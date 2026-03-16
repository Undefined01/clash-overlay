// libmodule/src/mkif.ts
// mkIf — conditional config fragments, pure sugar over deferred + undefined.
//
// For plain objects: expand each key to defer(() => condition() ? value : undefined)
// For non-objects: wrap as defer(() => condition() ? value : undefined)
//
// Boolean overload: eagerly returns value or {} when condition is a plain boolean.

import { defer } from './defer.js';
import { isPlainObject } from './core-merge.js';

/**
 * Conditionally include configuration based on a boolean or boolean function.
 *
 * **Boolean condition** (eager): returns value directly or empty object/undefined.
 *
 * **Function condition** (lazy): for plain objects, expands each key into a
 * deferred that returns the value or undefined based on the condition.
 * For other values, wraps as a single deferred.
 *
 * @param condition - Boolean or function returning boolean
 * @param value - Configuration fragment or value to conditionally include
 */
export function mkIf<T>(
    condition: boolean | (() => boolean),
    value: T,
): T extends Record<string, unknown> ? Record<string, unknown> : ReturnType<typeof defer> {
    // Eager boolean overload
    if (typeof condition === 'boolean') {
        if (isPlainObject(value)) {
            return (condition ? value : {}) as any;
        }
        return (condition ? value : undefined) as any;
    }

    // Lazy function overload
    if (isPlainObject(value)) {
        let cached: boolean | undefined;
        const evalCond = () => {
            if (cached === undefined) cached = condition();
            return cached;
        };
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            result[key] = defer(() => evalCond() ? val : undefined);
        }
        return result as any;
    }

    return defer(() => condition() ? value : undefined) as any;
}
