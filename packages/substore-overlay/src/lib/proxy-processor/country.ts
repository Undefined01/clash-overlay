import { withRetry, isRecord } from './runtime.js';

export async function resolveIp(host: string,
    DOH_API: string,
    HTTP_TIMEOUT_MS: number,
    EDNS_CLIENT_SUBNET: string,
    RETRIES: number,
    RETRY_DELAY_MS: number,
    logDebug?: (message: string, detail?: object) => void): Promise<string> {
    const value = String(host || '').trim();
    if (!value) {
        logDebug?.('MMDB resolveIp empty host');
    }
    if (!value) return '';
    if (typeof ProxyUtils !== 'undefined' && ProxyUtils && typeof ProxyUtils.isIP === 'function' && ProxyUtils.isIP(value)) {
        logDebug?.('MMDB resolveIp host is IP', { host: value });
        return value;
    }
    if (typeof ProxyUtils === 'undefined' || !ProxyUtils || typeof ProxyUtils.doh !== 'function') {
        logDebug?.('MMDB resolveIp missing ProxyUtils.doh', {
            hasProxyUtils: typeof ProxyUtils !== 'undefined' && !!ProxyUtils,
            dohType: typeof (typeof ProxyUtils === 'undefined' ? undefined : (ProxyUtils as Record<string, unknown>).doh),
        });
        return '';
    }

    const packet = await withRetry(
        () => ProxyUtils.doh({ url: DOH_API, domain: value, type: 'A', timeout: HTTP_TIMEOUT_MS, edns: EDNS_CLIENT_SUBNET }),
        RETRIES,
        RETRY_DELAY_MS,
        logDebug,
        `doh:${value}`,
    );

    logDebug?.('MMDB resolveIp doh packet', {
        host: value,
        answerCount: isRecord(packet) && Array.isArray((packet as { answers?: unknown }).answers)
            ? ((packet as { answers?: unknown }).answers as unknown[]).length
            : null,
    });

    const answers = (packet && typeof packet === 'object' && 'answers' in packet ? (packet as { answers?: unknown }).answers : null) as unknown;
    if (!Array.isArray(answers)) return '';
    const firstA = answers.find((a) => isRecord(a) && a.type === 'A' && typeof a.data === 'string') as { data?: string } | undefined;
    const ip = String(firstA?.data || '').trim();
    if (typeof ProxyUtils !== 'undefined' && ProxyUtils && typeof ProxyUtils.isIP === 'function' && ProxyUtils.isIP(ip)) {
        logDebug?.('MMDB resolveIp doh resolved A', { host: value, ip });
        return ip;
    }
    logDebug?.('MMDB resolveIp doh no A record', { host: value });
    return '';
}

export function normalizeCountryCode(value: unknown): string {
    const code = String(value || '').trim().toUpperCase();
    return code || 'ZZ';
}
