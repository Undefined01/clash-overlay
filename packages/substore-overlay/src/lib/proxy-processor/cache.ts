import type { BaseProxy } from './types.js';
import { isRecord } from './runtime.js';

const dayMs = 24 * 60 * 60 * 1000;

export interface GeoPairCacheValue {
    entry: {
        countryCode: string;
    };
    landing: {
        countryCode: string;
    };
    checkedAt: number;
}

export function defaultCacheTtlMs(): number {
    return dayMs;
}

export function readCache(id: string): Record<string, unknown> | string | null {
    if (typeof scriptResourceCache === 'undefined') return null;
    const value = scriptResourceCache.get(id);
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'string') return value;
    if (isRecord(value)) return value;
    return null;
}

export function writeCache(id: string, value: unknown, ttl?: number): void {
    if (typeof scriptResourceCache === 'undefined') return;
    scriptResourceCache.set(id, value, ttl);
}

export function buildGeoPairCacheId(
    proxy: BaseProxy,
    options: Record<string, string>,
): string {
    const stableProxy: Record<string, unknown> = {};
    const entries = Object.entries(proxy)
        .filter(([key]) => !key.startsWith('_') && key !== 'name')
        .sort(([a], [b]) => a.localeCompare(b));
    for (const [key, value] of entries) {
        stableProxy[key] = value;
    }
    return `proxy-processor-geo:${stableStringify(options)}:${stableStringify(stableProxy)}`;
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
