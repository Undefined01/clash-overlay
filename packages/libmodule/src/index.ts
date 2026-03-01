// libmodule/src/index.ts
// Public API — re-exports all overlay primitives.

// Types
export type {
    Deferred,
    Override,
    Ordered,
    OrderedList,
    MergeFn,
    OverlayFn,
    AsyncOverlayFn,
    ApplyOverlaysOptions,
} from './types.js';

export type { ModuleMergeOptions } from './module-merge.js';

// Deferred values
export { deferred, isDeferred } from './deferred.js';

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
    simpleMerge,
    extends_,
    composeManyExtensions,
    makeExtensible,
} from './overlay.js';

// Module merge (Nix module-system-style configuration merging)
export {
    createModuleMerge,
    moduleMerge,
    cleanup,
} from './module-merge.js';

// High-level processors
export {
    REMOVE,
    applyOverlay,
    mergeModule,
} from './processors.js';
export type {
    ModuleFn,
    ApplyOverlayOptions,
    MergeModuleOptions,
} from './processors.js';
