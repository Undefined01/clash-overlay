// libmodule/src/merge-engine.ts
// All-at-once per-key merge engine.
//
// Replaces the pairwise fold merge for evalModules. Collects all definitions
// per key across all fragments, applies priority filtering, then delegates
// to the appropriate OptionType.merge.

import { defer, isDefer, forceDefer } from './defer.js';
import { getPriority, unwrapPriority } from './priority.js';
import { isPromiseLike } from './core-merge.js';
import type { OptionType } from './option-types.js';

// ─── Definition Collection ──────────────────────────────────────────

export interface Definition {
    value: unknown;
    moduleIndex: number;
}

/**
 * Collect all definitions per key across all fragments.
 *
 * Returns a Map from key name to array of definitions, preserving module order.
 * Skips undefined values and internal keys (_options, _imports, _module).
 */
export function collectDefinitions(
    fragments: Array<Record<string, unknown>>,
): Map<string, Definition[]> {
    const defs = new Map<string, Definition[]>();

    for (let i = 0; i < fragments.length; i++) {
        for (const [key, value] of Object.entries(fragments[i])) {
            if (value === undefined) continue;
            // Skip internal keys that are processed separately
            if (key === '_options' || key === '_imports' || key === '_module') continue;

            if (!defs.has(key)) defs.set(key, []);
            defs.get(key)!.push({ value, moduleIndex: i });
        }
    }

    return defs;
}

// ─── Priority Filtering ─────────────────────────────────────────────

/**
 * Filter definitions by priority (Nix override semantics).
 *
 * 1. Find the lowest priority number among concrete definitions
 * 2. Keep only concrete defs at that priority + all deferred defs
 * 3. Unwrap priority wrappers, returning raw values
 * 4. Maintain original module order
 */
export function filterOverrides(
    _key: string,
    defs: Definition[],
): unknown[] {
    if (defs.length === 0) return [];
    if (defs.length === 1) return [unwrapPriority(defs[0].value)];

    // Find the lowest priority among concrete values
    let minPriority = Infinity;
    for (const def of defs) {
        if (!isDefer(def.value)) {
            const pri = getPriority(def.value);
            if (pri < minPriority) minPriority = pri;
        }
    }

    // Keep deferred values and concrete values at winning priority, in original order
    return defs
        .filter(def => {
            if (isDefer(def.value)) return true;
            return getPriority(def.value) === minPriority;
        })
        .map(def => {
            if (isDefer(def.value)) return def.value;
            return unwrapPriority(def.value);
        });
}

// ─── Per-Key Merge ──────────────────────────────────────────────────

/**
 * Merge all definitions for a single key.
 *
 * Applies filterOverrides, then delegates to the OptionType's merge function.
 * When deferred values are present, wraps the merge in a deferred that resolves
 * all values before merging.
 */
export function mergeKey(
    key: string,
    defs: Definition[],
    optionType: OptionType,
): unknown {
    const filtered = filterOverrides(key, defs);

    if (filtered.length === 0) {
        return optionType.emptyValue ? optionType.emptyValue() : undefined;
    }

    if (filtered.length === 1) return filtered[0];

    // If any values are deferred, wrap merge in a deferred that resolves
    // all values first, then merges the concrete results
    const hasDefer = filtered.some(v => isDefer(v));
    if (hasDefer) {
        return defer(() => {
            const resolved = filtered.map(v => {
                if (isDefer(v)) return forceDefer(v);
                return v;
            });

            // Handle async case
            if (resolved.some(isPromiseLike)) {
                return Promise.all(resolved).then(vals =>
                    optionType.merge(key, vals.filter(v => v !== undefined)),
                );
            }

            const concrete = resolved.filter(v => v !== undefined);
            if (concrete.length === 0) return optionType.emptyValue ? optionType.emptyValue() : undefined;
            if (concrete.length === 1) return concrete[0];
            return optionType.merge(key, concrete);
        });
    }

    return optionType.merge(key, filtered);
}

