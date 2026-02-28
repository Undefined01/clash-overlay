// lib/lazy.js
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
function deferred(fn) {
    return { __deferred: true, fn };
}

function isDeferred(val) {
    return val !== null && typeof val === 'object' && val.__deferred === true;
}

/**
 * Recursively resolve all deferred values in a data structure.
 * Plain objects, arrays, and nested deferred values are all handled.
 */
function resolveDeferred(obj, visited = new WeakSet()) {
    if (obj === null || obj === undefined) return obj;
    if (isDeferred(obj)) {
        return resolveDeferred(obj.fn(), visited);
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
 *
 * @example
 * const result = applyOverlays(
 *   { a: 1 },
 *   [
 *     (final, prev) => ({ b: prev.a + 1, c: 3 }),
 *     (final, prev) => ({ c: 10, d: deferred(() => final.c + final.b) }),
 *   ]
 * );
 * // => { a: 1, b: 2, c: 10, d: 12 }
 */
function applyOverlays(base, overlays, options = {}) {
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

// ─── Smart Merge for Clash Configs ──────────────────────────────────

/**
 * Merge strategy for Clash module contributions.
 *
 * Rules:
 *   - Arrays: concatenated (rules, proxy-groups)
 *   - Plain objects: shallow merged (rule-providers, dns sections)
 *   - Scalars: later value wins
 *   - Keys prefixed with `_`: internal metadata, shallow merged
 */
function clashMerge(current, extension) {
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

/**
 * Nix `lib.extends`: apply an overlay to a fixed-point function.
 * Note: base and overlay must not eagerly access `final`.
 */
function extends_(overlay, baseFunc) {
    return (final) => {
        const prev = baseFunc(final);
        const ext = overlay(final, prev);
        return { ...prev, ...ext };
    };
}

/**
 * Nix `lib.composeManyExtensions`: compose multiple overlays.
 */
function composeManyExtensions(overlays) {
    return (final, prev) => {
        let acc = prev;
        for (const overlay of overlays) {
            const ext = overlay(final, acc);
            acc = { ...acc, ...ext };
        }
        return acc;
    };
}

// ─── Extensible Object ─────────────────────────────────────────────

/**
 * Create an object that can be extended with overlays.
 * Each call to `.extend(overlay)` returns a NEW object.
 *
 * @param {object} base
 * @param {Array} [initialOverlays]
 * @returns {object & { extend: Function }}
 *
 * @example
 * let obj = makeExtensible({ a: 1 });
 * obj = obj.extend((final, prev) => ({ b: prev.a + 1 }));
 * obj = obj.extend((final, prev) => ({
 *   c: deferred(() => final.a + final.b),
 * }));
 * console.log(obj.c); // 3
 */
function makeExtensible(base, initialOverlays = []) {
    const result = applyOverlays(base, initialOverlays);
    result.extend = (overlay) => {
        return makeExtensible(base, [...initialOverlays, overlay]);
    };
    return result;
}

module.exports = {
    deferred,
    isDeferred,
    resolveDeferred,
    applyOverlays,
    shallowMerge,
    clashMerge,
    extends_,
    composeManyExtensions,
    makeExtensible,
};
