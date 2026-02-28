// src/lib/clash.js
// Clash/Mihomo-specific helpers for override modules.
// Contains: URL/icon helpers, ruleset helpers, proxy group helpers.

import { deferred } from './lazy.js';

// ─── URL / Icon Helpers ─────────────────────────────────────────────

export function getGithub(owner, repo, branch, path) {
    return `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

export const miniIcon = (name) => getGithub("Orz-3", "mini", "master", `Color/${name}.png`);
export const qureIcon = (name) => getGithub("Koolson", "Qure", "master", `IconSet/Color/${name}.png`);

export function externalIcon(id) {
    return `https://img.icons8.com/?size=100&id=${id}&format=png&color=000000`;
}

// ─── Ruleset Helpers ────────────────────────────────────────────────

/**
 * Create a rule provider definition.
 *
 * @param {string} owner - GitHub owner
 * @param {string} repo - GitHub repo
 * @param {string} branch - Branch name
 * @param {string} path - File path within the repo
 * @param {object} [overrides] - Override defaults
 * @returns {{ name: string, provider: object }}
 */
export function makeRuleProvider(owner, repo, branch, path, overrides = {}) {
    const name = path.match(/([\w\-_]+)\.(\w+)$/)[1];
    let behavior = name.endsWith("ip") ? "ipcidr" : "domain";
    let format;

    if (path.endsWith(".yaml")) {
        format = "yaml";
        behavior = "classical";
    } else if (path.endsWith(".mrs")) {
        format = "mrs";
    } else if (path.endsWith(".list")) {
        format = "text";
        behavior = "classical";
    } else {
        throw new Error(`Unsupported ruleset format: ${path}`);
    }

    return {
        name,
        provider: {
            type: "http",
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
 * Shorthand for DustinWin ruleset.
 * Returns { name, provider } where name is the ruleset name.
 */
export function dustinRule(name) {
    return makeRuleProvider(
        "DustinWin", "ruleset_geodata", "mihomo-ruleset",
        `${name}.mrs`
    );
}

/**
 * Create a RULE-SET rule string.
 *
 * @param {string} rulesetName - Name of the rule provider
 * @param {string} proxy - Target proxy/group name
 * @param {...string} options - Additional options (e.g., 'no-resolve')
 * @returns {string}
 */
export function rulesetRule(rulesetName, proxy, ...options) {
    const optStr = options.map(opt => "," + opt).join("");
    return `RULE-SET,${rulesetName},${proxy}${optStr}`;
}

// ─── Proxy Group Helpers ────────────────────────────────────────────

export const GROUP_COMMON = {
    type: "select",
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    "max-failed-times": 2,
};

export const PRIMITIVE_GROUPS = ["DIRECT", "REJECT"];

/**
 * Reorder proxies list so `defaultProxy` is first.
 */
export function reorderProxies(proxies, defaultProxy) {
    const reordered = [...proxies];
    if (defaultProxy) {
        const index = reordered.indexOf(defaultProxy);
        if (index !== -1) reordered.splice(index, 1);
        reordered.unshift(defaultProxy);
    }
    return reordered;
}

/**
 * Create a "traffic" proxy group config.
 * The proxies list is deferred — it will be populated from final._allSelectables.
 *
 * @param {object} final - Lazy final proxy
 * @param {string} name - Group name
 * @param {object} opts - Options
 * @param {string} opts.defaultProxy - Default proxy name (placed first)
 * @param {string} opts.icon - Full icon URL
 * @param {object} [opts.overrides] - Additional group config overrides
 * @returns {object} Proxy group config
 */
export function trafficGroup(final, name, { defaultProxy, icon, ...overrides }) {
    return {
        ...GROUP_COMMON,
        name,
        icon,
        proxies: deferred(() =>
            reorderProxies(final._allSelectables, defaultProxy)
        ),
        ...overrides,
    };
}

/**
 * Create a "general" proxy group (手动选择, 延迟测试, etc.)
 *
 * @param {object} final - Lazy final proxy
 * @param {object} opts - Group options including name, type, etc.
 * @returns {object} Proxy group config
 */
export function generalGroup(final, { name, proxies: explicitProxies, ...overrides }) {
    return {
        ...GROUP_COMMON,
        name,
        proxies: explicitProxies || deferred(() => final._proxies),
        ...overrides,
    };
}
