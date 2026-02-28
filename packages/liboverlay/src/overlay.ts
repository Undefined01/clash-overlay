// liboverlay/src/overlay.ts
// Core overlay application — the JS equivalent of Nix's overlay system.
//
// Key insight: Nix's overlay system works because of pervasive lazy evaluation.
// In JS, we simulate this with:
//   1. A `deferred()` marker for values resolved after all overlays merge
//   2. A `final` Proxy that becomes accessible only after merge completes
//   3. Two-phase evaluation: merge overlays → resolve deferred values
//
// The `prev` and `final` semantics match Nix exactly:
//   - `prev`: the accumulated state from all previous overlays (immediately available)
//   - `final`: the state after ALL overlays are applied (lazy, use in deferred/getters)

import { isDeferred } from './deferred.js';
import { resolveDeferred } from './resolve.js';
import type { OverlayFn, MergeFn, ApplyOverlaysOptions } from './types.js';

/**
 * Apply overlays to a base state, producing the final merged result.
 *
 * This is the JS equivalent of:
 *   fix (extends (composeManyExtensions overlays) (final: base))
 *
 * Each overlay: (final, prev) => extensionAttrs
 *   - `prev`:  accumulated state from base + previous overlays (eager, safe to read)
 *   - `final`: state after ALL overlays (lazy proxy, wrap in deferred() for access)
 *
 * After all overlays are merged, deferred values are resolved.
 *
 * @param base     - Initial state
 * @param overlays - Overlay functions
 * @param options  - Custom merge strategy
 * @returns Final resolved result
 */
export function applyOverlays(
    base: Record<string, unknown>,
    overlays: OverlayFn[],
    options: ApplyOverlaysOptions = {},
): Record<string, unknown> {
    const merge = options.merge ?? shallowMerge;

    let finalResolved: Record<string, unknown> | null = null;

    // Proxy for `final`: defers all access until after merge completes
    const finalProxy = new Proxy(Object.create(null) as Record<string, unknown>, {
        get(_: Record<string, unknown>, prop: string | symbol): unknown {
            if (prop === '__isFinalProxy') return true;
            if (finalResolved === null) {
                throw new Error(
                    `Cannot eagerly access final.${String(prop)} during overlay evaluation. ` +
                    `Wrap in deferred(() => final.${String(prop)}).`,
                );
            }
            return finalResolved[prop as string];
        },
        has(_: Record<string, unknown>, prop: string | symbol): boolean {
            if (finalResolved === null) {
                throw new Error(`Cannot check 'final' membership during overlay evaluation.`);
            }
            return (prop as string) in finalResolved;
        },
        ownKeys(): Array<string | symbol> {
            if (finalResolved === null) {
                throw new Error(`Cannot enumerate 'final' during overlay evaluation.`);
            }
            return Reflect.ownKeys(finalResolved);
        },
        getOwnPropertyDescriptor(_: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
            if (finalResolved === null) return undefined;
            if ((prop as string) in finalResolved) {
                return { value: finalResolved[prop as string], writable: true, enumerable: true, configurable: true };
            }
            return undefined;
        },
    });

    // Phase 1: Sequential overlay application
    let current: Record<string, unknown> = { ...base };
    for (const overlay of overlays) {
        const ext = overlay(finalProxy, current);
        current = merge(current, ext);
    }

    // Phase 2: Resolve deferred values
    finalResolved = current;
    const resolved = resolveDeferred(current) as Record<string, unknown>;
    finalResolved = resolved; // update for any nested deferred that reference final

    return resolved;
}

function shallowMerge(
    current: Record<string, unknown>,
    extension: Record<string, unknown>,
): Record<string, unknown> {
    return { ...current, ...extension };
}

/**
 * Simple merge strategy: concatenate arrays, shallow-merge objects, last-writer-wins for scalars.
 */
export function simpleMerge(
    current: Record<string, unknown>,
    extension: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(extension)) {
        if (!(key in result)) {
            result[key] = value;
        } else if (Array.isArray(result[key]) && Array.isArray(value)) {
            result[key] = [...(result[key] as unknown[]), ...value];
        } else if (
            typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key]) &&
            typeof value === 'object' && value !== null && !Array.isArray(value) &&
            !isDeferred(result[key]) && !isDeferred(value)
        ) {
            result[key] = { ...(result[key] as Record<string, unknown>), ...(value as Record<string, unknown>) };
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ─── Nix-Compatible Primitives (for reference) ─────────────────────

export function extends_(
    overlay: OverlayFn,
    baseFunc: (final: Record<string, unknown>) => Record<string, unknown>,
): (final: Record<string, unknown>) => Record<string, unknown> {
    return (final) => {
        const prev = baseFunc(final);
        const ext = overlay(final, prev);
        return { ...prev, ...ext };
    };
}

export function composeManyExtensions(overlays: OverlayFn[]): OverlayFn {
    return (final, prev) => {
        let acc = prev;
        for (const overlay of overlays) {
            const ext = overlay(final, acc);
            acc = { ...acc, ...ext };
        }
        return acc;
    };
}

interface Extensible extends Record<string, unknown> {
    extend: (overlay: OverlayFn) => Extensible;
}

export function makeExtensible(
    base: Record<string, unknown>,
    initialOverlays: OverlayFn[] = [],
): Extensible {
    const result = applyOverlays(base, initialOverlays) as Extensible;
    result.extend = (overlay: OverlayFn): Extensible => {
        return makeExtensible(base, [...initialOverlays, overlay]);
    };
    return result;
}
