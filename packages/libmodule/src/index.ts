// libmodule/src/index.ts
// Public API — re-exports all overlay primitives.

// Types
export type {
    Defined,
    Override,
    Ordered,
    OrderedList,
    MaybePromise,
    MergeKeys,
    MergeStringKeys,
    MergeValueAt,
    ArrayLikeValue,
    MergeArrayItem,
    MkMergeObjectResult,
    MkMergeValue,
    MkMergeAsyncValue,
    MkMergeResult,
    MergeFn,
    OverlayFn,
    AsyncOverlayFn,
    ApplyOverlaysOptions,
    ModuleArgs,
    ModuleFn,
    AsyncModuleFn,
    EvalModulesOptions,
} from './types.js';

export type { OptionType } from './option-types.js';
export type { OptionDeclaration } from './options.js';
export type { DeferProxy } from './defer.js';
export type { ScalarHandler } from './core-merge.js';

// Symbols
export { MARKER, DEFER_SYMBOL } from './symbols.js';

// Defer (Proxy-based lazy values)
export { defer, isDefer, forceDefer } from './defer.js';

// Option type system
export { types, isOptionType, makeType } from './option-types.js';

// Priority system (Nix-compatible)
export {
    DEFAULT_PRIORITY,
    MKDEFAULT_PRIORITY,
    MKFORCE_PRIORITY,
    mkOverride,
    mkDefault,
    mkForce,
    isOverride,
    getPriority,
    unwrapPriority,
} from './priority.js';

// Order system (Nix-compatible)
export {
    DEFAULT_ORDER,
    BEFORE_ORDER,
    AFTER_ORDER,
    mkBefore,
    mkAfter,
    mkOrder,
    isOrdered,
    isOrderedList,
    isArrayLike,
} from './order.js';

// Resolution
export { resolveDeferred, resolveDeferredAsync } from './resolve.js';

// Overlay application
export {
    applyOverlays,
    applyOverlaysAsync,
    extends_,
    composeManyExtensions,
    makeExtensible,
} from './overlay.js';

// Module evaluation (Nix module-system-style)
export {
    evalModules,
    evalModulesAsync,
} from './modules.js';

// Core merge (shared helpers and unified merge functions)
export {
    deepMerge,
    coreMerge,
    coreDeepMerge,
    isPlainObject,
    scalarEqual,
    scalarLastWins,
} from './core-merge.js';

// Conditional config (Nix mkIf equivalent)
export { mkIf } from './mkif.js';

// Multi-definition merge (Nix mkMerge equivalent)
export { mkMerge } from './mkmerge.js';
