// tests/test-lazy.js — Unit tests for lib/lazy.js

import {
    deferred, applyOverlays, clashMerge, makeExtensible,
    mkDefault, mkForce, mkOverride,
    mkBefore, mkAfter, mkOrder,
} from '../src/lib/lazy.js';
import { clashModuleMerge } from '../src/lib/merge.js';

function assert(cond, msg) {
    if (!cond) {
        console.error("FAIL:", msg);
        process.exit(1);
    }
}

// ─── Test 1: Basic applyOverlays ────────────────────────────────────
console.log('=== Test 1: basic overlay (prev only) ===');
const r1 = applyOverlays(
    { a: 1 },
    [
        (final, prev) => ({ b: prev.a + 1 }),
        (final, prev) => ({ c: prev.b + 10 }),
    ]
);
assert(r1.a === 1, 'r1.a === 1');
assert(r1.b === 2, 'r1.b === 2');
assert(r1.c === 12, 'r1.c === 12');
console.log('PASS:', JSON.stringify(r1));

// ─── Test 2: Deferred forward reference ─────────────────────────────
console.log('=== Test 2: deferred (forward ref via final) ===');
const r2 = applyOverlays(
    { a: 1 },
    [
        (final, prev) => ({
            b: prev.a + 1,
            c: 3,
        }),
        (final, prev) => ({
            c: 10,
            d: deferred(() => final.c + final.b),
        }),
    ]
);
assert(r2.a === 1, 'r2.a === 1');
assert(r2.b === 2, 'r2.b === 2');
assert(r2.c === 10, 'r2.c === 10');
assert(r2.d === 12, 'r2.d === 12 (deferred: final.c + final.b = 10 + 2)');
console.log('PASS:', JSON.stringify(r2));

// ─── Test 3: Forward reference — early overlay reads late overlay's value ──
console.log('=== Test 3: forward reference (early reads late via final) ===');
const r3 = applyOverlays(
    { proxies: ['proxy1'] },
    [
        (final, prev) => ({
            allCount: deferred(() => final.proxies.length),
        }),
        (final, prev) => ({
            proxies: [...prev.proxies, 'proxy2', 'proxy3'],
        }),
    ]
);
assert(r3.proxies.length === 3, 'r3.proxies has 3 elements');
assert(r3.allCount === 3, 'r3.allCount === 3 (forward ref via deferred)');
console.log('PASS: proxies=%j, allCount=%d', r3.proxies, r3.allCount);

// ─── Test 4: clashModuleMerge — ordered arrays ──────────────────────
console.log('=== Test 4: clashModuleMerge (ordered arrays, objects merge) ===');
const r4 = applyOverlays(
    { rules: [], dns: { enable: true } },
    [
        (final, prev) => ({
            rules: mkOrder(10, ['rule1', 'rule2']),
            dns: { ipv6: true },
        }),
        (final, prev) => ({
            rules: mkOrder(30, ['rule3']),
        }),
        (final, prev) => ({
            rules: ['rule4'],  // default order 100
        }),
    ],
    { merge: clashModuleMerge }
);
assert(JSON.stringify(r4.rules) === '["rule1","rule2","rule3","rule4"]', 'rules ordered: ' + JSON.stringify(r4.rules));
assert(r4.dns.enable === true, 'dns.enable preserved');
assert(r4.dns.ipv6 === true, 'dns.ipv6 merged');
console.log('PASS:', JSON.stringify(r4));

// ─── Test 5: Eager final access throws ─────────────────────────────
console.log('=== Test 5: eager final access throws ===');
let threw = false;
try {
    applyOverlays(
        { a: 1 },
        [
            (final, prev) => ({
                b: final.a + 1,  // EAGER access — should throw
            }),
        ]
    );
} catch (e) {
    threw = true;
    console.log('PASS: Correctly threw:', e.message);
}
assert(threw, 'Should have thrown for eager final access');

// ─── Test 6: mkBefore / mkAfter ─────────────────────────────────────
console.log('=== Test 6: mkBefore / mkAfter ordering ===');
const r6 = applyOverlays(
    { items: [] },
    [
        (final, prev) => ({ items: mkAfter(['last']) }),
        (final, prev) => ({ items: ['middle'] }),
        (final, prev) => ({ items: mkBefore(['first']) }),
    ],
    { merge: clashModuleMerge }
);
assert(JSON.stringify(r6.items) === '["first","middle","last"]', 'order: ' + JSON.stringify(r6.items));
console.log('PASS:', JSON.stringify(r6.items));

// ─── Test 7: Priority wrappers ──────────────────────────────────────
console.log('=== Test 7: mkDefault + mkOverride ===');
const r7 = applyOverlays(
    {},
    [
        (final, prev) => ({ port: mkDefault(7890) }),
        (final, prev) => ({ port: mkOverride(1080) }),
    ],
    { merge: clashModuleMerge }
);
assert(r7.port === 1080, 'mkOverride wins: ' + r7.port);
console.log('PASS: port =', r7.port);

// ─── Test 8: Scalar conflict errors ─────────────────────────────────
console.log('=== Test 8: scalar conflict detection ===');
let conflictThrew = false;
try {
    applyOverlays(
        {},
        [
            (final, prev) => ({ port: 7890 }),
            (final, prev) => ({ port: 1080 }),
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    conflictThrew = true;
    console.log('PASS: Correctly threw:', e.message);
}
assert(conflictThrew, 'Should have thrown for scalar conflict');

// ─── Test 9: makeExtensible ─────────────────────────────────────────
console.log('=== Test 9: makeExtensible ===');
let obj = makeExtensible({ a: 1 });
obj = obj.extend((final, prev) => ({ b: prev.a + 1 }));
obj = obj.extend((final, prev) => ({
    c: deferred(() => final.a + final.b),
}));
assert(obj.a === 1, 'obj.a === 1');
assert(obj.b === 2, 'obj.b === 2');
assert(obj.c === 3, 'obj.c === 3');
console.log('PASS:', JSON.stringify({ a: obj.a, b: obj.b, c: obj.c }));

console.log('\n=== All lazy tests passed ===');
