// tests/merge.test.js — Comprehensive tests for src/lib/merge.js
import { describe, it, expect } from 'vitest';
import {
    deferred, mkDefault, mkForce, mkOverride,
    mkBefore, mkAfter, mkOrder,
    applyOverlays,
} from '../src/lib/lazy.js';
import { clashModuleMerge, mergeModules, cleanup } from '../src/lib/merge.js';

// Helper: apply overlays with clashModuleMerge
function mergeWith(...overlays) {
    return applyOverlays({}, overlays.map(o => () => o), { merge: clashModuleMerge });
}

// ─── clashModuleMerge: Array merge ──────────────────────────────────

describe('clashModuleMerge — array merge', () => {
    it('merges plain arrays as ordered segments', () => {
        const result = mergeWith(
            { rules: ['a', 'b'] },
            { rules: ['c'] },
        );
        expect(result.rules).toEqual(['a', 'b', 'c']);
    });

    it('orders arrays by mkOrder', () => {
        const result = mergeWith(
            { rules: mkOrder(30, ['c']) },
            { rules: mkOrder(10, ['a']) },
            { rules: mkOrder(20, ['b']) },
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

    it('handles mixed ordered and plain in same array', () => {
        const result = mergeWith(
            { rules: [mkOrder(10, ['first']), 'default', mkAfter(['last'])] },
        );
        expect(result.rules).toEqual(['first', 'default', 'last']);
    });

    it('stable sort: same order preserves registration order', () => {
        const result = mergeWith(
            { rules: mkOrder(50, ['a']) },
            { rules: mkOrder(50, ['b']) },
            { rules: mkOrder(50, ['c']) },
        );
        expect(result.rules).toEqual(['a', 'b', 'c']);
    });

    it('throws on array/non-array type mismatch', () => {
        expect(() => mergeWith(
            { key: [1, 2] },
            { key: 'not-an-array' },
        )).toThrow(/Type mismatch/);
    });

    it('skips _* prefixed keys from ordered list wrapping', () => {
        const result = mergeWith(
            { _internal: ['a'] },
            { _internal: ['b'] },     // later wins for _* keys
        );
        expect(result._internal).toEqual(['b']);
    });
});

// ─── clashModuleMerge: Object merge ─────────────────────────────────

describe('clashModuleMerge — object merge', () => {
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
        expect(result.dns.servers).toEqual(['a', 'b']);
    });

    it('detects key conflicts in rule-providers', () => {
        expect(() => mergeWith(
            { 'rule-providers': { foo: { type: 'http' } } },
            { 'rule-providers': { foo: { type: 'file' } } },
        )).toThrow(/Rule provider key conflict: "foo"/);
    });

    it('merges non-conflicting rule-providers', () => {
        const result = mergeWith(
            { 'rule-providers': { a: { type: 'http' } } },
            { 'rule-providers': { b: { type: 'file' } } },
        );
        expect(result['rule-providers']).toEqual({
            a: { type: 'http' },
            b: { type: 'file' },
        });
    });
});

// ─── clashModuleMerge: Scalar conflict resolution ───────────────────

describe('clashModuleMerge — scalar conflicts', () => {
    it('same value is idempotent (no error)', () => {
        const result = mergeWith(
            { port: 7890 },
            { port: 7890 },
        );
        expect(result.port).toBe(7890);
    });

    it('different regular values throw', () => {
        expect(() => mergeWith(
            { port: 7890 },
            { port: 1080 },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('mkDefault + mkOverride: override wins', () => {
        const result = mergeWith(
            { port: mkDefault(7890) },
            { port: mkOverride(1080) },
        );
        expect(result.port).toBe(1080);
    });

    it('mkOverride + mkDefault: override kept (reverse order)', () => {
        const result = mergeWith(
            { port: mkOverride(1080) },
            { port: mkDefault(7890) },
        );
        expect(result.port).toBe(1080);
    });

    it('mkDefault + regular with different value throws', () => {
        expect(() => mergeWith(
            { port: mkDefault(7890) },
            { port: 1080 },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('mkForce + different value throws', () => {
        expect(() => mergeWith(
            { port: mkForce(7890) },
            { port: 1080 },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('mkForce + same value is ok', () => {
        const result = mergeWith(
            { port: mkForce(7890) },
            { port: 7890 },
        );
        expect(result.port).toBe(7890);
    });

    it('two mkForce with different values throw', () => {
        expect(() => mergeWith(
            { port: mkForce(7890) },
            { port: mkForce(1080) },
        )).toThrow(/Scalar conflict.*port/);
    });
});

// ─── clashModuleMerge: Deferred values ──────────────────────────────

describe('clashModuleMerge — deferred values', () => {
    it('deferred extension replaces current value', () => {
        const result = applyOverlays(
            {},
            [
                (final, prev) => ({ count: 0 }),
                (final, prev) => ({ count: deferred(() => 42) }),
            ],
            { merge: clashModuleMerge }
        );
        expect(result.count).toBe(42);
    });

    it('extension replaces deferred current', () => {
        const result = applyOverlays(
            {},
            [
                (final, prev) => ({ val: deferred(() => 'old') }),
                (final, prev) => ({ val: 'new' }),
            ],
            { merge: clashModuleMerge }
        );
        expect(result.val).toBe('new');
    });

    it('undefined extensions are skipped', () => {
        const result = mergeWith(
            { a: 1 },
            { a: undefined, b: 2 },
        );
        expect(result.a).toBe(1);
        expect(result.b).toBe(2);
    });
});

// ─── clashModuleMerge: Metadata keys ────────────────────────────────

describe('clashModuleMerge — metadata keys (_*)', () => {
    it('later _* keys win (last-writer-wins)', () => {
        const result = mergeWith(
            { _meta: 'first' },
            { _meta: 'second' },
        );
        expect(result._meta).toBe('second');
    });

    it('_* arrays are NOT treated as ordered lists', () => {
        const result = mergeWith(
            { _proxies: ['a'] },
            { _proxies: ['b', 'c'] },
        );
        expect(result._proxies).toEqual(['b', 'c']); // replaced, not merged
    });
});

// ─── mergeModules ───────────────────────────────────────────────────

describe('mergeModules', () => {
    it('merges modules with ctx injection', () => {
        const mod1 = (final, prev, ctx) => ({
            mode: 'rule',
            'proxy-groups': mkBefore([{ name: 'select', proxies: ctx.config.proxies.map(p => p.name) }]),
        });
        const mod2 = (final, prev, ctx) => ({
            rules: mkOrder(10, ['MATCH,DIRECT']),
        });

        const result = mergeModules([mod1, mod2], {
            args: {},
            config: { proxies: [{ name: 'HK' }, { name: 'US' }] },
        });

        expect(result.mode).toBe('rule');
        expect(result['proxy-groups']).toHaveLength(1);
        expect(result['proxy-groups'][0].proxies).toEqual(['HK', 'US']);
        expect(result.rules).toEqual(['MATCH,DIRECT']);
    });

    it('initializes with proxies from config', () => {
        const mod = (final, prev, ctx) => ({});
        const result = mergeModules([mod], {
            args: {},
            config: { proxies: [{ name: 'p1' }] },
        });
        expect(result.proxies).toEqual([{ name: 'p1' }]);
    });

    it('handles empty modules list', () => {
        const result = mergeModules([], {
            args: {},
            config: { proxies: [] },
        });
        expect(result.proxies).toEqual([]);
        expect(result.rules).toEqual([]);
        expect(result['proxy-groups']).toEqual([]);
        expect(result['rule-providers']).toEqual({});
    });
});

// ─── cleanup ────────────────────────────────────────────────────────

describe('cleanup', () => {
    it('removes _* metadata keys', () => {
        expect(cleanup({ a: 1, _meta: 'x', _internal: [] })).toEqual({ a: 1 });
    });

    it('removes undefined values', () => {
        expect(cleanup({ a: 1, b: undefined })).toEqual({ a: 1 });
    });

    it('removes empty plain objects', () => {
        expect(cleanup({ a: 1, empty: {} })).toEqual({ a: 1 });
    });

    it('keeps non-empty objects', () => {
        expect(cleanup({ dns: { enable: true } })).toEqual({ dns: { enable: true } });
    });

    it('keeps arrays (even empty)', () => {
        expect(cleanup({ rules: [] })).toEqual({ rules: [] });
    });

    it('keeps falsy non-undefined values', () => {
        expect(cleanup({ a: 0, b: '', c: false, d: null })).toEqual({
            a: 0, b: '', c: false, d: null,
        });
    });
});
