// libmodule/src/mkif.ts
// mkIf — conditional config fragments, pure sugar over deferred + undefined.
//
// For plain objects: expand each key to deferred(() => condition() ? value : undefined)
// For non-objects: wrap as deferred(() => condition() ? value : undefined)

import { deferred } from './deferred.js';
import { isDeferred } from './deferred.js';
import { isOverride } from './priority.js';
import { isOrdered, isOrderedList } from './order.js';

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
 * Conditionally include configuration based on a boolean function.
 *
 * For plain objects: expands each key into a deferred that returns the value
 * or undefined based on the condition. Each key independently participates
 * in cross-module merge.
 *
 * For other values (scalars, arrays, wrapped primitives): wraps as a single
 * deferred returning the value or undefined.
 *
 * @param condition - Function returning boolean (evaluated at resolve time)
 * @param value - Configuration fragment or value to conditionally include
 * @returns Expanded deferred(s)
 *
 * @example
 * // Object mode: each key is independently conditional
 * (config) => ({
 *   ...mkIf(() => config.enableDns, {
 *     dns: { enable: true },
 *     rules: ['dns-rule'],
 *   }),
 * })
 *
 * @example
 * // Value mode: single conditional value
 * (config) => ({
 *   port: mkIf(() => config.useTls, 443),
 * })
 */
export function mkIf<T>(
    condition: () => boolean,
    value: T,
): T extends Record<string, unknown> ? Record<string, unknown> : ReturnType<typeof deferred> {
    if (isPlainObject(value)) {
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = deferred(() => condition() ? val : undefined);
        }
        return result as any;
    }

    return deferred(() => condition() ? value : undefined) as any;
}
