// tests/helpers.test.js — Comprehensive tests for src/lib/helpers.js
import { describe, it, expect } from 'vitest';
import { parseBool, parseNumber, parseString, parseArgs, mergeList } from '../src/lib/helpers.js';

// ─── parseBool ──────────────────────────────────────────────────────

describe('parseBool', () => {
    it('returns default for null/undefined', () => {
        expect(parseBool(null)).toBe(false);
        expect(parseBool(undefined)).toBe(false);
        expect(parseBool(null, true)).toBe(true);
        expect(parseBool(undefined, true)).toBe(true);
    });

    it('passes through boolean values', () => {
        expect(parseBool(true)).toBe(true);
        expect(parseBool(false)).toBe(false);
    });

    it('parses "true"/"false" strings (case insensitive)', () => {
        expect(parseBool('true')).toBe(true);
        expect(parseBool('True')).toBe(true);
        expect(parseBool('TRUE')).toBe(true);
        expect(parseBool('false')).toBe(false);
        expect(parseBool('False')).toBe(false);
        expect(parseBool('FALSE')).toBe(false);
    });

    it('parses "1"/"0" as true/false', () => {
        expect(parseBool('1')).toBe(true);
        expect(parseBool('0')).toBe(false);
    });

    it('throws on invalid string', () => {
        expect(() => parseBool('yes')).toThrow(/Invalid boolean value/);
        expect(() => parseBool('maybe')).toThrow(/Invalid boolean value/);
    });

    it('throws on unexpected types', () => {
        expect(() => parseBool(42)).toThrow(/Invalid boolean value/);
        expect(() => parseBool([])).toThrow(/Invalid boolean value/);
    });
});

// ─── parseNumber ────────────────────────────────────────────────────

describe('parseNumber', () => {
    it('returns default for null/undefined', () => {
        expect(parseNumber(null)).toBe(0);
        expect(parseNumber(undefined)).toBe(0);
        expect(parseNumber(null, 99)).toBe(99);
    });

    it('parses valid integer strings', () => {
        expect(parseNumber('42')).toBe(42);
        expect(parseNumber('-10')).toBe(-10);
        expect(parseNumber('0')).toBe(0);
    });

    it('parses numbers directly', () => {
        expect(parseNumber(7)).toBe(7);
    });

    it('returns default for NaN', () => {
        expect(parseNumber('abc')).toBe(0);
        expect(parseNumber('abc', 5)).toBe(5);
    });

    it('truncates floats (parseInt behavior)', () => {
        expect(parseNumber('3.14')).toBe(3);
        expect(parseNumber('7.9')).toBe(7);
    });
});

// ─── parseString ────────────────────────────────────────────────────

describe('parseString', () => {
    it('returns default for null/undefined', () => {
        const parser = parseString('default');
        expect(parser(null)).toBe('default');
        expect(parser(undefined)).toBe('default');
    });

    it('converts values to string', () => {
        const parser = parseString('default');
        expect(parser('hello')).toBe('hello');
        expect(parser(42)).toBe('42');
        expect(parser(true)).toBe('true');
    });

    it('returns factory function', () => {
        const parser = parseString('x');
        expect(typeof parser).toBe('function');
    });
});

// ─── parseArgs ──────────────────────────────────────────────────────

describe('parseArgs', () => {
    it('returns defaults for empty args', () => {
        const result = parseArgs({});
        expect(result.ipv6Enabled).toBe(false);
        expect(result.dnsMode).toBe('fake-ip');
    });

    it('parses ipv6Enabled boolean', () => {
        expect(parseArgs({ ipv6Enabled: 'true' }).ipv6Enabled).toBe(true);
        expect(parseArgs({ ipv6Enabled: true }).ipv6Enabled).toBe(true);
        expect(parseArgs({ ipv6Enabled: 'false' }).ipv6Enabled).toBe(false);
    });

    it('parses dnsMode string', () => {
        expect(parseArgs({ dnsMode: 'redir-host' }).dnsMode).toBe('redir-host');
    });

    it('ignores unknown args', () => {
        const result = parseArgs({ unknownKey: 'whatever' });
        expect(result).not.toHaveProperty('unknownKey');
    });
});

// ─── mergeList ──────────────────────────────────────────────────────

describe('mergeList', () => {
    it('merges flat elements', () => {
        expect(mergeList(1, 2, 3)).toEqual([1, 2, 3]);
    });

    it('flattens nested arrays', () => {
        expect(mergeList([1, 2], 3, [4, 5])).toEqual([1, 2, 3, 4, 5]);
    });

    it('filters out falsy values', () => {
        expect(mergeList(1, false, 2, null, 0, '', 3)).toEqual([1, 2, 3]);
    });

    it('handles conditional pattern: true && value, false && value', () => {
        expect(mergeList([true && 'a', false && 'b', 'c'])).toEqual(['a', 'c']);
    });

    it('returns empty array for no args', () => {
        expect(mergeList()).toEqual([]);
    });

    it('returns empty for all-falsy', () => {
        expect(mergeList(false, null, 0, '')).toEqual([]);
    });
});
