// tests/overlay.test.ts — Tests for applyOverlays, simpleMerge, makeExtensible
import { describe, it, expect } from 'vitest';
import {
    deferred,
    mkDefault, mkForce,
    applyOverlays, simpleMerge, makeExtensible,
} from '../src/index.js';
import type { MergeFn, OverlayFn } from '../src/index.js';

// ─── applyOverlays: basic mechanics ─────────────────────────────────

describe('applyOverlays', () => {
    describe('basic overlay mechanics', () => {
        it('applies overlays using prev (accumulated state)', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (_final, prev) => ({ b: (prev.a as number) + 1 }),
                    (_final, prev) => ({ c: (prev.b as number) + 10 }),
                ],
            );
            expect(result).toEqual({ a: 1, b: 2, c: 12 });
        });

        it('returns base unchanged with no overlays', () => {
            expect(applyOverlays({ x: 1 }, [])).toEqual({ x: 1 });
        });

        it('later overlay overwrites earlier keys (shallow merge)', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    () => ({ a: 2 }),
                    () => ({ a: 3 }),
                ],
            );
            expect(result).toEqual({ a: 3 });
        });

        it('does not mutate the base object', () => {
            const base = { a: 1 };
            applyOverlays(base, [() => ({ a: 2 })]);
            expect(base.a).toBe(1);
        });
    });

    // ─── Deferred / final access ─────────────────────────────────────

    describe('deferred / final access', () => {
        it('resolves deferred values after all overlays', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (_final, prev) => ({ b: (prev.a as number) + 1, c: 3 }),
                    (final) => ({
                        c: 10,
                        d: deferred(() => (final.c as number) + (final.b as number)),
                    }),
                ],
            );
            expect(result).toEqual({ a: 1, b: 2, c: 10, d: 12 });
        });

        it('forward reference: early overlay reads late value via final', () => {
            const result = applyOverlays(
                { proxies: ['p1'] },
                [
                    (final) => ({
                        count: deferred(() => (final.proxies as string[]).length),
                    }),
                    (_final, prev) => ({
                        proxies: [...(prev.proxies as string[]), 'p2', 'p3'],
                    }),
                ],
            );
            expect(result.proxies).toEqual(['p1', 'p2', 'p3']);
            expect(result.count).toBe(3);
        });

        it('deferred can reference concrete values via final', () => {
            const result = applyOverlays(
                { a: 1, b: 2 },
                [
                    (final) => ({
                        c: deferred(() => (final.a as number) + (final.b as number)),
                    }),
                ],
            );
            expect(result).toEqual({ a: 1, b: 2, c: 3 });
        });

        it('deferred-to-deferred via final resolves recursively', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (final) => ({
                        b: deferred(() => (final.a as number) + 1),
                        c: deferred(() => final.b),
                    }),
                ],
            );
            expect(result.b).toBe(2);
            expect(result.c).toBe(2); // recursively resolved
        });

        it('throws on eager final access', () => {
            expect(() => {
                applyOverlays({ a: 1 }, [(final) => ({ b: final.a })]);
            }).toThrow(/Cannot eagerly access final\.a/);
        });

        it('throws on final "in" check during evaluation', () => {
            expect(() => {
                applyOverlays({ a: 1 }, [(final) => ({ b: 'a' in final })]);
            }).toThrow(/Cannot check 'final' membership/);
        });

        it('throws on final enumeration during evaluation', () => {
            expect(() => {
                applyOverlays({ a: 1 }, [(final) => ({ b: Object.keys(final) })]);
            }).toThrow(/Cannot enumerate 'final'/);
        });
    });

    // ─── Custom merge strategies ─────────────────────────────────────

    describe('custom merge strategies', () => {
        it('uses custom merge function when provided', () => {
            const concatMerge: MergeFn = (cur, ext) => {
                const result = { ...cur };
                for (const [k, v] of Object.entries(ext)) {
                    if (Array.isArray(result[k]) && Array.isArray(v)) {
                        result[k] = [...(result[k] as unknown[]), ...v];
                    } else {
                        result[k] = v;
                    }
                }
                return result;
            };
            const result = applyOverlays(
                { items: [1] },
                [
                    () => ({ items: [2] }),
                    () => ({ items: [3] }),
                ],
                { merge: concatMerge },
            );
            expect(result.items).toEqual([1, 2, 3]);
        });
    });
});

// ─── simpleMerge ────────────────────────────────────────────────────

describe('simpleMerge', () => {
    it('adds new keys', () => {
        expect(simpleMerge({}, { a: 1 })).toEqual({ a: 1 });
    });

    it('concatenates arrays', () => {
        expect(simpleMerge({ a: [1] }, { a: [2] })).toEqual({ a: [1, 2] });
    });

    it('shallow merges objects', () => {
        expect(simpleMerge({ o: { a: 1 } }, { o: { b: 2 } })).toEqual({ o: { a: 1, b: 2 } });
    });

    it('later scalar wins', () => {
        expect(simpleMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('does not merge deferred as objects', () => {
        const d = deferred(() => 42);
        const result = simpleMerge({ a: { x: 1 } }, { a: d as unknown as Record<string, unknown> });
        expect(result.a).toBe(d);
    });
});

// ─── makeExtensible ─────────────────────────────────────────────────

describe('makeExtensible', () => {
    it('creates an extensible object', () => {
        const obj = makeExtensible({ a: 1 });
        expect(obj.a).toBe(1);
        expect(typeof obj.extend).toBe('function');
    });

    it('extends with prev reference', () => {
        const obj = makeExtensible({ a: 1 });
        const obj2 = obj.extend((_final, prev) => ({ b: (prev.a as number) + 1 }));
        expect(obj2.a).toBe(1);
        expect(obj2.b).toBe(2);
    });

    it('supports forward references via deferred', () => {
        let obj = makeExtensible({ a: 1 });
        obj = obj.extend((_final, prev) => ({ b: (prev.a as number) + 1 }));
        obj = obj.extend((final) => ({
            c: deferred(() => (final.a as number) + (final.b as number)),
        }));
        expect(obj.c).toBe(3);
    });

    it('each extend returns a new object (immutable)', () => {
        const obj1 = makeExtensible({ a: 1 });
        const obj2 = obj1.extend(() => ({ b: 2 }));
        expect(obj1.b).toBeUndefined();
        expect(obj2.b).toBe(2);
    });
});
