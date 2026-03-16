// libmodule/src/symbols.ts
// Shared symbols for marker type detection.
//
// All libmodule marker types (Override, Ordered, OrderedList, DeferProxy)
// carry MARKER with a string discriminant. This enables a single
// `!(MARKER in val)` check in isPlainObject to exclude all markers.

/** Shared marker symbol for all libmodule marker types. */
export const MARKER = Symbol.for('libmodule:marker');

/** Symbol for defer proxy lambda retrieval. */
export const DEFER_SYMBOL = Symbol.for('libmodule:defer');

/** Symbol for defer proxy force/cache. */
export const FORCE_SYMBOL = Symbol.for('libmodule:defer:force');
