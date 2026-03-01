// libmodule/src/resolve.ts
// Recursively resolve deferred values, unwrap priority wrappers,
// and flatten ordered lists.

import { isDeferred } from './deferred.js';
import { isOverride } from './priority.js';
import { isOrdered, isOrderedList } from './order.js';
import type { OrderedList } from './types.js';

/**
 * Recursively resolve all deferred values, unwrap priority wrappers,
 * and flatten ordered lists into plain arrays.
 */
export function resolveDeferred(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    if (obj === null || obj === undefined) return obj;

    if (isOverride(obj)) {
        return resolveDeferred(obj.value, visited);
    }
    if (isDeferred(obj)) {
        const resolved = obj.fn();
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

    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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
    if (isDeferred(obj)) {
        return resolveDeferredAsync(await obj.fn(), visited);
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

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
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

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}
