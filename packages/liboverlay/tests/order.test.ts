// tests/order.test.ts — Tests for ordering system
import { describe, it, expect } from 'vitest';
import {
    mkBefore, mkAfter, mkOrder,
    isOrdered, isOrderedList, isArrayLike,
    DEFAULT_ORDER, BEFORE_ORDER, AFTER_ORDER,
} from '../src/index.js';

// ─── Constants ──────────────────────────────────────────────────────

describe('order constants', () => {
    it('has correct Nix-compatible values', () => {
        expect(BEFORE_ORDER).toBe(500);
        expect(DEFAULT_ORDER).toBe(1000);
        expect(AFTER_ORDER).toBe(1500);
    });

    it('maintains correct relative ordering', () => {
        expect(BEFORE_ORDER).toBeLessThan(DEFAULT_ORDER);
        expect(DEFAULT_ORDER).toBeLessThan(AFTER_ORDER);
    });
});

// ─── mkBefore / mkAfter / mkOrder ───────────────────────────────────

describe('mkBefore', () => {
    it('creates ordered with BEFORE_ORDER', () => {
        const o = mkBefore(['a', 'b']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(BEFORE_ORDER);
        expect(o.items).toEqual(['a', 'b']);
    });

    it('handles empty array', () => {
        const o = mkBefore([]);
        expect(o.items).toEqual([]);
        expect(o.order).toBe(500);
    });
});

describe('mkAfter', () => {
    it('creates ordered with AFTER_ORDER', () => {
        const o = mkAfter(['x']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(AFTER_ORDER);
        expect(o.items).toEqual(['x']);
    });
});

describe('mkOrder', () => {
    it('creates ordered with custom order', () => {
        const o = mkOrder(750, ['mid']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(750);
        expect(o.items).toEqual(['mid']);
    });

    it('allows order 0', () => {
        expect(mkOrder(0, ['x']).order).toBe(0);
    });

    it('allows negative order', () => {
        expect(mkOrder(-100, ['x']).order).toBe(-100);
    });

    it('allows order beyond AFTER_ORDER', () => {
        expect(mkOrder(9999, ['x']).order).toBe(9999);
    });
});

// ─── Type Checks ────────────────────────────────────────────────────

describe('isOrdered', () => {
    it('detects order wrappers', () => {
        expect(isOrdered(mkBefore([]))).toBe(true);
        expect(isOrdered(mkAfter([]))).toBe(true);
        expect(isOrdered(mkOrder(50, []))).toBe(true);
    });

    it('rejects non-ordered values', () => {
        expect(isOrdered([])).toBe(false);
        expect(isOrdered(null)).toBe(false);
        expect(isOrdered(undefined)).toBe(false);
        expect(isOrdered({})).toBe(false);
        expect(isOrdered({ __ordered: false })).toBe(false);
        expect(isOrdered(42)).toBe(false);
    });
});

describe('isOrderedList', () => {
    it('detects accumulated segments', () => {
        expect(isOrderedList({ __orderedList: true, segments: [] })).toBe(true);
    });

    it('rejects non-ordered-list values', () => {
        expect(isOrderedList([])).toBe(false);
        expect(isOrderedList(null)).toBe(false);
        expect(isOrderedList(undefined)).toBe(false);
        expect(isOrderedList({})).toBe(false);
        expect(isOrderedList({ __orderedList: false })).toBe(false);
    });
});

describe('isArrayLike', () => {
    it('detects all array-like types', () => {
        expect(isArrayLike([1, 2])).toBe(true);
        expect(isArrayLike(mkOrder(10, []))).toBe(true);
        expect(isArrayLike({ __orderedList: true, segments: [] })).toBe(true);
    });

    it('rejects non-array-like values', () => {
        expect(isArrayLike(42)).toBe(false);
        expect(isArrayLike(null)).toBe(false);
        expect(isArrayLike(undefined)).toBe(false);
        expect(isArrayLike({})).toBe(false);
        expect(isArrayLike('string')).toBe(false);
    });
});
