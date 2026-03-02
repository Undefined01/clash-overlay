import * as v from 'valibot';
import type { ScriptOperator, SubStoreArguments } from '../types/substore.js';
import { getNodeSubscriptionName } from '../lib/substore-context.js';
import {
    parseBooleanArg,
    parsePositiveFloatArg,
    scalarSchema,
} from '../lib/args.js';
import type {
    BaseProxy,
    GeoInfo,
    NodeInfo,
    WithName,
} from '../lib/proxy-processor/types.js';
import { normalizeCountryCode } from '../lib/proxy-processor/country.js';

export const renameScriptArgsSchema = v.object({
    entry_landing_rename_enabled: v.optional(scalarSchema),
    rename_by_geo_enabled: v.optional(scalarSchema),

    entry_landing_default_multiplier: v.optional(scalarSchema),
    default_multiplier: v.optional(scalarSchema),

    entry_landing_show_residential: v.optional(scalarSchema),
    show_residential: v.optional(scalarSchema),
});

export type RenameScriptArgs = v.InferOutput<typeof renameScriptArgsSchema> & SubStoreArguments;

const renameArgsSchema = v.object({
    enabled: v.boolean(),
    defaultMultiplier: v.number(),
    showResidential: v.boolean(),
});

type RenameArgs = v.InferOutput<typeof renameArgsSchema>;

const renameDefaults = {
    enabled: true,
    defaultMultiplier: 1,
    showResidential: true,
} as const;

function parseRenameArgs(rawArgs: SubStoreArguments): RenameArgs {
    return v.parse(renameArgsSchema, {
        enabled: parseBooleanArg(
            rawArgs,
            ['entry_landing_rename_enabled', 'rename_by_geo_enabled'],
            renameDefaults.enabled,
        ),
        defaultMultiplier: parsePositiveFloatArg(
            rawArgs,
            ['entry_landing_default_multiplier', 'default_multiplier'],
            renameDefaults.defaultMultiplier,
        ),
        showResidential: parseBooleanArg(
            rawArgs,
            ['entry_landing_show_residential', 'show_residential'],
            renameDefaults.showResidential,
        ),
    });
}

/** Input proxy shape consumed by this operator. */
export interface RenameInputProxy extends BaseProxy {
    _geoEntry?: Partial<Pick<GeoInfo, 'countryCode'>>;
    _nodeInfo?: NodeInfo;
}

/** Output proxy shape: original input with rewritten `name`. */
export type RenameOutputProxy<TProxy extends RenameInputProxy> = WithName<TProxy>;

interface RenameRow<TProxy extends RenameInputProxy> {
    proxy: TProxy;
    originName: string;
    countryCode: string;
    multiplier: number;
    tags: string[];
    source: string;
}

const operator: ScriptOperator<RenameInputProxy> = (proxies, _targetPlatform, _context) => {
    if (!Array.isArray(proxies) || proxies.length === 0) return proxies;

    const args = parseRenameArgs(typeof $arguments !== 'undefined' ? $arguments : {});
    if (!args.enabled) return proxies;

    renameProxies(proxies, args);
    return proxies;
};

export default operator;

export function renameProxies<TProxy extends RenameInputProxy>(
    proxies: TProxy[],
    args: RenameArgs,
): Array<RenameOutputProxy<TProxy>> {
    const rows = proxies.map(proxy => buildRenameRow(proxy, args));
    applyRename(rows, args);

    const reordered = rows.map(row => row.proxy as RenameOutputProxy<TProxy>);
    proxies.splice(0, proxies.length, ...reordered);
    return reordered;
}

export function renameProxiesByNodeInfo<TProxy extends RenameInputProxy>(
    proxies: TProxy[],
    args: RenameArgs,
): Array<RenameOutputProxy<TProxy>> {
    return renameProxies(proxies, args);
}

export function renameProxiesByEntryLanding<TProxy extends RenameInputProxy>(
    proxies: TProxy[],
    args: RenameArgs,
): Array<RenameOutputProxy<TProxy>> {
    return renameProxiesByNodeInfo(proxies, args);
}

function applyRename<TProxy extends RenameInputProxy>(rows: RenameRow<TProxy>[], args: RenameArgs): void {
    rows.sort((a, b) => {
        if (a.countryCode !== b.countryCode) return a.countryCode.localeCompare(b.countryCode);
        if (a.multiplier !== b.multiplier) return a.multiplier - b.multiplier;
        return a.originName.localeCompare(b.originName);
    });

    const counter = new Map<string, number>();
    for (const row of rows) {
        const next = (counter.get(row.countryCode) || 0) + 1;
        counter.set(row.countryCode, next);

        const routePrefix = row.countryCode;
        const number = String(next).padStart(2, '0');
        const multiplier = formatMultiplier(row.multiplier);
        const tags = args.showResidential ? row.tags : row.tags.filter(t => t !== '家宽');

        const left = [routePrefix, number, multiplier, ...tags].join(' ').trim();
        row.proxy.name = row.source ? `${left} | ${row.source}` : left;
    }
}

function buildRenameRow<TProxy extends RenameInputProxy>(
    proxy: TProxy,
    args: RenameArgs,
): RenameRow<TProxy> {
    const originName = String(proxy._originName || proxy.name || '');
    const countryCode = normalizeCountryCode(proxy._geoEntry?.countryCode ?? proxy._nodeInfo?.countryCode);
    const multiplier = resolveMultiplier(proxy._nodeInfo?.multiplier, args.defaultMultiplier);
    const tags = resolveTags(proxy._nodeInfo?.tags);
    const source = getNodeSubscriptionName(proxy, {
        includeCollectionName: false,
    });

    return {
        proxy,
        originName,
        countryCode,
        multiplier,
        tags,
        source,
    };
}

function resolveMultiplier(value: unknown, defaultMultiplier: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    return defaultMultiplier;
}

function resolveTags(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        if (typeof item !== 'string') continue;
        const tag = item.trim();
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
    }
    return out;
}

function formatMultiplier(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '1x';
    const rounded = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
    return `${rounded}x`;
}
