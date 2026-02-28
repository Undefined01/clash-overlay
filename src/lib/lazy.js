// src/lib/lazy.js
// Nix-style overlay system adapted for JavaScript's eager evaluation.
//
// Key insight: Nix's overlay system works because of pervasive lazy evaluation.
// In JS, we simulate this with:
//   1. A `deferred()` marker for values resolved after all overlays merge
//   2. A `final` Proxy that becomes accessible only after merge completes
//   3. Two-phase evaluation: merge overlays → resolve deferred values
//
// The `prev` and `final` semantics match Nix exactly:
//   - `prev`: the accumulated state from all previous overlays (immediately available)
//   - `final`: the state after ALL overlays are applied (lazy, use in deferred/getters)

// ─── Deferred Values ────────────────────────────────────────────────

/**
 * Mark a value as deferred — resolved after all overlays are merged.
 * Use this to create forward references to `final`.
 *
 * @param {() => any} fn - Thunk returning the actual value
 *
 * @example
 * const mod = (final, prev) => ({
 *   allProxies: deferred(() => [...final.proxies, 'DIRECT', 'REJECT']),
 * });
 */
export function deferred(fn) {
    return { __deferred: true, fn };
}

export function isDeferred(val) {
    return val !== null && typeof val === 'object' && val.__deferred === true;
}

// ─── Priority Wrappers (scalar conflict resolution) ─────────────────

/**
 * Mark a value as a "default" — overridable ONLY by mkOverride().
 * Regular values and mkForce() with different values will cause an error.
 *
 * @param {any} value
 */
export function mkDefault(value) {
    return { __priority: 'default', value };
}

/**
 * Mark a value as "forced" — an assertion that this value must not differ.
 * Any conflicting value (regular, mkDefault, mkOverride, or another mkForce)
 * with a different value will cause an error.
 *
 * @param {any} value
 */
export function mkForce(value) {
    return { __priority: 'force', value };
}

/**
 * Explicitly override a mkDefault value.
 * This is the ONLY way to silently change a mkDefault value.
 * Conflicts with regular, mkForce, or another mkOverride will error
 * if values differ.
 *
 * @param {any} value
 */
export function mkOverride(value) {
    return { __priority: 'override', value };
}

export function isPriorityWrapped(val) {
    return val !== null && typeof val === 'object' && typeof val.__priority === 'string';
}

/**
 * Get the priority type of a value.
 * @returns {'default' | 'force' | 'override' | 'regular'}
 */
export function getPriorityType(val) {
    return isPriorityWrapped(val) ? val.__priority : 'regular';
}

/** Unwrap a priority wrapper, returning the raw value. */
export function unwrapPriority(val) {
    return isPriorityWrapped(val) ? val.value : val;
}

// ─── Order Wrappers (list element positioning) ──────────────────────

export const DEFAULT_ORDER = 100;
export const BEFORE_ORDER = 0;
export const AFTER_ORDER = 10000;

/**
 * Place list elements at the front (order 0).
 * @param {Array} items
 */
export function mkBefore(items) {
    return { __ordered: true, order: BEFORE_ORDER, items };
}

/**
 * Place list elements at the end (order 10000).
 * @param {Array} items
 */
export function mkAfter(items) {
    return { __ordered: true, order: AFTER_ORDER, items };
}

/**
 * Place list elements at a specific order position.
 * Lower order = earlier in the final list. Default order for plain arrays = 100.
 *
 * @param {number} order - Sort position
 * @param {Array} items - Array of items
 */
export function mkOrder(order, items) {
    return { __ordered: true, order, items };
}

/** Check if a value is an order wrapper (mkBefore/mkAfter/mkOrder). */
export function isOrdered(val) {
    return val !== null && typeof val === 'object' && val.__ordered === true;
}

/** Check if a value is accumulated ordered segments (internal). */
export function isOrderedList(val) {
    return val !== null && typeof val === 'object' && val.__orderedList === true;
}

/** Check if a value is array-like (plain array, ordered, or ordered list). */
export function isArrayLike(val) {
    return Array.isArray(val) || isOrdered(val) || isOrderedList(val);
}

/**
 * Recursively resolve all deferred values, unwrap priority wrappers,
 * and flatten ordered lists.
 */
export function resolveDeferred(obj, visited = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (isPriorityWrapped(obj)) {
        return resolveDeferred(obj.value, visited);
    }
    if (isDeferred(obj)) {
        return resolveDeferred(obj.fn(), visited);
    }
    if (isOrderedList(obj)) {
        return flattenOrderedList(obj, visited);
    }
    if (isOrdered(obj)) {
        return resolveDeferred(obj.items, visited);
    }
    if (typeof obj !== 'object') return obj;
    if (obj instanceof RegExp || obj instanceof Date) return obj;
    if (visited.has(obj)) return obj; // prevent infinite loops
    visited.add(obj);

    if (Array.isArray(obj)) {
        return obj.map((item) => resolveDeferred(item, visited));
    }
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
        resolved[key] = resolveDeferred(value, visited);
    }
    return resolved;
}

/**
 * Sort ordered segments by order (stable) and flatten into a single array.
 */
function flattenOrderedList(orderedList, visited) {
    const sorted = [...orderedList.segments].sort((a, b) => a.order - b.order);
    const items = [];
    for (const seg of sorted) {
        const resolved = resolveDeferred(seg.items, visited);
        if (Array.isArray(resolved)) {
            items.push(...resolved);
        } else if (resolved !== null && resolved !== undefined) {
            items.push(resolved);
        }
    }
    return items;
}

// ─── Overlay Application ────────────────────────────────────────────

/**
 * Apply overlays to a base state, producing the final merged result.
 *
 * This is the JS equivalent of:
 *   fix (extends (composeManyExtensions overlays) (final: base))
 *
 * Each overlay: (final, prev) => extensionAttrs
 *   - `prev`:  accumulated state from base + previous overlays (eager, safe to read)
 *   - `final`: state after ALL overlays (lazy proxy, wrap in deferred() for access)
 *
 * After all overlays are merged, deferred values are resolved.
 *
 * @param {object} base - Initial state
 * @param {Array<(final, prev) => object>} overlays - Overlay functions
 * @param {{ merge?: (cur, ext) => object }} [options] - Custom merge strategy
 * @returns {object} Final resolved result
 */
export function applyOverlays(base, overlays, options = {}) {
    const merge = options.merge || shallowMerge;

    let finalResolved = null;

    // Proxy for `final`: defers all access until after merge completes
    const finalProxy = new Proxy(Object.create(null), {
        get(_, prop) {
            if (prop === "__isFinalProxy") return true;
            if (finalResolved === null) {
                throw new Error(
                    `Cannot eagerly access final.${String(prop)} during overlay evaluation. ` +
                    `Wrap in deferred(() => final.${String(prop)}).`
                );
            }
            return finalResolved[prop];
        },
        has(_, prop) {
            if (finalResolved === null) {
                throw new Error(`Cannot check 'final' membership during overlay evaluation.`);
            }
            return prop in finalResolved;
        },
        ownKeys() {
            if (finalResolved === null) {
                throw new Error(`Cannot enumerate 'final' during overlay evaluation.`);
            }
            return Reflect.ownKeys(finalResolved);
        },
        getOwnPropertyDescriptor(_, prop) {
            if (finalResolved === null) return undefined;
            const v = finalResolved;
            if (prop in v) {
                return { value: v[prop], writable: true, enumerable: true, configurable: true };
            }
            return undefined;
        },
    });

    // Phase 1: Sequential overlay application
    let current = { ...base };
    for (const overlay of overlays) {
        const ext = overlay(finalProxy, current);
        current = merge(current, ext);
    }

    // Phase 2: Resolve deferred values
    finalResolved = current;
    const resolved = resolveDeferred(current);
    finalResolved = resolved; // update for any nested deferred that reference final

    return resolved;
}

function shallowMerge(current, extension) {
    return { ...current, ...extension };
}

/**
 * Merge strategy for Clash module contributions (simple version).
 */
export function clashMerge(current, extension) {
    const result = { ...current };
    for (const [key, value] of Object.entries(extension)) {
        if (!(key in result)) {
            result[key] = value;
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = [...result[key], ...value];
        } else if (
            typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
            typeof value === 'object' && value !== null && !Array.isArray(value) &&
            !isDeferred(result[key]) && !isDeferred(value)
        ) {
            result[key] = { ...result[key], ...value };
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ─── Nix-Compatible Primitives (for reference) ─────────────────────

export function extends_(overlay, baseFunc) {
    return (final) => {
        const prev = baseFunc(final);
        const ext = overlay(final, prev);
        return { ...prev, ...ext };
    };
}

export function composeManyExtensions(overlays) {
    return (final, prev) => {
        let acc = prev;
        for (const overlay of overlays) {
            const ext = overlay(final, acc);
            acc = { ...acc, ...ext };
        }
        return acc;
    };
}

export function makeExtensible(base, initialOverlays = []) {
    const result = applyOverlays(base, initialOverlays);
    result.extend = (overlay) => {
        return makeExtensible(base, [...initialOverlays, overlay]);
    };
    return result;
}
