// tests/mkmerge.test.ts — Tests for mkMerge multi-definition merge
import { describe, it, expect } from 'vitest';
import {
    mkMerge, mkIf, defer,
    mkDefault, mkForce, mkOverride,
    mkOrder, mkBefore, mkAfter,
    applyOverlays, deepMerge,
} from '../src/index.js';

// Helper: apply overlays with deepMerge
function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
    return applyOverlays(
        {},
        overlays.map(o => () => o),
        { merge: deepMerge },
    );
}

// ─── Object mode ────────────────────────────────────────────────────

describe('mkMerge — object mode', () => {
    it('merges overlapping array keys', () => {
        const result = mergeWith(
            mkMerge([{ packages: ['vim'] }, { packages: ['git'], port: 80 }]) as Record<string, unknown>,
        );
        expect(result.packages).toEqual(['vim', 'git']);
        expect(result.port).toBe(80);
    });

    it('conflicting scalars throw', () => {
        expect(() => mergeWith(
            mkMerge([{ port: 80 }, { port: 443 }]) as Record<string, unknown>,
        )).toThrow(/Scalar conflict/);
    });

    it('priority resolution: mkDefault loses to bare', () => {
        const result = mergeWith(
            mkMerge([{ port: mkDefault(80) }, { port: 443 }]) as Record<string, unknown>,
        );
        expect(result.port).toBe(443);
    });

    it('non-overlapping keys are preserved', () => {
        const result = mergeWith(
            mkMerge([{ a: 1 }, { b: 2 }]) as Record<string, unknown>,
        );
        expect(result).toEqual({ a: 1, b: 2 });
    });
});

// ─── Value mode ─────────────────────────────────────────────────────

describe('mkMerge — value mode', () => {
    it('merges multiple arrays', () => {
        const result = mergeWith({ items: mkMerge([['a'], ['b'], ['c']]) });
        expect(result.items).toEqual(['a', 'b', 'c']);
    });

    it('multiple arrays with ordering', () => {
        const result = mergeWith({
            items: mkMerge([['middle'], mkBefore(['first']), mkAfter(['last'])]),
        });
        expect(result.items).toEqual(['first', 'middle', 'last']);
    });

    it('scalar with priorities', () => {
        const result = mergeWith({ port: mkMerge([mkDefault(80), 443]) });
        expect(result.port).toBe(443);
    });
});

// ─── Deferred definitions ───────────────────────────────────────────

describe('mkMerge — deferred definitions', () => {
    it('mix of concrete and deferred arrays', () => {
        const result = mergeWith({
            packages: mkMerge([['vim'], defer(() => ['firefox'])]),
        });
        expect(result.packages).toEqual(['vim', 'firefox']);
    });

    it('deferred resolves to undefined is filtered', () => {
        const result = mergeWith({
            packages: mkMerge([['vim'], defer(() => undefined)]),
        });
        expect(result.packages).toEqual(['vim']);
    });

    it('all deferred resolve to undefined returns undefined (cleaned)', () => {
        const result = mergeWith({
            packages: mkMerge([defer(() => undefined), defer(() => undefined)]),
        });
        expect(result.packages).toBeUndefined();
    });
});

// ─── mkIf + mkMerge composition ─────────────────────────────────────

describe('mkMerge — mkIf composition', () => {
    it('object mode with mkIf fragments (all true)', () => {
        const result = applyOverlays(
            {},
            [
                (final) => mkMerge([
                    { packages: ['base'] },
                    mkIf(() => true, { packages: ['firefox'], theme: 'dark' }),
                    mkIf(() => true, { packages: ['nginx'] }),
                ]) as Record<string, unknown>,
            ],
            { merge: deepMerge },
        );
        expect(result.packages).toEqual(['base', 'firefox', 'nginx']);
        expect(result.theme).toBe('dark');
    });

    it('object mode with mkIf fragments (all false)', () => {
        const result = applyOverlays(
            {},
            [
                () => mkMerge([
                    { packages: ['base'] },
                    mkIf(() => false, { packages: ['firefox'], theme: 'dark' }),
                    mkIf(() => false, { packages: ['nginx'] }),
                ]) as Record<string, unknown>,
            ],
            { merge: deepMerge },
        );
        expect(result.packages).toEqual(['base']);
        expect(result.theme).toBeUndefined();
    });

    it('value mode with mkIf', () => {
        const result = mergeWith({
            packages: mkMerge([['base'], mkIf(() => true, ['firefox'])]),
        });
        expect(result.packages).toEqual(['base', 'firefox']);
    });

    it('value mode with mkIf false', () => {
        const result = mergeWith({
            packages: mkMerge([['base'], mkIf(() => false, ['firefox'])]),
        });
        expect(result.packages).toEqual(['base']);
    });
});

// ─── Cross-module merge ─────────────────────────────────────────────

describe('mkMerge — cross-module merge', () => {
    it('mkMerge array merged with another module array', () => {
        const result = applyOverlays(
            {},
            [
                () => ({ packages: mkOrder(500, ['early']) }),
                () => ({
                    packages: mkMerge([
                        ['base'],
                        mkIf(() => true, mkAfter(['late'])),
                    ]),
                }),
            ],
            { merge: deepMerge },
        );
        expect(result.packages).toEqual(['early', 'base', 'late']);
    });
});

// ─── Edge cases ─────────────────────────────────────────────────────

describe('mkMerge — edge cases', () => {
    it('empty input returns undefined', () => {
        expect(mkMerge([])).toBeUndefined();
    });

    it('single object definition', () => {
        const result = mergeWith(mkMerge([{ a: 1 }]) as Record<string, unknown>);
        expect(result).toEqual({ a: 1 });
    });

    it('single value definition', () => {
        const result = mergeWith({ x: mkMerge([42]) });
        expect(result.x).toBe(42);
    });

    it('undefined definitions are filtered', () => {
        const result = mergeWith({ x: mkMerge([undefined, 42, undefined]) });
        expect(result.x).toBe(42);
    });
});
