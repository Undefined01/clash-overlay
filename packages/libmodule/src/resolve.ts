// libmodule/src/resolve.ts
// Recursively resolve deferred values, unwrap priority wrappers,
// and flatten ordered lists.

import { isDefer, forceDefer } from './defer.js';
import { isOverride } from './priority.js';
import { isOrdered, isOrderedList } from './order.js';
import { isPlainObject, isPromiseLike } from './core-merge.js';
import type { OrderedList } from './types.js';

/**
 * Normalize a merged config for safe `final` / `config` access inside deferred
 * resolvers, without evaluating deferred values.
 *
 * This unwraps priority wrappers and flattens ordered lists into plain arrays,
 * while leaving defer proxies intact.
 */
export function normalizeFinal(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    if (obj === null || obj === undefined) return obj;

    if (isOverride(obj)) {
        return normalizeFinal(obj.value, visited);
    }
    if (isDefer(obj)) {
        return obj; // leave defer proxies intact for resolve phase
    }
    if (isOrderedList(obj)) {
        return flattenOrderedListShallow(obj, visited);
    }
    if (isOrdered(obj)) {
        return normalizeFinal(obj.items, visited);
    }

    if (typeof obj !== 'object') return obj;
    if (obj instanceof RegExp || obj instanceof Date) return obj;
    if (visited.has(obj)) return obj; // prevent infinite loops
    visited.add(obj);

    if (Array.isArray(obj)) {
        return obj.map((item) => normalizeFinal(item, visited));
    }

    if (!isPlainObject(obj)) return obj;

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        normalized[key] = normalizeFinal(value, visited);
    }
    return normalized;
}

/**
 * Recursively resolve all deferred values, unwrap priority wrappers,
 * and flatten ordered lists into plain arrays.
 */
export function resolveDeferred(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    if (obj === null || obj === undefined) return obj;

    if (isOverride(obj)) {
        return resolveDeferred(obj.value, visited);
    }
    if (isDefer(obj)) {
        const resolved = forceDefer(obj);
        if (isPromiseLike(resolved)) {
            throw new Error('Deferred resolver returned Promise in sync mode. Use resolveDeferredAsync.');
        }
        return resolveDeferred(resolved, visited);
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

    if (!isPlainObject(obj)) return obj;

    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        resolved[key] = resolveDeferred(value, visited);
    }
    return resolved;
}

/**
 * Async variant of resolveDeferred — supports deferred values that return Promise.
 */
export async function resolveDeferredAsync(
    obj: unknown,
    visited: WeakSet<object> = new WeakSet(),
): Promise<unknown> {
    if (obj === null || obj === undefined) return obj;

    if (isOverride(obj)) {
        return resolveDeferredAsync(obj.value, visited);
    }
    if (isDefer(obj)) {
        const resolved = forceDefer(obj);
        return resolveDeferredAsync(resolved instanceof Promise ? await resolved : resolved, visited);
    }
    if (isOrderedList(obj)) {
        return flattenOrderedListAsync(obj, visited);
    }
    if (isOrdered(obj)) {
        return resolveDeferredAsync(obj.items, visited);
    }

    if (typeof obj !== 'object') return obj;
    if (obj instanceof RegExp || obj instanceof Date) return obj;
    if (visited.has(obj)) return obj;
    visited.add(obj);

    if (Array.isArray(obj)) {
        const resolved = await Promise.all(obj.map(item => resolveDeferredAsync(item, visited)));
        return resolved;
    }

    if (!isPlainObject(obj)) return obj;

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        result[key] = await resolveDeferredAsync(value, visited);
    }
    return result;
}

/**
 * Sort ordered segments by order (stable) and flatten into a single array.
 */
function flattenOrderedList(orderedList: OrderedList, visited: WeakSet<object>): unknown[] {
    const sorted = [...orderedList.segments].sort((a, b) => a.order - b.order);
    const items: unknown[] = [];
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

function flattenOrderedListShallow(orderedList: OrderedList, visited: WeakSet<object>): unknown[] {
    const sorted = [...orderedList.segments].sort((a, b) => a.order - b.order);
    const items: unknown[] = [];
    for (const seg of sorted) {
        const normalized = normalizeFinal(seg.items, visited);
        if (Array.isArray(normalized)) {
            items.push(...normalized);
        } else if (normalized !== null && normalized !== undefined) {
            items.push(normalized);
        }
    }
    return items;
}

async function flattenOrderedListAsync(
    orderedList: OrderedList,
    visited: WeakSet<object>,
): Promise<unknown[]> {
    const sorted = [...orderedList.segments].sort((a, b) => a.order - b.order);
    const items: unknown[] = [];
    for (const seg of sorted) {
        const resolved = await resolveDeferredAsync(seg.items, visited);
        if (Array.isArray(resolved)) {
            items.push(...resolved);
        } else if (resolved !== null && resolved !== undefined) {
            items.push(resolved);
        }
    }
    return items;
}

// ─── Undefined Cleanup ──────────────────────────────────────────────

/**
 * Recursively remove keys whose values are `undefined`.
 * - Object keys with `undefined` values are removed.
 * - Array elements that are `undefined` are filtered out.
 * - Objects that become empty after cleanup become `undefined` (propagate upward).
 */
export function deepCleanUndefined(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof RegExp || obj instanceof Date) return obj;

    if (Array.isArray(obj)) {
        const cleaned = obj
            .map(deepCleanUndefined)
            .filter(item => item !== undefined);
        return cleaned;
    }

    const result: Record<string, unknown> = {};
    let hasKeys = false;
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const cleaned = deepCleanUndefined(value);
        if (cleaned !== undefined) {
            result[key] = cleaned;
            hasKeys = true;
        }
    }
    return hasKeys ? result : undefined;
}
