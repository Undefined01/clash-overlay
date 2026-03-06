// tests/mkif.test.ts — Tests for mkIf conditional config
import { describe, it, expect } from 'vitest';
import {
    mkIf, deferred, isDeferred,
    mkOrder, mkBefore, mkAfter, mkDefault, mkForce, mkOverride,
    applyOverlays, moduleMerge,
} from '../src/index.js';

// Helper: apply overlays with moduleMerge
function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
    return applyOverlays(
        {},
        overlays.map(o => () => o),
        { merge: moduleMerge },
    );
}

// ─── Object mode ────────────────────────────────────────────────────

describe('mkIf — object mode', () => {
    it('condition true: all keys present', () => {
        const result = mergeWith(mkIf(() => true, { a: 1, b: ['x'] }));
        expect(result).toEqual({ a: 1, b: ['x'] });
    });

    it('condition false: all keys removed', () => {
        const result = mergeWith(mkIf(() => false, { a: 1, b: ['x'] }));
        expect(result).toEqual({});
    });

    it('each key is independently wrapped in deferred', () => {
        const expanded = mkIf(() => true, { a: 1, b: 2 });
        expect(isDeferred(expanded.a)).toBe(true);
        expect(isDeferred(expanded.b)).toBe(true);
    });

    it('no new __type tags introduced', () => {
        const expanded = mkIf(() => true, { a: 1 });
        const val = expanded.a as any;
        expect(val.__type).toBe('deferred');
    });

    it('keys participate in cross-module merge (condition true)', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ rules: ['always'] }),
                () => mkIf(() => true, { rules: mkOrder(500, ['conditional']) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.rules).toEqual(['conditional', 'always']);
    });

    it('keys participate in cross-module merge (condition false)', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ rules: ['always'] }),
                () => mkIf(() => false, { rules: mkOrder(500, ['conditional']) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.rules).toEqual(['always']);
    });

    it('preserves mkForce through deferred', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ port: 80 }),
                () => mkIf(() => true, { port: mkForce(443) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.port).toBe(443);
    });

    it('preserves mkDefault through deferred', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ port: 80 }),
                () => mkIf(() => true, { port: mkDefault(443) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.port).toBe(80); // bare (100) wins over mkDefault (1000)
    });

    it('preserves mkBefore/mkAfter through deferred', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ items: ['middle'] }),
                () => mkIf(() => true, { items: mkBefore(['first']) }),
                () => mkIf(() => true, { items: mkAfter(['last']) }),
            ],
            { merge: moduleMerge },
        );
        expect(result.items).toEqual(['first', 'middle', 'last']);
    });
});

// ─── Value mode (non-object) ────────────────────────────────────────

describe('mkIf — value mode', () => {
    it('scalar: condition true', () => {
        const result = mergeWith({ port: mkIf(() => true, 443) });
        expect(result.port).toBe(443);
    });

    it('scalar: condition false', () => {
        const result = mergeWith({ port: mkIf(() => false, 443) });
        expect(result).toEqual({});
    });

    it('array: condition true', () => {
        const result = mergeWith({ items: mkIf(() => true, ['nginx']) });
        expect(result.items).toEqual(['nginx']);
    });

    it('array: condition false', () => {
        const result = mergeWith({ items: mkIf(() => false, ['nginx']) });
        expect(result).toEqual({});
    });

    it('wrapped value: mkBefore condition true', () => {
        const result = mergeWith({ items: mkIf(() => true, mkBefore(['early'])) });
        expect(result.items).toEqual(['early']);
    });

    it('result is a deferred, not a new type', () => {
        const val = mkIf(() => true, 42);
        expect(isDeferred(val)).toBe(true);
    });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('mkIf — edge cases', () => {
    it('empty object with condition true returns empty', () => {
        const result = mergeWith(mkIf(() => true, {}));
        expect(result).toEqual({});
    });

    it('empty object with condition false returns empty', () => {
        const result = mergeWith(mkIf(() => false, {}));
        expect(result).toEqual({});
    });

    it('multiple mkIf in same module', () => {
        const result = mergeWith({
            ...mkIf(() => true, { a: 1 }),
            ...mkIf(() => false, { b: 2 }),
            ...mkIf(() => true, { c: 3 }),
        });
        expect(result).toEqual({ a: 1, c: 3 });
    });

    it('mkIf with config reference (via deferred)', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ enabled: true }),
                (final) => mkIf(
                    () => (final as any).enabled,
                    { port: 443 },
                ),
            ],
            { merge: moduleMerge },
        );
        expect(result).toEqual({ enabled: true, port: 443 });
    });

    it('mkIf with config reference, condition false', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ enabled: false }),
                (final) => mkIf(
                    () => (final as any).enabled,
                    { port: 443 },
                ),
            ],
            { merge: moduleMerge },
        );
        expect(result).toEqual({ enabled: false });
    });
});
