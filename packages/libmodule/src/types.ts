// libmodule/src/types.ts
// Core type definitions for the Nix-style overlay system.

// ─── Deferred ───────────────────────────────────────────────────────

/** Deferred value — resolved after all overlays merge. */
export interface Deferred<T = unknown> {
    readonly __deferred: true;
    readonly fn: () => T | Promise<T>;
}

// ─── Priority (Nix-compatible) ──────────────────────────────────────

/**
 * Priority override wrapper (Nix-compatible).
 *
 * Lower priority number = higher precedence.
 *   mkForce:   priority 50
 *   bare value: priority 100 (implicit, DEFAULT_PRIORITY)
 *   mkDefault: priority 1000
 *
 * Corresponds to Nix's:
 *   { __type = "override"; inherit priority content; }
 */
export interface Override<T = unknown> {
    readonly __type: 'override';
    readonly priority: number;
    readonly value: T;
}

// ─── Order ──────────────────────────────────────────────────────────

/** Ordered list segment — positions elements via sort order. */
export interface Ordered<T = unknown> {
    readonly __ordered: true;
    readonly order: number;
    readonly items: T[];
}

/** Accumulated ordered segments (internal merge state). */
export interface OrderedList<T = unknown> {
    readonly __orderedList: true;
    readonly segments: Array<{ order: number; items: T[] }>;
}

// ─── Overlay System ─────────────────────────────────────────────────

/** Merge function: combines current accumulated state with a new extension. */
export type MergeFn = (
    current: Record<string, unknown>,
    extension: Record<string, unknown>,
) => Record<string, unknown>;

/** Overlay function: receives final proxy and prev state, returns extension. */
export type OverlayFn = (
    final: Record<string, unknown>,
    prev: Record<string, unknown>,
) => Record<string, unknown>;

/** Async overlay function: may resolve extension asynchronously. */
export type AsyncOverlayFn = (
    final: Record<string, unknown>,
    prev: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** Options for applyOverlays. */
export interface ApplyOverlaysOptions {
    merge?: MergeFn;
}
