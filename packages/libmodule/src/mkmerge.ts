// libmodule/src/mkmerge.ts
// mkMerge — merge multiple definitions for the same key within a single module.
//
// Two modes:
// - Object mode: all defs are plain objects → collect keys, merge per-key
// - Value mode: fold definitions using mergeResolvedValues

import { deferred, isDeferred } from './deferred.js';
import { isOverride } from './priority.js';
import { isOrdered, isOrderedList } from './order.js';
import { mergeResolvedValues } from './module-merge.js';

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

function foldValues(values: unknown[]): unknown {
    if (values.length === 0) return undefined;
    let acc = values[0];
    for (let i = 1; i < values.length; i++) {
        acc = mergeResolvedValues('mkMerge', acc, values[i]);
    }
    return acc;
}

/**
 * Merge values: fold definitions using mergeResolvedValues.
 * If any definition is deferred, return a deferred that resolves all then folds.
 */
function mkMergeValues(definitions: unknown[]): unknown {
    const hasDeferred = definitions.some(d => isDeferred(d));

    if (hasDeferred) {
        return deferred(() => {
            const resolved = definitions.map(d => isDeferred(d) ? d.fn() : d);
            if (resolved.some(isPromiseLike)) {
                return Promise.all(resolved).then(vals =>
                    foldValues(vals.filter(v => v !== undefined))
                );
            }
            return foldValues(resolved.filter(v => v !== undefined));
        });
    }

    return foldValues(definitions.filter(v => v !== undefined));
}

/**
 * Merge objects: collect keys across all definitions, merge per-key.
 * All definitions must be plain objects (mkIf on objects produces plain objects
 * with deferred values per-key, so this handles mkIf composition naturally).
 */
function mkMergeObjects(definitions: Record<string, unknown>[]): Record<string, unknown> {
    const keyValues = new Map<string, unknown[]>();

    for (const obj of definitions) {
        for (const [key, val] of Object.entries(obj)) {
            if (!keyValues.has(key)) keyValues.set(key, []);
            keyValues.get(key)!.push(val);
        }
    }

    const result: Record<string, unknown> = {};
    for (const [key, values] of keyValues) {
        if (values.length === 1) {
            result[key] = values[0];
        } else {
            result[key] = mkMergeValues(values);
        }
    }
    return result;
}

/**
 * Merge multiple definitions for the same key within a single module.
 *
 * Object mode: When all definitions are plain objects, collects all keys
 * across definitions and merges each key's values using standard merge rules.
 * This handles mkIf composition naturally since mkIf(cond, obj) returns a
 * plain object with deferred values per-key.
 *
 * Value mode: When definitions include non-object values (arrays, scalars, etc.),
 * folds them using standard merge rules.
 *
 * @param definitions - Array of values to merge
 * @returns Merged result, or undefined for empty input
 *
 * @example
 * // Object mode: merge config fragments with mkIf
 * mkMerge([
 *   { packages: ['vim'] },
 *   mkIf(() => config.gui, { packages: ['firefox'] }),
 * ])
 *
 * @example
 * // Value mode: merge arrays
 * { packages: mkMerge([['base'], mkIf(() => cond, ['extra'])]) }
 */
export function mkMerge(definitions: unknown[]): unknown {
    if (definitions.length === 0) return undefined;

    // Check if all definitions are plain objects (or undefined to skip)
    const nonUndefined = definitions.filter(d => d !== undefined);
    if (nonUndefined.length === 0) return undefined;

    const allObjects = nonUndefined.every(d => isPlainObject(d));

    if (allObjects) {
        return mkMergeObjects(nonUndefined as Record<string, unknown>[]);
    }

    return mkMergeValues(nonUndefined);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}
