import { describe, it, expect } from 'vitest';
import { types, isOptionType, makeType } from '../src/option-types.js';
import { mkBefore, mkAfter, mkOrder } from '../src/order.js';
import { MARKER } from '../src/symbols.js';

describe('isOptionType', () => {
    it('detects OptionType instances', () => {
        expect(isOptionType(types.bool)).toBe(true);
        expect(isOptionType(types.str)).toBe(true);
        expect(isOptionType(types.anything)).toBe(true);
    });

    it('rejects non-OptionType values', () => {
        expect(isOptionType(null)).toBe(false);
        expect(isOptionType(42)).toBe(false);
        expect(isOptionType({ name: 'fake' })).toBe(false);
    });
});

describe('types.bool', () => {
    it('check passes for booleans', () => {
        expect(types.bool.check(true)).toBe(true);
        expect(types.bool.check(false)).toBe(true);
    });

    it('check fails for non-booleans', () => {
        expect(types.bool.check(1)).toBe(false);
        expect(types.bool.check('true')).toBe(false);
    });

    it('merges single def', () => {
        expect(types.bool.merge('k', [true])).toBe(true);
    });

    it('merges equal defs', () => {
        expect(types.bool.merge('k', [true, true])).toBe(true);
    });

    it('errors on conflicting defs', () => {
        expect(() => types.bool.merge('k', [true, false])).toThrow('Conflicting');
    });
});

describe('types.int', () => {
    it('check passes for integers', () => {
        expect(types.int.check(42)).toBe(true);
        expect(types.int.check(0)).toBe(true);
        expect(types.int.check(-1)).toBe(true);
    });

    it('check fails for non-integers', () => {
        expect(types.int.check(3.14)).toBe(false);
        expect(types.int.check('42')).toBe(false);
    });

    it('merges equal defs', () => {
        expect(types.int.merge('k', [42, 42])).toBe(42);
    });

    it('errors on conflicting defs', () => {
        expect(() => types.int.merge('k', [1, 2])).toThrow('Conflicting');
    });
});

describe('types.str', () => {
    it('check passes for strings', () => {
        expect(types.str.check('hello')).toBe(true);
        expect(types.str.check('')).toBe(true);
    });

    it('check fails for non-strings', () => {
        expect(types.str.check(42)).toBe(false);
    });

    it('merges equal defs', () => {
        expect(types.str.merge('k', ['x', 'x'])).toBe('x');
    });

    it('errors on conflicting defs', () => {
        expect(() => types.str.merge('k', ['a', 'b'])).toThrow('Conflicting');
    });

    it('has emptyValue', () => {
        expect(types.str.emptyValue!()).toBe('');
    });
});

describe('types.enum', () => {
    const mode = types.enum(['tcp', 'udp'] as const);

    it('check passes for valid values', () => {
        expect(mode.check('tcp')).toBe(true);
        expect(mode.check('udp')).toBe(true);
    });

    it('check fails for invalid values', () => {
        expect(mode.check('http')).toBe(false);
    });

    it('merges equal defs', () => {
        expect(mode.merge('k', ['tcp', 'tcp'])).toBe('tcp');
    });

    it('errors on conflicting defs', () => {
        expect(() => mode.merge('k', ['tcp', 'udp'])).toThrow('Conflicting');
    });
});

describe('types.listOf', () => {
    const list = types.listOf(types.str);

    it('check passes for valid arrays', () => {
        expect(list.check(['a', 'b'])).toBe(true);
        expect(list.check([])).toBe(true);
    });

    it('check fails for invalid arrays', () => {
        expect(list.check([1, 2])).toBe(false);
        expect(list.check('not array')).toBe(false);
    });

    it('merges by concatenation', () => {
        expect(list.merge('k', [['a'], ['b']])).toEqual(['a', 'b']);
    });

    it('respects mkOrder', () => {
        const result = list.merge('k', [
            ['middle'] as unknown as string[],
            mkBefore(['first']) as unknown as string[],
            mkAfter(['last']) as unknown as string[],
        ]);
        expect(result).toEqual(['first', 'middle', 'last']);
    });

    it('has emptyValue', () => {
        expect(list.emptyValue!()).toEqual([]);
    });
});

describe('types.attrsOf', () => {
    const attrs = types.attrsOf(types.str);

    it('check passes for valid objects', () => {
        expect(attrs.check({ a: 'x' })).toBe(true);
        expect(attrs.check({})).toBe(true);
    });

    it('check fails for invalid values', () => {
        expect(attrs.check({ a: 1 })).toBe(false);
        expect(attrs.check(null)).toBe(false);
        expect(attrs.check([1])).toBe(false);
    });

    it('merges by deep merge per sub-key', () => {
        expect(attrs.merge('k', [{ a: 'x' }, { b: 'y' }])).toEqual({ a: 'x', b: 'y' });
    });

    it('delegates sub-key merge to elem type', () => {
        expect(attrs.merge('k', [{ a: 'x' }, { a: 'x' }])).toEqual({ a: 'x' });
    });

    it('errors on conflicting sub-key values', () => {
        expect(() => attrs.merge('k', [{ a: 'x' }, { a: 'y' }])).toThrow('Conflicting');
    });

    it('has emptyValue', () => {
        expect(attrs.emptyValue!()).toEqual({});
    });
});

describe('types.nullOr', () => {
    const opt = types.nullOr(types.str);

    it('check passes for null and inner type', () => {
        expect(opt.check(null)).toBe(true);
        expect(opt.check('hello')).toBe(true);
    });

    it('check fails for wrong type', () => {
        expect(opt.check(42)).toBe(false);
    });

    it('filters nulls and delegates to inner', () => {
        expect(opt.merge('k', [null, 'hello', null])).toBe('hello');
    });

    it('returns null if all defs are null', () => {
        expect(opt.merge('k', [null, null])).toBe(null);
    });

    it('has emptyValue', () => {
        expect(opt.emptyValue!()).toBe(null);
    });
});

describe('types.either', () => {
    const strOrInt = types.either(types.str, types.int);

    it('check passes for either type', () => {
        expect(strOrInt.check('hello')).toBe(true);
        expect(strOrInt.check(42)).toBe(true);
    });

    it('check fails for neither type', () => {
        expect(strOrInt.check(true)).toBe(false);
    });

    it('merges when all match t1', () => {
        expect(strOrInt.merge('k', ['a', 'a'])).toBe('a');
    });

    it('merges when all match t2', () => {
        expect(strOrInt.merge('k', [42, 42])).toBe(42);
    });

    it('errors on mixed types', () => {
        expect(() => strOrInt.merge('k', ['a', 42])).toThrow('Mixed types');
    });
});

describe('types.unique', () => {
    it('check always passes', () => {
        expect(types.unique.check(42)).toBe(true);
        expect(types.unique.check('x')).toBe(true);
    });

    it('merges single def', () => {
        expect(types.unique.merge('k', [42])).toBe(42);
    });

    it('errors on multiple defs', () => {
        expect(() => types.unique.merge('k', [1, 2])).toThrow('unique');
    });
});

describe('types.raw', () => {
    it('check always passes', () => {
        expect(types.raw.check(42)).toBe(true);
    });

    it('last definition wins', () => {
        expect(types.raw.merge('k', [1, 2, 3])).toBe(3);
    });
});

describe('types.anything', () => {
    it('check always passes', () => {
        expect(types.anything.check(42)).toBe(true);
        expect(types.anything.check([1])).toBe(true);
        expect(types.anything.check({ a: 1 })).toBe(true);
    });

    it('merges arrays by concat', () => {
        const result = types.anything.merge('k', [['a'], ['b']]);
        // Returns an OrderedList with MARKER
        expect((result as Record<symbol, unknown>)[MARKER]).toBe('order-list');
    });

    it('merges objects by deep merge', () => {
        expect(types.anything.merge('k', [{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
    });

    it('merges equal scalars', () => {
        expect(types.anything.merge('k', [42, 42])).toBe(42);
    });

    it('errors on conflicting scalars', () => {
        expect(() => types.anything.merge('k', [1, 2])).toThrow('Scalar conflict');
    });

    it('returns single def as-is', () => {
        expect(types.anything.merge('k', [42])).toBe(42);
    });
});

describe('types.lines', () => {
    it('check passes for strings and string arrays', () => {
        expect(types.lines.check('hello')).toBe(true);
        expect(types.lines.check(['a', 'b'])).toBe(true);
    });

    it('check fails for non-strings', () => {
        expect(types.lines.check(42)).toBe(false);
    });

    it('has apply that joins with newline', () => {
        expect(types.lines.apply(['a', 'b', 'c'])).toBe('a\nb\nc');
    });

    it('has emptyValue', () => {
        expect(types.lines.emptyValue!()).toBe('');
    });
});

describe('types.coercedTo', () => {
    const coerced = types.coercedTo(types.str, (v: number) => String(v), types.str);

    it('merges with coercion', () => {
        expect(coerced.merge('k', [42 as unknown as string, 42 as unknown as string])).toBe('42');
    });
});

// ─── types.submodule ────────────────────────────────────────────────

describe('types.submodule', () => {
    const sub = types.submodule({
        name: { type: types.str },
        port: { type: types.int, default: 80 },
        tags: { type: types.listOf(types.str), default: [] },
    });

    it('check passes for plain objects', () => {
        expect(sub.check({ name: 'test' })).toBe(true);
        expect(sub.check({})).toBe(true);
    });

    it('check fails for non-objects', () => {
        expect(sub.check(42)).toBe(false);
        expect(sub.check(null)).toBe(false);
        expect(sub.check([1])).toBe(false);
    });

    it('single def passthrough', () => {
        expect(sub.merge('k', [{ name: 'x', port: 443 }])).toEqual({
            name: 'x', port: 443, tags: [],
        });
    });

    it('multiple defs merge sub-keys', () => {
        const result = sub.merge('k', [
            { name: 'x', tags: ['a'] },
            { tags: ['b'] },
        ]);
        expect(result.name).toBe('x');
        expect(result.tags).toEqual(['a', 'b']);
        expect(result.port).toBe(80);
    });

    it('undeclared sub-key uses types.anything', () => {
        const result = sub.merge('k', [
            { name: 'x', extra: 'ok' },
        ]);
        expect(result.extra).toBe('ok');
        expect(result.port).toBe(80);
    });

    it('injects defaults for missing sub-keys', () => {
        const result = sub.merge('k', [{ name: 'test' }]);
        expect(result.port).toBe(80);
        expect(result.tags).toEqual([]);
    });

    it('emptyValue returns defaults', () => {
        expect(sub.emptyValue!()).toEqual({ name: '', port: 80, tags: [] });
    });

    it('nested submodule', () => {
        const inner = types.submodule({ x: { type: types.int, default: 0 } });
        const outer = types.submodule({ nested: { type: inner } });
        const result = outer.merge('k', [
            { nested: { x: 1 } },
            { nested: { x: 1 } },
        ]);
        expect(result.nested).toEqual({ x: 1 });
    });
});

// ─── types.keyedListOf ──────────────────────────────────────────────

describe('types.keyedListOf', () => {
    type Group = { name: string; proxies: string[] };
    const grouped = types.keyedListOf<Group>(
        (g) => g.name,
        types.submodule({
            name: { type: types.str },
            proxies: { type: types.listOf(types.str), default: [] },
        }) as unknown as import('../src/option-types.js').OptionType<Group>,
    );

    it('single module passthrough', () => {
        const result = grouped.merge('k', [
            [{ name: 'A', proxies: ['p1'] }],
        ]);
        expect(result).toEqual([{ name: 'A', proxies: ['p1'] }]);
    });

    it('two modules, same key merged', () => {
        const result = grouped.merge('k', [
            [{ name: 'A', proxies: ['p1'] }],
            [{ name: 'A', proxies: ['p2'] }],
        ]);
        expect(result).toEqual([{ name: 'A', proxies: ['p1', 'p2'] }]);
    });

    it('multiple keys preserve insertion order', () => {
        const result = grouped.merge('k', [
            [{ name: 'B', proxies: ['b1'] }, { name: 'A', proxies: ['a1'] }],
            [{ name: 'A', proxies: ['a2'] }],
        ]);
        expect(result.map((g: Group) => g.name)).toEqual(['B', 'A']);
        expect(result[1].proxies).toEqual(['a1', 'a2']);
    });

    it('respects mkOrder', () => {
        const result = grouped.merge('k', [
            mkAfter([{ name: 'Z', proxies: ['z'] }]) as unknown as Group[],
            mkBefore([{ name: 'A', proxies: ['a'] }]) as unknown as Group[],
        ]);
        expect(result.map((g: Group) => g.name)).toEqual(['A', 'Z']);
    });

    it('has emptyValue', () => {
        expect(grouped.emptyValue!()).toEqual([]);
    });
});

// ─── types.uniqueListOf ─────────────────────────────────────────────

describe('types.uniqueListOf', () => {
    const ulist = types.uniqueListOf(types.str);

    it('no duplicates passthrough', () => {
        expect(ulist.merge('k', [['a', 'b'], ['c']])).toEqual(['a', 'b', 'c']);
    });

    it('duplicates removed (first occurrence wins)', () => {
        expect(ulist.merge('k', [['a', 'b'], ['b', 'c']])).toEqual(['a', 'b', 'c']);
    });

    it('mkOrder + dedup interaction', () => {
        const result = ulist.merge('k', [
            ['middle'] as unknown as string[],
            mkBefore(['first', 'middle']) as unknown as string[],
        ]);
        expect(result).toEqual(['first', 'middle']);
    });

    it('custom keyFn', () => {
        const byLower = types.uniqueListOf(types.str, (s) => s.toLowerCase());
        const result = byLower.merge('k', [['Hello'], ['hello', 'World']]);
        expect(result).toEqual(['Hello', 'World']);
    });

    it('has emptyValue', () => {
        expect(ulist.emptyValue!()).toEqual([]);
    });
});

// ─── makeType ───────────────────────────────────────────────────────

describe('makeType', () => {
    it('creates a custom OptionType', () => {
        const positiveInt = makeType<number>(
            'positiveInt',
            (v) => Number.isInteger(v) && (v as number) > 0,
            (key, defs) => {
                const sum = defs.reduce((a, b) => a + b, 0);
                return sum;
            },
        );
        expect(isOptionType(positiveInt)).toBe(true);
        expect(positiveInt.check(1)).toBe(true);
        expect(positiveInt.check(-1)).toBe(false);
        expect(positiveInt.merge('k', [1, 2, 3])).toBe(6);
    });
});
