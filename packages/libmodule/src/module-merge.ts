// libmodule/src/module-merge.ts
// Configurable module merge strategy — the JS equivalent of NixOS module
// configuration merging.
//
// Each module contributes a config fragment. This engine merges them with:
//   - Ordered list collection for arrays (via mkBefore / mkAfter / mkOrder)
//   - Deep recursive merge for objects
//   - Nix-compatible numeric priority conflict resolution for scalars
//   - Uniform merge semantics for all keys

import { deferred, isDeferred } from './deferred.js';
import { isOverride, getPriority, unwrapPriority } from './priority.js';
import { isOrdered, isOrderedList, isArrayLike, DEFAULT_ORDER } from './order.js';
import type { Deferred, MergeFn, OrderedList } from './types.js';

// ─── Helpers ────────────────────────────────────────────────────────

function isPlainObject(val: unknown): val is Record<string, unknown> {
    return (
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !isDeferred(val) &&
        !isOverride(val) &&
        !isOrdered(val) &&
        !isOrderedList(val) &&
        !(val instanceof RegExp) &&
        !(val instanceof Date)
    );
}

/**
 * Deep merge two plain objects. Arrays within are concatenated;
 * nested objects are merged recursively; scalars use last-writer-wins.
 */
function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        result[key] = mergeDeepValue(result[key], value);
    }
    return result;
}

function mergeDeepValue(current: unknown, extension: unknown): unknown {
    if (isDeferred(current) || isDeferred(extension)) {
        return deferred(() => {
            const cur = isDeferred(current) ? current.fn() : current;
            const ext = isDeferred(extension) ? extension.fn() : extension;

            if (isPromiseLike(cur) || isPromiseLike(ext)) {
                return Promise.all([cur, ext]).then(([c, e]) => mergeDeepValue(c, e));
            }

            return mergeDeepValue(cur, ext);
        });
    }

    const curIsArr = isArrayLike(current);
    const extIsArr = isArrayLike(extension);
    if (curIsArr || extIsArr) {
        if (!curIsArr || !extIsArr) {
            throw new Error('Type mismatch in deep merge: cannot merge array with non-array');
        }
        const curSegs = toSegments(current);
        const extSegs = toSegments(extension);
        return { __type: 'order-list', segments: [...curSegs, ...extSegs] } as OrderedList;
    }

    if (isPlainObject(current) && isPlainObject(extension)) {
        return deepMerge(current, extension);
    }
    return extension;
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}

// ─── Ordered Array Helpers ──────────────────────────────────────────

interface Segment {
    order: number;
    items: unknown[];
}

/**
 * Convert an array-like value to ordered segments.
 */
function toSegments(val: unknown): Segment[] {
    if (isOrderedList(val)) return val.segments;
    if (isOrdered(val)) return [{ order: val.order, items: val.items }];
    if (Array.isArray(val)) {
        const hasOrdered = val.some(item => isOrdered(item));
        if (hasOrdered) {
            const segments: Segment[] = [];
            let inline: unknown[] = [];
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

// ─── Configuration ──────────────────────────────────────────────────

/**
 * Options for creating a module merge function.
 */
export interface ModuleMergeOptions {
    /**
     * Object-typed keys for which duplicate sub-keys are a conflict error.
     *
     * When merging two objects under a key listed here, any sub-key present
     * in both current and extension triggers a conflict error instead of
     * silent deep merge.
     *
     * Example: `['rule-providers']` makes `{ 'rule-providers': { foo: ... } }`
     * from two different modules an error.
     *
     * @default []
     */
    uniqueKeyFields?: string[];

}

// ─── Resolved Value Merge ────────────────────────────────────────────

/**
 * Merge two concrete (non-deferred) values for the same key.
 *
 * Handles array concat, deep object merge, and scalar priority comparison.
 * Exported for use by mkMerge.
 */
export function mergeResolvedValues(
    key: string,
    cur: unknown,
    ext: unknown,
    uniqueKeyFields?: Set<string>,
): unknown {
    // undefined = not declared
    if (ext === undefined) return cur;
    if (cur === undefined) {
        if (isArrayLike(ext)) {
            return { __type: 'order-list', segments: toSegments(ext) } as OrderedList;
        }
        return ext;
    }

    // ── Array-like: collect ordered segments ──
    const curIsArr = isArrayLike(cur);
    const extIsArr = isArrayLike(ext);

    if (curIsArr || extIsArr) {
        if (!curIsArr || !extIsArr) {
            throw new Error(
                `Type mismatch for "${key}": cannot merge array with non-array`,
            );
        }
        const curSegs = toSegments(cur);
        const extSegs = toSegments(ext);
        return { __type: 'order-list', segments: [...curSegs, ...extSegs] } as OrderedList;
    }

    // Unwrap priorities for value comparison
    const curVal = unwrapPriority(cur);
    const extVal = unwrapPriority(ext);

    // ── Object fields: deep merge ──
    if (isPlainObject(curVal) && isPlainObject(extVal)) {
        if (uniqueKeyFields?.has(key)) {
            for (const k of Object.keys(extVal)) {
                if (k in curVal) {
                    throw new Error(
                        `Unique-key conflict in "${key}": sub-key "${k}" already defined.`,
                    );
                }
            }
        }
        return deepMerge(curVal, extVal);
    }

    // ── Scalar conflict resolution (Nix-compatible) ──
    const curPri = getPriority(cur);
    const extPri = getPriority(ext);

    if (curPri === extPri) {
        // Same priority: values must be equal (idempotent)
        if (curVal === extVal) return cur;
        throw new Error(
            `Scalar conflict for key "${key}": ` +
            `values ${JSON.stringify(curVal)} vs ${JSON.stringify(extVal)} ` +
            `at same priority ${curPri}. ` +
            `Use different mkOverride priorities to resolve.`,
        );
    }

    // Different priorities: lower number (higher precedence) wins
    return extPri < curPri ? ext : cur;
}

// ─── Deferred Merge ─────────────────────────────────────────────────

/**
 * When either side is deferred, produce a new deferred that resolves
 * both sides and merges them at resolve time.
 */
function deferredMerge(
    key: string,
    cur: unknown,
    ext: unknown,
    uniqueKeyFields?: Set<string>,
): Deferred {
    return deferred(() => {
        const resolvedCur = isDeferred(cur) ? cur.fn() : cur;
        const resolvedExt = isDeferred(ext) ? ext.fn() : ext;

        if (isPromiseLike(resolvedCur) || isPromiseLike(resolvedExt)) {
            return Promise.all([resolvedCur, resolvedExt]).then(
                ([c, e]) => mergeResolvedValues(key, c, e, uniqueKeyFields),
            );
        }

        return mergeResolvedValues(key, resolvedCur, resolvedExt, uniqueKeyFields);
    });
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a module merge function with the given options.
 *
 * The merge strategy handles three kinds of values:
 *
 * 1. **Arrays** — collected as ordered segments, flattened by sort order
 *    after all overlays merge. Use `mkBefore`, `mkAfter`, `mkOrder` to
 *    control position.
 *
 * 2. **Objects** — deep recursive merge. Arrays inside objects are
 *    concatenated; nested objects are merged recursively.
 *
 * 3. **Scalars** — Nix-compatible priority conflict resolution:
 *    - Same priority + same value → idempotent (ok)
 *    - Same priority + different value → error
 *    - Different priorities → lower number wins
 *    - Use `mkForce` (50), bare value (100), `mkDefault` (1000)
 *
 * @param options - configuration for the merge behavior
 * @returns A `MergeFn` suitable for `applyOverlays`
 */
export function createModuleMerge(options?: ModuleMergeOptions): MergeFn {
    const uniqueKeyFields = new Set(options?.uniqueKeyFields ?? []);

    const merge: MergeFn = (current, extension) => {
        const result: Record<string, unknown> = { ...current };

        for (const [key, extRaw] of Object.entries(extension)) {
            if (extRaw === undefined) continue;

            // New key
            if (!(key in result) || result[key] === undefined) {
                if (isArrayLike(extRaw)) {
                    result[key] = { __type: 'order-list', segments: toSegments(extRaw) } as OrderedList;
                } else {
                    result[key] = extRaw;
                }
                continue;
            }

            const curRaw = result[key];

            // ── Deferred on either side: defer the merge ──
            if (isDeferred(curRaw) || isDeferred(extRaw)) {
                result[key] = deferredMerge(key, curRaw, extRaw, uniqueKeyFields);
                continue;
            }

            // ── Concrete merge ──
            result[key] = mergeResolvedValues(key, curRaw, extRaw, uniqueKeyFields);
        }

        return result;
    };

    return merge;
}

/**
 * Default module merge — no unique-key fields.
 *
 * Suitable for most configuration merging use cases.
 */
export const moduleMerge: MergeFn = createModuleMerge();

// ─── Cleanup ────────────────────────────────────────────────────────

/**
 * Remove metadata keys (starting with `prefix`) and empty/undefined values
 * from a merged config object.
 *
 * @param config - The merged config
 * @param prefix - Metadata key prefix to strip (default: '_')
 * @returns Cleaned config
 */
export function cleanup(
    config: Record<string, unknown>,
    prefix: string = '_',
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
        if (key.startsWith(prefix)) continue;
        if (value === undefined) continue;
        if (isPlainObject(value) && Object.keys(value).length === 0) continue;
        result[key] = value;
    }
    return result;
}
