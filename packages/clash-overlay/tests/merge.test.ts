// tests/merge.test.ts — Tests for Clash module merge engine
import { describe, it, expect } from 'vitest';
import {
    deferred, mkDefault, mkForce, mkOverride,
    mkBefore, mkAfter, mkOrder,
    applyOverlays,
    DEFAULT_PRIORITY, MKDEFAULT_PRIORITY, MKFORCE_PRIORITY,
} from 'liboverlay';
import { clashModuleMerge, mergeModules, cleanup } from '../src/lib/merge.js';

// Helper: apply overlays with clashModuleMerge
function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
    return applyOverlays(
        {},
        overlays.map(o => () => o),
        { merge: clashModuleMerge },
    );
}

// ─── Array merge ────────────────────────────────────────────────────

describe('clashModuleMerge — array merge', () => {
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

    it('throws on array/non-array type mismatch', () => {
        expect(() => mergeWith(
            { key: [1, 2] },
            { key: 'not-an-array' },
        )).toThrow(/Type mismatch/);
    });

    it('skips _* keys from ordered list wrapping', () => {
        const result = mergeWith(
            { _internal: ['a'] },
            { _internal: ['b'] },
        );
        expect(result._internal).toEqual(['b']);
    });
});

// ─── Object merge ───────────────────────────────────────────────────

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
        expect((result.dns as Record<string, unknown>).servers).toEqual(['a', 'b']);
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

// ─── Scalar conflict resolution (Nix-compatible priorities) ─────────

describe('clashModuleMerge — scalar conflicts (Nix priorities)', () => {
    it('same value at same priority is idempotent', () => {
        const result = mergeWith({ port: 7890 }, { port: 7890 });
        expect(result.port).toBe(7890);
    });

    it('different values at same priority (both bare) → throws', () => {
        expect(() => mergeWith({ port: 7890 }, { port: 1080 })).toThrow(/Scalar conflict.*port/);
    });

    it('mkDefault (1000) vs bare (100): bare wins (lower priority number)', () => {
        const result = mergeWith({ port: mkDefault(7890) }, { port: 1080 });
        expect(result.port).toBe(1080);
    });

    it('bare (100) vs mkDefault (1000): bare wins regardless of order', () => {
        const result = mergeWith({ port: 1080 }, { port: mkDefault(7890) });
        expect(result.port).toBe(1080);
    });

    it('mkForce (50) vs bare (100): mkForce wins', () => {
        const result = mergeWith({ port: 7890 }, { port: mkForce(1080) });
        expect(result.port).toBe(1080);
    });

    it('bare (100) vs mkForce (50): mkForce wins regardless of order', () => {
        const result = mergeWith({ port: mkForce(1080) }, { port: 7890 });
        expect(result.port).toBe(1080);
    });

    it('mkForce (50) vs mkDefault (1000): mkForce wins', () => {
        const result = mergeWith({ port: mkDefault(7890) }, { port: mkForce(1080) });
        expect(result.port).toBe(1080);
    });

    it('two mkForce with same value is ok', () => {
        const result = mergeWith({ port: mkForce(7890) }, { port: mkForce(7890) });
        expect(result.port).toBe(7890);
    });

    it('two mkForce with different values → throws', () => {
        expect(() => mergeWith(
            { port: mkForce(7890) },
            { port: mkForce(1080) },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('two mkDefault with different values → throws (same priority 1000)', () => {
        expect(() => mergeWith(
            { port: mkDefault(7890) },
            { port: mkDefault(1080) },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('mkOverride(200) vs bare(100): bare wins (100 < 200)', () => {
        const result = mergeWith({ port: mkOverride(200, 7890) }, { port: 1080 });
        expect(result.port).toBe(1080);
    });

    it('mkOverride(50) vs bare(100): mkOverride wins (50 < 100)', () => {
        const result = mergeWith({ port: 7890 }, { port: mkOverride(50, 1080) });
        expect(result.port).toBe(1080);
    });

    it('mkOverride(100) vs bare(100): same priority, same rules apply', () => {
        // Same value → ok
        const result = mergeWith({ port: 7890 }, { port: mkOverride(100, 7890) });
        expect(result.port).toBe(7890);

        // Different value → throws
        expect(() => mergeWith(
            { port: 7890 },
            { port: mkOverride(100, 1080) },
        )).toThrow(/Scalar conflict.*port/);
    });

    it('mkOverride(1) beats everything', () => {
        const result = mergeWith(
            { port: mkForce(7890) },
            { port: mkOverride(1, 1080) },
        );
        expect(result.port).toBe(1080);
    });
});

// ─── Deferred values ────────────────────────────────────────────────

describe('clashModuleMerge — deferred values', () => {
    it('deferred extension replaces current', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ count: 0 }),
                () => ({ count: deferred(() => 42) }),
            ],
            { merge: clashModuleMerge },
        );
        expect(result.count).toBe(42);
    });

    it('undefined extensions are skipped', () => {
        const result = mergeWith({ a: 1 }, { a: undefined, b: 2 });
        expect(result.a).toBe(1);
        expect(result.b).toBe(2);
    });
});

// ─── Metadata keys ──────────────────────────────────────────────────

describe('clashModuleMerge — metadata keys (_*)', () => {
    it('later _* keys win', () => {
        const result = mergeWith({ _meta: 'first' }, { _meta: 'second' });
        expect(result._meta).toBe('second');
    });

    it('_* arrays are NOT ordered lists', () => {
        const result = mergeWith({ _proxies: ['a'] }, { _proxies: ['b', 'c'] });
        expect(result._proxies).toEqual(['b', 'c']);
    });
});

// ─── mergeModules ───────────────────────────────────────────────────

describe('mergeModules', () => {
    it('merges modules with ctx injection', () => {
        const mod1 = (
            _final: Record<string, unknown>,
            _prev: Record<string, unknown>,
            ctx: { config: { proxies: Array<{ name: string }> } },
        ) => ({
            mode: 'rule',
            'proxy-groups': mkBefore([{ name: 'select', proxies: ctx.config.proxies.map(p => p.name) }]),
        });
        const mod2 = () => ({
            rules: mkOrder(800, ['MATCH,DIRECT']),
        });

        const result = mergeModules([mod1, mod2], {
            args: {},
            config: { proxies: [{ name: 'HK' }, { name: 'US' }] },
        });

        expect(result.mode).toBe('rule');
        expect((result['proxy-groups'] as Array<{ proxies: string[] }>)[0].proxies).toEqual(['HK', 'US']);
        expect(result.rules).toEqual(['MATCH,DIRECT']);
    });

    it('handles empty modules list', () => {
        const result = mergeModules([], { args: {}, config: { proxies: [] } });
        expect(result.proxies).toEqual([]);
        expect(result.rules).toEqual([]);
    });
});

// ─── cleanup ────────────────────────────────────────────────────────

describe('cleanup', () => {
    it('removes _* metadata keys', () => {
        expect(cleanup({ a: 1, _meta: 'x' })).toEqual({ a: 1 });
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
