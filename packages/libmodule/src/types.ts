// libmodule/src/types.ts
// Core type definitions for the Nix-style overlay system.

import type { MARKER } from './symbols.js';
import type { DeferProxy } from './defer.js';

// ─── Priority (Nix-compatible) ──────────────────────────────────────

/**
 * Priority override wrapper (Nix-compatible).
 *
 * Lower priority number = higher precedence.
 *   mkForce:   priority 50
 *   bare value: priority 100 (implicit, DEFAULT_PRIORITY)
 *   mkDefault: priority 1000
 */
export interface Override<T = unknown> {
    readonly [MARKER]: 'override';
    readonly priority: number;
    readonly value: T;
}

// ─── Order ──────────────────────────────────────────────────────────

/** Ordered list segment — positions elements via sort order. */
export interface Ordered<T = unknown> {
    readonly [MARKER]: 'order';
    readonly order: number;
    readonly items: T[];
}

/** Accumulated ordered segments (internal merge state). */
export interface OrderedList<T = unknown> {
    readonly [MARKER]: 'order-list';
    readonly segments: Array<{ order: number; items: T[] }>;
}

export type Defined<T> = Exclude<T, undefined>;

export type MaybePromise<T> = T | Promise<T>;

export type MergeKeys<T> = T extends T ? keyof T : never;

export type MergeStringKeys<T> = Extract<MergeKeys<T>, string>;

export type MergeValueAt<T, K extends PropertyKey> =
    T extends T
        ? K extends keyof T
            ? T[K]
            : never
        : never;

export type ArrayLikeValue<T> = Array<T | Ordered<T>> | Ordered<T> | OrderedList<T>;

export type MergeArrayItem<T> =
    T extends readonly (infer U)[]
        ? U
        : T extends Ordered<infer U>
            ? U
            : T extends OrderedList<infer U>
                ? U
                : never;

export type MkMergeObjectResult<T extends object> = {
    [K in MergeKeys<T>]?: MkMergeResult<Defined<MergeValueAt<T, K>>>;
};

type MkMergeDerived<T> =
    [MergeArrayItem<T>] extends [never]
        ? T extends object
            ? MkMergeObjectResult<T>
            : never
        : OrderedList<MergeArrayItem<T>>;

export type MkMergeValue<T> = Defined<T> | MkMergeDerived<Defined<T>> | undefined;

export type MkMergeAsyncValue<T> = MaybePromise<MkMergeValue<T>>;

export type MkMergeResult<T> = MkMergeValue<T> | DeferProxy<MkMergeAsyncValue<T>>;

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

// ─── Module System ─────────────────────────────────────────────────

/** Module args: config proxy plus any specialArgs. */
export interface ModuleArgs {
    config: Record<string, unknown>;
    [key: string]: unknown;
}

/** Module function: receives { config, ...specialArgs }, returns a config fragment. */
export type ModuleFn = (args: ModuleArgs) => Record<string, unknown>;

/** Async module function: may return Promise. */
export type AsyncModuleFn = (
    args: ModuleArgs,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/** Options for evalModules / evalModulesAsync. */
export interface EvalModulesOptions {
    /** Additional arguments passed to all module functions alongside config. */
    args?: Record<string, unknown>;
    /** Warning handler. Default: console.warn. */
    onWarning?: (message: string) => void;
}
