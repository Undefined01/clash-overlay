import { describe, it, expect } from 'vitest';
import { collectDefinitions, filterOverrides, mergeKey } from '../src/merge-engine.js';
import { types } from '../src/option-types.js';
import { mkDefault, mkForce, mkOverride } from '../src/priority.js';
import { mkBefore, mkAfter } from '../src/order.js';
import { defer } from '../src/defer.js';

describe('collectDefinitions', () => {
    it('collects values per key across fragments', () => {
        const fragments = [
            { a: 1, b: 'x' },
            { a: 2, c: true },
            { a: 3, b: 'y' },
        ];
        const defs = collectDefinitions(fragments);

        expect(defs.get('a')!.map(d => d.value)).toEqual([1, 2, 3]);
        expect(defs.get('b')!.map(d => d.value)).toEqual(['x', 'y']);
        expect(defs.get('c')!.map(d => d.value)).toEqual([true]);
    });

    it('skips undefined values', () => {
        const fragments = [{ a: 1 }, { a: undefined }];
        const defs = collectDefinitions(fragments);
        expect(defs.get('a')!.length).toBe(1);
    });

    it('skips _options, _imports, _module keys', () => {
        const fragments = [{ _options: {}, _imports: [], _module: {}, a: 1 }];
        const defs = collectDefinitions(fragments);
        expect(defs.has('_options')).toBe(false);
        expect(defs.has('_imports')).toBe(false);
        expect(defs.has('_module')).toBe(false);
        expect(defs.has('a')).toBe(true);
    });

    it('preserves module index', () => {
        const fragments = [{}, { a: 1 }, { a: 2 }];
        const defs = collectDefinitions(fragments);
        expect(defs.get('a')!.map(d => d.moduleIndex)).toEqual([1, 2]);
    });
});

describe('filterOverrides', () => {
    it('returns single value unwrapped', () => {
        const result = filterOverrides('k', [{ value: 42, moduleIndex: 0 }]);
        expect(result).toEqual([42]);
    });

    it('unwraps priority wrappers', () => {
        const result = filterOverrides('k', [{ value: mkDefault(42), moduleIndex: 0 }]);
        expect(result).toEqual([42]);
    });

    it('keeps lowest priority (highest precedence)', () => {
        const result = filterOverrides('k', [
            { value: mkDefault(1), moduleIndex: 0 },  // priority 1000
            { value: 2, moduleIndex: 1 },              // priority 100 (bare)
            { value: mkForce(3), moduleIndex: 2 },     // priority 50
        ]);
        expect(result).toEqual([3]);
    });

    it('keeps all defs at same priority', () => {
        const result = filterOverrides('k', [
            { value: 1, moduleIndex: 0 },  // bare: 100
            { value: 2, moduleIndex: 1 },  // bare: 100
        ]);
        expect(result).toEqual([1, 2]);
    });

    it('passes deferred values through in original order', () => {
        const d = defer(() => 42);
        const result = filterOverrides('k', [
            { value: d, moduleIndex: 0 },
            { value: 1, moduleIndex: 1 },
        ]);
        expect(result).toEqual([d, 1]);
    });
});

describe('mergeKey', () => {
    it('merges same key from 3 modules with types.anything', () => {
        const defs = [
            { value: { a: 1 }, moduleIndex: 0 },
            { value: { b: 2 }, moduleIndex: 1 },
            { value: { c: 3 }, moduleIndex: 2 },
        ];
        const result = mergeKey('k', defs, types.anything);
        expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('detects priority conflict across 3 modules', () => {
        const defs = [
            { value: 1, moduleIndex: 0 },
            { value: 2, moduleIndex: 1 },
            { value: 3, moduleIndex: 2 },
        ];
        expect(() => mergeKey('k', defs, types.anything)).toThrow('Scalar conflict');
    });

    it('respects mkOrder in all-at-once merge', () => {
        const defs = [
            { value: ['mid'], moduleIndex: 0 },
            { value: mkBefore(['first']), moduleIndex: 1 },
            { value: mkAfter(['last']), moduleIndex: 2 },
        ];
        const result = mergeKey('k', defs, types.listOf(types.str));
        expect(result).toEqual(['first', 'mid', 'last']);
    });

    it('uses typed merge when type is specified', () => {
        const defs = [
            { value: true, moduleIndex: 0 },
            { value: true, moduleIndex: 1 },
        ];
        expect(mergeKey('k', defs, types.bool)).toBe(true);
    });

    it('typed merge errors on conflict', () => {
        const defs = [
            { value: true, moduleIndex: 0 },
            { value: false, moduleIndex: 1 },
        ];
        expect(() => mergeKey('k', defs, types.bool)).toThrow('Conflicting');
    });

    it('priority resolution happens before type merge', () => {
        // mkForce(true) wins over bare false
        const defs = [
            { value: false, moduleIndex: 0 },
            { value: mkForce(true), moduleIndex: 1 },
        ];
        expect(mergeKey('k', defs, types.bool)).toBe(true);
    });

    it('returns emptyValue for empty defs', () => {
        expect(mergeKey('k', [], types.str)).toBe('');
        expect(mergeKey('k', [], types.listOf(types.str))).toEqual([]);
    });

    it('returns undefined for empty defs with no emptyValue', () => {
        expect(mergeKey('k', [], types.int)).toBe(undefined);
    });

    it('mixes typed and untyped keys', () => {
        // types.anything for undeclared keys
        const defs = [
            { value: { nested: 1 }, moduleIndex: 0 },
            { value: { nested2: 2 }, moduleIndex: 1 },
        ];
        expect(mergeKey('k', defs, types.anything)).toEqual({ nested: 1, nested2: 2 });
    });
});
