// liboverlay/src/resolve.ts
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

    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        resolved[key] = resolveDeferred(value, visited);
    }
    return resolved;
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
