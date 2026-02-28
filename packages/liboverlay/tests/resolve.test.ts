// tests/resolve.test.ts — Tests for resolveDeferred
import { describe, it, expect } from 'vitest';
import {
    deferred, mkDefault, mkForce, mkOverride, mkOrder,
    resolveDeferred,
} from '../src/index.js';

describe('resolveDeferred', () => {
    // ─── Deferred resolution ─────────────────────────────────────────

    it('resolves deferred values', () => {
        expect(resolveDeferred(deferred(() => 42))).toBe(42);
    });

    it('resolves nested deferred values', () => {
        const obj = { a: deferred(() => 1), b: { c: deferred(() => 2) } };
        expect(resolveDeferred(obj)).toEqual({ a: 1, b: { c: 2 } });
    });

    it('resolves deferred in arrays', () => {
        expect(resolveDeferred([deferred(() => 1), 2])).toEqual([1, 2]);
    });

    it('resolves chained deferred values', () => {
        const result = resolveDeferred(deferred(() => deferred(() => 42)));
        expect(result).toBe(42);
    });

    it('resolves deeply nested deferred', () => {
        const obj = {
            a: { b: { c: deferred(() => ({ d: deferred(() => 'deep') })) } }
        };
        expect(resolveDeferred(obj)).toEqual({ a: { b: { c: { d: 'deep' } } } });
    });

    // ─── Priority unwrapping ─────────────────────────────────────────

    it('unwraps mkDefault', () => {
        expect(resolveDeferred(mkDefault(42))).toBe(42);
    });

    it('unwraps mkForce', () => {
        expect(resolveDeferred(mkForce('x'))).toBe('x');
    });

    it('unwraps mkOverride', () => {
        expect(resolveDeferred(mkOverride(200, [1, 2]))).toEqual([1, 2]);
    });

    it('unwraps nested Override in objects', () => {
        expect(resolveDeferred({ a: mkDefault(1), b: mkForce(2) })).toEqual({ a: 1, b: 2 });
    });

    it('unwraps Override containing deferred', () => {
        expect(resolveDeferred(mkDefault(deferred(() => 99)))).toBe(99);
    });

    // ─── Ordered list flattening ─────────────────────────────────────

    it('flattens ordered lists by sort order', () => {
        const orderedList = {
            __orderedList: true,
            segments: [
                { order: 1500, items: ['c'] },
                { order: 500, items: ['a'] },
                { order: 1000, items: ['b'] },
            ],
        };
        expect(resolveDeferred(orderedList)).toEqual(['a', 'b', 'c']);
    });

    it('stable sort: same order preserves insertion order', () => {
        const orderedList = {
            __orderedList: true,
            segments: [
                { order: 1000, items: ['first'] },
                { order: 1000, items: ['second'] },
                { order: 1000, items: ['third'] },
            ],
        };
        expect(resolveDeferred(orderedList)).toEqual(['first', 'second', 'third']);
    });

    it('resolves deferred within ordered list items', () => {
        const orderedList = {
            __orderedList: true,
            segments: [
                { order: 500, items: [deferred(() => 'resolved')] },
            ],
        };
        expect(resolveDeferred(orderedList)).toEqual(['resolved']);
    });

    it('resolves ordered wrappers to their items', () => {
        expect(resolveDeferred(mkOrder(50, ['x', 'y']))).toEqual(['x', 'y']);
    });

    // ─── Pass-through ────────────────────────────────────────────────

    it('passes through primitives', () => {
        expect(resolveDeferred(null)).toBe(null);
        expect(resolveDeferred(undefined)).toBe(undefined);
        expect(resolveDeferred(42)).toBe(42);
        expect(resolveDeferred('str')).toBe('str');
        expect(resolveDeferred(true)).toBe(true);
    });

    it('passes through RegExp and Date', () => {
        const re = /test/;
        const date = new Date('2025-01-01');
        expect(resolveDeferred(re)).toBe(re);
        expect(resolveDeferred(date)).toBe(date);
    });

    // ─── Circular reference handling ─────────────────────────────────

    it('handles circular references without infinite loop', () => {
        const obj: Record<string, unknown> = { a: 1 };
        obj.self = obj;
        const result = resolveDeferred(obj) as Record<string, unknown>;
        expect(result.a).toBe(1);
        expect(result.self).toBe(obj);
    });

    it('handles multiple references to same object', () => {
        const shared = { x: deferred(() => 42) };
        const obj = { a: shared, b: shared };
        const result = resolveDeferred(obj) as Record<string, unknown>;
        expect((result.a as Record<string, unknown>).x).toBe(42);
        // b gets the original ref (visited) — this is the current behavior
        expect(result.b).toBe(shared);
    });
});
