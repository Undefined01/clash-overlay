import type { SubStoreHttpRequest, SubStoreHttpResponse } from '../types/substore.js';
import type {
    MutableProxy,
    ProxyPreprocessContext,
    ProxyPreprocessor,
} from '../lib/proxy-preprocess.js';

interface GeoInfo {
    ip: string;
    countryCode: string;
    country: string;
}

interface LandingGeoInfo extends GeoInfo {
    isResidential: boolean;
}

interface DetectorArgs {
    enabled: boolean;
    cacheEnabled: boolean;
    concurrency: number;
    timeout: number;
    retries: number;
    retryDelay: number;
    landingApi: string;
    geoApiTemplate: string;
    dohApi: string;
    residentialRegex: RegExp;
    surgeHttpApi: string;
    surgeHttpApiProtocol: string;
    surgeHttpApiKey: string;
}

export interface RuntimeRequest extends SubStoreHttpRequest {
    method?: 'get';
    'policy-descriptor'?: string;
}

export interface RuntimeResponse extends SubStoreHttpResponse {}

export interface LandingApiRequest {
    apiUrl: string;
    timeout: number;
    node: string;
    requester: SurgeApiClient;
}

interface RemoteSurgeEvaluateOutput {
    error?: unknown;
    response?: {
        status?: unknown;
        statusCode?: unknown;
        headers?: unknown;
        body?: unknown;
    };
    data?: unknown;
}

interface RemoteSurgeEvaluateResponse {
    output?: RemoteSurgeEvaluateOutput;
}

export interface LandingApiClient {
    lookup(request: LandingApiRequest): Promise<GeoInfo>;
}

export interface SurgeApiClient {
    request(req: RuntimeRequest): Promise<RuntimeResponse>;
}

export class IpApiLandingClient implements LandingApiClient {
    async lookup(request: LandingApiRequest): Promise<GeoInfo> {
        const response = await request.requester.request({
            method: 'get',
            url: request.apiUrl,
            timeout: request.timeout,
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
                accept: 'application/json',
            },
            node: request.node,
            'policy-descriptor': request.node,
        });
        return parseLandingResponse(response.body);
    }
}

export class NativeSurgeApiClient implements SurgeApiClient {
    async request(req: RuntimeRequest): Promise<RuntimeResponse> {
        return $substore.http.get(req);
    }
}

export class RemoteSurgeApiClient implements SurgeApiClient {
    private endpoint: string;
    private protocol: string;
    private key: string;

    constructor(endpoint: string, protocol: string, key: string) {
        this.endpoint = endpoint;
        this.protocol = protocol;
        this.key = key;
    }

    async request(req: RuntimeRequest): Promise<RuntimeResponse> {
        const timeoutMs = req.timeout || 5000;
        const surgeRequest: RuntimeRequest = {
            ...req,
            timeout: timeoutMs / 1000,
        };
        const evaluateScript =
            `$httpClient.get(${JSON.stringify(surgeRequest)}, ` +
            `(error, response, data) => { $done({ error, response, data }) })`;

        const response = await $substore.http.post({
            url: `${this.protocol}://${this.endpoint}/v1/scripting/evaluate`,
            timeout: timeoutMs,
            headers: {
                ...(this.key ? { 'X-Key': this.key } : {}),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                script_text: evaluateScript,
                mock_type: 'cron',
                timeout: timeoutMs / 1000,
            }),
        });

        const parsed = safeJsonParse<RemoteSurgeEvaluateResponse>(response.body);
        const output = isRecord(parsed?.output) ? (parsed.output as RemoteSurgeEvaluateOutput) : {};
        if (output.error) {
            throw new Error(`surge evaluate error: ${String(output.error)}`);
        }

        const responseObject = isRecord(output.response)
            ? (output.response as RemoteSurgeEvaluateOutput['response'])
            : undefined;
        const statusValue = responseObject?.statusCode ?? responseObject?.status;
        const statusCode = Number(statusValue);
        const headers = isRecord(responseObject?.headers)
            ? (responseObject?.headers as Record<string, string | string[] | undefined>)
            : {};
        const data = typeof output.data === 'string'
            ? output.data
            : typeof responseObject?.body === 'string'
                ? responseObject.body
                : '';

        return {
            statusCode: Number.isFinite(statusCode) ? statusCode : 200,
            headers,
            body: data,
        };
    }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const UNKNOWN_GEO: GeoInfo = {
    ip: '',
    countryCode: 'ZZ',
    country: '',
};

const DEFAULT_ARGS: Omit<DetectorArgs, 'residentialRegex'> = {
    enabled: true,
    cacheEnabled: true,
    concurrency: 10,
    timeout: 5000,
    retries: 1,
    retryDelay: 800,
    landingApi: 'http://ip-api.com/json?fields=status,country,countryCode,query',
    geoApiTemplate: 'http://ip-api.com/json/{{ip}}?fields=status,country,countryCode,query',
    dohApi: 'https://1.1.1.1/dns-query',
    surgeHttpApi: '',
    surgeHttpApiProtocol: 'http',
    surgeHttpApiKey: '',
};

export default async function entryLandingGeoModule(
    proxies: MutableProxy[],
    ctx: ProxyPreprocessContext,
): Promise<void> {
    const args = parseDetectorArgs(ctx.rawArgs);
    if (!args.enabled || proxies.length === 0) return;

    const landingApiClient: LandingApiClient = new IpApiLandingClient();
    const surgeApiClient: SurgeApiClient = args.surgeHttpApi
        ? new RemoteSurgeApiClient(args.surgeHttpApi, args.surgeHttpApiProtocol, args.surgeHttpApiKey)
        : new NativeSurgeApiClient();
    const runtimeTarget = detectRuntimeTarget();

    const tasks = proxies.map(proxy => async () => {
        await detectOneProxy(proxy, args, runtimeTarget, landingApiClient, surgeApiClient);
    });
    await executeAsyncTasks(tasks, args.concurrency);
}

async function detectOneProxy(
    proxy: MutableProxy,
    args: DetectorArgs,
    runtimeTarget: string | null,
    landingApiClient: LandingApiClient,
    surgeApiClient: SurgeApiClient,
): Promise<void> {
    if (typeof proxy._originName === 'undefined') proxy._originName = String(proxy.name || '');
    if (typeof proxy._originId === 'undefined') proxy._originId = String(proxy.id || '');

    const cacheId = buildGeoPairCacheId(proxy, {
        landingApi: args.landingApi,
        geoApiTemplate: args.geoApiTemplate,
        dohApi: args.dohApi,
        residentialPattern: args.residentialRegex.source,
    });

    if (args.cacheEnabled) {
        const cached = readCache(cacheId);
        if (isRecord(cached) && cached.entry && cached.landing) {
            proxy._geoEntry = cached.entry;
            proxy._geoLanding = cached.landing;
            proxy._geoCheckedAt = Number(cached.checkedAt) || Date.now();
            return;
        }
    }

    const server = String(proxy.server || '');
    const entryIp = await resolveEntryIp(server, args);
    const entryGeo = await geoLookup(entryIp, args);
    const landingGeo = await detectLandingGeo(
        proxy,
        args,
        runtimeTarget,
        landingApiClient,
        surgeApiClient,
    );

    proxy._geoEntry = entryGeo;
    proxy._geoLanding = landingGeo;
    proxy._geoCheckedAt = Date.now();

    if (args.cacheEnabled) {
        writeCache(cacheId, {
            entry: entryGeo,
            landing: landingGeo,
            checkedAt: proxy._geoCheckedAt,
        });
    }
}

async function resolveEntryIp(server: string, args: DetectorArgs): Promise<string> {
    if (!server) return '';
    if (isIp(server)) return server;

    const cacheId = `entry-ip:${server}:${args.dohApi}`;
    const cached = readCache(cacheId);
    if (typeof cached === 'string' && cached) return cached;

    const response = await withRetry(() =>
        $substore.http.get({
            url: `${args.dohApi}?name=${encodeURIComponent(server)}&type=A`,
            timeout: args.timeout,
            headers: { accept: 'application/dns-json' },
        }), args.retries, args.retryDelay);

    const parsed = safeJsonParse<{ Answer?: Array<{ data?: unknown }> }>(response.body);
    const answers = Array.isArray(parsed?.Answer) ? parsed.Answer : [];
    const ip = String(answers.find(item => isIp(String(item?.data || '')))?.data || '');
    if (ip && args.cacheEnabled) writeCache(cacheId, ip, DAY_MS);
    return ip;
}

async function geoLookup(ip: string, args: DetectorArgs): Promise<GeoInfo> {
    if (!ip) return UNKNOWN_GEO;

    const cacheId = `geo-ip:${ip}:${args.geoApiTemplate}`;
    const cached = readCache(cacheId);
    if (isRecord(cached)) {
        return {
            ip: String(cached.ip || ip),
            countryCode: normalizeCountryCode(cached.countryCode),
            country: String(cached.country || ''),
        };
    }

    const url = args.geoApiTemplate.replace(/\{\{ip\}\}/g, encodeURIComponent(ip));
    const response = await withRetry(
        () => $substore.http.get({ url, timeout: args.timeout }),
        args.retries,
        args.retryDelay,
    );
    const parsed = safeJsonParse<Record<string, unknown>>(response.body) || {};
    const geo = {
        ip: String(parsed.query || ip),
        countryCode: normalizeCountryCode(parsed.countryCode),
        country: String(parsed.country || ''),
    };
    if (args.cacheEnabled) writeCache(cacheId, geo, DAY_MS);
    return geo;
}

async function detectLandingGeo(
    proxy: MutableProxy,
    args: DetectorArgs,
    runtimeTarget: string | null,
    landingApiClient: LandingApiClient,
    surgeApiClient: SurgeApiClient,
): Promise<LandingGeoInfo> {
    const rawId = String(proxy._originId || proxy.id || '');
    const isResidential = args.residentialRegex.test(rawId);

    const node = produceNode(proxy, args.surgeHttpApi ? 'Surge' : runtimeTarget);
    if (!node) {
        return { ...UNKNOWN_GEO, isResidential };
    }

    const landingGeo = await withRetry(() =>
        landingApiClient.lookup({
            apiUrl: args.landingApi,
            timeout: args.timeout,
            node,
            requester: surgeApiClient,
        }), args.retries, args.retryDelay);

    return {
        ip: String(landingGeo.ip || ''),
        countryCode: normalizeCountryCode(landingGeo.countryCode),
        country: String(landingGeo.country || ''),
        isResidential,
    };
}

function parseLandingResponse(body: string): GeoInfo {
    const parsed = safeJsonParse<Record<string, unknown>>(body);
    if (parsed) {
        return {
            ip: String(parsed.query || ''),
            countryCode: normalizeCountryCode(parsed.countryCode),
            country: String(parsed.country || ''),
        };
    }
    const text = String(body || '').trim();
    return {
        ip: isIp(text) ? text : '',
        countryCode: 'ZZ',
        country: '',
    };
}

function parseDetectorArgs(rawArgs: Record<string, unknown>): DetectorArgs {
    const residentialSource = asString(
        pickArg(rawArgs, [
            'entry_landing_residential_regex',
            'geo_residential_regex',
            'residential_regex',
        ]),
        '(家宽|住宅|residential|home)',
    );

    return {
        enabled: asBoolean(
            pickArg(rawArgs, ['entry_landing_geo_enabled', 'geo_detect_enabled']),
            DEFAULT_ARGS.enabled,
        ),
        cacheEnabled: asBoolean(
            pickArg(rawArgs, ['entry_landing_cache', 'geo_cache', 'cache']),
            DEFAULT_ARGS.cacheEnabled,
        ),
        concurrency: asPositiveInt(
            pickArg(rawArgs, ['entry_landing_concurrency', 'geo_concurrency', 'concurrency']),
            DEFAULT_ARGS.concurrency,
        ),
        timeout: asPositiveInt(
            pickArg(rawArgs, ['entry_landing_timeout', 'geo_timeout', 'timeout']),
            DEFAULT_ARGS.timeout,
        ),
        retries: asPositiveInt(
            pickArg(rawArgs, ['entry_landing_retries', 'geo_retries', 'retries']),
            DEFAULT_ARGS.retries,
        ),
        retryDelay: asPositiveInt(
            pickArg(rawArgs, ['entry_landing_retry_delay', 'geo_retry_delay', 'retry_delay']),
            DEFAULT_ARGS.retryDelay,
        ),
        landingApi: asString(
            pickArg(rawArgs, ['entry_landing_api', 'landing_api']),
            DEFAULT_ARGS.landingApi,
        ),
        geoApiTemplate: asString(
            pickArg(rawArgs, ['entry_geo_api', 'geo_api']),
            DEFAULT_ARGS.geoApiTemplate,
        ),
        dohApi: asString(
            pickArg(rawArgs, ['entry_doh_api', 'doh_api']),
            DEFAULT_ARGS.dohApi,
        ),
        residentialRegex: new RegExp(residentialSource, 'i'),
        surgeHttpApi: asString(
            pickArg(rawArgs, ['entry_landing_surge_http_api', 'surge_http_api']),
            DEFAULT_ARGS.surgeHttpApi,
        ),
        surgeHttpApiProtocol: asString(
            pickArg(rawArgs, ['entry_landing_surge_http_api_protocol', 'surge_http_api_protocol']),
            DEFAULT_ARGS.surgeHttpApiProtocol,
        ),
        surgeHttpApiKey: asString(
            pickArg(rawArgs, ['entry_landing_surge_http_api_key', 'surge_http_api_key']),
            DEFAULT_ARGS.surgeHttpApiKey,
        ),
    };
}

function pickArg(rawArgs: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (typeof rawArgs[key] !== 'undefined') return rawArgs[key];
    }
    return undefined;
}

function asString(value: unknown, fallback: string): string {
    if (typeof value === 'undefined' || value === null) return fallback;
    return String(value);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'undefined' || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
}

function asPositiveInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function detectRuntimeTarget(): string | null {
    const env = $substore.env || {};
    if (env.isLoon) return 'Loon';
    if (env.isSurge) return 'Surge';
    return null;
}

function produceNode(proxy: MutableProxy, targetPlatform: string | null): string | null {
    if (!targetPlatform || typeof ProxyUtils === 'undefined') return null;
    const producer = (ProxyUtils as { produce?: (proxies: MutableProxy[], platform: string) => unknown }).produce;
    if (typeof producer !== 'function') return null;
    const result = producer([proxy], targetPlatform);
    return typeof result === 'string' && result ? result : null;
}

function normalizeCountryCode(value: unknown): string {
    const code = String(value || '').trim().toUpperCase();
    return code || 'ZZ';
}

function readCache(id: string): Record<string, unknown> | string | null {
    if (typeof scriptResourceCache === 'undefined') return null;
    const value = scriptResourceCache.get(id);
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') return value;
    if (isRecord(value)) return value;
    return null;
}

function writeCache(id: string, value: unknown, ttl?: number): void {
    if (typeof scriptResourceCache === 'undefined') return;
    scriptResourceCache.set(id, value, ttl);
}

export function buildGeoPairCacheId(
    proxy: MutableProxy,
    options: Record<string, unknown>,
): string {
    const stableProxy: Record<string, unknown> = {};
    const entries = Object.entries(proxy)
        .filter(([key]) => !key.startsWith('_') && key !== 'name' && key !== 'id')
        .sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
        stableProxy[key] = value;
    }
    return `entry-landing-geo:${stableStringify(options)}:${stableStringify(stableProxy)}`;
}

function stableStringify(value: unknown): string {
    if (!isRecord(value)) return JSON.stringify(value);
    const keys = Object.keys(value).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
        const child = value[key];
        normalized[key] = isRecord(child) ? JSON.parse(stableStringify(child)) : child;
    }
    return JSON.stringify(normalized);
}

async function withRetry<T>(
    run: () => Promise<T>,
    retries: number,
    retryDelayMs: number,
): Promise<T> {
    let attempt = 0;
    let lastError: unknown = null;
    while (attempt <= retries) {
        try {
            return await run();
        } catch (error) {
            lastError = error;
            if (attempt >= retries) break;
            await wait(retryDelayMs);
        }
        attempt += 1;
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function wait(ms: number): Promise<void> {
    if (typeof $substore.wait === 'function') {
        await $substore.wait(ms);
        return;
    }
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function executeAsyncTasks(
    tasks: Array<() => Promise<void>>,
    concurrency: number,
): Promise<void> {
    if (tasks.length === 0) return;
    const maxWorkers = Math.max(1, Math.min(concurrency, tasks.length));
    let cursor = 0;

    async function worker(): Promise<void> {
        while (true) {
            const current = cursor;
            cursor += 1;
            if (current >= tasks.length) return;
            await tasks[current]();
        }
    }

    await Promise.all(Array.from({ length: maxWorkers }, () => worker()));
}

function safeJsonParse<T>(text: string): T | null {
    if (!text) return null;
    try {
        return JSON.parse(text) as T;
    } catch (_error) {
        return null;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIp(value: string): boolean {
    const candidate = value.trim();
    if (!candidate) return false;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate)) {
        return candidate
            .split('.')
            .every(part => {
                const num = Number(part);
                return Number.isInteger(num) && num >= 0 && num <= 255;
            });
    }
    return candidate.includes(':') && /^[a-fA-F0-9:]+$/.test(candidate);
}

export const entryLandingGeoPreprocessor: ProxyPreprocessor = entryLandingGeoModule;
