// liboverlay/src/module-merge.ts
// Configurable module merge strategy — the JS equivalent of NixOS module
// configuration merging.
//
// Each module contributes a config fragment. This engine merges them with:
//   - Ordered list collection for arrays (via mkBefore / mkAfter / mkOrder)
//   - Deep recursive merge for objects
//   - Nix-compatible numeric priority conflict resolution for scalars
//   - Metadata key passthrough (prefix-based, default "_")

import { isDeferred } from './deferred.js';
import { isOverride, getPriority, unwrapPriority } from './priority.js';
import { isOrdered, isOrderedList, isArrayLike, DEFAULT_ORDER } from './order.js';
import type { MergeFn, OrderedList } from './types.js';

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
        if (isPlainObject(result[key]) && isPlainObject(value)) {
            result[key] = deepMerge(result[key], value);
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = [...(result[key] as unknown[]), ...value];
        } else {
            result[key] = value;
        }
    }
    return result;
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

    /**
     * Prefix for metadata keys. Keys starting with this prefix use
     * last-writer-wins semantics and are excluded by `cleanup()`.
     *
     * @default '_'
     */
    metadataPrefix?: string;
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a module merge function with the given options.
 *
 * The merge strategy handles four kinds of values:
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
 * 4. **Metadata** — keys starting with `metadataPrefix` use
 *    last-writer-wins and skip ordered list collection.
 *
 * @param options - configuration for the merge behavior
 * @returns A `MergeFn` suitable for `applyOverlays`
 */
export function createModuleMerge(options?: ModuleMergeOptions): MergeFn {
    const uniqueKeyFields = new Set(options?.uniqueKeyFields ?? []);
    const metadataPrefix = options?.metadataPrefix ?? '_';

    const merge: MergeFn = (current, extension) => {
        const result: Record<string, unknown> = { ...current };

        for (const [key, extRaw] of Object.entries(extension)) {
            if (extRaw === undefined) continue;

            const isMeta = key.startsWith(metadataPrefix);

            // New key
            if (!(key in result) || result[key] === undefined) {
                if (!isMeta && isArrayLike(extRaw)) {
                    result[key] = { __orderedList: true, segments: toSegments(extRaw) } as OrderedList;
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

            // Metadata keys: later wins
            if (isMeta) {
                result[key] = extRaw;
                continue;
            }

            // ── Array-like: collect ordered segments ──
            const curIsArr = isArrayLike(curRaw);
            const extIsArr = isArrayLike(extRaw);

            if (curIsArr || extIsArr) {
                if (!curIsArr || !extIsArr) {
                    throw new Error(
                        `Type mismatch for "${key}": cannot merge array with non-array`,
                    );
                }
                const curSegs = toSegments(curRaw);
                const extSegs = toSegments(extRaw);
                result[key] = { __orderedList: true, segments: [...curSegs, ...extSegs] } as OrderedList;
                continue;
            }

            // Unwrap priorities for value comparison
            const curVal = unwrapPriority(curRaw);
            const extVal = unwrapPriority(extRaw);

            // ── Object fields: deep merge ──
            if (isPlainObject(curVal) && isPlainObject(extVal)) {
                if (uniqueKeyFields.has(key)) {
                    for (const k of Object.keys(extVal)) {
                        if (k in curVal) {
                            throw new Error(
                                `Unique-key conflict in "${key}": sub-key "${k}" already defined.`,
                            );
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

            // ── Scalar conflict resolution (Nix-compatible) ──
            const curPri = getPriority(curRaw);
            const extPri = getPriority(extRaw);

            if (curPri === extPri) {
                // Same priority: values must be equal (idempotent)
                if (curVal === extVal) continue;
                throw new Error(
                    `Scalar conflict for key "${key}": ` +
                    `values ${JSON.stringify(curVal)} vs ${JSON.stringify(extVal)} ` +
                    `at same priority ${curPri}. ` +
                    `Use different mkOverride priorities to resolve.`,
                );
            }

            // Different priorities: lower number (higher precedence) wins
            if (extPri < curPri) {
                result[key] = extRaw;
            }
            // else: current has higher precedence, keep it
        }

        return result;
    };

    return merge;
}

/**
 * Default module merge — no unique-key fields, `_` metadata prefix.
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
