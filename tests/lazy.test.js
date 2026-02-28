// tests/lazy.test.js — Comprehensive tests for src/lib/lazy.js
import { describe, it, expect } from 'vitest';
import {
    deferred, isDeferred,
    mkDefault, mkForce, mkOverride,
    isPriorityWrapped, getPriorityType, unwrapPriority,
    mkBefore, mkAfter, mkOrder,
    isOrdered, isOrderedList, isArrayLike,
    resolveDeferred,
    applyOverlays, clashMerge,
    makeExtensible,
    DEFAULT_ORDER, BEFORE_ORDER, AFTER_ORDER,
} from '../src/lib/lazy.js';

// ─── deferred / isDeferred ──────────────────────────────────────────

describe('deferred', () => {
    it('creates a deferred wrapper', () => {
        const d = deferred(() => 42);
        expect(d.__deferred).toBe(true);
        expect(typeof d.fn).toBe('function');
        expect(d.fn()).toBe(42);
    });

    it('isDeferred recognizes deferred values', () => {
        expect(isDeferred(deferred(() => 1))).toBe(true);
    });

    it('isDeferred returns false for non-deferred values', () => {
        expect(isDeferred(null)).toBe(false);
        expect(isDeferred(undefined)).toBe(false);
        expect(isDeferred(42)).toBe(false);
        expect(isDeferred('str')).toBe(false);
        expect(isDeferred({})).toBe(false);
        expect(isDeferred([])).toBe(false);
        expect(isDeferred({ __deferred: false })).toBe(false);
    });
});

// ─── Priority Wrappers ──────────────────────────────────────────────

describe('priority wrappers', () => {
    describe('mkDefault / mkForce / mkOverride', () => {
        it('mkDefault wraps with default priority', () => {
            const w = mkDefault(42);
            expect(w.__priority).toBe('default');
            expect(w.value).toBe(42);
        });

        it('mkForce wraps with force priority', () => {
            const w = mkForce('hello');
            expect(w.__priority).toBe('force');
            expect(w.value).toBe('hello');
        });

        it('mkOverride wraps with override priority', () => {
            const w = mkOverride(false);
            expect(w.__priority).toBe('override');
            expect(w.value).toBe(false);
        });

        it('can wrap falsy values', () => {
            expect(mkDefault(0).value).toBe(0);
            expect(mkDefault(null).value).toBe(null);
            expect(mkDefault('').value).toBe('');
            expect(mkDefault(false).value).toBe(false);
        });
    });

    describe('isPriorityWrapped', () => {
        it('detects wrapped values', () => {
            expect(isPriorityWrapped(mkDefault(1))).toBe(true);
            expect(isPriorityWrapped(mkForce(1))).toBe(true);
            expect(isPriorityWrapped(mkOverride(1))).toBe(true);
        });

        it('rejects non-wrapped values', () => {
            expect(isPriorityWrapped(null)).toBe(false);
            expect(isPriorityWrapped(undefined)).toBe(false);
            expect(isPriorityWrapped(42)).toBe(false);
            expect(isPriorityWrapped({})).toBe(false);
            expect(isPriorityWrapped({ __priority: 123 })).toBe(false); // must be string
        });
    });

    describe('getPriorityType', () => {
        it('returns correct type for wrappers', () => {
            expect(getPriorityType(mkDefault(1))).toBe('default');
            expect(getPriorityType(mkForce(1))).toBe('force');
            expect(getPriorityType(mkOverride(1))).toBe('override');
        });

        it('returns regular for unwrapped values', () => {
            expect(getPriorityType(42)).toBe('regular');
            expect(getPriorityType('str')).toBe('regular');
            expect(getPriorityType(null)).toBe('regular');
        });
    });

    describe('unwrapPriority', () => {
        it('unwraps priority-wrapped values', () => {
            expect(unwrapPriority(mkDefault(42))).toBe(42);
            expect(unwrapPriority(mkForce('x'))).toBe('x');
            expect(unwrapPriority(mkOverride(false))).toBe(false);
        });

        it('returns non-wrapped values as-is', () => {
            expect(unwrapPriority(42)).toBe(42);
            expect(unwrapPriority(null)).toBe(null);
            expect(unwrapPriority('str')).toBe('str');
        });
    });
});

// ─── Order Wrappers ─────────────────────────────────────────────────

describe('order wrappers', () => {
    it('mkBefore creates ordered with BEFORE_ORDER', () => {
        const o = mkBefore(['a', 'b']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(BEFORE_ORDER);
        expect(o.items).toEqual(['a', 'b']);
    });

    it('mkAfter creates ordered with AFTER_ORDER', () => {
        const o = mkAfter(['x']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(AFTER_ORDER);
        expect(o.items).toEqual(['x']);
    });

    it('mkOrder creates ordered with custom order', () => {
        const o = mkOrder(50, ['mid']);
        expect(o.__ordered).toBe(true);
        expect(o.order).toBe(50);
        expect(o.items).toEqual(['mid']);
    });

    it('order constants have correct relative values', () => {
        expect(BEFORE_ORDER).toBeLessThan(DEFAULT_ORDER);
        expect(DEFAULT_ORDER).toBeLessThan(AFTER_ORDER);
        expect(BEFORE_ORDER).toBe(0);
        expect(DEFAULT_ORDER).toBe(100);
        expect(AFTER_ORDER).toBe(10000);
    });
});

// ─── Type Checks ────────────────────────────────────────────────────

describe('type checks', () => {
    it('isOrdered detects order wrappers', () => {
        expect(isOrdered(mkBefore([]))).toBe(true);
        expect(isOrdered(mkAfter([]))).toBe(true);
        expect(isOrdered(mkOrder(50, []))).toBe(true);
        expect(isOrdered([])).toBe(false);
        expect(isOrdered(null)).toBe(false);
        expect(isOrdered({})).toBe(false);
    });

    it('isOrderedList detects accumulated segments', () => {
        expect(isOrderedList({ __orderedList: true, segments: [] })).toBe(true);
        expect(isOrderedList([])).toBe(false);
        expect(isOrderedList(null)).toBe(false);
    });

    it('isArrayLike detects all array-like types', () => {
        expect(isArrayLike([1, 2])).toBe(true);
        expect(isArrayLike(mkOrder(10, []))).toBe(true);
        expect(isArrayLike({ __orderedList: true, segments: [] })).toBe(true);
        expect(isArrayLike(42)).toBe(false);
        expect(isArrayLike(null)).toBe(false);
        expect(isArrayLike({})).toBe(false);
    });
});

// ─── resolveDeferred ────────────────────────────────────────────────

describe('resolveDeferred', () => {
    it('resolves deferred values', () => {
        expect(resolveDeferred(deferred(() => 42))).toBe(42);
    });

    it('resolves nested deferred values', () => {
        const obj = { a: deferred(() => 1), b: { c: deferred(() => 2) } };
        expect(resolveDeferred(obj)).toEqual({ a: 1, b: { c: 2 } });
    });

    it('resolves deferred in arrays', () => {
        expect(resolveDeferred([deferred(() => 1), 2])).toEqual([1, 2]);
    });

    it('unwraps priority wrappers', () => {
        expect(resolveDeferred(mkDefault(42))).toBe(42);
        expect(resolveDeferred(mkForce('x'))).toBe('x');
    });

    it('passes through primitives', () => {
        expect(resolveDeferred(null)).toBe(null);
        expect(resolveDeferred(undefined)).toBe(undefined);
        expect(resolveDeferred(42)).toBe(42);
        expect(resolveDeferred('str')).toBe('str');
        expect(resolveDeferred(true)).toBe(true);
    });

    it('passes through RegExp and Date', () => {
        const re = /test/;
        const date = new Date('2025-01-01');
        expect(resolveDeferred(re)).toBe(re);
        expect(resolveDeferred(date)).toBe(date);
    });

    it('handles circular references without infinite loop', () => {
        const obj = { a: 1 };
        obj.self = obj;
        const result = resolveDeferred(obj);
        expect(result.a).toBe(1);
        expect(result.self).toBe(obj); // same reference, stops recursing
    });

    it('resolves chained deferred values', () => {
        const result = resolveDeferred(deferred(() => deferred(() => 42)));
        expect(result).toBe(42);
    });

    it('flattens ordered lists', () => {
        const orderedList = {
            __orderedList: true,
            segments: [
                { order: 30, items: ['c'] },
                { order: 10, items: ['a'] },
                { order: 20, items: ['b'] },
            ],
        };
        expect(resolveDeferred(orderedList)).toEqual(['a', 'b', 'c']);
    });

    it('resolves ordered wrappers to their items', () => {
        const ordered = mkOrder(50, ['x', 'y']);
        expect(resolveDeferred(ordered)).toEqual(['x', 'y']);
    });
});

// ─── applyOverlays ─────────────────────────────────────────────────

describe('applyOverlays', () => {
    describe('basic overlay mechanics', () => {
        it('applies overlays using prev (accumulated state)', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (final, prev) => ({ b: prev.a + 1 }),
                    (final, prev) => ({ c: prev.b + 10 }),
                ]
            );
            expect(result).toEqual({ a: 1, b: 2, c: 12 });
        });

        it('returns base unchanged with no overlays', () => {
            const result = applyOverlays({ x: 1 }, []);
            expect(result).toEqual({ x: 1 });
        });

        it('later overlay overwrites earlier keys (shallow merge)', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (final, prev) => ({ a: 2 }),
                    (final, prev) => ({ a: 3 }),
                ]
            );
            expect(result).toEqual({ a: 3 });
        });
    });

    describe('deferred / final access', () => {
        it('resolves deferred values after all overlays', () => {
            const result = applyOverlays(
                { a: 1 },
                [
                    (final, prev) => ({ b: prev.a + 1, c: 3 }),
                    (final, prev) => ({
                        c: 10,
                        d: deferred(() => final.c + final.b),
                    }),
                ]
            );
            expect(result).toEqual({ a: 1, b: 2, c: 10, d: 12 });
        });

        it('forward reference: early overlay reads late value via final', () => {
            const result = applyOverlays(
                { proxies: ['p1'] },
                [
                    (final, prev) => ({
                        count: deferred(() => final.proxies.length),
                    }),
                    (final, prev) => ({
                        proxies: [...prev.proxies, 'p2', 'p3'],
                    }),
                ]
            );
            expect(result.proxies).toEqual(['p1', 'p2', 'p3']);
            expect(result.count).toBe(3);
        });

        it('deferred can reference concrete (non-deferred) values via final', () => {
            // Deferred-to-concrete works because finalResolved holds merged state
            const result = applyOverlays(
                { a: 1, b: 2 },
                [
                    (final, prev) => ({
                        c: deferred(() => final.a + final.b),
                    }),
                ]
            );
            expect(result).toEqual({ a: 1, b: 2, c: 3 });
        });

        it('deferred-to-deferred via final resolves recursively', () => {
            // resolveDeferred recursively resolves: final.b returns deferred wrapper,
            // which resolveDeferred then resolves again.
            const result = applyOverlays(
                { a: 1 },
                [
                    (final, prev) => ({
                        b: deferred(() => final.a + 1),
                        c: deferred(() => final.b), // returns deferred wrapper, resolved recursively
                    }),
                ]
            );
            expect(result.b).toBe(2);
            expect(result.c).toBe(2); // recursively resolved
        });

        it('deferred arithmetic with deferred value produces coercion artifact', () => {
            // JS coerces deferred wrapper to "[object Object]" before resolveDeferred
            // can process it — this is a known limitation.
            const result = applyOverlays(
                { a: 1 },
                [
                    (final, prev) => ({
                        b: deferred(() => final.a + 1),
                        c: deferred(() => final.b + 10), // [object Object]10
                    }),
                ]
            );
            expect(result.b).toBe(2);
            expect(typeof result.c).toBe('string'); // coercion artifact
        });

        it('throws on eager final access', () => {
            expect(() => {
                applyOverlays(
                    { a: 1 },
                    [(final, prev) => ({ b: final.a + 1 })]
                );
            }).toThrow(/Cannot eagerly access final\.a/);
        });

        it('throws on final "in" check during evaluation', () => {
            expect(() => {
                applyOverlays(
                    { a: 1 },
                    [(final, prev) => ({ b: 'a' in final })]
                );
            }).toThrow(/Cannot check 'final' membership/);
        });

        it('throws on final enumeration during evaluation', () => {
            expect(() => {
                applyOverlays(
                    { a: 1 },
                    [(final, prev) => ({ b: Object.keys(final) })]
                );
            }).toThrow(/Cannot enumerate 'final'/);
        });
    });

    describe('custom merge strategies', () => {
        it('uses custom merge function when provided', () => {
            const concatMerge = (cur, ext) => {
                const result = { ...cur };
                for (const [k, v] of Object.entries(ext)) {
                    if (Array.isArray(result[k]) && Array.isArray(v)) {
                        result[k] = [...result[k], ...v];
                    } else {
                        result[k] = v;
                    }
                }
                return result;
            };
            const result = applyOverlays(
                { items: [1] },
                [
                    (final, prev) => ({ items: [2] }),
                    (final, prev) => ({ items: [3] }),
                ],
                { merge: concatMerge }
            );
            expect(result.items).toEqual([1, 2, 3]);
        });
    });
});

// ─── clashMerge ─────────────────────────────────────────────────────

describe('clashMerge', () => {
    it('adds new keys', () => {
        expect(clashMerge({}, { a: 1 })).toEqual({ a: 1 });
    });

    it('concatenates arrays', () => {
        expect(clashMerge({ a: [1] }, { a: [2] })).toEqual({ a: [1, 2] });
    });

    it('shallow merges objects', () => {
        expect(clashMerge({ o: { a: 1 } }, { o: { b: 2 } })).toEqual({ o: { a: 1, b: 2 } });
    });

    it('later scalar wins', () => {
        expect(clashMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
    });

    it('does not merge deferred as objects', () => {
        const d = deferred(() => 42);
        const result = clashMerge({ a: { x: 1 } }, { a: d });
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
        let obj = makeExtensible({ a: 1 });
        obj = obj.extend((final, prev) => ({ b: prev.a + 1 }));
        expect(obj.a).toBe(1);
        expect(obj.b).toBe(2);
    });

    it('supports forward references via deferred', () => {
        let obj = makeExtensible({ a: 1 });
        obj = obj.extend((final, prev) => ({ b: prev.a + 1 }));
        obj = obj.extend((final, prev) => ({
            c: deferred(() => final.a + final.b),
        }));
        expect(obj.c).toBe(3);
    });

    it('each extend returns a new object (immutable)', () => {
        const obj1 = makeExtensible({ a: 1 });
        const obj2 = obj1.extend((f, p) => ({ b: 2 }));
        expect(obj1.b).toBeUndefined();
        expect(obj2.b).toBe(2);
    });
});
