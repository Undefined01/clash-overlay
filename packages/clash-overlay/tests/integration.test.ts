// tests/integration.test.ts — Full override pipeline integration tests
import { describe, it, expect } from 'vitest';
import { parseArgs, mergeList } from '../src/lib/helpers.js';
import { mergeModules, cleanup } from '../src/lib/merge.js';
import {
    deferred, mkBefore, mkAfter, mkOrder, mkDefault, mkForce,
} from 'liboverlay';
import {
    GROUP_COMMON, PRIMITIVE_GROUPS,
    trafficGroup, generalGroup, rulesetRule, dustinRule,
    miniIcon, qureIcon,
} from '../src/lib/clash.js';

// ─── Minimal fixture modules ────────────────────────────────────────

function fixture_general(
    _final: Record<string, unknown>,
    _prev: Record<string, unknown>,
    ctx: { args: Record<string, unknown> },
): Record<string, unknown> {
    return {
        mode: 'rule',
        ipv6: ctx.args.ipv6Enabled as boolean,
    };
}

function fixture_baseGroups(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
    ctx: { config: { proxies: Array<{ name: string }> } },
): Record<string, unknown> {
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

function fixture_traffic(
    final: Record<string, unknown>,
    _prev: Record<string, unknown>,
): Record<string, unknown> {
    const { name: rpName, provider: rp } = dustinRule('ai');
    return {
        'proxy-groups': mkOrder(900, [
            trafficGroup(final, 'AI', {
                defaultProxy: '手动选择',
                icon: qureIcon('Bot'),
            }),
        ]),
        'rule-providers': { [rpName]: rp },
        rules: mkOrder(900, [rulesetRule(rpName, 'AI')]),
    };
}

function fixture_fallback(): Record<string, unknown> {
    return {
        rules: mkAfter(['MATCH,手动选择']),
    };
}

function fixture_domestic(): Record<string, unknown> {
    const { name, provider } = dustinRule('domestic');
    return {
        'rule-providers': { [name]: provider },
        rules: mkOrder(800, [rulesetRule(name, 'DIRECT')]),
    };
}

// ─── Full pipeline ──────────────────────────────────────────────────

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

    let result: Record<string, unknown>;

    it('merges without error', () => {
        result = cleanup(mergeModules(modules, ctx));
        expect(result).toBeDefined();
    });

    it('scalar fields are set', () => {
        expect(result.mode).toBe('rule');
        expect(result.ipv6).toBe(false);
    });

    it('proxy-groups: mkBefore base groups come first', () => {
        const groups = result['proxy-groups'] as Array<{ name: string }>;
        expect(groups[0].name).toBe('手动选择');
    });

    it('proxy-groups: traffic groups present after base', () => {
        const names = (result['proxy-groups'] as Array<{ name: string }>).map(g => g.name);
        expect(names).toContain('AI');
        expect(names.indexOf('手动选择')).toBeLessThan(names.indexOf('AI'));
    });

    it('deferred proxies are resolved', () => {
        const groups = result['proxy-groups'] as Array<{ name: string; proxies: string[] }>;
        const aiGroup = groups.find(g => g.name === 'AI')!;
        expect(Array.isArray(aiGroup.proxies)).toBe(true);
        expect(aiGroup.proxies[0]).toBe('手动选择');
    });

    it('rules ordered: domestic before MATCH (MATCH last)', () => {
        const rules = result.rules as string[];
        const matchIdx = rules.findIndex(r => r.startsWith('MATCH'));
        const domesticIdx = rules.findIndex(r => r.includes('domestic'));
        expect(domesticIdx).toBeLessThan(matchIdx);
        expect(matchIdx).toBe(rules.length - 1);
    });

    it('rule-providers are merged', () => {
        const rp = result['rule-providers'] as Record<string, unknown>;
        expect(rp).toHaveProperty('ai');
        expect(rp).toHaveProperty('domestic');
    });

    it('cleanup removes _* metadata', () => {
        expect(result).not.toHaveProperty('_proxies');
        expect(result).not.toHaveProperty('_allSelectables');
    });

    it('all icon URLs are valid http(s)', () => {
        for (const g of result['proxy-groups'] as Array<{ icon?: string }>) {
            if (g.icon) expect(g.icon).toMatch(/^https?:\/\//);
        }
    });

    it('no duplicate proxy group names', () => {
        const names = (result['proxy-groups'] as Array<{ name: string }>).map(g => g.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('no duplicate rules', () => {
        const rules = result.rules as string[];
        expect(new Set(rules).size).toBe(rules.length);
    });

    it('proxies preserved from config', () => {
        expect(result.proxies).toEqual(config.proxies);
    });
});

// ─── Priority integration ───────────────────────────────────────────

describe('Priority in full pipeline', () => {
    it('mkDefault overridden by bare value', () => {
        const mod1 = () => ({ port: mkDefault(7890) });
        const mod2 = () => ({ port: 1080 });
        const result = cleanup(mergeModules([mod1, mod2], {
            args: {},
            config: { proxies: [] },
        }));
        expect(result.port).toBe(1080);
    });

    it('mkForce wins over bare value', () => {
        const mod1 = () => ({ port: 7890 });
        const mod2 = () => ({ port: mkForce(1080) });
        const result = cleanup(mergeModules([mod1, mod2], {
            args: {},
            config: { proxies: [] },
        }));
        expect(result.port).toBe(1080);
    });
});

// ─── Argument propagation ───────────────────────────────────────────

describe('Argument propagation', () => {
    it('ipv6Enabled=true flows through', () => {
        const args = parseArgs({ ipv6Enabled: 'true' });
        const ctx = { args, config: { proxies: [] as Array<{ name: string }> } };
        const result = cleanup(mergeModules([fixture_general], ctx));
        expect(result.ipv6).toBe(true);
    });
});

// ─── Rule-provider conflict detection ───────────────────────────────

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
            mergeModules([mod1, mod2], { args: {}, config: { proxies: [] } }),
        ).toThrow(/Unique-key conflict in "rule-providers": sub-key "proxy"/);
    });
});

// ─── mergeList in module context ────────────────────────────────────

describe('mergeList in module context', () => {
    it('conditionally builds rules list', () => {
        const enableSsh = true;
        const enablePrivate = false;

        const rules = mergeList(
            enableSsh && 'DST-PORT,22,SSH',
            enablePrivate && 'GEOSITE,private,DIRECT',
            'MATCH,PROXY',
        );

        expect(rules).toEqual(['DST-PORT,22,SSH', 'MATCH,PROXY']);
    });
});
