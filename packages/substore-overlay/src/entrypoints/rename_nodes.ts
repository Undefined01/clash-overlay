import type { ProxyNode, ScriptOperator } from '../types/substore.js';
import { getNodeSubscriptionName } from '../lib/substore-context.js';
import type {
    GeoInfo,
    NodeInfo,
} from '../lib/proxy-processor/types.js';
import { normalizeCountryCode } from '../lib/proxy-processor/country.js';

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
    _nodeInfo?: NodeInfo;
}

/** Output proxy shape: original input with rewritten `name`. */

interface RenameRow<TProxy> {
    proxy: TProxy;
    originName: string;
    countryCode: string;
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
        const tags = row.tags;

        const left = [routePrefix, number, multiplier, ...tags].join(' ').trim();
        row.proxy.name = row.source ? `${left} | ${row.source}` : left;
    }
}

function buildRenameRow<TProxy extends RenameInputProxy>(
    proxy: TProxy,
): RenameRow<TProxy> {
    const originName = proxy.name;
    const countryCode = normalizeCountryCode(proxy._geoEntry?.countryCode ?? proxy._nodeInfo?.countryCode);
    const multiplier = resolveMultiplier(proxy._nodeInfo?.multiplier);
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
