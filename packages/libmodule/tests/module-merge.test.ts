// tests/module-merge.test.ts — Tests for configurable module merge engine
import { describe, it, expect } from 'vitest';
import {
    deferred, mkDefault, mkForce, mkOverride,
    mkBefore, mkAfter, mkOrder,
    applyOverlays,
    moduleMerge, createModuleMerge, cleanup,
} from '../src/index.js';

// Helper: apply overlays with the default moduleMerge
function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
    return applyOverlays(
        {},
        overlays.map(o => () => o),
        { merge: moduleMerge },
    );
}

// ─── Array merge ────────────────────────────────────────────────────

describe('moduleMerge — array merge', () => {
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

    it('skips metadata keys from ordered list wrapping', () => {
        const result = mergeWith(
            { _internal: ['a'] },
            { _internal: ['b'] },
        );
        expect(result._internal).toEqual(['b']);
    });

    it('handles empty arrays', () => {
        const result = mergeWith({ items: [] }, { items: ['a'] });
        expect(result.items).toEqual(['a']);
    });

    it('handles mkOrder with empty items', () => {
        const result = mergeWith(
            { items: mkOrder(500, []) },
            { items: ['a'] },
        );
        expect(result.items).toEqual(['a']);
    });
});

// ─── Object merge ───────────────────────────────────────────────────

describe('moduleMerge — object merge', () => {
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

    it('by default, objects with same sub-key deep merge (no conflict)', () => {
        const result = mergeWith(
            { providers: { foo: { type: 'http' } } },
            { providers: { foo: { url: 'https://...' } } },
        );
        expect(result.providers).toEqual({
            foo: { type: 'http', url: 'https://...' },
        });
    });

    it('merges non-overlapping object keys', () => {
        const result = mergeWith(
            { providers: { a: { type: 'http' } } },
            { providers: { b: { type: 'file' } } },
        );
        expect(result.providers).toEqual({
            a: { type: 'http' },
            b: { type: 'file' },
        });
    });
});

// ─── Scalar conflict resolution (Nix-compatible priorities) ─────────

describe('moduleMerge — scalar conflicts (Nix priorities)', () => {
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
        const result = mergeWith({ port: 7890 }, { port: mkOverride(100, 7890) });
        expect(result.port).toBe(7890);

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

    it('string scalars with same value are idempotent', () => {
        const result = mergeWith({ mode: 'rule' }, { mode: 'rule' });
        expect(result.mode).toBe('rule');
    });

    it('string scalars with different values → throws', () => {
        expect(() => mergeWith({ mode: 'rule' }, { mode: 'global' }))
            .toThrow(/Scalar conflict.*mode/);
    });

    it('boolean scalars with priority', () => {
        const result = mergeWith({ ipv6: mkDefault(false) }, { ipv6: true });
        expect(result.ipv6).toBe(true);
    });
});

// ─── Deferred values ────────────────────────────────────────────────

describe('moduleMerge — deferred values', () => {
    it('deferred extension replaces current', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ count: 0 }),
                () => ({ count: deferred(() => 42) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.count).toBe(42);
    });

    it('undefined extensions are skipped', () => {
        const result = mergeWith({ a: 1 }, { a: undefined, b: 2 });
        expect(result.a).toBe(1);
        expect(result.b).toBe(2);
    });

    it('deferred references to final are resolved', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ x: 10, y: deferred(() => 0) }),
                (final) => ({ y: deferred(() => (final as Record<string, number>).x * 2) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.y).toBe(20);
    });
});

// ─── Metadata keys ──────────────────────────────────────────────────

describe('moduleMerge — metadata keys (_*)', () => {
    it('later metadata keys win', () => {
        const result = mergeWith({ _meta: 'first' }, { _meta: 'second' });
        expect(result._meta).toBe('second');
    });

    it('metadata arrays are NOT ordered lists', () => {
        const result = mergeWith({ _proxies: ['a'] }, { _proxies: ['b', 'c'] });
        expect(result._proxies).toEqual(['b', 'c']);
    });

    it('metadata objects are replaced, not deep merged', () => {
        const result = mergeWith(
            { _ctx: { a: 1, b: 2 } },
            { _ctx: { b: 3 } },
        );
        expect(result._ctx).toEqual({ b: 3 });
    });
});

// ─── createModuleMerge with uniqueKeyFields ─────────────────────────

describe('createModuleMerge — uniqueKeyFields', () => {
    it('detects duplicate sub-keys in uniqueKeyFields', () => {
        const merge = createModuleMerge({ uniqueKeyFields: ['providers'] });
        expect(() => applyOverlays(
            {},
            [
                () => ({ providers: { foo: { type: 'http' } } }),
                () => ({ providers: { foo: { type: 'file' } } }),
            ],
            { merge },
        )).toThrow(/Unique-key conflict in "providers": sub-key "foo"/);
    });

    it('allows non-overlapping sub-keys in uniqueKeyFields', () => {
        const merge = createModuleMerge({ uniqueKeyFields: ['providers'] });
        const result = applyOverlays(
            {},
            [
                () => ({ providers: { a: { type: 'http' } } }),
                () => ({ providers: { b: { type: 'file' } } }),
            ],
            { merge },
        );
        expect(result.providers).toEqual({
            a: { type: 'http' },
            b: { type: 'file' },
        });
    });

    it('non-listed keys merge normally (no conflict)', () => {
        const merge = createModuleMerge({ uniqueKeyFields: ['providers'] });
        const result = applyOverlays(
            {},
            [
                () => ({ config: { a: 1 } }),
                () => ({ config: { a: 2 } }),
            ],
            { merge },
        );
        expect(result.config).toEqual({ a: 2 });
    });
});

// ─── createModuleMerge with metadataPrefix ──────────────────────────

describe('createModuleMerge — metadataPrefix', () => {
    it('custom prefix changes which keys are metadata', () => {
        const merge = createModuleMerge({ metadataPrefix: '$' });
        const result = applyOverlays(
            {},
            [
                () => ({ $internal: ['a'], _normal: ['x'] }),
                () => ({ $internal: ['b'], _normal: ['y'] }),
            ],
            { merge },
        );
        // $internal is metadata → last wins
        expect(result.$internal).toEqual(['b']);
        // _normal is NOT metadata → ordered list merge
        expect(result._normal).toEqual(['x', 'y']);
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

    it('supports custom prefix', () => {
        expect(cleanup({ a: 1, $meta: 'x', _keep: 2 }, '$')).toEqual({ a: 1, _keep: 2 });
    });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('moduleMerge — edge cases', () => {
    it('empty extension is a no-op', () => {
        const result = mergeWith({ a: 1 }, {});
        expect(result.a).toBe(1);
    });

    it('single overlay just wraps arrays', () => {
        const result = mergeWith({ items: ['a'] });
        expect(result.items).toEqual(['a']);
    });

    it('null values are treated as scalars', () => {
        const result = mergeWith({ a: null }, { a: null });
        expect(result.a).toBeNull();
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
});
