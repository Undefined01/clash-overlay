// tests/integration.test.ts — Full override pipeline integration tests
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { mergeList } from '../src/lib/helpers.js';
import {
    mkBefore, mkAfter, mkOrder, mkDefault, mkForce,
    evalModules,
    defer,
} from 'libmodule';
import type { ModuleFn } from 'libmodule';
import {
    PRIMITIVE_GROUPS,
    trafficGroup, generalGroup, rulesetRule, dustinRule,
    miniIcon, qureIcon,
} from '../src/lib/clash.js';
import overrideMain from '../src/entrypoints/override.js';
import type { ClashMetaConfig } from '../src/types/clash_meta_config.js';

// ─── Minimal fixture modules ────────────────────────────────────────

const fixture_general: ModuleFn = ({ config }) => ({
    mode: 'rule',
    ipv6: defer(() => {
        const ctx = config._ctx as any;
        return !!ctx.arguments?.ipv6Enabled;
    }),
});

const fixture_baseGroups: ModuleFn = ({ config }) => {
    return {
        'proxy-groups': mkBefore([
            generalGroup(config, {
                name: '手动选择',
                proxies: defer(() => {
                    const proxies = ((config.proxies as Array<{ name?: unknown }>) || [])
                        .map(p => String(p.name || ''))
                        .filter(Boolean);
                    return [...proxies, ...PRIMITIVE_GROUPS];
                }),
                icon: miniIcon('Static'),
            }),
        ]),
    };
};

const fixture_traffic: ModuleFn = ({ config }) => {
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
};

const fixture_fallback: ModuleFn = () => ({
    rules: mkAfter(['MATCH,手动选择']),
});

const fixture_domestic: ModuleFn = () => {
    const { name, provider } = dustinRule('domestic');
    return {
        'rule-providers': { [name]: provider },
        rules: mkOrder(800, [rulesetRule(name, 'DIRECT')]),
    };
};

function stripMetadata(obj: Record<string, unknown>, prefix = '_'): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key.startsWith(prefix)) continue;
        if (value === undefined) continue;
        if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
        result[key] = value;
    }
    return result;
}

function runModules(
    modules: ModuleFn[],
    config: { proxies: Array<{ name: string;[key: string]: unknown }> },
    rawArgs: Record<string, unknown> = {},
): Record<string, unknown> {
    // Pre-compute proxy names from base config (not from config proxy)
    const proxyNames = config.proxies
        .map(p => String(p.name || ''))
        .filter(Boolean);

    return stripMetadata(evalModules(
        {
            ...config,
            _ctx: { arguments: rawArgs },
            // Pre-set concrete values that modules can use eagerly
            _proxies: proxyNames,
            _allSelectables: ['手动选择', ...proxyNames, ...PRIMITIVE_GROUPS],
        },
        modules,
    ));
}

function runOverride(config: ClashMetaConfig): Record<string, unknown> {
    return stripMetadata(overrideMain(config) as unknown as Record<string, unknown>);
}

const sampleOverrideConfig: ClashMetaConfig = {
    proxies: [
        {
            name: 'HK Transit 01',
            type: 'ss',
            server: 'hk.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'password-hk',
            udp: true,
            _nodeInfo: { countryCode: 'HK', tags: ['中转'] },
        },
        {
            name: 'US Landing 01',
            type: 'ss',
            server: 'us.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'password-us',
            udp: true,
            _nodeInfo: { countryCode: 'US', tags: ['落地'] },
        },
        {
            name: 'SG Home 01',
            type: 'ss',
            server: 'sg.example.com',
            port: 443,
            cipher: 'aes-128-gcm',
            password: 'password-sg',
            udp: true,
            _nodeInfo: { countryCode: 'SG', tags: ['家宽'] },
        },
        {
            name: 'JP Forward 01',
            type: 'ss',
            server: 'jp.example.com',
            port: 8443,
            cipher: 'aes-256-gcm',
            password: 'password-jp',
            udp: true,
            _nodeInfo: { countryCode: 'JP', tags: [] },
        },
    ],
};

// ─── Full pipeline ──────────────────────────────────────────────────

describe('Full override pipeline', () => {
    const config = {
        proxies: [
            { name: 'HK-1', server: '1.2.3.4' },
            { name: 'US-1', server: '5.6.7.8' },
            { name: 'JP-1', server: '9.0.1.2' },
        ],
    };

    const modules: ModuleFn[] = [
        fixture_general,
        fixture_baseGroups,
        fixture_traffic,
        fixture_domestic,
        fixture_fallback,
    ];

    let result: Record<string, unknown>;

    it('merges without error', () => {
        result = runModules(modules, config);
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
        const mod1: ModuleFn = () => ({ port: mkDefault(7890) });
        const mod2: ModuleFn = () => ({ port: 1080 });
        const result = runModules([mod1, mod2], { proxies: [] });
        expect(result.port).toBe(1080);
    });

    it('mkForce wins over bare value', () => {
        const mod1: ModuleFn = () => ({ port: 7890 });
        const mod2: ModuleFn = () => ({ port: mkForce(1080) });
        const result = runModules([mod1, mod2], { proxies: [] });
        expect(result.port).toBe(1080);
    });
});

// ─── Argument propagation ───────────────────────────────────────────

describe('Argument propagation', () => {
    it('ipv6Enabled=true flows through', () => {
        const result = runModules(
            [fixture_general],
            { proxies: [] as Array<{ name: string }> },
            { ipv6Enabled: 'true' },
        );
        expect(result.ipv6).toBe(true);
    });
});

// ─── Rule-provider conflict detection ───────────────────────────────

describe('Rule-provider conflict', () => {
    it('same rule-provider is idempotent', () => {
        const mod1: ModuleFn = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        const mod2: ModuleFn = () => {
            const { name, provider } = dustinRule('proxy');
            return { 'rule-providers': { [name]: provider } };
        };
        const { name, provider } = dustinRule('proxy');
        const result = runModules([mod1, mod2], { proxies: [] });
        expect(result['rule-providers']).toStrictEqual({ [name]: provider });
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

describe('override.ts full output', () => {
    it('matches the reference config for the sample proxies', () => {
        const result = runOverride(sampleOverrideConfig);
        const actual = JSON.stringify(result, null, 2);
        const expectedUrl = new URL('./fixtures/override-full.expected.json', import.meta.url);

        if (process.env.UPDATE_OVERRIDE_FIXTURE === '1') {
            writeFileSync(expectedUrl, `${actual}\n`);
        }

        const expected = readFileSync(expectedUrl, 'utf8').trimEnd();

        expect(actual).toBe(expected);
    });
});
