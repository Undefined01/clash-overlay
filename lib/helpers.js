// lib/helpers.js
// Shared helpers for Clash override modules.
// Extracted from the original override.js utility functions.

const { deferred } = require('./lazy');

// ─── Argument Parsing ───────────────────────────────────────────────

function parseBool(value, defaultValue = false) {
    if (value === null || typeof value === "undefined") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true" || value === "1") return true;
        if (value.toLowerCase() === "false" || value === "0") return false;
    }
    throw new Error(`Invalid boolean value: ${value}`);
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

function parseString(defaultValue) {
    return (value) => {
        if (value === null || typeof value === "undefined") return defaultValue;
        return String(value);
    };
}

function parseArgs(args) {
    const spec = {
        ipv6Enabled: parseBool,
        dnsMode: parseString("fake-ip"),
    };
    return Object.entries(spec).reduce((acc, [name, parseFunc]) => {
        acc[name] = parseFunc(args[name]);
        return acc;
    }, {});
}

// ─── URL / Icon Helpers ─────────────────────────────────────────────

function getGithub(owner, repo, branch, path) {
    return `https://fastly.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

const miniIcon = (name) => getGithub("Orz-3", "mini", "master", `Color/${name}.png`);
const qureIcon = (name) => getGithub("Koolson", "Qure", "master", `IconSet/Color/${name}.png`);

function externalIcon(id) {
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
function makeRuleProvider(owner, repo, branch, path, overrides = {}) {
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
function dustinRule(name) {
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
function rulesetRule(rulesetName, proxy, ...options) {
    const optStr = options.map(opt => "," + opt).join("");
    return `RULE-SET,${rulesetName},${proxy}${optStr}`;
}

// ─── Proxy Group Helpers ────────────────────────────────────────────

const GROUP_COMMON = {
    type: "select",
    url: "https://www.gstatic.com/generate_204",
    interval: 300,
    tolerance: 50,
    "max-failed-times": 2,
};

const PRIMITIVE_GROUPS = ["DIRECT", "REJECT"];

/**
 * Reorder proxies list so `defaultProxy` is first.
 */
function reorderProxies(proxies, defaultProxy) {
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
 * @param {string} opts.icon - Full icon URL (use qureIcon/miniIcon/externalIcon explicitly)
 * @param {object} [opts.overrides] - Additional group config overrides
 * @returns {object} Proxy group config
 */
function trafficGroup(final, name, { defaultProxy, icon, ...overrides }) {
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
function generalGroup(final, { name, proxies: explicitProxies, ...overrides }) {
    return {
        ...GROUP_COMMON,
        name,
        proxies: explicitProxies || deferred(() => final._proxies),
        ...overrides,
    };
}

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Merge lists, filtering out falsy values. Supports nested arrays.
 * mergeList([1, 2], 3, [true && 4, false && 5]) => [1, 2, 3, 4]
 */
function mergeList(...elements) {
    return elements.flat().filter(Boolean);
}

module.exports = {
    // Arg parsing
    parseBool,
    parseNumber,
    parseString,
    parseArgs,

    // URLs & Icons
    getGithub,
    miniIcon,
    qureIcon,
    externalIcon,

    // Rulesets
    makeRuleProvider,
    dustinRule,
    rulesetRule,

    // Proxy groups
    GROUP_COMMON,
    PRIMITIVE_GROUPS,
    reorderProxies,
    trafficGroup,
    generalGroup,

    // Utility
    mergeList,
};
