import { describe, it, expect } from 'vitest';
import { extractOptions, resolveOptionType, getOptionDefault } from '../src/options.js';
import { types } from '../src/option-types.js';

describe('extractOptions', () => {
    it('extracts flat key declarations', () => {
        const fragments = [
            { _options: { 'dns.enable': { type: types.bool, default: false } } },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.has('dns.enable')).toBe(true);
        expect(opts.get('dns.enable')!.type).toBe(types.bool);
        expect(opts.get('dns.enable')!.default).toBe(false);
    });

    it('extracts nested dict declarations', () => {
        const fragments = [
            {
                _options: {
                    dns: {
                        enable: { type: types.bool, default: false },
                        mode: { type: types.enum(['fake-ip', 'redir-host']), default: 'fake-ip' },
                    },
                },
            },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.has('dns.enable')).toBe(true);
        expect(opts.has('dns.mode')).toBe(true);
        expect(opts.get('dns.enable')!.default).toBe(false);
        expect(opts.get('dns.mode')!.default).toBe('fake-ip');
    });

    it('handles mixed flat and nested declarations', () => {
        const fragments = [
            {
                _options: {
                    port: { type: types.int },
                    dns: {
                        enable: { type: types.bool },
                    },
                },
            },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.has('port')).toBe(true);
        expect(opts.has('dns.enable')).toBe(true);
    });

    it('merges cross-module _options with non-overlapping keys', () => {
        const fragments = [
            { _options: { port: { type: types.int } } },
            { _options: { host: { type: types.str } } },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.size).toBe(2);
        expect(opts.has('port')).toBe(true);
        expect(opts.has('host')).toBe(true);
    });

    it('merges cross-module _options with same key + same type (last-writer-wins)', () => {
        const fragments = [
            { _options: { port: { type: types.int, default: 80 } } },
            { _options: { port: { type: types.int, default: 3000 } } },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.size).toBe(1);
        expect(opts.get('port')!.default).toBe(3000);
    });

    it('throws on cross-module _options with same key + different type', () => {
        const fragments = [
            { _options: { port: { type: types.int } } },
            { _options: { port: { type: types.str } } },
        ];
        expect(() => extractOptions(fragments as any)).toThrow('Conflicting _options type');
    });

    it('ignores fragments without _options', () => {
        const fragments = [
            { rules: ['a'] },
            { _options: { port: { type: types.int } } },
            { dns: { enable: true } },
        ];
        const opts = extractOptions(fragments as any);
        expect(opts.size).toBe(1);
        expect(opts.has('port')).toBe(true);
    });

    it('returns empty map when no fragment has _options', () => {
        const fragments = [{ rules: ['a'] }, { dns: {} }];
        const opts = extractOptions(fragments as any);
        expect(opts.size).toBe(0);
    });
});

describe('resolveOptionType', () => {
    it('returns declared option type', () => {
        const opts = new Map([['port', { type: types.int }]]);
        expect(resolveOptionType('port', opts, false)).toBe(types.int);
    });

    it('falls back to types.anything when check=false', () => {
        const opts = new Map();
        expect(resolveOptionType('unknown', opts, false)).toBe(types.anything);
    });

    it('throws for undeclared key when check=true', () => {
        const opts = new Map();
        expect(() => resolveOptionType('unknown', opts, true)).toThrow('Undeclared option');
    });

    it('uses freeformType fallback when check=true', () => {
        const opts = new Map();
        expect(resolveOptionType('unknown', opts, true, types.raw)).toBe(types.raw);
    });
});

describe('getOptionDefault', () => {
    it('returns explicit default', () => {
        const opts = new Map([['port', { type: types.int, default: 80 }]]);
        const result = getOptionDefault('port', opts);
        expect(result.hasDefault).toBe(true);
        expect(result.value).toBe(80);
    });

    it('returns type emptyValue when no explicit default', () => {
        const opts = new Map([['name', { type: types.str }]]);
        const result = getOptionDefault('name', opts);
        expect(result.hasDefault).toBe(true);
        expect(result.value).toBe('');
    });

    it('returns no default when type has no emptyValue', () => {
        const opts = new Map([['port', { type: types.int }]]);
        const result = getOptionDefault('port', opts);
        expect(result.hasDefault).toBe(false);
    });

    it('returns no default for undeclared key', () => {
        const opts = new Map();
        const result = getOptionDefault('unknown', opts);
        expect(result.hasDefault).toBe(false);
    });
});
