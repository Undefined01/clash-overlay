import type { ProxyNode, ScriptOperator } from '../types/substore.js';
import type {
    GeoInfo,
    NodeInfo,
} from '../lib/proxy-processor/types.js';
import { SubscriptionNodeInfo } from '../lib/substore-context.js';

/**
 * `rename_nodes` operator.
 *
 * Renames nodes using fields written by upstream processors:
 * - `detect_geo` -> `_geoEntry.countryCode`
 * - `parse_node_name` -> `_nodeInfo.{countryCode,multiplier,tags}`
 *
 * `$arguments`: (none)
 */

/** Input proxy shape consumed by this operator. */
export interface RenameInputProxy {
    name: string;
    _geoEntry?: Partial<Pick<GeoInfo, 'countryCode'>>;
    _geoLanding?: Partial<Pick<GeoInfo, 'countryCode'>>;
    _nodeInfo?: NodeInfo;
}

/** Output proxy shape: original input with rewritten `name`. */

interface RenameRow<TProxy> {
    proxy: TProxy;
    originName: string;
    countryCode: string;
    landingCountryCode: string;
    multiplier: number;
    tags: string[];
    source: string;
}

const operator: ScriptOperator<ProxyNode & RenameInputProxy> = (proxies, _targetPlatform, _context) => {
    if (!Array.isArray(proxies) || proxies.length === 0) return proxies;

    renameNodes(proxies);
    return proxies;
};

export default operator;

export function renameNodes<TProxy extends RenameInputProxy>(
    proxies: TProxy[],
): Array<TProxy> {
    const rows = proxies.map(proxy => buildRenameRow(proxy));
    applyRename(rows);

    const reordered = rows.map(row => row.proxy);
    proxies.splice(0, proxies.length, ...reordered);
    return reordered;
}

function applyRename<TProxy extends RenameInputProxy>(rows: RenameRow<TProxy>[]): void {
    rows.sort((a, b) => {
        const aCode = a.landingCountryCode + a.countryCode;
        const bCode = b.landingCountryCode + b.countryCode;
        if (aCode !== bCode) return aCode.localeCompare(bCode);
        if (a.multiplier !== b.multiplier) return a.multiplier - b.multiplier;
        return a.originName.localeCompare(b.originName);
    });

    const counter = new Map<string, number>();
    for (const row of rows) {
        const next = (counter.get(row.landingCountryCode) || 0) + 1;
        counter.set(row.landingCountryCode, next);

        const routePrefix = row.countryCode;
        const number = String(next).padStart(2, '0');
        const multiplier = formatMultiplier(row.multiplier);
        const tags = row.tags;

        const left = [routePrefix, number, multiplier, ...tags].join(' ').trim();
        row.proxy.name = row.source ? `${left} | ${row.source}` : left;
    }
}

function buildRenameRow<TProxy extends RenameInputProxy & SubscriptionNodeInfo>(
    proxy: TProxy,
): RenameRow<TProxy> {
    const originName = proxy.name;
    const fallback = (countryCode: string | undefined, fallbackCode: string): string => {
        return countryCode && countryCode !== 'ZZ' ? countryCode : fallbackCode;
    }
    const entryCountryCode = fallback(proxy._geoEntry?.countryCode, proxy._nodeInfo?.countryCode ?? 'ZZ');
    const nodeCountryCode = fallback(proxy._geoLanding?.countryCode, proxy._nodeInfo?.countryCode ?? 'ZZ');
    let countryCodes = [entryCountryCode, nodeCountryCode];
    if (entryCountryCode === nodeCountryCode) {
        countryCodes = [entryCountryCode];
    }
    const countryCode = countryCodes.join('→');
    const multiplier = resolveMultiplier(proxy._nodeInfo?.multiplier);
    const tags = resolveTags(proxy._nodeInfo?.tags);
    const source = proxy._subDisplayName || proxy._subName || '';

    return {
        proxy,
        originName,
        countryCode,
        landingCountryCode: countryCodes[countryCodes.length - 1],
        multiplier,
        tags,
        source,
    };
}

function resolveMultiplier(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    return 1;
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
