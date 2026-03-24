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
import type {
    ArrayLikeValue,
    Defined,
    MergeArrayItem,
    MergeStringKeys,
    MergeValueAt,
    MkMergeAsyncValue,
    MkMergeObjectResult,
    MkMergeResult,
    MkMergeValue,
    OrderedList,
} from './types.js';

export type MergeWrapper<T> = MkMergeResult<T>;

type MergeComparable<T> = Exclude<MkMergeValue<T>, undefined>;

type MergeObjectBuckets<T extends object> = Partial<{
    [K in MergeStringKeys<T>]: Array<MergeValueAt<T, K>>;
}>;

function isDefined<T>(value: T): value is Defined<T> {
    return value !== undefined;
}

function makeOrderedList<T>(segments: OrderedList<T>['segments']): OrderedList<T> {
    return { [MARKER]: 'order-list', segments };
}

function toOrderedSegments<T>(value: ArrayLikeValue<T>): OrderedList<T>['segments'] {
    return toSegments(value) as OrderedList<T>['segments'];
}

function objectEntries<T extends object>(
    obj: T,
): Array<[MergeStringKeys<T>, MergeValueAt<T, MergeStringKeys<T>>]> {
    return Object.entries(obj) as Array<[MergeStringKeys<T>, MergeValueAt<T, MergeStringKeys<T>>]>;
}

function priorityMerge<T>(key: string, cur: MergeComparable<T>, ext: MergeComparable<T>): MergeComparable<T> {

    // Arrays: ordered concat
    const curIsArr = isArrayLike(cur);
    const extIsArr = isArrayLike(ext);
    if (curIsArr || extIsArr) {
        if (!curIsArr || !extIsArr) {
            throw new Error(
                `Type mismatch for "${key}": cannot merge array with non-array`,
            );
        }
        type Item = MergeArrayItem<T>;
        const curSegs = toOrderedSegments<Item>(cur as ArrayLikeValue<Item>);
        const extSegs = toOrderedSegments<Item>(ext as ArrayLikeValue<Item>);
        return makeOrderedList<Item>([...curSegs, ...extSegs]) as MergeComparable<T>;
    }

    // Unwrap priorities for value comparison
    const curVal = unwrapPriority(cur);
    const extVal = unwrapPriority(ext);

    // Objects: deep merge
    if (isPlainObject(curVal) && isPlainObject(extVal)) {
        return coreDeepMerge(key, curVal, extVal, scalarLastWins) as MergeComparable<T>;
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

function foldValues<T>(values: Array<Defined<T>>): MergeComparable<T> {
    let acc = values[0] as MergeComparable<T>;
    for (let i = 1; i < values.length; i++) {
        acc = priorityMerge('mkMerge', acc, values[i] as MergeComparable<T>);
    }
    return acc;
}

/**
 * Merge values: fold definitions using priorityMerge.
 * If any definition is deferred, return a deferred that resolves all then folds.
 */
function mkMergeValues<T>(definitions: T[]): MkMergeResult<T> | undefined {
    const hasDeferred = definitions.some(d => isDefer(d));

    if (hasDeferred) {
        return defer<MkMergeAsyncValue<T>>(() => {
            const resolved = definitions.map(d => isDefer(d) ? forceDefer(d) : d);
            if (resolved.some(isPromiseLike)) {
                return Promise.all(
                    resolved as Array<PromiseLike<Defined<T>> | Defined<T>>,
                ).then(vals => {
                    const defined = vals.filter(isDefined) as Array<Defined<T>>;
                    return defined.length > 0 ? foldValues(defined) : undefined;
                });
            }
            const defined = resolved.filter(isDefined) as Array<Defined<T>>;
            return defined.length > 0 ? foldValues(defined) : undefined;
        });
    }

    const defined = definitions.filter(isDefined);
    return defined.length > 0 ? foldValues(defined) : undefined;
}

/**
 * Merge objects: collect keys across all definitions, merge per-key.
 */
function mkMergeObjects<T extends object>(definitions: T[]): MkMergeObjectResult<T> {
    const keyValues: MergeObjectBuckets<T> = {};

    for (const obj of definitions) {
        for (const [key, value] of objectEntries(obj)) {
            const existing = keyValues[key] ?? [];
            existing.push(value);
            keyValues[key] = existing;
        }
    }

    const result: Partial<MkMergeObjectResult<T>> = {};
    for (const key of Object.keys(keyValues) as Array<MergeStringKeys<T>>) {
        const values = keyValues[key];
        if (!values || values.length === 0) continue;
        if (values.length === 1) {
            result[key] = values[0] as MkMergeObjectResult<T>[typeof key];
        } else {
            result[key] = mkMergeValues(values) as MkMergeObjectResult<T>[typeof key];
        }
    }
    return result as MkMergeObjectResult<T>;
}

/**
 * Merge multiple definitions for the same key within a single module.
 */
export function mkMerge<T>(definitions: T[]): MkMergeResult<T> | undefined {
    if (definitions.length === 0) return undefined;

    const nonUndefined = definitions.filter(isDefined);
    if (nonUndefined.length === 0) return undefined;

    const allObjects = nonUndefined.every(d => isPlainObject(d));

    if (allObjects) {
        return mkMergeObjects(nonUndefined as Array<Defined<T> & object>) as MkMergeResult<T>;
    }

    return mkMergeValues(definitions);
}
