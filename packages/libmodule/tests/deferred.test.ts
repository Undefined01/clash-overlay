// tests/deferred.test.ts — Tests for deferred values
import { describe, it, expect } from 'vitest';
import { deferred, isDeferred } from '../src/index.js';

describe('deferred', () => {
    it('creates a deferred wrapper', () => {
        const d = deferred(() => 42);
        expect(d.__type).toBe('deferred');
        expect(typeof d.fn).toBe('function');
        expect(d.fn()).toBe(42);
    });

    it('wraps any return type', () => {
        expect(deferred(() => 'hello').fn()).toBe('hello');
        expect(deferred(() => [1, 2]).fn()).toEqual([1, 2]);
        expect(deferred(() => null).fn()).toBe(null);
        expect(deferred(() => ({ x: 1 })).fn()).toEqual({ x: 1 });
    });

    it('is lazy — fn is not called at creation', () => {
        let called = false;
        deferred(() => { called = true; return 1; });
        expect(called).toBe(false);
    });
});

describe('isDeferred', () => {
    it('recognizes deferred values', () => {
        expect(isDeferred(deferred(() => 1))).toBe(true);
        expect(isDeferred(deferred(async () => 1))).toBe(true);
    });

    it('returns false for non-deferred values', () => {
        expect(isDeferred(null)).toBe(false);
        expect(isDeferred(undefined)).toBe(false);
        expect(isDeferred(42)).toBe(false);
        expect(isDeferred('str')).toBe(false);
        expect(isDeferred({})).toBe(false);
        expect(isDeferred([])).toBe(false);
        expect(isDeferred({ __type: 'other' })).toBe(false);
        expect(isDeferred({ __type: true })).toBe(false);
        expect(isDeferred({ a: deferred(() => 1 )})).toBe(false);
        expect(isDeferred([ deferred(() => 1) ])).toBe(false);
    });

    it('requires __type === deferred', () => {
        expect(isDeferred({ __type: 1 })).toBe(false);
        expect(isDeferred({ __type: 'deferred', fn: () => 1 })).toBe(true);
    });
});
