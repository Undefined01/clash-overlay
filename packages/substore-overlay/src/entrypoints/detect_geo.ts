import * as v from 'valibot';
import type { ProxyNode, ScriptOperator, TargetPlatform } from '../types/substore.js';
import { booleanArgSchema, positiveIntSchema } from '../lib/args.js';
import { normalizeCountryCode, resolveIp } from '../lib/proxy-processor/country.js';
import {
    buildGeoPairCacheId,
    readCache,
    writeCache,
} from '../lib/proxy-processor/cache.js';
import {
    createDebugLogger,
    executeAsyncTasks,
    isRecord,
    safeJsonParse,
    toErrorMessage,
    withRetry,
} from '../lib/proxy-processor/runtime.js';
import type { GeoInfo, LandingGeoInfo } from '../lib/proxy-processor/types.js';

const IP_API_ENTRY_TEMPLATE = 'http://ip-api.com/json/{{host}}';
const IP_API_LANDING = 'http://ip-api.com/json';
const DOH_API = 'https://1.1.1.1/dns-query';
const EDNS_CLIENT_SUBNET = '223.6.6.6';

const HTTP_TIMEOUT_MS = 5000;
const RETRIES = 1;
const RETRY_DELAY_MS = 800;

const SUCCEEDED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const FAILED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

enum entryDetectionMode {
    MMDB = 'MMDB',
    IP_API = 'ip-api',
}

const entryDetectionModeSchema = v.pipe(
    v.string(),
    v.picklist(Object.values(entryDetectionMode)),
);

const detectGeoArgsSchema = v.looseObject({
    cache: v.optional(booleanArgSchema, true),
    concurrency: v.optional(positiveIntSchema, 10),
    entry_detection_mode: v.optional(entryDetectionModeSchema, entryDetectionMode.IP_API),
    debug: v.optional(booleanArgSchema, false),
});

/**
 * `detect_geo` operator `$arguments` (parsed via `valibot`).
 *
 * - `cache`: `bool`
 *   - Accepts: `true`/`false`, `1`/`0`, `'true'`/`'false'`, `'1'`/`'0'`
 *   - Default: `true`
 * - `concurrency`: `int` (positive)
 *   - Default: `10`
 * - `entry_detection_mode`: `'MMDB' | 'ip-api'`
 *   - `'MMDB'`: `ProxyUtils.doh` -> `ProxyUtils.MMDB().geoip(ip)`
 *   - `'ip-api'`: `http://ip-api.com/json/{host}?fields=status,countryCode`
 *   - Default: `'ip-api'`
 * - `debug`: `bool`
 *   - Default: `false`
 *   - When `true`, prints detailed debug logs for cache, network requests, and parsing results.
 */
export type DetectGeoArgs = v.InferOutput<typeof detectGeoArgsSchema>;

/** Fields patched by this operator. */
export type DetectGeoPatch = { _geoEntry: GeoInfo; _geoLanding: LandingGeoInfo; _geoCheckedAt: number };

/** Input proxy shape consumed by this operator (besides {@link ProxyNode}). */
export interface DetectGeoInputProxy {
    server?: string;
}

/** Output proxy shape: original input plus detected geo fields. */
export type DetectGeoOutputProxy = ProxyNode & DetectGeoInputProxy & DetectGeoPatch;

const operator: ScriptOperator<ProxyNode & DetectGeoInputProxy, DetectGeoOutputProxy> = async (proxies, _targetPlatform, _context) => {
    const args = v.parse(detectGeoArgsSchema, typeof $arguments !== 'undefined' ? $arguments : {});
    const logDebug = createDebugLogger('detect_geo', args.debug);
    logDebug('operator start', {
        proxyCount: Array.isArray(proxies) ? proxies.length : -1,
        targetPlatform: _targetPlatform,
        cache: args.cache,
        concurrency: args.concurrency,
        entry_detection_mode: args.entry_detection_mode,
        runtimeEnv: typeof $substore === 'undefined' ? null : {
            isNode: $substore.env?.isNode,
            isSurge: $substore.env?.isSurge,
            isLoon: $substore.env?.isLoon,
            isQX: $substore.env?.isQX,
        },
    });

    const entryDetector: GeoDetector = args.entry_detection_mode === 'MMDB'
        ? new MMDBGeoDetector(logDebug)
        : new IpApiGeoDetector(logDebug);
    const landingDetector: LandingGeoDetector = new SubStoreSurgeGeoDetector(logDebug);

    const tasks = proxies.map((proxy, index) => async () => {
        return await detectOneProxy(proxy, index, args, entryDetector, landingDetector, logDebug);
    });
    const results = await executeAsyncTasks(tasks, args.concurrency, logDebug);
    return results;
};

export default operator;

interface GeoDetector {
    detect(host: string): Promise<{ countryCode: string }>;
}

class MMDBGeoDetector implements GeoDetector {
    constructor(private readonly logDebug?: (message: string, detail?: object) => void) {}

    async detect(host: string): Promise<{ countryCode: string }> {
        const ip = await resolveIp(host, DOH_API, HTTP_TIMEOUT_MS, EDNS_CLIENT_SUBNET, RETRIES, RETRY_DELAY_MS, this.logDebug);
        this.logDebug?.('MMDB detect resolved ip', { host, ip });
        if (!ip) return { countryCode: 'ZZ' };
        if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.MMDB !== 'function') {
            this.logDebug?.('MMDB detect missing ProxyUtils.MMDB', {
                hasProxyUtils: typeof ProxyUtils !== 'undefined' && !!ProxyUtils,
                MMDBType: typeof (typeof ProxyUtils === 'undefined' ? undefined : (ProxyUtils as Record<string, unknown>).MMDB),
            });
            return { countryCode: 'ZZ' };
        }

        const mmdb = new ProxyUtils.MMDB();
        const iso = mmdb.geoip(ip);
        this.logDebug?.('MMDB detect geoip result', { ip, iso });
        return { countryCode: normalizeCountryCode(iso) };
    }
}

class IpApiGeoDetector implements GeoDetector {
    constructor(private readonly logDebug?: (message: string, detail?: object) => void) {}

    async detect(host: string): Promise<{ countryCode: string }> {
        const value = String(host || '').trim();
        if (!value) {
            this.logDebug?.('ip-api entry skip: empty host');
            return { countryCode: 'ZZ' };
        }
        if (typeof $substore === 'undefined') {
            this.logDebug?.('ip-api entry skip: $substore is undefined');
            return { countryCode: 'ZZ' };
        }

        const ip = await resolveIp(value, DOH_API, HTTP_TIMEOUT_MS, EDNS_CLIENT_SUBNET, RETRIES, RETRY_DELAY_MS, this.logDebug);
        const url = IP_API_ENTRY_TEMPLATE.replace(/\{\{host\}\}/g, encodeURIComponent(ip));
        this.logDebug?.('ip-api entry request', { host: value, url });
        const response = await withRetry(
            () => $substore.http.get({ url, timeout: HTTP_TIMEOUT_MS, headers: { accept: 'application/json' } }),
            RETRIES,
            RETRY_DELAY_MS,
            this.logDebug,
            `ip-api-entry:${value}`,
        );

        const bodyText = toBodyText(response.body);
        this.logDebug?.('ip-api entry response', {
            host: value,
            statusCode: response.statusCode,
            bodyPreview: truncateText(bodyText, 240),
        });

        const parsed = safeJsonParse<Record<string, unknown>>(bodyText) || {};
        if (String(parsed.status || '') && String(parsed.status || '') !== 'success') {
            this.logDebug?.('ip-api entry non-success status', { host: value, status: parsed.status, message: parsed.message });
            return { countryCode: 'ZZ' };
        }
        const cc = normalizeCountryCode(parsed.countryCode);
        this.logDebug?.('ip-api entry parsed countryCode', { host: value, countryCode: parsed.countryCode, normalized: cc });
        return { ...parsed, countryCode: cc };
    }
}

interface LandingGeoDetector {
    detect(node: ProxyNode): Promise<{ countryCode: string }>;
}

class SubStoreSurgeGeoDetector implements LandingGeoDetector {
    constructor(private readonly logDebug?: (message: string, detail?: object) => void) {}

    async detect(node: ProxyNode): Promise<{ countryCode: string }> {
        if (typeof $substore === 'undefined') {
            this.logDebug?.('ip-api landing skip: $substore is undefined');
            return { countryCode: 'ZZ' };
        }

        const runtimeTarget = 'sing-box';

        const policyDescriptor = producePolicyDescriptor(node, runtimeTarget, this.logDebug);
        if (!policyDescriptor) {
            this.logDebug?.('ip-api landing skip: failed to produce policy descriptor', {
                targetPlatform: runtimeTarget,
                name: String(node.name || ''),
                type: String((node as { type?: unknown }).type || ''),
            });
            return { countryCode: 'ZZ' };
        }

        this.logDebug?.('ip-api landing request', {
            targetPlatform: runtimeTarget,
            name: String(node.name || ''),
            policyDescriptorLength: policyDescriptor.length,
        });

        const response = await withRetry(
            () =>
                $substore.http.get({
                    url: IP_API_LANDING,
                    timeout: HTTP_TIMEOUT_MS,
                    headers: { accept: 'application/json' },
                    node: policyDescriptor,
                    'policy-descriptor': policyDescriptor,
                }),
            RETRIES,
            RETRY_DELAY_MS,
            this.logDebug,
            `ip-api-landing:${String(node.name || '')}`,
        );

        const bodyText = toBodyText(response.body);
        this.logDebug?.('ip-api landing response', {
            name: String(node.name || ''),
            statusCode: response.statusCode,
            bodyPreview: truncateText(bodyText, 240),
        });

        const parsed = safeJsonParse<Record<string, unknown>>(bodyText) || {};
        if (String(parsed.status || '') && String(parsed.status || '') !== 'success') {
            this.logDebug?.('ip-api landing non-success status', { status: parsed.status, message: parsed.message });
            return { countryCode: 'ZZ' };
        }
        const cc = normalizeCountryCode(parsed.countryCode);
        this.logDebug?.('ip-api landing parsed countryCode', { countryCode: parsed.countryCode, normalized: cc });
        return { ...parsed, countryCode: cc };
    }
}

export { buildGeoPairCacheId };

async function detectOneProxy(
    proxy: ProxyNode & DetectGeoInputProxy,
    index: number,
    args: DetectGeoArgs,
    entryDetector: GeoDetector,
    landingDetector: LandingGeoDetector,
    logDebug: (message: string, detail?: object) => void,
): Promise<DetectGeoOutputProxy> {
    logDebug('proxy start', {
        index,
        name: String(proxy.name || ''),
        type: String(proxy.type || ''),
        server: String(proxy.server || ''),
    });

    const cacheId = buildGeoPairCacheId(proxy, {
        entry_detection_mode: args.entry_detection_mode,
        ip_api_entry: IP_API_ENTRY_TEMPLATE,
        ip_api_landing: IP_API_LANDING,
        doh_api: DOH_API,
    });

    if (args.cache) {
        const cached = readCache(cacheId);
        if (isGeoPairCacheValue(cached)) {
            proxy._geoEntry = cached.entry;
            proxy._geoLanding = cached.landing;
            proxy._geoCheckedAt = Number(cached.checkedAt) || Date.now();
            logDebug('proxy cache hit', {
                index,
                entry: cached.entry,
                landing: cached.landing,
                checkedAt: proxy._geoCheckedAt,
            });
            return proxy as DetectGeoOutputProxy;
        }
        logDebug('proxy cache miss', { index });
    }

    let entry: { countryCode: string } = { countryCode: 'ZZ' };
    let landing: { countryCode: string } = { countryCode: 'ZZ' };
    try {
        entry = await entryDetector.detect(String(proxy.server || ''));
    } catch (error) {
        logDebug('entry detect threw', { index, error: toErrorMessage(error) });
    }
    try {
        landing = await landingDetector.detect(proxy);
    } catch (error) {
        logDebug('landing detect threw', { index, error: toErrorMessage(error) });
    }

    const entryGeo: GeoInfo = entry;
    const landingGeo: LandingGeoInfo = landing;

    proxy._geoEntry = entryGeo;
    proxy._geoLanding = landingGeo;
    proxy._geoCheckedAt = Date.now();

    if (args.cache) {
        const ttl = entryGeo.countryCode === 'ZZ' ? FAILED_CACHE_TTL_MS : SUCCEEDED_CACHE_TTL_MS;
        logDebug('proxy cache write', { index, ttl, entry: entryGeo, landing: landingGeo });
        writeCache(
            cacheId,
            {
                entry: entryGeo,
                landing: landingGeo,
                checkedAt: proxy._geoCheckedAt,
            },
            ttl,
        );
    }

    logDebug('proxy done', { index, entry: entryGeo, landing: landingGeo, checkedAt: proxy._geoCheckedAt });
    return proxy as DetectGeoOutputProxy;
}

function producePolicyDescriptor(
    proxy: ProxyNode,
    targetPlatform: TargetPlatform,
    logDebug?: (message: string, detail?: object) => void,
): string | null {
    if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.produce !== 'function') return null;
    const produced = ProxyUtils.produce([proxy], targetPlatform);
    if (typeof produced !== 'string' || !produced) return null;

    const candidates = produced
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#!'));
    logDebug?.('producePolicyDescriptor', {
        targetPlatform,
        producedLength: produced.length,
        candidateCount: candidates.length,
    });
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
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

function truncateText(value: string, maxLength: number): string {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function toBodyText(body: unknown): string {
    if (typeof body === 'string') return body;
    if (body === null || typeof body === 'undefined') return '';
    try {
        return JSON.stringify(body);
    } catch (_error) {
        return String(body);
    }
}
