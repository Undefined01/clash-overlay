// libmodule/src/core-merge.ts
// Shared merge helpers and unified merge functions.
//
// Extracted from duplicated code across module-merge.ts and option-types.ts.
// Provides the building blocks for all merge strategies in libmodule.

import { MARKER } from './symbols.js';
import { defer, isDefer, forceDefer } from './defer.js';
import { isArrayLike, isOrdered, isOrderedList, DEFAULT_ORDER } from './order.js';
import type { MergeFn, OrderedList } from './types.js';

// ─── Shared Helpers ──────────────────────────────────────────────────

export function isPlainObject(val: unknown): val is Record<string, unknown> {
    return (
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !(MARKER in (val as object)) &&
        !(val instanceof RegExp) &&
        !(val instanceof Date)
    );
}

export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}

// ─── Ordered Array Helpers ───────────────────────────────────────────

export interface Segment {
    order: number;
    items: unknown[];
}

export function toSegments(val: unknown): Segment[] {
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

export function flattenSegments(segments: Segment[]): unknown[] {
    const sorted = [...segments].sort((a, b) => a.order - b.order);
    const items: unknown[] = [];
    for (const seg of sorted) {
        items.push(...seg.items);
    }
    return items;
}

// ─── Scalar Handlers ─────────────────────────────────────────────────

export type ScalarHandler = (key: string, cur: unknown, ext: unknown) => unknown;

/** Scalars must be strictly equal, otherwise error. */
export function scalarEqual(key: string, cur: unknown, ext: unknown): unknown {
    if (cur === ext) return cur;
    throw new Error(
        `Scalar conflict for key "${key}": ` +
        `values ${JSON.stringify(cur)} vs ${JSON.stringify(ext)} ` +
        `at same priority. ` +
        `Use different mkOverride priorities to resolve.`,
    );
}

/** Last writer wins for scalars. */
export function scalarLastWins(_key: string, _cur: unknown, ext: unknown): unknown {
    return ext;
}

// ─── Core Merge ──────────────────────────────────────────────────────

/**
 * Merge two values for the same key.
 *
 * - undefined: pass through
 * - deferred: wrap in defer, force both, recurse
 * - arrays: ordered concat as OrderedList
 * - objects: coreDeepMerge (recursive)
 * - scalars: delegate to onScalar
 */
export function coreMerge(
    key: string,
    cur: unknown,
    ext: unknown,
    onScalar: ScalarHandler = scalarEqual,
): unknown {
    if (ext === undefined) return cur;
    if (cur === undefined) return ext;

    // Deferred on either side: wrap merge in a deferred
    if (isDefer(cur) || isDefer(ext)) {
        return defer(() => {
            const c = isDefer(cur) ? forceDefer(cur) : cur;
            const e = isDefer(ext) ? forceDefer(ext) : ext;

            if (isPromiseLike(c) || isPromiseLike(e)) {
                return Promise.all([c, e]).then(
                    ([rc, re]) => coreMerge(key, rc, re, onScalar),
                );
            }

            return coreMerge(key, c, e, onScalar);
        });
    }

    // Arrays: collect as ordered list
    const curIsArr = isArrayLike(cur) || Array.isArray(cur);
    const extIsArr = isArrayLike(ext) || Array.isArray(ext);
    if (curIsArr || extIsArr) {
        if (!curIsArr || !extIsArr) {
            throw new Error('Type mismatch in deep merge: cannot merge array with non-array');
        }
        const segments = [...toSegments(cur), ...toSegments(ext)];
        return { [MARKER]: 'order-list', segments } as unknown as OrderedList;
    }

    // Objects: deep merge
    if (isPlainObject(cur) && isPlainObject(ext)) {
        return coreDeepMerge(key, cur, ext, onScalar);
    }

    // Scalars: delegate
    return onScalar(key, cur, ext);
}

/**
 * Recursively deep-merge two plain objects using coreMerge per key.
 */
export function coreDeepMerge(
    key: string,
    target: Record<string, unknown>,
    source: Record<string, unknown>,
    onScalar: ScalarHandler = scalarEqual,
): Record<string, unknown> {
    const result = { ...target };
    for (const [k, value] of Object.entries(source)) {
        if (k in result && result[k] !== undefined) {
            result[k] = coreMerge(`${key}.${k}`, result[k], value, onScalar);
        } else {
            result[k] = value;
        }
    }
    return result;
}

// ─── Public MergeFn ──────────────────────────────────────────────────

/**
 * Deep-merge MergeFn using coreMerge + scalarLastWins.
 * Replaces moduleMerge for overlay users.
 */
export const deepMerge: MergeFn = (current, extension) => {
    const result: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(extension)) {
        if (value === undefined) continue;
        if (!(key in result) || result[key] === undefined) {
            result[key] = value;
        } else {
            result[key] = coreMerge(key, result[key], value, scalarLastWins);
        }
    }
    return result;
};
