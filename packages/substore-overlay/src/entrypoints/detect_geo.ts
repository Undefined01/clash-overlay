import * as v from 'valibot';
import type { ScriptOperator, SubStoreArguments, TargetPlatform } from '../types/substore.js';
import {
    parseBooleanArg,
    parsePositiveIntArg,
    parseRegexArg,
    parseStringArg,
    scalarSchema,
} from '../lib/args.js';
import { normalizeCountryCode } from '../lib/proxy-processor/country.js';
import {
    buildGeoPairCacheId,
    defaultCacheTtlMs,
    readCache,
    writeCache,
} from '../lib/proxy-processor/cache.js';
import {
    IpApiLandingClient,
    NativeSurgeApiClient,
    RemoteSurgeApiClient,
    type LandingApiClient,
    type SurgeApiClient,
} from '../lib/proxy-processor/geo-clients.js';
import {
    createDebugLogger,
    executeAsyncTasks,
    isIp,
    isRecord,
    safeJsonParse,
    type DebugLogger,
    withRetry,
} from '../lib/proxy-processor/runtime.js';
import type {
    BaseProxy,
    GeoInfo,
    LandingGeoInfo,
} from '../lib/proxy-processor/types.js';

export const detectGeoScriptArgsSchema = v.object({
    entry_landing_debug: v.optional(scalarSchema),
    debug: v.optional(scalarSchema),

    entry_landing_geo_enabled: v.optional(scalarSchema),
    geo_detect_enabled: v.optional(scalarSchema),

    entry_landing_cache: v.optional(scalarSchema),
    geo_cache: v.optional(scalarSchema),
    cache: v.optional(scalarSchema),

    entry_landing_concurrency: v.optional(scalarSchema),
    geo_concurrency: v.optional(scalarSchema),
    concurrency: v.optional(scalarSchema),

    entry_landing_timeout: v.optional(scalarSchema),
    geo_timeout: v.optional(scalarSchema),
    timeout: v.optional(scalarSchema),

    entry_landing_retries: v.optional(scalarSchema),
    geo_retries: v.optional(scalarSchema),
    retries: v.optional(scalarSchema),

    entry_landing_retry_delay: v.optional(scalarSchema),
    geo_retry_delay: v.optional(scalarSchema),
    retry_delay: v.optional(scalarSchema),

    entry_landing_api: v.optional(scalarSchema),
    landing_api: v.optional(scalarSchema),

    entry_geo_api: v.optional(scalarSchema),
    geo_api: v.optional(scalarSchema),

    entry_doh_api: v.optional(scalarSchema),
    doh_api: v.optional(scalarSchema),

    entry_landing_surge_http_api: v.optional(scalarSchema),
    surge_http_api: v.optional(scalarSchema),

    entry_landing_surge_http_api_protocol: v.optional(scalarSchema),
    surge_http_api_protocol: v.optional(scalarSchema),

    entry_landing_surge_http_api_key: v.optional(scalarSchema),
    surge_http_api_key: v.optional(scalarSchema),

    entry_landing_residential_regex: v.optional(scalarSchema),
    geo_residential_regex: v.optional(scalarSchema),
    residential_regex: v.optional(scalarSchema),
});

export type DetectGeoScriptArgs = v.InferOutput<typeof detectGeoScriptArgsSchema> & SubStoreArguments;

const detectGeoArgsSchema = v.object({
    enabled: v.boolean(),
    cacheEnabled: v.boolean(),
    concurrency: v.number(),
    timeout: v.number(),
    retries: v.number(),
    retryDelay: v.number(),
    landingApi: v.string(),
    geoApiTemplate: v.string(),
    dohApi: v.string(),
    surgeHttpApi: v.string(),
    surgeHttpApiProtocol: v.string(),
    surgeHttpApiKey: v.string(),
    residentialRegex: v.instance(RegExp),
    debug: v.boolean(),
});

type DetectGeoArgs = v.InferOutput<typeof detectGeoArgsSchema>;

const detectGeoDefaults = {
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
    residentialRegexSource: '(家宽|住宅|residential|home)',
    debug: false,
} as const;

function parseDetectGeoArgs(rawArgs: SubStoreArguments): DetectGeoArgs {
    return v.parse(detectGeoArgsSchema, {
        enabled: parseBooleanArg(rawArgs, ['entry_landing_geo_enabled', 'geo_detect_enabled'], detectGeoDefaults.enabled),
        cacheEnabled: parseBooleanArg(rawArgs, ['entry_landing_cache', 'geo_cache', 'cache'], detectGeoDefaults.cacheEnabled),
        concurrency: parsePositiveIntArg(rawArgs, ['entry_landing_concurrency', 'geo_concurrency', 'concurrency'], detectGeoDefaults.concurrency),
        timeout: parsePositiveIntArg(rawArgs, ['entry_landing_timeout', 'geo_timeout', 'timeout'], detectGeoDefaults.timeout),
        retries: parsePositiveIntArg(rawArgs, ['entry_landing_retries', 'geo_retries', 'retries'], detectGeoDefaults.retries),
        retryDelay: parsePositiveIntArg(rawArgs, ['entry_landing_retry_delay', 'geo_retry_delay', 'retry_delay'], detectGeoDefaults.retryDelay),
        landingApi: parseStringArg(rawArgs, ['entry_landing_api', 'landing_api'], detectGeoDefaults.landingApi),
        geoApiTemplate: parseStringArg(rawArgs, ['entry_geo_api', 'geo_api'], detectGeoDefaults.geoApiTemplate),
        dohApi: parseStringArg(rawArgs, ['entry_doh_api', 'doh_api'], detectGeoDefaults.dohApi),
        surgeHttpApi: parseStringArg(rawArgs, ['entry_landing_surge_http_api', 'surge_http_api'], detectGeoDefaults.surgeHttpApi),
        surgeHttpApiProtocol: parseStringArg(
            rawArgs,
            ['entry_landing_surge_http_api_protocol', 'surge_http_api_protocol'],
            detectGeoDefaults.surgeHttpApiProtocol,
        ),
        surgeHttpApiKey: parseStringArg(rawArgs, ['entry_landing_surge_http_api_key', 'surge_http_api_key'], detectGeoDefaults.surgeHttpApiKey),
        residentialRegex: parseRegexArg(
            rawArgs,
            ['entry_landing_residential_regex', 'geo_residential_regex', 'residential_regex'],
            detectGeoDefaults.residentialRegexSource,
        ),
        debug: parseBooleanArg(rawArgs, ['entry_landing_debug', 'debug'], detectGeoDefaults.debug),
    });
}

/** Input proxy shape consumed by this operator. */
export interface DetectGeoInputProxy extends BaseProxy {
    _geoEntry?: GeoInfo;
    _geoLanding?: LandingGeoInfo;
    _geoCheckedAt?: number;
}

/** Fields patched by this operator. */
export type DetectGeoPatch = { _geoEntry: GeoInfo; _geoLanding: LandingGeoInfo; _geoCheckedAt: number };

/** Output proxy shape: original input plus detected geo fields. */
export type DetectGeoOutputProxy<TProxy extends DetectGeoInputProxy> = TProxy & DetectGeoPatch;

const unknownGeo: GeoInfo = { ip: '', countryCode: 'ZZ', country: '' };

const operator: ScriptOperator<DetectGeoInputProxy> = async (
    proxies,
    _targetPlatform,
    _context,
) => {
    if (!Array.isArray(proxies) || proxies.length === 0) return proxies;

    const args = parseDetectGeoArgs(typeof $arguments !== 'undefined' ? $arguments : {});
    const logDebug = createDebugLogger('DetectGeo', args.debug);
    logDebug('operator start', {
        proxyCount: proxies.length,
        enabled: args.enabled,
        cacheEnabled: args.cacheEnabled,
        concurrency: args.concurrency,
        timeout: args.timeout,
        retries: args.retries,
        retryDelay: args.retryDelay,
        landingApi: args.landingApi,
        geoApiTemplate: args.geoApiTemplate,
        dohApi: args.dohApi,
        surgeHttpApi: args.surgeHttpApi,
        surgeHttpApiProtocol: args.surgeHttpApiProtocol,
    });

    if (!args.enabled) return proxies;

    const landingApiClient: LandingApiClient = new IpApiLandingClient();
    const surgeApiClient: SurgeApiClient = args.surgeHttpApi
        ? new RemoteSurgeApiClient(args.surgeHttpApi, args.surgeHttpApiProtocol, args.surgeHttpApiKey)
        : new NativeSurgeApiClient();

    const runtimeTarget = detectRuntimeTarget();
    logDebug('runtime target resolved', {
        runtimeTarget,
        surgeClient: args.surgeHttpApi ? 'remote' : 'native',
    });
    if (!runtimeTarget && !args.surgeHttpApi) {
        logDebug('landing detection risk', {
            reason: 'runtimeTarget is null and entry_landing_surge_http_api is empty',
            impact: 'cannot produce policy node, landing geo may fallback to ZZ',
            suggestion: 'provide entry_landing_surge_http_api or run in Surge/Loon runtime',
        });
    }

    const tasks = proxies.map(proxy => async () => {
        await detectOneProxy(proxy, args, runtimeTarget, landingApiClient, surgeApiClient, logDebug);
    });
    await executeAsyncTasks(tasks, args.concurrency, logDebug);
    logDebug('operator completed', { proxyCount: proxies.length });

    return proxies;
};

export default operator;
export { buildGeoPairCacheId };

async function detectOneProxy<TProxy extends DetectGeoInputProxy>(
    proxy: TProxy,
    args: DetectGeoArgs,
    runtimeTarget: TargetPlatform | null,
    landingApiClient: LandingApiClient,
    surgeApiClient: SurgeApiClient,
    logDebug: DebugLogger,
): Promise<DetectGeoOutputProxy<TProxy>> {
    if (typeof proxy._originName === 'undefined') proxy._originName = String(proxy.name || '');
    logDebug('detectOneProxy start', {
        name: proxy._originName,
        server: proxy.server,
    });

    const cacheId = buildGeoPairCacheId(proxy, {
        landingApi: args.landingApi,
        geoApiTemplate: args.geoApiTemplate,
        dohApi: args.dohApi,
        residentialPattern: args.residentialRegex.source,
    });

    if (args.cacheEnabled) {
        const cached = readCache(cacheId);
        if (isGeoPairCacheValue(cached)) {
            proxy._geoEntry = cached.entry;
            proxy._geoLanding = cached.landing;
            proxy._geoCheckedAt = Number(cached.checkedAt) || Date.now();
            logDebug('geo pair cache hit', { cacheId, name: proxy._originName });
            logDebug('geo pair cache payload', {
                entry: proxy._geoEntry,
                landing: proxy._geoLanding,
                checkedAt: proxy._geoCheckedAt,
            });
            return proxy as DetectGeoOutputProxy<TProxy>;
        }
    }

    const server = String(proxy.server || '');
    const entryIp = await resolveEntryIp(server, args, logDebug);
    const entryGeo = await geoLookup(entryIp, args, logDebug);
    const landingGeo = await detectLandingGeo(
        proxy,
        args,
        runtimeTarget,
        landingApiClient,
        surgeApiClient,
        logDebug,
    );

    proxy._geoEntry = entryGeo;
    proxy._geoLanding = landingGeo;
    proxy._geoCheckedAt = Date.now();
    logDebug('detectOneProxy completed', {
        name: proxy._originName,
        entryIp,
        entryGeo,
        landingGeo,
    });

    if (args.cacheEnabled) {
        writeCache(cacheId, {
            entry: entryGeo,
            landing: landingGeo,
            checkedAt: proxy._geoCheckedAt,
        }, defaultCacheTtlMs());
        logDebug('geo pair cache write', { cacheId, name: proxy._originName });
    }

    return proxy as DetectGeoOutputProxy<TProxy>;
}

async function resolveEntryIp(server: string, args: DetectGeoArgs, logDebug: DebugLogger): Promise<string> {
    if (!server) {
        logDebug('resolveEntryIp skipped: empty server');
        return '';
    }
    if (isIp(server)) {
        logDebug('resolveEntryIp direct ip', { server });
        return server;
    }

    const cacheId = `entry-ip:${server}:${args.dohApi}`;
    const cached = readCache(cacheId);
    if (typeof cached === 'string' && cached) {
        logDebug('entry ip cache hit', { server, ip: cached, cacheId });
        return cached;
    }

    const dohUrl = `${args.dohApi}?name=${encodeURIComponent(server)}&type=A`;
    logDebug('entry ip lookup request', { server, dohUrl });
    const response = await withRetry(
        () =>
            $substore.http.get({
                url: dohUrl,
                timeout: args.timeout,
                headers: { accept: 'application/dns-json' },
            }),
        args.retries,
        args.retryDelay,
        logDebug,
        `resolveEntryIp:${server}`,
    );

    const parsed = safeJsonParse<{ Answer?: Array<{ data?: unknown }> }>(response.body) || {};
    const answers = Array.isArray(parsed.Answer) ? parsed.Answer : [];
    const ip = String((answers.find(item => isIp(String(item.data || ''))) || {}).data || '');
    if (ip && args.cacheEnabled) {
        writeCache(cacheId, ip, defaultCacheTtlMs());
        logDebug('entry ip cache write', { server, ip, cacheId });
    }
    logDebug('entry ip lookup result', { server, ip: ip || '(empty)' });
    return ip;
}

async function geoLookup(ip: string, args: DetectGeoArgs, logDebug: DebugLogger): Promise<GeoInfo> {
    if (!ip) {
        logDebug('geoLookup skipped: empty ip');
        return unknownGeo;
    }

    const cacheId = `geo-ip:${ip}:${args.geoApiTemplate}`;
    const cached = readCache(cacheId);
    if (isRecord(cached)) {
        logDebug('geo cache hit', { ip, cacheId });
        return {
            ip: String(cached.ip || ip),
            countryCode: normalizeCountryCode(cached.countryCode),
            country: String(cached.country || ''),
        };
    }

    const url = args.geoApiTemplate.replace(/\{\{ip\}\}/g, encodeURIComponent(ip));
    logDebug('geo lookup request', { ip, url });
    const response = await withRetry(
        () => $substore.http.get({ url, timeout: args.timeout }),
        args.retries,
        args.retryDelay,
        logDebug,
        `geoLookup:${ip}`,
    );
    const parsed = safeJsonParse<Record<string, unknown>>(response.body) || {};
    const geo: GeoInfo = {
        ip: String(parsed.query || ip),
        countryCode: normalizeCountryCode(parsed.countryCode),
        country: String(parsed.country || ''),
    };
    if (args.cacheEnabled) {
        writeCache(cacheId, geo, defaultCacheTtlMs());
        logDebug('geo cache write', { ip, cacheId, geo });
    }
    logDebug('geo lookup result', { ip, geo });
    return geo;
}

async function detectLandingGeo(
    proxy: DetectGeoInputProxy,
    args: DetectGeoArgs,
    runtimeTarget: TargetPlatform | null,
    landingApiClient: LandingApiClient,
    surgeApiClient: SurgeApiClient,
    logDebug: DebugLogger,
): Promise<LandingGeoInfo> {
    const marker = String(proxy._originName || proxy.name || '');
    const isResidential = args.residentialRegex.test(marker);
    const node = produceNode(proxy, args.surgeHttpApi ? 'Surge' : runtimeTarget);
    logDebug('landing detection prepared', {
        name: proxy._originName,
        marker,
        isResidential,
        runtimeTarget,
        nodeAvailable: Boolean(node),
    });

    if (!node) {
        logDebug('landing detection fallback: no node produced', { name: proxy._originName });
        logDebug('landing detection fallback hint', {
            runtimeTarget,
            surgeHttpApi: args.surgeHttpApi,
            suggestion: 'if this is Node runtime, configure entry_landing_surge_http_api',
        });
        return { ...unknownGeo, isResidential };
    }

    const geo = await withRetry(
        () =>
            landingApiClient.lookup({
                apiUrl: args.landingApi,
                timeout: args.timeout,
                node,
                requester: surgeApiClient,
            }),
        args.retries,
        args.retryDelay,
        logDebug,
        `landingLookup:${proxy._originName || proxy.name || '(unknown)'}`,
    );

    const landingGeo: LandingGeoInfo = {
        ip: String(geo.ip || ''),
        countryCode: normalizeCountryCode(geo.countryCode),
        country: String(geo.country || ''),
        isResidential,
    };
    logDebug('landing detection result', { name: proxy._originName, landingGeo });
    return landingGeo;
}

function detectRuntimeTarget(): TargetPlatform | null {
    const env = ($substore && $substore.env) || {};
    if (env.isLoon) return 'Loon';
    if (env.isSurge) return 'Surge';
    return null;
}

function produceNode(proxy: DetectGeoInputProxy, targetPlatform: TargetPlatform | null): string | null {
    if (!targetPlatform || typeof ProxyUtils === 'undefined') return null;
    if (!ProxyUtils || typeof ProxyUtils.produce !== 'function') return null;
    const produce = ProxyUtils.produce as (proxies: DetectGeoInputProxy[], platform: TargetPlatform) => unknown;
    const result = produce([proxy], targetPlatform);
    return typeof result === 'string' && result ? result : null;
}

function isGeoPairCacheValue(value: Record<string, unknown> | string | null): value is {
    entry: GeoInfo;
    landing: LandingGeoInfo;
    checkedAt: number;
} {
    if (!isRecord(value)) return false;
    if (!isRecord(value.entry) || !isRecord(value.landing)) return false;
    return true;
}
