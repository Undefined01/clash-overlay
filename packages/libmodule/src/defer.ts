// libmodule/src/defer.ts
// Proxy-based lazy values — resolved after all overlays merge.
//
// `defer()` returns a Proxy tagged with MARKER='defer' and DEFER_SYMBOL.
// Property access forces the lambda, caches the result, returns the concrete value.
// Works for both object and primitive return types.

import { MARKER, DEFER_SYMBOL, FORCE_SYMBOL } from './symbols.js';

/** A proxy wrapping a lazily-evaluated value. */
export type DeferProxy<T = unknown> = T & { readonly [DEFER_SYMBOL]: () => T };

/**
 * Create a lazily-evaluated value. The returned Proxy defers evaluation
 * of `fn` until a property is accessed, then caches the result.
 *
 * Works for both objects and primitives:
 * - Object: property access returns the resolved object's property
 * - Primitive: property access returns undefined (harmless — values
 *   are only accessed after resolveDeferred forces them)
 *
 * @example
 * const mod = ({ config }) => ({
 *   allProxies: defer(() => [...config.proxies, 'DIRECT', 'REJECT']),
 * });
 */
export function defer<T>(fn: () => T): DeferProxy<T> {
    let cached: T | undefined;
    let forced = false;

    return new Proxy({} as object, {
        get(_target, prop) {
            if (prop === MARKER) return 'defer';
            if (prop === DEFER_SYMBOL) return fn;
            if (prop === FORCE_SYMBOL) {
                if (!forced) { cached = fn(); forced = true; }
                return cached;
            }
            if (prop === Symbol.for('nodejs.util.inspect.custom')) {
                return () => forced ? `DeferProxy(resolved)` : `DeferProxy(pending)`;
            }
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || cached === undefined) return undefined;
            if (typeof cached !== 'object' && typeof cached !== 'function') return undefined;
            return (cached as Record<string | symbol, unknown>)[prop];
        },
        has(_target, prop) {
            if (prop === MARKER) return true;
            if (prop === DEFER_SYMBOL) return true;
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return false;
            return prop in (cached as object);
        },
        ownKeys() {
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return [];
            return Reflect.ownKeys(cached as object);
        },
        getOwnPropertyDescriptor(_target, prop) {
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return undefined;
            return Object.getOwnPropertyDescriptor(cached as object, prop);
        },
    }) as DeferProxy<T>;
}

/** Check if a value is a defer proxy. */
export function isDefer<T>(val: DeferProxy<T> | T): val is DeferProxy<T> {
    return val !== null && typeof val === 'object' && DEFER_SYMBOL in (val as object);
}

/**
 * Explicitly force a defer proxy, returning the cached result.
 * If the value is not a defer proxy, returns it as-is.
 */
export function forceDefer<T>(val: DeferProxy<T> | T): T {
    if (isDefer(val)) {
        return (val as Record<symbol, unknown>)[FORCE_SYMBOL] as T;
    }
    return val;
}
