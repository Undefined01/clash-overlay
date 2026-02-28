// liboverlay/src/deferred.ts
// Deferred values — resolved after all overlays merge.

import type { Deferred } from './types.js';

/**
 * Mark a value as deferred — resolved after all overlays are merged.
 * Use this to create forward references to `final`.
 *
 * @example
 * const mod = (final, prev) => ({
 *   allProxies: deferred(() => [...final.proxies, 'DIRECT', 'REJECT']),
 * });
 */
export function deferred<T>(fn: () => T): Deferred<T> {
    return { __deferred: true, fn };
}

/** Check if a value is a deferred wrapper. */
export function isDeferred(val: unknown): val is Deferred {
    return val !== null && typeof val === 'object' && (val as Deferred).__deferred === true;
}
