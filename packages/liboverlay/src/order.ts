// liboverlay/src/order.ts
// Nix-compatible ordering system for list element positioning.
//
// In Nix:
//   mkBefore             = mkOrder 500;
//   defaultOrderPriority = 1000;
//   mkAfter              = mkOrder 1500;
//
// Lower order = earlier in the final list.

import type { Ordered, OrderedList } from './types.js';

/** Default order for plain arrays. */
export const DEFAULT_ORDER = 1000;

/** Order for mkBefore — placed near the front. */
export const BEFORE_ORDER = 500;

/** Order for mkAfter — placed near the end. */
export const AFTER_ORDER = 1500;

/**
 * Place list elements near the front (order 500).
 */
export function mkBefore<T>(items: T[]): Ordered<T> {
    return { __ordered: true, order: BEFORE_ORDER, items };
}

/**
 * Place list elements near the end (order 1500).
 */
export function mkAfter<T>(items: T[]): Ordered<T> {
    return { __ordered: true, order: AFTER_ORDER, items };
}

/**
 * Place list elements at a specific order position.
 * Lower order = earlier in the final list. Default order for plain arrays = 1000.
 *
 * @param order - Sort position
 * @param items - Array of items
 */
export function mkOrder<T>(order: number, items: T[]): Ordered<T> {
    return { __ordered: true, order, items };
}

/** Check if a value is an order wrapper (mkBefore/mkAfter/mkOrder). */
export function isOrdered(val: unknown): val is Ordered {
    return val !== null && typeof val === 'object' && (val as Ordered).__ordered === true;
}

/** Check if a value is accumulated ordered segments (internal). */
export function isOrderedList(val: unknown): val is OrderedList {
    return val !== null && typeof val === 'object' && (val as OrderedList).__orderedList === true;
}

/** Check if a value is array-like (plain array, ordered, or ordered list). */
export function isArrayLike(val: unknown): boolean {
    return Array.isArray(val) || isOrdered(val) || isOrderedList(val);
}
