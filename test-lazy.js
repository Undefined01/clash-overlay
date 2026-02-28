const {
    deferred, applyOverlays, clashMerge, makeExtensible
} = require('./lib/lazy');

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
            // Early overlay: references value added by LATER overlay
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

// ─── Test 4: clashMerge — array concatenation ──────────────────────
console.log('=== Test 4: clashMerge (arrays concat, objects merge) ===');
const r4 = applyOverlays(
    { rules: ['rule1'], dns: { enable: true }, port: 7890 },
    [
        (final, prev) => ({
            rules: ['rule2', 'rule3'],
            dns: { ipv6: true },
        }),
        (final, prev) => ({
            rules: ['rule4'],
            port: 8080,
        }),
    ],
    { merge: clashMerge }
);
assert(JSON.stringify(r4.rules) === '["rule1","rule2","rule3","rule4"]', 'rules concatenated');
assert(r4.dns.enable === true, 'dns.enable preserved');
assert(r4.dns.ipv6 === true, 'dns.ipv6 merged');
assert(r4.port === 8080, 'port overwritten');
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
    assert(e.message.includes('Cannot eagerly access'), 'correct error message');
}
assert(threw, 'should have thrown on eager final access');
console.log('PASS: eager final access correctly throws');

// ─── Test 6: makeExtensible ────────────────────────────────────────
console.log('=== Test 6: makeExtensible ===');
let obj = makeExtensible({ x: 10 });
obj = obj.extend((final, prev) => ({ y: prev.x + 5 }));
obj = obj.extend((final, prev) => ({
    z: deferred(() => final.x + final.y),
}));
assert(obj.x === 10, 'obj.x === 10');
assert(obj.y === 15, 'obj.y === 15');
assert(obj.z === 25, 'obj.z === 25');
console.log('PASS: x=%d, y=%d, z=%d', obj.x, obj.y, obj.z);

// ─── Test 7: Clash-like scenario ───────────────────────────────────
console.log('=== Test 7: Clash-like scenario ===');
const clash = applyOverlays(
    {
        proxies: ['node-hk', 'node-jp', 'node-us'],
        proxyGroups: [],
        rules: [],
        ruleProviders: {},
    },
    [
        // Module: base groups
        (final, prev) => ({
            proxyGroups: [{
                name: '手动选择',
                type: 'select',
                proxies: deferred(() => final.proxies),
            }],
        }),
        // Module: streaming
        (final, prev) => ({
            ruleProviders: {
                netflix: { type: 'http', url: 'netflix.mrs' },
            },
            proxyGroups: [{
                name: '流媒体',
                type: 'select',
                proxies: deferred(() => ['手动选择', ...final.proxies]),
            }],
            rules: ['RULE-SET,netflix,流媒体'],
        }),
        // Module: fallback
        (final, prev) => ({
            rules: ['MATCH,手动选择'],
        }),
    ],
    { merge: clashMerge }
);

assert(clash.proxyGroups.length === 2, '2 proxy groups');
assert(clash.proxyGroups[0].name === '手动选择', 'first group is 手动选择');
assert(clash.proxyGroups[0].proxies.length === 3, '手动选择 has 3 proxies');
assert(clash.proxyGroups[1].name === '流媒体', 'second group is 流媒体');
assert(clash.proxyGroups[1].proxies.length === 4, '流媒体 has 4 proxies (手动选择 + 3)');
assert(clash.rules.length === 2, '2 rules');
assert(clash.ruleProviders.netflix.url === 'netflix.mrs', 'netflix provider');
console.log('PASS: Clash-like merge works correctly');

console.log('\n✅ All 7 tests passed!');
