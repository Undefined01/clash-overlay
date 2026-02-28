// lib/merge.js
// Clash configuration module merge engine.
//
// Each module contributes pieces of a Clash config. This engine merges
// them together with the correct strategy per field, then resolves deferred values.

const { deferred, isDeferred, resolveDeferred, applyOverlays } = require('./lazy');

/**
 * Merge strategy for Clash module contributions.
 *
 * | Field           | Strategy                                    |
 * |-----------------|---------------------------------------------|
 * | `rules`         | Array concat (ordered, earlier = higher pri) |
 * | `proxyGroups`   | Array concat                                |
 * | `ruleProviders` | Object merge (key conflict = error)         |
 * | `dns`           | Deep merge                                  |
 * | `hosts`         | Object merge                                |
 * | scalars         | Later value wins                            |
 *
 * @param {object} current - Accumulated state
 * @param {object} extension - New contributions from a module
 * @returns {object} Merged result
 */
function clashModuleMerge(current, extension) {
    const result = { ...current };

    for (const [key, value] of Object.entries(extension)) {
        if (value === undefined) continue;

        if (!(key in result) || result[key] === undefined) {
            result[key] = value;
            continue;
        }

        const cur = result[key];

        // Array fields: concatenate
        if (Array.isArray(cur) && Array.isArray(value)) {
            result[key] = [...cur, ...value];
            continue;
        }

        // Object fields: merge (with conflict detection for ruleProviders)
        if (isPlainObject(cur) && isPlainObject(value)) {
            if (key === 'ruleProviders') {
                // Strict merge: error on key conflict
                for (const k of Object.keys(value)) {
                    if (k in cur) {
                        throw new Error(`Rule provider key conflict: "${k}" already defined.`);
                    }
                }
                result[key] = { ...cur, ...value };
            } else {
                // Deep-ish merge (one level)
                result[key] = deepMerge(cur, value);
            }
            continue;
        }

        // Deferred values: keep as-is for later resolution
        if (isDeferred(value)) {
            result[key] = value;
            continue;
        }

        // Scalar: later wins
        result[key] = value;
    }

    return result;
}

function isPlainObject(val) {
    return (
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !isDeferred(val) &&
        !(val instanceof RegExp) &&
        !(val instanceof Date)
    );
}

/**
 * Deep merge two plain objects. Arrays within are concatenated.
 */
function deepMerge(target, source) {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (isPlainObject(result[key]) && isPlainObject(value)) {
            result[key] = deepMerge(result[key], value);
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = [...result[key], ...value];
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ─── Module System ──────────────────────────────────────────────────

/**
 * The initial empty state for the Clash module system.
 */
function initialModuleState() {
    return {
        // Clash top-level config fields
        general: {},
        dns: {},
        hosts: {},
        sniffer: {},
        tun: {},

        // Module-managed fields
        proxyGroups: [],
        rules: [],
        ipRules: [],       // IP-based rules (appended after domain rules)
        ruleProviders: {},
    };
}

/**
 * Merge modules into a Clash configuration.
 *
 * Each module is a function: `(final, prev, ctx) => contributions`
 *   - `final`: lazy proxy to the fully merged result (use with deferred())
 *   - `prev`:  current accumulated state from previous modules
 *   - `ctx`:   shared context (proxies, helpers, args)
 *
 * @param {Array<Function>} modules - Module functions
 * @param {object} ctx - Shared context passed to each module
 * @returns {object} Fully merged and resolved Clash config
 */
function mergeModules(modules, ctx) {
    // Wrap modules to inject ctx
    const overlays = modules.map(mod => {
        return (final, prev) => mod(final, prev, ctx);
    });

    const base = initialModuleState();
    return applyOverlays(base, overlays, { merge: clashModuleMerge });
}

/**
 * Convert the merged module state into a final Clash configuration object.
 *
 * This assembles the top-level structure expected by Mihomo/Clash.
 *
 * @param {object} merged - Result from mergeModules()
 * @param {object} ctx - Context with proxies etc.
 * @returns {object} Clash config
 */
function buildClashConfig(merged, ctx) {
    // Assemble rules: domain rules first, then IP rules, then MATCH fallback
    const allRules = [
        ...merged.rules,
        ...merged.ipRules,
        `MATCH,${merged._fallbackGroup || '漏网之鱼'}`,
    ];

    const config = {
        ...merged.general,
        ...merged.hosts,
        dns: merged.dns,
        sniffer: merged.sniffer,
        tun: merged.tun,
        proxies: ctx.rawProxies,
        'proxy-groups': merged.proxyGroups,
        rules: allRules,
        'rule-providers': merged.ruleProviders,
    };

    // Clean up undefined/empty fields
    for (const key of Object.keys(config)) {
        if (config[key] === undefined) delete config[key];
        if (isPlainObject(config[key]) && Object.keys(config[key]).length === 0) {
            delete config[key];
        }
    }

    return config;
}

module.exports = {
    clashModuleMerge,
    deepMerge,
    initialModuleState,
    mergeModules,
    buildClashConfig,
};
