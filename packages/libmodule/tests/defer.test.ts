import { describe, it, expect, vi } from 'vitest';
import { defer, isDefer, forceDefer, DEFER_SYMBOL, MARKER } from '../src/index.js';

describe('defer()', () => {
    it('creates a proxy that is detected by isDefer', () => {
        const d = defer(() => ({ a: 1 }));
        expect(isDefer(d)).toBe(true);
    });

    it('carries MARKER="defer"', () => {
        const d = defer(() => ({ a: 1 }));
        expect((d as Record<symbol, unknown>)[MARKER]).toBe('defer');
    });

    it('forces lambda on property access and returns the value', () => {
        const d = defer(() => ({ a: 1, b: 'hello' }));
        expect(d.a).toBe(1);
        expect(d.b).toBe('hello');
    });

    it('caches result — fn called only once', () => {
        const fn = vi.fn(() => ({ x: 42 }));
        const d = defer(fn);

        expect(d.x).toBe(42);
        expect(d.x).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('supports Symbol detection via DEFER_SYMBOL', () => {
        const fn = () => ({ a: 1 });
        const d = defer(fn);
        expect(DEFER_SYMBOL in d).toBe(true);
        expect((d as Record<symbol, unknown>)[DEFER_SYMBOL]).toBe(fn);
    });

    it('is not confused with plain objects', () => {
        expect(isDefer({ a: 1 })).toBe(false);
        expect(isDefer(null)).toBe(false);
        expect(isDefer(undefined)).toBe(false);
        expect(isDefer(42)).toBe(false);
        expect(isDefer('string')).toBe(false);
        expect(isDefer([1, 2])).toBe(false);
    });

    it('supports has trap', () => {
        const d = defer(() => ({ a: 1, b: 2 }));
        expect('a' in d).toBe(true);
        expect('c' in d).toBe(false);
    });

    it('supports ownKeys trap', () => {
        const d = defer(() => ({ a: 1, b: 2 }));
        expect(Object.keys(d)).toEqual(['a', 'b']);
    });

    it('supports getOwnPropertyDescriptor trap', () => {
        const d = defer(() => ({ a: 1 }));
        const desc = Object.getOwnPropertyDescriptor(d, 'a');
        expect(desc?.value).toBe(1);
    });

    it('handles primitive return types (property access returns undefined)', () => {
        const d = defer(() => 42);
        expect((d as any).anything).toBeUndefined();
        expect(isDefer(d)).toBe(true);
    });

    it('handles null return type', () => {
        const d = defer(() => null);
        expect((d as any).anything).toBeUndefined();
        expect(isDefer(d)).toBe(true);
    });
});

describe('forceDefer()', () => {
    it('forces a defer proxy and returns the value', () => {
        const d = defer(() => ({ x: 10 }));
        const result = forceDefer(d);
        expect(result).toEqual({ x: 10 });
    });

    it('forces primitive defer and returns the value', () => {
        const d = defer(() => 42);
        expect(forceDefer(d)).toBe(42);
    });

    it('uses caching — fn called only once even with forceDefer + property access', () => {
        const fn = vi.fn(() => ({ x: 42 }));
        const d = defer(fn);

        const forced = forceDefer(d);
        expect(forced).toEqual({ x: 42 });
        expect(d.x).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns non-defer values as-is', () => {
        expect(forceDefer(42 as unknown as object)).toBe(42);
        expect(forceDefer({ a: 1 })).toEqual({ a: 1 });
        expect(forceDefer(null as unknown as object)).toBe(null);
    });
});
