// libmodule/src/mkmerge.ts
// mkMerge — merge multiple definitions for the same key within a single module.
//
// Two modes:
// - Object mode: all defs are plain objects → collect keys, merge per-key
// - Value mode: fold definitions using priorityMerge

import { defer, isDefer, forceDefer } from './defer.js';
import { getPriority, unwrapPriority } from './priority.js';
import { isPlainObject, isPromiseLike, coreDeepMerge, scalarLastWins, toSegments } from './core-merge.js';
import { isArrayLike } from './order.js';
import { MARKER } from './symbols.js';
import type { OrderedList } from './types.js';

function priorityMerge(key: string, cur: unknown, ext: unknown): unknown {
    if (ext === undefined) return cur;
    if (cur === undefined) {
        if (isArrayLike(ext)) {
            return { [MARKER]: 'order-list', segments: toSegments(ext) } as unknown as OrderedList;
        }
        return ext;
    }

    // Arrays: ordered concat
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
        return { [MARKER]: 'order-list', segments: [...curSegs, ...extSegs] } as unknown as OrderedList;
    }

    // Unwrap priorities for value comparison
    const curVal = unwrapPriority(cur);
    const extVal = unwrapPriority(ext);

    // Objects: deep merge
    if (isPlainObject(curVal) && isPlainObject(extVal)) {
        return coreDeepMerge(key, curVal, extVal, scalarLastWins);
    }

    // Scalar conflict resolution (Nix-compatible)
    const curPri = getPriority(cur);
    const extPri = getPriority(ext);

    if (curPri === extPri) {
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

function foldValues(values: unknown[]): unknown {
    if (values.length === 0) return undefined;
    let acc = values[0];
    for (let i = 1; i < values.length; i++) {
        acc = priorityMerge('mkMerge', acc, values[i]);
    }
    return acc;
}

/**
 * Merge values: fold definitions using priorityMerge.
 * If any definition is deferred, return a deferred that resolves all then folds.
 */
function mkMergeValues(definitions: unknown[]): unknown {
    const hasDeferred = definitions.some(d => isDefer(d));

    if (hasDeferred) {
        return defer(() => {
            const resolved = definitions.map(d => isDefer(d) ? forceDefer(d) : d);
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
 */
export function mkMerge(definitions: unknown[]): unknown {
    if (definitions.length === 0) return undefined;

    const nonUndefined = definitions.filter(d => d !== undefined);
    if (nonUndefined.length === 0) return undefined;

    const allObjects = nonUndefined.every(d => isPlainObject(d));

    if (allObjects) {
        return mkMergeObjects(nonUndefined as Record<string, unknown>[]);
    }

    return mkMergeValues(nonUndefined);
}
