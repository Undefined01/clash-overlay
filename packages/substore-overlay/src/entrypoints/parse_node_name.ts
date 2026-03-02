import type { ScriptOperator, ProxyNode } from '../types/substore.js';
import type { MergeNodeInfo } from '../lib/substore-context.js';
import type { NodeInfo, NodeInfoPatch } from '../lib/proxy-processor/types.js';
import { normalizeCountryCode } from '../lib/proxy-processor/country.js';

/**
 * `parse_node_name` operator.
 *
 * Writes `_nodeInfo` based on node `name` only.
 *
 * `$arguments`: (none)
 * - This operator intentionally ignores `$arguments` for stability and composability.
 */

/** Input proxy extra fields consumed by this operator (besides {@link ProxyNode}). */
export type ParseNodeNameInputProxy = MergeNodeInfo & Partial<NodeInfoPatch> & {
    name: string;
};

/** Fields patched by this operator. */
export type ParseNodeNamePatch = NodeInfoPatch;

/** Output proxy shape: original input plus patched private fields. */
export type ParseNodeNameOutputProxy = ParseNodeNameInputProxy & ParseNodeNamePatch;

export const operator: ScriptOperator<ParseNodeNameInputProxy, ParseNodeNameOutputProxy> = (proxies, _targetPlatform, _context) => {
    for (const proxy of proxies) {
        proxy._nodeInfo = parseNodeInfoFromName(proxy.name);
    }

    return proxies as Array<ParseNodeNameOutputProxy>;
};

export default operator;

/**
 * Built-in rules.
 *
 * The array order is preserved in output (deduped by first appearance).
 */
const builtInTagRules: Array<{ pattern: RegExp; tag: string }> = [
    { pattern: /IPLC/i, tag: 'IPLC' },
    { pattern: /IEPL/i, tag: 'IEPL' },
    { pattern: /核心/, tag: '核心' },
    { pattern: /边缘/, tag: '边缘' },
    { pattern: /高级/, tag: '高级' },
    { pattern: /标准/, tag: '标准' },
    { pattern: /实验/, tag: '实验' },
    { pattern: /商宽/, tag: '商宽' },
    { pattern: /游戏|game/i, tag: '游戏' },
    { pattern: /购物/, tag: '购物' },
    { pattern: /专线/, tag: '专线' },
    { pattern: /LB/i, tag: 'LB' },
    { pattern: /cloudflare/i, tag: 'CF' },
    { pattern: /\budp\b/i, tag: 'UDP' },
    { pattern: /\bgpt\b/i, tag: 'GPT' },
    { pattern: /\budpn\b/i, tag: 'UDPN' },
];
const residentialTagPattern = /(家宽|住宅|residential|home)/i;

export function parseNodeInfoFromName(
    name: string,
): NodeInfo {
    const normalizedName = String(name || '');
    const countryCode = resolveCountryCode(normalizedName);
    const multiplier = resolveMultiplier(normalizedName);
    const tags = collectTags(normalizedName);

    const nodeInfo: NodeInfo = { countryCode };
    if (typeof multiplier === 'number') nodeInfo.multiplier = multiplier;
    if (tags.length > 0) nodeInfo.tags = tags;

    return nodeInfo;
}

export function resolveCountryCode(name: string): string {
    const iso = typeof ProxyUtils !== 'undefined' && ProxyUtils && typeof ProxyUtils.getISO === 'function'
        ? ProxyUtils.getISO(name)
        : undefined;
    return normalizeCountryCode(iso);
}

function resolveMultiplier(name: string): number | undefined {
    // Replace full-width characters with half-width equivalents for more robust parsing
    const normalize_rules: Array<[RegExp, string]> = [
        [/（/g, '('],
        [/）/g, ')'],

        [/倍率/g, "x"],
        [/倍/g, "x"],
        [/ˣ/g, 'x'],
        [/×/gi, "x"],
        [/\bX\b/g, "x"],
    
        [/⁰/g, '0'],
        [/¹/g, '1'],
        [/²/g, '2'],
        [/³/g, '3'],
        [/⁴/g, '4'],
        [/⁵/g, '5'],
        [/⁶/g, '6'],
        [/⁷/g, '7'],
        [/⁸/g, '8'],
        [/⁹/g, '9'],
    ]
    let normalized_name = name;
    for (const [regex, replacement] of normalize_rules) {
        normalized_name = normalized_name.replace(regex, replacement);
    }

    // 1) 1.5x / 1.5 x
    // 2) x1.5 / x 1.5
    // 3) 倍率1.5 / 1.5倍率 / 1.5倍（都会被 normalize 成 x）
    const re =
        /(?:\b(\d+(?:\.\d+)?)\s*x\b)|(?:\bx\s*(\d+(?:\.\d+)?))|(?:\b(\d+(?:\.\d+)?)\s*x(?!\w))/i;
    const match = normalized_name.match(re);
    if (match && match[1]) {
        const parsed = Number.parseFloat(match[1]);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return undefined;
}

function collectTags(name: string): string[] {
    const tags: string[] = [];
    const seen = new Set<string>();

    const pushTag = (tag: string | undefined): void => {
        if (!tag || seen.has(tag)) return;
        seen.add(tag);
        tags.push(tag);
    };

    for (const rule of builtInTagRules) {
        if (rule.pattern.test(name)) pushTag(rule.tag);
    }

    if (residentialTagPattern.test(name)) {
        pushTag('家宽');
    }

    return tags;
}
