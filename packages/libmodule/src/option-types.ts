// libmodule/src/option-types.ts
// Type system for per-key merge semantics.
//
// Each OptionType controls how multiple definitions of the same key
// are merged, validated, and transformed.

import { isArrayLike, DEFAULT_ORDER } from './order.js';
import { isPlainObject, coreMerge, toSegments, flattenSegments } from './core-merge.js';
import type { Segment } from './core-merge.js';

// ─── Symbol for OptionType detection ────────────────────────────────

const OPTION_TYPE_SYMBOL = Symbol.for('libmodule:option-type');

/** Check if a value is an OptionType. */
export function isOptionType(val: unknown): val is OptionType<unknown, unknown> {
    return val !== null && typeof val === 'object' && OPTION_TYPE_SYMBOL in (val as object);
}

// ─── OptionType Interface ───────────────────────────────────────────

/**
 * Defines per-key merge semantics, validation, and optional transforms.
 */
export interface OptionType<TValue = unknown, TOutput = TValue> {
    readonly [OPTION_TYPE_SYMBOL]: true;
    readonly name: string;
    /** Validate a single value. */
    check: (value: unknown) => boolean;
    /** Merge multiple definitions (after priority filtering). */
    merge: (key: string, defs: TValue[]) => TValue;
    /** Default empty value when no definitions provided. */
    emptyValue?: () => TValue;
    /** Optional final transform applied after validation. */
    apply?: (value: TValue) => TOutput;
}

// ─── Helpers ────────────────────────────────────────────────────────

export function makeType<TValue, TOutput = TValue>(
    name: string,
    check: (value: unknown) => boolean,
    merge: (key: string, defs: TValue[]) => TValue,
    emptyValue?: () => TValue,
    apply?: (value: TValue) => TOutput,
): OptionType<TValue, TOutput> {
    return { [OPTION_TYPE_SYMBOL]: true as const, name, check, merge, emptyValue, apply };
}

/** All-must-equal merge: all defs must be the same value. */
function allEqual<T>(key: string, defs: T[]): T {
    if (defs.length === 0) throw new Error(`No definitions for "${key}".`);
    const first = defs[0];
    for (let i = 1; i < defs.length; i++) {
        if (defs[i] !== first) {
            throw new Error(
                `Conflicting definitions for "${key}": ` +
                `${JSON.stringify(first)} vs ${JSON.stringify(defs[i])}.`,
            );
        }
    }
    return first;
}

// ─── Type Constructors ──────────────────────────────────────────────

/** Boolean type. All definitions must be equal. */
const bool: OptionType<boolean> = makeType(
    'bool',
    (v): v is boolean => typeof v === 'boolean',
    allEqual,
);

/** Integer type. All definitions must be equal. */
const int: OptionType<number> = makeType(
    'int',
    (v): v is number => Number.isInteger(v),
    allEqual,
);

/** String type. All definitions must be equal. */
const str: OptionType<string> = makeType(
    'str',
    (v): v is string => typeof v === 'string',
    allEqual,
    () => '',
);

/** Enum type. All definitions must be equal and one of the allowed values. */
function enum_<T extends string | number>(values: readonly T[]): OptionType<T> {
    return makeType(
        `enum(${values.map(v => JSON.stringify(v)).join(', ')})`,
        (v) => (values as readonly unknown[]).includes(v),
        allEqual,
    );
}

/** List type. Definitions are concatenated respecting mkOrder. */
function listOf<T>(elem: OptionType<T>): OptionType<T[]> {
    return makeType(
        `listOf(${elem.name})`,
        (v) => Array.isArray(v) && v.every(item => elem.check(item)),
        (_key, defs) => {
            const allSegments: Segment[] = [];
            for (const def of defs) {
                if (isArrayLike(def)) {
                    allSegments.push(...toSegments(def));
                } else if (Array.isArray(def)) {
                    allSegments.push({ order: DEFAULT_ORDER, items: def });
                }
            }
            return flattenSegments(allSegments) as T[];
        },
        () => [] as T[],
    );
}

/** Attribute set type. Per sub-key deep merge delegating to elem. */
function attrsOf<T>(elem: OptionType<T>): OptionType<Record<string, T>> {
    return makeType(
        `attrsOf(${elem.name})`,
        (v) => isPlainObject(v) && Object.values(v).every(item => elem.check(item)),
        (key, defs) => {
            const result: Record<string, T[]> = {};
            for (const def of defs) {
                for (const [k, v] of Object.entries(def)) {
                    if (!result[k]) result[k] = [];
                    result[k].push(v);
                }
            }
            const merged: Record<string, T> = {};
            for (const [k, values] of Object.entries(result)) {
                merged[k] = values.length === 1 ? values[0] : elem.merge(`${key}.${k}`, values);
            }
            return merged;
        },
        () => ({} as Record<string, T>),
    );
}

/** Nullable type. Filters out nulls, then delegates to inner. */
function nullOr<T>(inner: OptionType<T>): OptionType<T | null> {
    return makeType<T | null>(
        `nullOr(${inner.name})`,
        (v) => v === null || inner.check(v),
        (key, defs) => {
            const nonNull = defs.filter((d): d is T => d !== null);
            if (nonNull.length === 0) return null;
            if (nonNull.length === 1) return nonNull[0];
            return inner.merge(key, nonNull);
        },
        () => null,
    );
}

/** Either type. Dispatches merge by which type matches. */
function either<A, B>(t1: OptionType<A>, t2: OptionType<B>): OptionType<A | B> {
    return makeType(
        `either(${t1.name}, ${t2.name})`,
        (v) => t1.check(v) || t2.check(v),
        (key, defs) => {
            // If all match t1, use t1.merge
            if (defs.every(d => t1.check(d))) {
                return t1.merge(key, defs as A[]);
            }
            // If all match t2, use t2.merge
            if (defs.every(d => t2.check(d))) {
                return t2.merge(key, defs as B[]);
            }
            throw new Error(
                `Mixed types for "${key}": cannot merge ${t1.name} with ${t2.name}.`,
            );
        },
    );
}

/** Unique type. Exactly one definition allowed. */
const unique: OptionType = makeType(
    'unique',
    () => true,
    (key, defs) => {
        if (defs.length !== 1) {
            throw new Error(
                `Option "${key}" is unique but has ${defs.length} definitions.`,
            );
        }
        return defs[0];
    },
);

/** Raw type. Last definition wins (no merge). */
const raw: OptionType = makeType(
    'raw',
    () => true,
    (_key, defs) => defs[defs.length - 1],
);

/**
 * Anything type. Duck-typed merge:
 * - Arrays: concat with ordered segments
 * - Objects: deep merge
 * - Scalars: all must equal (same-priority semantics, since priority is
 *   already resolved before type.merge is called)
 */
const anything: OptionType = makeType(
    'anything',
    () => true,
    (key, defs) => {
        if (defs.length === 0) return undefined as unknown;
        if (defs.length === 1) return defs[0];

        let acc = defs[0];
        for (let i = 1; i < defs.length; i++) {
            acc = coreMerge(key, acc, defs[i]);
        }
        return acc;
    },
);

/**
 * Lines type. Sugar for listOf(str) with apply that joins with '\n'.
 */
const lines: OptionType<string | string[]> = makeType<string | string[]>(
    'lines',
    (v): v is string | string[] =>
        typeof v === 'string' || (Array.isArray(v) && v.every(item => typeof item === 'string')),
    (_key, defs) => {
        const all: string[] = [];
        for (const def of defs) {
            if (Array.isArray(def)) {
                all.push(...def);
            } else {
                all.push(def);
            }
        }
        return all;
    },
    () => '',
    (val): string => Array.isArray(val) ? val.join('\n') : val,
);

/** Coerced type. Coerces values before delegating to inner type. */
function coercedTo<S, T>(
    target: OptionType<T>,
    coerce: (val: S) => T,
    inner: OptionType<T>,
): OptionType<T> {
    return makeType(
        `coercedTo(${target.name}, ${inner.name})`,
        (v) => target.check(v),
        (key, defs) => {
            const coerced = defs.map(d => coerce(d as unknown as S));
            return inner.merge(key, coerced);
        },
    );
}

/** Submodule type. Nested module system inside an option. */
function submodule(
    options: Record<string, import('./options.js').OptionDeclaration>,
): OptionType<Record<string, unknown>> {
    const optionMap = new Map(Object.entries(options));

    return makeType(
        `submodule({${[...optionMap.keys()].join(', ')}})`,
        (v) => isPlainObject(v),
        (key, defs) => {
            const subKeys = new Set<string>();
            for (const def of defs) {
                for (const k of Object.keys(def as Record<string, unknown>)) {
                    subKeys.add(k);
                }
            }

            const result: Record<string, unknown> = {};
            for (const subKey of subKeys) {
                const subDefs = defs
                    .map(d => (d as Record<string, unknown>)[subKey])
                    .filter(v => v !== undefined);
                const subType = optionMap.get(subKey)?.type ?? anything;
                result[subKey] = subDefs.length === 1
                    ? subDefs[0]
                    : subType.merge(`${key}.${subKey}`, subDefs);
            }

            for (const [subKey, decl] of optionMap) {
                if (!(subKey in result)) {
                    if ('default' in decl) result[subKey] = decl.default;
                    else if (decl.type.emptyValue) result[subKey] = decl.type.emptyValue();
                }
            }

            return result;
        },
        () => {
            const result: Record<string, unknown> = {};
            for (const [subKey, decl] of optionMap) {
                if ('default' in decl) result[subKey] = decl.default;
                else if (decl.type.emptyValue) result[subKey] = decl.type.emptyValue();
            }
            return result;
        },
    );
}

/** Keyed list type. List of objects merged by key, output as ordered array. */
function keyedListOf<T extends Record<string, unknown>>(
    keyFn: (elem: T) => string,
    elemType: OptionType<T>,
): OptionType<T[]> {
    return makeType(
        `keyedListOf(${elemType.name})`,
        (v) => Array.isArray(v),
        (key, defs) => {
            // Flatten all ordered segments
            const allSegments: Segment[] = [];
            for (const def of defs) {
                if (isArrayLike(def)) {
                    allSegments.push(...toSegments(def));
                } else if (Array.isArray(def)) {
                    allSegments.push({ order: DEFAULT_ORDER, items: def });
                }
            }
            const sorted = [...allSegments].sort((a, b) => a.order - b.order);

            // Group by key, preserving first-seen order
            const groups = new Map<string, T[]>();
            for (const seg of sorted) {
                for (const item of seg.items as T[]) {
                    const k = keyFn(item);
                    if (!groups.has(k)) groups.set(k, []);
                    groups.get(k)!.push(item);
                }
            }

            // Merge each group
            const result: T[] = [];
            for (const [, items] of groups) {
                result.push(
                    items.length === 1
                        ? items[0]
                        : elemType.merge(key, items),
                );
            }
            return result;
        },
        () => [] as T[],
    );
}

/** Unique list type. Ordered list with post-merge deduplication. */
function uniqueListOf<T>(
    elem: OptionType<T>,
    keyFn: (item: T) => string = String,
): OptionType<T[]> {
    const inner = listOf(elem);
    return makeType(
        `uniqueListOf(${elem.name})`,
        inner.check,
        (key, defs) => {
            const merged = inner.merge(key, defs);
            const seen = new Set<string>();
            return merged.filter(item => {
                const k = keyFn(item);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
        },
        inner.emptyValue,
    );
}

// ─── Public API ─────────────────────────────────────────────────────

export const types = {
    bool,
    int,
    str,
    enum: enum_,
    listOf,
    attrsOf,
    nullOr,
    either,
    unique,
    raw,
    anything,
    lines,
    coercedTo,
    submodule,
    keyedListOf,
    uniqueListOf,
} as const;
