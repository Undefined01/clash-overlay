import { describe, it, expect } from 'vitest';
import { applyOverlay, mergeModule, REMOVE, mkDefault, mkForce } from '../src/index.js';

describe('applyOverlay', () => {
    it('supports overlay final/prev semantics', async () => {
        const base = { a: { n: 1 }, b: { n: 2 } };
        const result = await applyOverlay(base, [
            (_final, prev) => ({
                a: { n: (prev.a as { n: number }).n + 1 },
            }),
            (final) => ({
                c: { n: (final.a as { n: number }).n + (final.b as { n: number }).n },
            }),
        ]);
        expect(result).toEqual({
            a: { n: 2 },
            b: { n: 2 },
            c: { n: 4 },
        });
    });

    it('supports key deletion via REMOVE', async () => {
        const result = await applyOverlay(
            { a: { v: 1 }, b: { v: 2 } },
            [() => ({ a: REMOVE })],
        );
        expect(result).toEqual({ b: { v: 2 } });
    });

    it('replaces attrsets shallowly like nix overlays', async () => {
        const result = await applyOverlay(
            { a: { b: { c: 1 } } },
            [() => ({ a: { d: 2 } })],
        );
        expect(result).toEqual({ a: { d: 2 } });
    });
});

describe('mergeModule', () => {
    it('passes only final config to modules', async () => {
        const result = await mergeModule(
            { value: 1 },
            [
                (config) => ({ a: (config.value as number) + 1 }),
                (config) => ({ b: (config.a as number) + 1 }),
            ],
        );
        expect(result).toEqual({ value: 1, a: 2, b: 3 });
    });

    it('respects module priorities with default moduleMerge', async () => {
        const result = await mergeModule(
            {},
            [
                () => ({ port: mkDefault(7890) }),
                () => ({ port: mkForce(1080) }),
            ],
        );
        expect(result.port).toBe(1080);
    });
});
