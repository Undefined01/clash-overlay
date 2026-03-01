// libmodule/src/priority.ts
// Nix-compatible priority system for scalar conflict resolution.
//
// In Nix:
//   mkOverride = priority: content: { __type = "override"; inherit priority content; };
//   mkDefault  = mkOverride 1000;
//   mkForce    = mkOverride 50;
//   (bare value) is implicitly mkOverride 100;
//
// Lower priority number = higher precedence.
// Two values at the same priority with different content → error.

import type { Override } from './types.js';

/** Priority for bare (unwrapped) scalar values. */
export const DEFAULT_PRIORITY = 100;

/** Priority for mkDefault — easily overridden. */
export const MKDEFAULT_PRIORITY = 1000;

/** Priority for mkForce — overrides almost everything. */
export const MKFORCE_PRIORITY = 50;

/**
 * Wrap a value with an explicit numeric priority.
 * Lower priority number = higher precedence.
 *
 * @param priority - Numeric priority (lower wins)
 * @param value    - The value to wrap
 */
export function mkOverride<T>(priority: number, value: T): Override<T> {
    return { __type: 'override', priority, value };
}

/**
 * Mark a value as a "default" (priority 1000) — easily overridden by bare
 * values (100) or mkForce (50).
 */
export function mkDefault<T>(value: T): Override<T> {
    return mkOverride(MKDEFAULT_PRIORITY, value);
}

/**
 * Mark a value as "forced" (priority 50) — takes precedence over bare
 * values (100) and mkDefault (1000).
 */
export function mkForce<T>(value: T): Override<T> {
    return mkOverride(MKFORCE_PRIORITY, value);
}

/** Check if a value is an Override wrapper. */
export function isOverride(val: unknown): val is Override {
    return (
        val !== null &&
        typeof val === 'object' &&
        (val as Override).__type === 'override'
    );
}

/**
 * Get the effective priority of a value.
 * Override wrappers return their numeric priority;
 * bare values return DEFAULT_PRIORITY (100).
 */
export function getPriority(val: unknown): number {
    return isOverride(val) ? val.priority : DEFAULT_PRIORITY;
}

/** Unwrap an Override wrapper, returning the raw value. */
export function unwrapPriority(val: unknown): unknown {
    return isOverride(val) ? val.value : val;
}
