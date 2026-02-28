// clash-overlay/src/lib/merge.ts
// Clash configuration module merge engine.
//
// Each module contributes Clash-native config fragments. This engine merges
// them with the correct strategy per field type, detects scalar conflicts
// using Nix-compatible numeric priorities, and resolves deferred values
// with ordered list flattening.

import {
    isDeferred, resolveDeferred, applyOverlays,
    isOverride, getPriority, unwrapPriority,
    isOrdered, isOrderedList, isArrayLike,
    DEFAULT_ORDER,
} from 'liboverlay';
import type { MergeFn, OrderedList } from 'liboverlay';

// ─── Helpers ────────────────────────────────────────────────────────

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
 * Deep merge two plain objects. Arrays within are concatenated.
 * Scalars inside deep merge use "later wins" (no conflict detection).
 */
function deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (isPlainObject(result[key]) && isPlainObject(value)) {
            result[key] = deepMerge(result[key], value);
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = [...(result[key] as unknown[]), ...value];
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ─── Ordered Array Helpers ──────────────────────────────────────────

interface Segment {
    order: number;
    items: unknown[];
}

/**
 * Convert an array-like value to ordered segments.
 */
function toSegments(val: unknown): Segment[] {
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

// ─── Merge Strategy ─────────────────────────────────────────────────

/**
 * Merge strategy for Clash module contributions.
 *
 * Scalar conflict resolution (Nix-compatible):
 *   - Two values at the same priority with different content → error
 *   - Different priorities → lower number (higher precedence) wins
 *   - mkForce (50) > bare (100) > mkDefault (1000)
 *
 * Array merge:
 *   - Arrays are collected as ordered segments
 *
 * Object merge:
 *   - Deep merge (recursive)
 *   - rule-providers: strict key-conflict detection
 */
export const clashModuleMerge: MergeFn = (current, extension) => {
    const result: Record<string, unknown> = { ...current };

    for (const [key, extRaw] of Object.entries(extension)) {
        if (extRaw === undefined) continue;

        // New key
        if (!(key in result) || result[key] === undefined) {
            if (!key.startsWith('_') && isArrayLike(extRaw)) {
                result[key] = { __orderedList: true, segments: toSegments(extRaw) } as OrderedList;
            } else {
                result[key] = extRaw;
            }
            continue;
        }

        const curRaw = result[key];

        // Deferred values: keep extension for later resolution
        if (isDeferred(extRaw)) {
            result[key] = extRaw;
            continue;
        }

        // Internal metadata (_* keys): later wins
        if (key.startsWith('_')) {
            result[key] = extRaw;
            continue;
        }

        // ── Array-like: collect ordered segments ──
        const curIsArr = isArrayLike(curRaw);
        const extIsArr = isArrayLike(extRaw);

        if (curIsArr || extIsArr) {
            if (!curIsArr || !extIsArr) {
                throw new Error(
                    `Type mismatch for "${key}": cannot merge array with non-array`,
                );
            }
            const curSegs = toSegments(curRaw);
            const extSegs = toSegments(extRaw);
            result[key] = { __orderedList: true, segments: [...curSegs, ...extSegs] } as OrderedList;
            continue;
        }

        // Unwrap priorities for value comparison
        const curVal = unwrapPriority(curRaw);
        const extVal = unwrapPriority(extRaw);

        // ── Object fields: deep merge ──
        if (isPlainObject(curVal) && isPlainObject(extVal)) {
            if (key === 'rule-providers') {
                for (const k of Object.keys(extVal)) {
                    if (k in curVal) {
                        throw new Error(`Rule provider key conflict: "${k}" already defined.`);
                    }
                }
            }
            result[key] = deepMerge(curVal, extVal);
            continue;
        }

        // Deferred current: keep extension
        if (isDeferred(curRaw)) {
            result[key] = extRaw;
            continue;
        }

        // ── Scalar conflict resolution (Nix-compatible) ──
        const curPri = getPriority(curRaw);
        const extPri = getPriority(extRaw);

        if (curPri === extPri) {
            // Same priority: values must be equal (idempotent)
            if (curVal === extVal) continue;
            throw new Error(
                `Scalar conflict for key "${key}": ` +
                `values ${JSON.stringify(curVal)} vs ${JSON.stringify(extVal)} ` +
                `at same priority ${curPri}. ` +
                `Use different mkOverride priorities to resolve.`,
            );
        }

        // Different priorities: lower number (higher precedence) wins
        if (extPri < curPri) {
            result[key] = extRaw;
        }
        // else: current has higher precedence, keep it
    }

    return result;
};

// ─── Module System ──────────────────────────────────────────────────

export interface ModuleContext {
    args: Record<string, unknown>;
    config: {
        proxies: Array<{ name: string; [key: string]: unknown }>;
        [key: string]: unknown;
    };
}

export type ClashModule = (
    final: Record<string, unknown>,
    prev: Record<string, unknown>,
    ctx: ModuleContext,
) => Record<string, unknown>;

/**
 * Initial empty state for the Clash module system.
 */
function initialModuleState(config: ModuleContext['config']): Record<string, unknown> {
    return {
        proxies: config.proxies || [],
        'proxy-groups': [],
        rules: [],
        'rule-providers': {},
    };
}

/**
 * Merge modules into a Clash configuration.
 */
export function mergeModules(modules: ClashModule[], ctx: ModuleContext): Record<string, unknown> {
    const overlays = modules.map(mod => {
        return (final: Record<string, unknown>, prev: Record<string, unknown>) =>
            mod(final, prev, ctx);
    });

    const base = initialModuleState(ctx.config);
    return applyOverlays(base, overlays, { merge: clashModuleMerge });
}

/**
 * Remove internal metadata keys (_* prefix) and empty objects from config.
 */
export function cleanup(config: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
        if (key.startsWith('_')) continue;
        if (value === undefined) continue;
        if (isPlainObject(value) && Object.keys(value).length === 0) continue;
        result[key] = value;
    }
    return result;
}
