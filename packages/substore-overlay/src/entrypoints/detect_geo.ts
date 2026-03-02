import * as v from 'valibot';
import type { ProxyNode, ScriptOperator, TargetPlatform } from '../types/substore.js';
import { booleanArgSchema, positiveIntSchema } from '../lib/args.js';
import { normalizeCountryCode } from '../lib/proxy-processor/country.js';
import {
    buildGeoPairCacheId,
    defaultCacheTtlMs,
    readCache,
    writeCache,
} from '../lib/proxy-processor/cache.js';
import {
    executeAsyncTasks,
    isRecord,
    safeJsonParse,
    withRetry,
} from '../lib/proxy-processor/runtime.js';
import type { GeoInfo, LandingGeoInfo } from '../lib/proxy-processor/types.js';

const IP_API_ENTRY_TEMPLATE = 'http://ip-api.com/json/{{host}}?fields=status,countryCode';
const IP_API_LANDING = 'http://ip-api.com/json?fields=status,countryCode';
const DOH_API = 'https://1.1.1.1/dns-query';

const HTTP_TIMEOUT_MS = 5000;
const RETRIES = 1;
const RETRY_DELAY_MS = 800;

const entryDetectionModeSchema = v.fallback(
    v.pipe(
        v.string(),
        v.transform((s) => s.trim()),
        v.transform((s) => {
            const lower = s.toLowerCase();
            if (lower === 'mmdb') return 'MMDB';
            if (lower === 'ip-api' || lower === 'ip_api' || lower === 'ipapi') return 'ip-api';
            return s;
        }),
        v.picklist(['MMDB', 'ip-api'] as const),
    ),
    'ip-api',
);

const detectGeoArgsSchema = v.looseObject({
    cache: v.optional(booleanArgSchema, true),
    concurrency: v.optional(positiveIntSchema, 10),
    entry_detection_mode: v.optional(entryDetectionModeSchema, 'ip-api'),
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
    const entryDetector: GeoDetector = args.entry_detection_mode === 'MMDB' ? new MMDBGeoDetector() : new IpApiGeoDetector();
    const landingDetector: LandingGeoDetector = new SubStoreSurgeGeoDetector();

    const tasks = proxies.map(proxy => async () => {
        return await detectOneProxy(proxy, args, entryDetector, landingDetector);
    });
    const results = await executeAsyncTasks(tasks, args.concurrency);
    return results;
};

export default operator;

interface GeoDetector {
    detect(host: string): Promise<{ countryCode: string }>;
}

class MMDBGeoDetector implements GeoDetector {
    async detect(host: string): Promise<{ countryCode: string }> {
        const ip = await this.resolveIp(host);
        if (!ip) return { countryCode: 'ZZ' };
        if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.MMDB !== 'function') {
            return { countryCode: 'ZZ' };
        }

        const mmdb = new ProxyUtils.MMDB();
        const iso = mmdb.geoip(ip);
        return { countryCode: normalizeCountryCode(iso) };
    }

    private async resolveIp(host: string): Promise<string> {
        const value = String(host || '').trim();
        if (!value) return '';
        if (typeof ProxyUtils !== 'undefined' && ProxyUtils && typeof ProxyUtils.isIP === 'function' && ProxyUtils.isIP(value)) {
            return value;
        }
        if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.doh !== 'function') {
            return '';
        }

        const packet = await withRetry(
            () => ProxyUtils.doh({ url: DOH_API, domain: value, type: 'A', timeout: HTTP_TIMEOUT_MS }),
            RETRIES,
            RETRY_DELAY_MS,
            undefined,
            `doh:${value}`,
        );

        const answers = (packet && typeof packet === 'object' && 'answers' in packet ? (packet as { answers?: unknown }).answers : null) as unknown;
        if (!Array.isArray(answers)) return '';
        const firstA = answers.find((a) => isRecord(a) && a.type === 'A' && typeof a.data === 'string') as { data?: string } | undefined;
        const ip = String(firstA?.data || '').trim();
        if (typeof ProxyUtils !== 'undefined' && ProxyUtils && typeof ProxyUtils.isIP === 'function' && ProxyUtils.isIP(ip)) {
            return ip;
        }
        return '';
    }
}

class IpApiGeoDetector implements GeoDetector {
    async detect(host: string): Promise<{ countryCode: string }> {
        const value = String(host || '').trim();
        if (!value) return { countryCode: 'ZZ' };
        if (typeof $substore === 'undefined') return { countryCode: 'ZZ' };

        const url = IP_API_ENTRY_TEMPLATE.replace(/\{\{host\}\}/g, encodeURIComponent(value));
        const response = await withRetry(
            () => $substore.http.get({ url, timeout: HTTP_TIMEOUT_MS, headers: { accept: 'application/json' } }),
            RETRIES,
            RETRY_DELAY_MS,
            undefined,
            `ip-api-entry:${value}`,
        );

        const parsed = safeJsonParse<Record<string, unknown>>(response.body) || {};
        if (String(parsed.status || '') && String(parsed.status || '') !== 'success') {
            return { countryCode: 'ZZ' };
        }
        return { countryCode: normalizeCountryCode(parsed.countryCode) };
    }
}

interface LandingGeoDetector {
    detect(node: ProxyNode): Promise<{ countryCode: string }>;
}

class SubStoreSurgeGeoDetector implements LandingGeoDetector {
    async detect(node: ProxyNode): Promise<{ countryCode: string }> {
        if (typeof $substore === 'undefined') return { countryCode: 'ZZ' };

        const runtimeTarget = detectRuntimeTarget();
        if (!runtimeTarget) return { countryCode: 'ZZ' };

        const policyDescriptor = producePolicyDescriptor(node, runtimeTarget);
        if (!policyDescriptor) return { countryCode: 'ZZ' };

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
            undefined,
            `ip-api-landing:${String(node.name || '')}`,
        );

        const parsed = safeJsonParse<Record<string, unknown>>(response.body) || {};
        if (String(parsed.status || '') && String(parsed.status || '') !== 'success') {
            return { countryCode: 'ZZ' };
        }
        return { countryCode: normalizeCountryCode(parsed.countryCode) };
    }
}

export { buildGeoPairCacheId };

async function detectOneProxy(
    proxy: ProxyNode & DetectGeoInputProxy,
    args: DetectGeoArgs,
    entryDetector: GeoDetector,
    landingDetector: LandingGeoDetector,
): Promise<DetectGeoOutputProxy> {
    if (typeof proxy._originName === 'undefined') {
        proxy._originName = String(proxy.name || '');
    }

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
            return proxy as DetectGeoOutputProxy;
        }
    }

    const entry = await entryDetector.detect(String(proxy.server || ''));
    const landing = await landingDetector.detect(proxy);

    const entryGeo: GeoInfo = { countryCode: normalizeCountryCode(entry.countryCode) };
    const landingGeo: LandingGeoInfo = { countryCode: normalizeCountryCode(landing.countryCode) };

    proxy._geoEntry = entryGeo;
    proxy._geoLanding = landingGeo;
    proxy._geoCheckedAt = Date.now();

    if (args.cache) {
        writeCache(
            cacheId,
            {
                entry: entryGeo,
                landing: landingGeo,
                checkedAt: proxy._geoCheckedAt,
            },
            defaultCacheTtlMs(),
        );
    }

    return proxy as DetectGeoOutputProxy;
}

function detectRuntimeTarget(): TargetPlatform | null {
    const env = typeof $substore === 'undefined' ? null : $substore.env;
    if (env?.isLoon) return 'Loon';
    if (env?.isSurge) return 'Surge';
    return null;
}

function producePolicyDescriptor(proxy: ProxyNode, targetPlatform: TargetPlatform): string | null {
    if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.produce !== 'function') return null;
    const produced = ProxyUtils.produce([proxy], targetPlatform);
    if (typeof produced !== 'string' || !produced) return null;

    const candidates = produced
        .split(/[\r\n]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#!'));
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
