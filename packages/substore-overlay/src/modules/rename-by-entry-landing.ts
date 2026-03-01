import type {
    MutableProxy,
    ProxyPreprocessContext,
    ProxyPreprocessor,
} from '../lib/proxy-preprocess.js';

export interface RenameArgs {
    enabled: boolean;
    defaultMultiplier: number;
    showResidential: boolean;
}

const DEFAULT_RENAME_ARGS: RenameArgs = {
    enabled: true,
    defaultMultiplier: 1,
    showResidential: true,
};

export default function renameByEntryLandingModule(
    proxies: MutableProxy[],
    ctx: ProxyPreprocessContext,
): void {
    const args = parseRenameArgs(ctx.rawArgs);
    if (!args.enabled || proxies.length === 0) return;
    renameProxiesByEntryLanding(proxies, args);
}

export function renameProxiesByEntryLanding(
    proxies: MutableProxy[],
    args: RenameArgs,
): void {
    const rows = proxies.map(proxy => {
        const originName = String(proxy._originName || proxy.name || '');
        const entryCode = normalizeCode(getDeep(proxy, '_geoEntry.countryCode'));
        const landingCode = normalizeCode(getDeep(proxy, '_geoLanding.countryCode'));
        const multiplier = extractMultiplier(originName, args.defaultMultiplier);
        const source = String(proxy._subDisplayName || '');
        const isResidential = Boolean(getDeep(proxy, '_geoLanding.isResidential'));

        return {
            proxy,
            originName,
            entryCode,
            landingCode,
            multiplier,
            source,
            isResidential,
        };
    });

    rows.sort((a, b) => {
        if (a.landingCode !== b.landingCode) return a.landingCode.localeCompare(b.landingCode);
        if (a.multiplier !== b.multiplier) return a.multiplier - b.multiplier;
        if (a.entryCode !== b.entryCode) return a.entryCode.localeCompare(b.entryCode);
        return a.originName.localeCompare(b.originName);
    });

    const counter = new Map<string, number>();
    for (const row of rows) {
        const next = (counter.get(row.landingCode) || 0) + 1;
        counter.set(row.landingCode, next);

        const routePrefix = row.entryCode === row.landingCode
            ? row.landingCode
            : `${row.entryCode}->${row.landingCode}`;
        const number = String(next).padStart(2, '0');
        const multiplier = formatMultiplier(row.multiplier);
        const tags = args.showResidential && row.isResidential ? ['家宽'] : [];

        const left = [routePrefix, number, multiplier, ...tags].join(' ').trim();
        row.proxy.name = row.source ? `${left} | ${row.source}` : left;
    }
}

function parseRenameArgs(rawArgs: Record<string, unknown>): RenameArgs {
    return {
        enabled: asBoolean(
            pickArg(rawArgs, ['entry_landing_rename_enabled', 'rename_by_geo_enabled']),
            DEFAULT_RENAME_ARGS.enabled,
        ),
        defaultMultiplier: asPositiveFloat(
            pickArg(rawArgs, ['entry_landing_default_multiplier', 'default_multiplier']),
            DEFAULT_RENAME_ARGS.defaultMultiplier,
        ),
        showResidential: asBoolean(
            pickArg(rawArgs, ['entry_landing_show_residential', 'show_residential']),
            DEFAULT_RENAME_ARGS.showResidential,
        ),
    };
}

function pickArg(rawArgs: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        if (typeof rawArgs[key] !== 'undefined') return rawArgs[key];
    }
    return undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'undefined' || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
}

function asPositiveFloat(value: unknown, fallback: number): number {
    const parsed = Number.parseFloat(String(value));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

function extractMultiplier(name: string, defaultValue: number): number {
    const patterns = [
        /(\d+(?:\.\d+)?)\s*x\b/i,
        /x\s*(\d+(?:\.\d+)?)/i,
        /×\s*(\d+(?:\.\d+)?)/i,
        /(\d+(?:\.\d+)?)\s*倍(?:率)?/i,
    ];
    for (const pattern of patterns) {
        const match = name.match(pattern);
        if (match && match[1]) {
            const parsed = Number.parseFloat(match[1]);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    }
    return defaultValue;
}

function formatMultiplier(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '1x';
    const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
    return `${rounded}x`;
}

function getDeep(object: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = object;
    for (const key of keys) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function normalizeCode(value: unknown): string {
    const code = String(value || '').trim().toUpperCase();
    return code || 'ZZ';
}

export const renameByEntryLandingPreprocessor: ProxyPreprocessor = renameByEntryLandingModule;
