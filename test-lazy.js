const {
    deferred, applyOverlays, clashMerge, makeExtensible,
    mkDefault, mkForce, mkOverride,
    mkBefore, mkAfter, mkOrder,
} = require('./lib/lazy');
const { clashModuleMerge } = require('./lib/merge');

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

// ─── Test 7: Clash-like scenario with ordered arrays ────────────────
console.log('=== Test 7: Clash-like scenario ===');
const clash = applyOverlays(
    {
        proxies: ['node-hk', 'node-jp', 'node-us'],
        'proxy-groups': [],
        rules: [],
        'rule-providers': {},
    },
    [
        // Module: base groups
        (final, prev) => ({
            'proxy-groups': mkBefore([{
                name: '手动选择',
                type: 'select',
                proxies: deferred(() => final.proxies),
            }]),
        }),
        // Module: streaming
        (final, prev) => ({
            'rule-providers': {
                netflix: { type: 'http', url: 'netflix.mrs' },
            },
            'proxy-groups': mkOrder(50, [{
                name: '流媒体',
                type: 'select',
                proxies: deferred(() => ['手动选择', ...final.proxies]),
            }]),
            rules: mkOrder(50, ['RULE-SET,netflix,流媒体']),
        }),
        // Module: fallback
        (final, prev) => ({
            rules: mkAfter(['MATCH,手动选择']),
        }),
    ],
    { merge: clashModuleMerge }
);

assert(clash['proxy-groups'].length === 2, '2 proxy groups');
assert(clash['proxy-groups'][0].name === '手动选择', 'first group is 手动选择');
assert(clash['proxy-groups'][0].proxies.length === 3, '手动选择 has 3 proxies');
assert(clash['proxy-groups'][1].name === '流媒体', 'second group is 流媒体');
assert(clash['proxy-groups'][1].proxies.length === 4, '流媒体 has 4 proxies (手动选择 + 3)');
assert(clash.rules.length === 2, '2 rules');
assert(clash.rules[0] === 'RULE-SET,netflix,流媒体', 'first rule is streaming');
assert(clash.rules[1] === 'MATCH,手动选择', 'last rule is MATCH');
assert(clash['rule-providers'].netflix.url === 'netflix.mrs', 'netflix provider');
console.log('PASS: Clash-like merge works correctly');

// ─── Test 8: Scalar conflict detection ─────────────────────────────
console.log('=== Test 8: scalar conflict throws ===');
threw = false;
try {
    applyOverlays(
        { port: 7890 },
        [
            (final, prev) => ({ port: 8080 }),
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error: ' + e.message);
}
assert(threw, 'should throw on scalar conflict');
console.log('PASS: scalar conflict correctly throws');

// ─── Test 9: Same scalar value is ok ────────────────────────────────
console.log('=== Test 9: same scalar value is idempotent ===');
const r9 = applyOverlays(
    { port: 7890 },
    [
        (final, prev) => ({ port: 7890 }),
    ],
    { merge: clashModuleMerge }
);
assert(r9.port === 7890, 'port unchanged');
console.log('PASS: same scalar value ok');

// ─── Test 10: mkDefault + mkOverride allows override ────────────────
console.log('=== Test 10: mkDefault + mkOverride ===');
const r10 = applyOverlays(
    {},
    [
        (final, prev) => ({ port: mkDefault(7890) }),
        (final, prev) => ({ port: mkOverride(8080) }),
    ],
    { merge: clashModuleMerge }
);
assert(r10.port === 8080, 'mkOverride overrides mkDefault');
console.log('PASS: mkOverride overrides mkDefault: %d', r10.port);

// ─── Test 11: mkDefault + regular → error on different values ───────
console.log('=== Test 11: mkDefault + regular errors ===');
threw = false;
try {
    applyOverlays(
        {},
        [
            (final, prev) => ({ port: mkDefault(7890) }),
            (final, prev) => ({ port: 8080 }),  // regular cannot override mkDefault
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error: ' + e.message);
}
assert(threw, 'mkDefault + regular with different values should error');
console.log('PASS: mkDefault + regular errors correctly');

// ─── Test 12: mkForce + regular → error on different values ─────────
console.log('=== Test 12: mkForce + regular errors ===');
threw = false;
try {
    applyOverlays(
        { port: 7890 },
        [
            (final, prev) => ({ port: mkForce(9999) }),
            (final, prev) => ({ port: 1234 }),  // cannot differ from mkForce
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error: ' + e.message);
}
assert(threw, 'mkForce + regular with different values should error');
console.log('PASS: mkForce + regular errors correctly');

// ─── Test 13: mkForce + same value → ok ─────────────────────────────
console.log('=== Test 13: mkForce + same value ok ===');
const r13 = applyOverlays(
    {},
    [
        (final, prev) => ({ mode: mkForce("rule") }),
        (final, prev) => ({ mode: "rule" }),  // same value → ok
    ],
    { merge: clashModuleMerge }
);
assert(r13.mode === "rule", 'mkForce + same value ok');
console.log('PASS: mkForce + same value ok: %s', r13.mode);

// ─── Test 14: mkDefault kept when no override ───────────────────────
console.log('=== Test 14: mkDefault kept when no override ===');
const r14 = applyOverlays(
    {},
    [
        (final, prev) => ({ port: mkDefault(7890) }),
    ],
    { merge: clashModuleMerge }
);
assert(r14.port === 7890, 'mkDefault value kept when not overridden');
console.log('PASS: mkDefault kept: %d', r14.port);

// ─── Test 15: _metadata keys allow override ─────────────────────────
console.log('=== Test 15: _metadata keys later wins ===');
const r15 = applyOverlays(
    {},
    [
        (final, prev) => ({ _flag: "first" }),
        (final, prev) => ({ _flag: "second" }),
    ],
    { merge: clashModuleMerge }
);
assert(r15._flag === "second", '_metadata later wins');
console.log('PASS: _metadata override works');

// ─── Test 16: mkBefore / mkAfter / mkOrder ordering ─────────────────
console.log('=== Test 16: mkBefore/mkAfter/mkOrder ordering ===');
const r16 = applyOverlays(
    { items: [] },
    [
        (final, prev) => ({ items: ['D'] }),              // default order 100
        (final, prev) => ({ items: mkBefore(['A']) }),     // order 0
        (final, prev) => ({ items: mkAfter(['F']) }),      // order 10000
        (final, prev) => ({ items: mkOrder(30, ['B']) }),  // order 30
        (final, prev) => ({ items: mkOrder(50, ['C']) }),  // order 50
        (final, prev) => ({ items: mkOrder(200, ['E']) }), // order 200
    ],
    { merge: clashModuleMerge }
);
assert(JSON.stringify(r16.items) === '["A","B","C","D","E","F"]',
    'ordered: ' + JSON.stringify(r16.items));
console.log('PASS: items ordered correctly: %j', r16.items);

// ─── Test 17: Mixed array with ordered wrappers ─────────────────────
console.log('=== Test 17: mixed array with ordered wrappers ===');
const r17 = applyOverlays(
    { rules: [] },
    [
        (final, prev) => ({
            rules: [
                mkOrder(90, ['rule-late']),
                mkAfter(['MATCH']),
            ],
        }),
        (final, prev) => ({
            rules: mkOrder(10, ['rule-early']),
        }),
    ],
    { merge: clashModuleMerge }
);
assert(r17.rules[0] === 'rule-early', 'first is rule-early');
assert(r17.rules[1] === 'rule-late', 'second is rule-late');
assert(r17.rules[2] === 'MATCH', 'last is MATCH');
console.log('PASS: mixed ordered array: %j', r17.rules);

// ─── Test 18: mkOverride + mkOverride with different values → error ──
console.log('=== Test 18: mkOverride + mkOverride conflict ===');
threw = false;
try {
    applyOverlays(
        {},
        [
            (final, prev) => ({ port: mkOverride(100) }),
            (final, prev) => ({ port: mkOverride(200) }),
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error');
}
assert(threw, 'mkOverride + mkOverride with different values should error');
console.log('PASS: mkOverride + mkOverride conflict errors');

// ─── Test 19: mkForce + mkOverride with different values → error ─────
console.log('=== Test 19: mkForce + mkOverride conflict ===');
threw = false;
try {
    applyOverlays(
        {},
        [
            (final, prev) => ({ mode: mkForce("rule") }),
            (final, prev) => ({ mode: mkOverride("direct") }),
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error');
}
assert(threw, 'mkForce + mkOverride with different values should error');
console.log('PASS: mkForce + mkOverride conflict errors');

// ─── Test 20: mkForce + mkDefault with different values → error ──────
console.log('=== Test 20: mkForce + mkDefault conflict ===');
threw = false;
try {
    applyOverlays(
        {},
        [
            (final, prev) => ({ mode: mkForce("rule") }),
            (final, prev) => ({ mode: mkDefault("direct") }),
        ],
        { merge: clashModuleMerge }
    );
} catch (e) {
    threw = true;
    assert(e.message.includes('Scalar conflict'), 'correct error');
}
assert(threw, 'mkForce + mkDefault with different values should error');
console.log('PASS: mkForce + mkDefault conflict errors');

console.log('\n✅ All 20 tests passed!');
