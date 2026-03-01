// tests/integration.test.ts — Full override pipeline integration tests
import { describe, it, expect } from 'vitest';
import { mergeList } from '../src/lib/helpers.js';
import { mergeModules, cleanup, buildModuleContext } from '../src/lib/merge.js';
import { getSubstoreContext } from '../src/lib/substore-context.js';
import {
    mkBefore, mkAfter, mkOrder, mkDefault, mkForce,
} from 'libmodule';
import {
    PRIMITIVE_GROUPS,
    trafficGroup, generalGroup, rulesetRule, dustinRule,
    miniIcon, qureIcon,
} from '../src/lib/clash.js';

// ─── Minimal fixture modules ────────────────────────────────────────

function fixture_general(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const ctx = getSubstoreContext(config);
    const ipv6 = ctx.arguments.get('ipv6Enabled') === 'true';
    return {
        mode: 'rule',
        ipv6,
    };
}

function fixture_baseGroups(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const proxies = (config.proxies as Array<{ name?: unknown }>)
        .map(p => String(p.name || ''))
        .filter(Boolean);
    return {
        _proxies: proxies,
        _allSelectables: ['手动选择', ...proxies, ...PRIMITIVE_GROUPS],
        'proxy-groups': mkBefore([
            generalGroup(config, {
                name: '手动选择',
                proxies: [...proxies, ...PRIMITIVE_GROUPS],
                icon: miniIcon('Static'),
            }),
        ]),
    };
}

function fixture_traffic(
    config: Record<string, unknown>,
): Record<string, unknown> {
    const { name: rpName, provider: rp } = dustinRule('ai');
    return {
        'proxy-groups': mkOrder(900, [
            trafficGroup(config, 'AI', {
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

async function runModules(
    modules: Array<(config: Record<string, unknown>) => Record<string, unknown>>,
    config: { proxies: Array<{ name: string; [key: string]: unknown }> },
    rawArgs: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
    const argumentsMap = new Map<string, string>(
        Object.entries(rawArgs).map(([k, v]) => [k, String(v)]),
    );
    return cleanup(await mergeModules(
        modules,
        config,
        buildModuleContext({ arguments: argumentsMap, rawArguments: rawArgs }),
    ));
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

    const modules = [
        fixture_general,
        fixture_baseGroups,
        fixture_traffic,
        fixture_domestic,
        fixture_fallback,
    ];

    let result: Record<string, unknown>;

    it('merges without error', async () => {
        result = await runModules(modules, config);
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
    it('mkDefault overridden by bare value', async () => {
        const mod1 = () => ({ port: mkDefault(7890) });
        const mod2 = () => ({ port: 1080 });
        const result = await runModules([mod1, mod2], { proxies: [] });
        expect(result.port).toBe(1080);
    });

    it('mkForce wins over bare value', async () => {
        const mod1 = () => ({ port: 7890 });
        const mod2 = () => ({ port: mkForce(1080) });
        const result = await runModules([mod1, mod2], { proxies: [] });
        expect(result.port).toBe(1080);
    });
});

// ─── Argument propagation ───────────────────────────────────────────

describe('Argument propagation', () => {
    it('ipv6Enabled=true flows through', async () => {
        const result = await runModules(
            [fixture_general],
            { proxies: [] as Array<{ name: string }> },
            { ipv6Enabled: 'true' },
        );
        expect(result.ipv6).toBe(true);
    });
});

// ─── Rule-provider conflict detection ───────────────────────────────

describe('Rule-provider conflict', () => {
    it('throws when two modules define same rule-provider key', async () => {
        const mod1 = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        const mod2 = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        await expect(runModules([mod1, mod2], { proxies: [] }))
            .rejects
            .toThrow(/Unique-key conflict in "rule-providers": sub-key "proxy"/);
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
