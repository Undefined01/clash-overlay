// liboverlay/src/index.ts
// Public API — re-exports all overlay primitives.

// Types
export type {
    Deferred,
    Override,
    Ordered,
    OrderedList,
    MergeFn,
    OverlayFn,
    ApplyOverlaysOptions,
} from './types.js';

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
export { resolveDeferred } from './resolve.js';

// Overlay application
export {
    applyOverlays,
    simpleMerge,
    extends_,
    composeManyExtensions,
    makeExtensible,
} from './overlay.js';
