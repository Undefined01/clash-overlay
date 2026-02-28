// tests/integration.test.js — Integration tests: full override pipeline
import { describe, it, expect } from 'vitest';
import { parseArgs, mergeList } from '../src/lib/helpers.js';
import { mergeModules, cleanup } from '../src/lib/merge.js';
import { deferred, mkBefore, mkAfter, mkOrder, mkDefault, mkForce     } from '../src/lib/lazy.js';
import {
    GROUP_COMMON, PRIMITIVE_GROUPS,
    trafficGroup, generalGroup, rulesetRule, dustinRule,
    miniIcon, qureIcon,
} from '../src/lib/clash.js';

// ─── Minimal fixture modules for integration testing ────────────────

function fixture_general(final, prev, ctx) {
    return {
        mode: 'rule',
        ipv6: ctx.args.ipv6Enabled,
    };
}

function fixture_baseGroups(final, prev, ctx) {
    const proxies = ctx.config.proxies.map(p => p.name);
    return {
        _proxies: proxies,
        _allSelectables: ['手动选择', ...proxies, ...PRIMITIVE_GROUPS],
        'proxy-groups': mkBefore([
            generalGroup(final, {
                name: '手动选择',
                proxies: [...proxies, ...PRIMITIVE_GROUPS],
                icon: miniIcon('Static'),
            }),
        ]),
    };
}

function fixture_traffic(final, prev, ctx) {
    const { name: rp_name, provider: rp } = dustinRule('ai');
    return {
        'proxy-groups': mkOrder(60, [
            trafficGroup(final, 'AI', {
                defaultProxy: '手动选择',
                icon: qureIcon('Bot'),
            }),
        ]),
        'rule-providers': { [rp_name]: rp },
        rules: mkOrder(60, [rulesetRule(rp_name, 'AI')]),
    };
}

function fixture_fallback(final, prev, ctx) {
    return {
        rules: mkAfter(['MATCH,手动选择']),
    };
}

function fixture_domestic(final, prev, ctx) {
    const { name, provider } = dustinRule('domestic');
    return {
        'rule-providers': { [name]: provider },
        rules: mkOrder(40, [rulesetRule(name, 'DIRECT')]),
    };
}

// ─── Integration: full pipeline ─────────────────────────────────────

describe('Full override pipeline', () => {
    const config = {
        proxies: [
            { name: 'HK-1', server: '1.2.3.4' },
            { name: 'US-1', server: '5.6.7.8' },
            { name: 'JP-1', server: '9.0.1.2' },
        ],
    };
    const args = parseArgs({});
    const ctx = { args, config };

    const modules = [
        fixture_general,
        fixture_baseGroups,
        fixture_traffic,
        fixture_domestic,
        fixture_fallback,
    ];

    let result;

    it('merges without error', () => {
        result = cleanup(mergeModules(modules, ctx));
        expect(result).toBeDefined();
    });

    it('scalar fields are set', () => {
        expect(result.mode).toBe('rule');
        expect(result.ipv6).toBe(false);
    });

    it('proxy-groups: mkBefore base groups come first', () => {
        const names = result['proxy-groups'].map(g => g.name);
        expect(names[0]).toBe('手动选择');
    });

    it('proxy-groups: traffic groups present after base groups', () => {
        const names = result['proxy-groups'].map(g => g.name);
        expect(names).toContain('AI');
        expect(names.indexOf('手动选择')).toBeLessThan(names.indexOf('AI'));
    });

    it('deferred proxies are resolved in proxy groups', () => {
        const aiGroup = result['proxy-groups'].find(g => g.name === 'AI');
        expect(Array.isArray(aiGroup.proxies)).toBe(true);
        expect(aiGroup.proxies.length).toBeGreaterThan(0);
        // AI group should have 手动选择 first (defaultProxy)
        expect(aiGroup.proxies[0]).toBe('手动选择');
    });

    it('rules are ordered: domestic before fallback (MATCH last)', () => {
        const matchIdx = result.rules.findIndex(r => r.startsWith('MATCH'));
        const domesticIdx = result.rules.findIndex(r => r.includes('domestic'));
        expect(domesticIdx).toBeLessThan(matchIdx);
        expect(matchIdx).toBe(result.rules.length - 1);
    });

    it('rule-providers are present and merged', () => {
        expect(result['rule-providers']).toHaveProperty('ai');
        expect(result['rule-providers']).toHaveProperty('domestic');
        expect(result['rule-providers'].ai.type).toBe('http');
    });

    it('cleanup removes _* metadata keys', () => {
        expect(result).not.toHaveProperty('_proxies');
        expect(result).not.toHaveProperty('_allSelectables');
    });

    it('all icon URLs are valid http(s)', () => {
        for (const g of result['proxy-groups']) {
            if (g.icon) {
                expect(g.icon).toMatch(/^https?:\/\//);
            }
        }
    });

    it('no duplicate proxy group names', () => {
        const names = result['proxy-groups'].map(g => g.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('no duplicate rules', () => {
        expect(new Set(result.rules).size).toBe(result.rules.length);
    });

    it('proxies are preserved from original config', () => {
        expect(result.proxies).toEqual(config.proxies);
    });
});

// ─── Integration: argument parsing flows through ────────────────────

describe('Argument propagation', () => {
    it('ipv6Enabled=true flows through', () => {
        const args = parseArgs({ ipv6Enabled: 'true' });
        const ctx = { args, config: { proxies: [] } };
        const result = cleanup(mergeModules([fixture_general], ctx));
        expect(result.ipv6).toBe(true);
    });
});

// ─── Integration: rule-provider conflict detection ──────────────────

describe('Rule-provider conflict', () => {
    it('throws when two modules define same rule-provider key', () => {
        const mod1 = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        const mod2 = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        expect(() =>
            mergeModules([mod1, mod2], { args: {}, config: { proxies: [] } })
        ).toThrow(/Rule provider key conflict: "proxy"/);
    });
});

// ─── Integration: mergeList utility in module context ───────────────

describe('mergeList in module context', () => {
    it('conditionally builds rules list', () => {
        const enableSsh = true;
        const enablePrivate = false;

        const rules = mergeList(
            enableSsh && 'DST-PORT,22,SSH',
            enablePrivate && 'GEOSITE,private,DIRECT',
            'MATCH,PROXY'
        );

        expect(rules).toEqual(['DST-PORT,22,SSH', 'MATCH,PROXY']);
    });
});
