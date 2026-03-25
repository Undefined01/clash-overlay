// libmodule/src/overlay.ts
// Core overlay application — the JS equivalent of Nix's overlay system.
//
// Key insight: Nix's overlay system works because of pervasive lazy evaluation.
// In JS, we simulate this with:
//   1. A `defer()` proxy for values resolved after all overlays merge
//   2. A `final` Proxy that becomes accessible only after merge completes
//   3. Two-phase evaluation: merge overlays → resolve deferred values
//
// The `prev` and `final` semantics match Nix exactly:
//   - `prev`: the accumulated state from all previous overlays (immediately available)
//   - `final`: the state after ALL overlays are applied (lazy, use in deferred/getters)

import { deepCleanUndefined, normalizeFinal, resolveDeferred, resolveDeferredAsync } from './resolve.js';
import type { OverlayFn, AsyncOverlayFn, ApplyOverlaysOptions } from './types.js';
import { createLazyRecordProxy } from './lazy-record-proxy.js';

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
export function applyOverlays<TState extends Record<string, unknown> = Record<string, unknown>>(
    base: Partial<TState>,
    overlays: Array<OverlayFn<TState>>,
    options: ApplyOverlaysOptions<TState> = {},
): TState {
    const merge = options.merge ?? shallowMerge;

    let finalResolved: Record<string, unknown> | null = null;
    const finalProxy = createLazyRecordProxy(
        () => finalResolved,
        { name: 'final', phase: 'overlay evaluation' },
    ) as TState;

    // Phase 1: Sequential overlay application
    let current: Partial<TState> = { ...base };
    for (const overlay of overlays) {
        const ext = overlay(finalProxy, current);
        current = merge(current, ext);
    }

    // Phase 2: Resolve deferred values
    finalResolved = normalizeFinal(current) as Record<string, unknown>;
    const resolved = resolveDeferred(current) as Record<string, unknown>;
    finalResolved = resolved; // update for any nested deferred that reference final

    // Phase 3: Clean undefined values
    const cleaned = deepCleanUndefined(resolved);
    return (cleaned ?? {}) as TState;
}

/**
 * Async overlay application. Supports:
 * - overlay functions that return Promise
 * - deferred resolvers that return Promise
 */
export async function applyOverlaysAsync<TState extends Record<string, unknown> = Record<string, unknown>>(
    base: Partial<TState>,
    overlays: Array<AsyncOverlayFn<TState>>,
    options: ApplyOverlaysOptions<TState> = {},
): Promise<TState> {
    const merge = options.merge ?? shallowMerge;

    let finalResolved: Record<string, unknown> | null = null;
    const finalProxy = createLazyRecordProxy(
        () => finalResolved,
        { name: 'final', phase: 'overlay evaluation' },
    ) as TState;

    let current: Partial<TState> = { ...base };
    for (const overlay of overlays) {
        const ext = await overlay(finalProxy, current);
        current = merge(current, ext);
    }

    finalResolved = normalizeFinal(current) as Record<string, unknown>;
    const resolved = await resolveDeferredAsync(current) as Record<string, unknown>;
    finalResolved = resolved;

    const cleaned = deepCleanUndefined(resolved);
    return (cleaned ?? {}) as TState;
}

function shallowMerge<TState extends Record<string, unknown>>(
    current: Partial<TState>,
    extension: Partial<TState>,
): Partial<TState> {
    return { ...current, ...extension };
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
