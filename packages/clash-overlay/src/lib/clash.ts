// clash-overlay/src/lib/clash.ts
// Clash/Mihomo-specific helpers for override modules.
// Contains: URL/icon helpers, ruleset helpers, proxy group helpers.

import { deferred } from 'liboverlay';
import type { Deferred } from 'liboverlay';

// ─── URL / Icon Helpers ─────────────────────────────────────────────

export function getGithub(owner: string, repo: string, branch: string, path: string): string {
    return `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

export const miniIcon = (name: string): string =>
    getGithub('Orz-3', 'mini', 'master', `Color/${name}.png`);

export const qureIcon = (name: string): string =>
    getGithub('Koolson', 'Qure', 'master', `IconSet/Color/${name}.png`);

export function externalIcon(id: string): string {
    return `https://img.icons8.com/?size=100&id=${id}&format=png&color=000000`;
}

// ─── Ruleset Helpers ────────────────────────────────────────────────

export interface RuleProvider {
    type: string;
    behavior: string;
    format: string;
    interval: number;
    path: string;
    url: string;
    [key: string]: unknown;
}

export interface RuleProviderEntry {
    name: string;
    provider: RuleProvider;
}

/**
 * Create a rule provider definition.
 */
export function makeRuleProvider(
    owner: string,
    repo: string,
    branch: string,
    path: string,
    overrides: Partial<RuleProvider> = {},
): RuleProviderEntry {
    const match = path.match(/([\w\-_]+)\.(\w+)$/);
    if (!match) throw new Error(`Cannot extract name from path: ${path}`);
    const name = match[1];
    let behavior = name.endsWith('ip') ? 'ipcidr' : 'domain';
    let format: string;

    if (path.endsWith('.yaml')) {
        format = 'yaml';
        behavior = 'classical';
    } else if (path.endsWith('.mrs')) {
        format = 'mrs';
    } else if (path.endsWith('.list')) {
        format = 'text';
        behavior = 'classical';
    } else {
        throw new Error(`Unsupported ruleset format: ${path}`);
    }

    return {
        name,
        provider: {
            type: 'http',
            behavior,
            format,
            interval: 86400,
            path: `./ruleset/${owner}/${name}.${format}`,
            url: getGithub(owner, repo, branch, path),
            ...overrides,
        },
    };
}

/**
 * Shorthand for DustinWin ruleset (.mrs format).
 */
export function dustinRule(name: string): RuleProviderEntry {
    return makeRuleProvider(
        'DustinWin', 'ruleset_geodata', 'mihomo-ruleset',
        `${name}.mrs`,
    );
}

/**
 * Create a RULE-SET rule string.
 */
export function rulesetRule(rulesetName: string, proxy: string, ...options: string[]): string {
    const optStr = options.map(opt => ',' + opt).join('');
    return `RULE-SET,${rulesetName},${proxy}${optStr}`;
}

// ─── Proxy Group Helpers ────────────────────────────────────────────

export interface ProxyGroup {
    name: string;
    type: string;
    url?: string;
    interval?: number;
    tolerance?: number;
    'max-failed-times'?: number;
    proxies?: string[] | Deferred<string[]>;
    icon?: string;
    filter?: string;
    'exclude-filter'?: string;
    'dialer-proxy'?: string;
    strategy?: string;
    [key: string]: unknown;
}

export const GROUP_COMMON: Partial<ProxyGroup> = {
    type: 'select',
    url: 'https://www.gstatic.com/generate_204',
    interval: 300,
    tolerance: 50,
    'max-failed-times': 2,
};

export const PRIMITIVE_GROUPS: string[] = ['DIRECT', 'REJECT'];

/**
 * Reorder proxies list so `defaultProxy` is first.
 */
export function reorderProxies(proxies: string[], defaultProxy: string | null): string[] {
    const reordered = [...proxies];
    if (defaultProxy) {
        const index = reordered.indexOf(defaultProxy);
        if (index !== -1) reordered.splice(index, 1);
        reordered.unshift(defaultProxy);
    }
    return reordered;
}

/** State type used by the final proxy. */
interface ClashState {
    _allSelectables: string[];
    _proxies: string[];
    [key: string]: unknown;
}

/**
 * Create a "traffic" proxy group config.
 * The proxies list is deferred — populated from final._allSelectables.
 */
export function trafficGroup(
    final: ClashState,
    name: string,
    { defaultProxy, icon, ...overrides }: {
        defaultProxy: string | null;
        icon: string;
        [key: string]: unknown;
    },
): ProxyGroup {
    return {
        ...GROUP_COMMON,
        name,
        icon,
        proxies: deferred(() =>
            reorderProxies(final._allSelectables, defaultProxy),
        ),
        ...overrides,
    } as ProxyGroup;
}

/**
 * Create a "general" proxy group (手动选择, 延迟测试, etc.)
 */
export function generalGroup(
    final: ClashState,
    { name, proxies: explicitProxies, ...overrides }: {
        name: string;
        proxies?: string[];
        [key: string]: unknown;
    },
): ProxyGroup {
    return {
        ...GROUP_COMMON,
        name,
        proxies: explicitProxies ?? deferred(() => final._proxies),
        ...overrides,
    } as ProxyGroup;
}
