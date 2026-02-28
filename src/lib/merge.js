// src/lib/merge.js
// Clash configuration module merge engine.
//
// Each module contributes Clash-native config fragments. This engine merges
// them with the correct strategy per field type, detects scalar conflicts,
// and resolves deferred values with ordered list flattening.

import {
    isDeferred, resolveDeferred, applyOverlays,
    isPriorityWrapped, getPriorityType, unwrapPriority,
    isOrdered, isOrderedList, isArrayLike,
    DEFAULT_ORDER,
} from './lazy.js';

// ─── Helpers ────────────────────────────────────────────────────────

function isPlainObject(val) {
    return (
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !isDeferred(val) &&
        !isPriorityWrapped(val) &&
        !isOrdered(val) &&
        !isOrderedList(val) &&
        !(val instanceof RegExp) &&
        !(val instanceof Date)
    );
}

/**
 * Deep merge two plain objects. Arrays within are concatenated.
 * Scalars inside deep merge use "later wins" (no conflict detection).
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

// ─── Ordered Array Helpers ─────────────────────────────────────────

/**
 * Convert an array-like value to ordered segments.
 */
function toSegments(val) {
    if (isOrderedList(val)) return val.segments;
    if (isOrdered(val)) return [{ order: val.order, items: val.items }];
    if (Array.isArray(val)) {
        const hasOrdered = val.some(item => isOrdered(item));
        if (hasOrdered) {
            const segments = [];
            let inline = [];
            for (const item of val) {
                if (isOrdered(item)) {
                    if (inline.length > 0) {
                        segments.push({ order: DEFAULT_ORDER, items: inline });
                        inline = [];
                    }
                    segments.push({ order: item.order, items: item.items });
                } else {
                    inline.push(item);
                }
            }
            if (inline.length > 0) {
                segments.push({ order: DEFAULT_ORDER, items: inline });
            }
            return segments;
        }
        return [{ order: DEFAULT_ORDER, items: val }];
    }
    throw new Error('Expected array-like value, got: ' + typeof val);
}

// ─── Merge Strategy ─────────────────────────────────────────────────

/**
 * Merge strategy for Clash module contributions.
 *
 * Scalar conflict resolution:
 *   - Same value → ok (idempotent)
 *   - mkDefault + mkOverride → mkOverride wins
 *   - Everything else with different values → error
 *
 * Array merge:
 *   - Arrays are collected as ordered segments
 *
 * Object merge:
 *   - Deep merge (recursive)
 *   - rule-providers: strict key-conflict detection
 */
export function clashModuleMerge(current, extension) {
    const result = { ...current };

    for (const [key, extRaw] of Object.entries(extension)) {
        if (extRaw === undefined) continue;

        // New key
        if (!(key in result) || result[key] === undefined) {
            if (!key.startsWith('_') && isArrayLike(extRaw)) {
                result[key] = { __orderedList: true, segments: toSegments(extRaw) };
            } else {
                result[key] = extRaw;
            }
            continue;
        }

        const curRaw = result[key];

        // Deferred values: keep extension for later resolution
        if (isDeferred(extRaw)) {
            result[key] = extRaw;
            continue;
        }

        // Internal metadata (_* keys): later wins
        if (key.startsWith('_')) {
            result[key] = extRaw;
            continue;
        }

        // ── Array-like: collect ordered segments ──
        const curIsArr = isArrayLike(curRaw);
        const extIsArr = isArrayLike(extRaw);

        if (curIsArr || extIsArr) {
            if (!curIsArr || !extIsArr) {
                throw new Error(
                    `Type mismatch for "${key}": cannot merge array with non-array`
                );
            }
            const curSegs = toSegments(curRaw);
            const extSegs = toSegments(extRaw);
            result[key] = { __orderedList: true, segments: [...curSegs, ...extSegs] };
            continue;
        }

        // Unwrap priorities for value comparison
        const curVal = unwrapPriority(curRaw);
        const extVal = unwrapPriority(extRaw);

        // ── Object fields: deep merge ──
        if (isPlainObject(curVal) && isPlainObject(extVal)) {
            if (key === 'rule-providers') {
                for (const k of Object.keys(extVal)) {
                    if (k in curVal) {
                        throw new Error(`Rule provider key conflict: "${k}" already defined.`);
                    }
                }
            }
            result[key] = deepMerge(curVal, extVal);
            continue;
        }

        // Deferred current: keep extension
        if (isDeferred(curRaw)) {
            result[key] = extRaw;
            continue;
        }

        // ── Scalar conflict resolution ──
        const curType = getPriorityType(curRaw);
        const extType = getPriorityType(extRaw);

        // Same value → ok (idempotent)
        if (curVal === extVal) {
            continue;
        }

        // mkDefault + mkOverride: the ONLY allowed silent override
        if (curType === 'default' && extType === 'override') {
            result[key] = extRaw;
            continue;
        }
        if (curType === 'override' && extType === 'default') {
            continue;
        }

        // All other different-value cases → error
        throw new Error(
            `Scalar conflict for key "${key}": ` +
            `existing value ${JSON.stringify(curVal)} (${curType}) vs ` +
            `new value ${JSON.stringify(extVal)} (${extType}). ` +
            `Use mkDefault() + mkOverride() for intentional overrides.`
        );
    }

    return result;
}

// ─── Module System ──────────────────────────────────────────────────

/**
 * Initial empty state for the Clash module system.
 */
function initialModuleState(config) {
    return {
        proxies: config.proxies || [],
        'proxy-groups': [],
        rules: [],
        'rule-providers': {},
    };
}

/**
 * Merge modules into a Clash configuration.
 *
 * @param {Array<Function>} modules - Module functions
 * @param {object} ctx - Shared context { args, config }
 * @returns {object} Fully merged and resolved Clash config
 */
export function mergeModules(modules, ctx) {
    const overlays = modules.map(mod => {
        return (final, prev) => mod(final, prev, ctx);
    });

    const base = initialModuleState(ctx.config);
    return applyOverlays(base, overlays, { merge: clashModuleMerge });
}

/**
 * Remove internal metadata keys (_* prefix) and empty objects from config.
 */
export function cleanup(config) {
    const result = {};
    for (const [key, value] of Object.entries(config)) {
        if (key.startsWith('_')) continue;
        if (value === undefined) continue;
        if (isPlainObject(value) && Object.keys(value).length === 0) continue;
        result[key] = value;
    }
    return result;
}
