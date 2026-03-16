// tests/core-merge.test.ts — Tests for coreMerge, coreDeepMerge, deepMerge
import { describe, it, expect } from 'vitest';
import {
    defer,
    mkBefore, mkAfter, mkOrder,
    applyOverlays,
    deepMerge, coreMerge, coreDeepMerge,
    scalarEqual, scalarLastWins,
    isPlainObject,
    MARKER,
} from '../src/index.js';

// ─── isPlainObject ──────────────────────────────────────────────────

describe('isPlainObject', () => {
    it('returns true for plain objects', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
    });

    it('returns false for arrays', () => {
        expect(isPlainObject([])).toBe(false);
    });

    it('returns false for null/undefined/primitives', () => {
        expect(isPlainObject(null)).toBe(false);
        expect(isPlainObject(undefined)).toBe(false);
        expect(isPlainObject(42)).toBe(false);
        expect(isPlainObject('str')).toBe(false);
    });

    it('returns false for MARKER-carrying objects', () => {
        const markerObj = { [MARKER]: 'override', priority: 100, value: 42 };
        expect(isPlainObject(markerObj)).toBe(false);
    });

    it('returns false for RegExp and Date', () => {
        expect(isPlainObject(new RegExp('foo'))).toBe(false);
        expect(isPlainObject(new Date())).toBe(false);
    });
});

// ─── coreMerge ──────────────────────────────────────────────────────

describe('coreMerge', () => {
    it('undefined passthrough: ext undefined returns cur', () => {
        expect(coreMerge('k', 42, undefined)).toBe(42);
    });

    it('undefined passthrough: cur undefined returns ext', () => {
        expect(coreMerge('k', undefined, 'hello')).toBe('hello');
    });

    it('arrays concat as ordered segments', () => {
        // Use deepMerge + applyOverlays to resolve the OrderedList
        const result = applyOverlays(
            {},
            [
                () => ({ items: ['a', 'b'] }),
                () => ({ items: ['c'] }),
            ],
            { merge: deepMerge },
        );
        expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('objects deep merge', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ dns: { enable: true, ipv6: false } }),
                () => ({ dns: { ipv6: true, mode: 'fake-ip' } }),
            ],
            { merge: deepMerge },
        );
        expect(result.dns).toEqual({ enable: true, ipv6: true, mode: 'fake-ip' });
    });

    it('scalar equal-or-error (default): same value ok', () => {
        expect(coreMerge('k', 42, 42)).toBe(42);
    });

    it('scalar equal-or-error (default): different values throw', () => {
        expect(() => coreMerge('k', 42, 99)).toThrow(/Scalar conflict/);
    });

    it('deferred wrapping: deferred values are merged after resolve', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ items: defer(() => ['a']) }),
                () => ({ items: defer(() => ['b']) }),
            ],
            { merge: deepMerge },
        );
        expect(result.items).toEqual(['a', 'b']);
    });

    it('throws on array/non-array type mismatch', () => {
        expect(() => coreMerge('k', [1, 2], 'not-an-array')).toThrow(/Type mismatch/);
    });
});

// ─── coreDeepMerge ──────────────────────────────────────────────────

describe('coreDeepMerge', () => {
    it('recursively merges nested objects', () => {
        const result = coreDeepMerge(
            'root',
            { a: { x: 1 } },
            { a: { y: 2 }, b: 3 },
            scalarLastWins,
        );
        expect(result).toEqual({ a: { x: 1, y: 2 }, b: 3 });
    });

    it('uses scalarEqual by default', () => {
        expect(() => coreDeepMerge(
            'root',
            { a: 1 },
            { a: 2 },
        )).toThrow(/Scalar conflict/);
    });

    it('uses provided scalar handler', () => {
        const result = coreDeepMerge(
            'root',
            { a: 1 },
            { a: 2 },
            scalarLastWins,
        );
        expect(result).toEqual({ a: 2 });
    });
});

// ─── scalarEqual / scalarLastWins ───────────────────────────────────

describe('scalarEqual', () => {
    it('returns value when equal', () => {
        expect(scalarEqual('k', 'foo', 'foo')).toBe('foo');
    });

    it('throws on mismatch', () => {
        expect(() => scalarEqual('k', 'foo', 'bar')).toThrow(/Scalar conflict/);
    });
});

describe('scalarLastWins', () => {
    it('always returns ext', () => {
        expect(scalarLastWins('k', 'foo', 'bar')).toBe('bar');
        expect(scalarLastWins('k', 1, 2)).toBe(2);
    });
});

// ─── deepMerge (MergeFn) ────────────────────────────────────────────

describe('deepMerge', () => {
    // Helper: apply overlays with deepMerge
    function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
        return applyOverlays(
            {},
            overlays.map(o => () => o),
            { merge: deepMerge },
        );
    }

    it('merges plain arrays as ordered segments', () => {
        const result = mergeWith({ rules: ['a', 'b'] }, { rules: ['c'] });
        expect(result.rules).toEqual(['a', 'b', 'c']);
    });

    it('orders arrays by mkOrder', () => {
        const result = mergeWith(
            { rules: mkOrder(1200, ['c']) },
            { rules: mkOrder(800, ['a']) },
            { rules: mkOrder(1000, ['b']) },
        );
        expect(result.rules).toEqual(['a', 'b', 'c']);
    });

    it('mkBefore goes first, mkAfter goes last', () => {
        const result = mergeWith(
            { items: mkAfter(['last']) },
            { items: ['middle'] },
            { items: mkBefore(['first']) },
        );
        expect(result.items).toEqual(['first', 'middle', 'last']);
    });

    it('stable sort: same order preserves registration order', () => {
        const result = mergeWith(
            { rules: mkOrder(1000, ['a']) },
            { rules: mkOrder(1000, ['b']) },
            { rules: mkOrder(1000, ['c']) },
        );
        expect(result.rules).toEqual(['a', 'b', 'c']);
    });

    it('deep merges plain objects', () => {
        const result = mergeWith(
            { dns: { enable: true, ipv6: false } },
            { dns: { ipv6: true, mode: 'fake-ip' } },
        );
        expect(result.dns).toEqual({ enable: true, ipv6: true, mode: 'fake-ip' });
    });

    it('deep merges nested objects', () => {
        const result = mergeWith(
            { config: { a: { x: 1 } } },
            { config: { a: { y: 2 }, b: 3 } },
        );
        expect(result.config).toEqual({ a: { x: 1, y: 2 }, b: 3 });
    });

    it('concatenates arrays inside deep merge', () => {
        const result = mergeWith(
            { dns: { servers: ['a'] } },
            { dns: { servers: ['b'] } },
        );
        expect((result.dns as Record<string, unknown>).servers).toEqual(['a', 'b']);
    });

    it('last-writer-wins for scalars', () => {
        const result = mergeWith({ port: 7890 }, { port: 1080 });
        expect(result.port).toBe(1080);
    });

    it('last-writer-wins for scalars in deep objects', () => {
        const result = mergeWith(
            { config: { a: 1 } },
            { config: { a: 2 } },
        );
        expect(result.config).toEqual({ a: 2 });
    });

    it('empty extension is a no-op', () => {
        const result = mergeWith({ a: 1 }, {});
        expect(result.a).toBe(1);
    });

    it('throws on array/non-array type mismatch', () => {
        expect(() => mergeWith(
            { key: [1, 2] },
            { key: 'not-an-array' },
        )).toThrow(/Type mismatch/);
    });

    it('deferred current with concrete ext', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ items: defer(() => ['a']) }),
                () => ({ items: ['b'] }),
            ],
            { merge: deepMerge },
        );
        expect(result.items).toEqual(['a', 'b']);
    });

    it('deferred ext with existing array', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ packages: ['vim'] }),
                () => ({ packages: defer(() => ['firefox']) }),
            ],
            { merge: deepMerge },
        );
        expect(result.packages).toEqual(['vim', 'firefox']);
    });

    it('both sides deferred: merges after resolve', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ items: defer(() => ['a']) }),
                () => ({ items: defer(() => ['b']) }),
            ],
            { merge: deepMerge },
        );
        expect(result.items).toEqual(['a', 'b']);
    });

    it('mixed ordered and plain arrays', () => {
        const result = mergeWith(
            { rules: mkBefore(['first']) },
            { rules: ['middle-a', 'middle-b'] },
            { rules: mkAfter(['last']) },
            { rules: mkOrder(600, ['early']) },
        );
        expect(result.rules).toEqual(['first', 'early', 'middle-a', 'middle-b', 'last']);
    });

    it('many overlays with complex interleaving', () => {
        const result = mergeWith(
            { items: mkOrder(1000, ['d']) },
            { items: mkOrder(500, ['b']) },
            { items: mkOrder(1500, ['f']) },
            { items: mkOrder(750, ['c']) },
            { items: mkOrder(250, ['a']) },
            { items: mkOrder(1250, ['e']) },
        );
        expect(result.items).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    });

    it('null values are treated as scalars', () => {
        const result = mergeWith({ a: null }, { a: null });
        expect(result.a).toBeNull();
    });

    it('handles empty arrays', () => {
        const result = mergeWith({ items: [] }, { items: ['a'] });
        expect(result.items).toEqual(['a']);
    });

    it('underscored keys use the same merge rules', () => {
        const result = mergeWith(
            { _internal: ['a'] },
            { _internal: ['b'] },
        );
        expect(result._internal).toEqual(['a', 'b']);
    });
});
