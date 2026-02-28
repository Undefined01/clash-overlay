// tests/clash.test.js — Comprehensive tests for src/lib/clash.js
import { describe, it, expect, vi } from 'vitest';
import {
    getGithub,
    miniIcon,
    qureIcon,
    externalIcon,
    makeRuleProvider,
    dustinRule,
    rulesetRule,
    GROUP_COMMON,
    PRIMITIVE_GROUPS,
    reorderProxies,
    trafficGroup,
    generalGroup,
} from '../src/lib/clash.js';
import { isDeferred, resolveDeferred } from '../src/lib/lazy.js';

// ─── URL / Icon Helpers ─────────────────────────────────────────────

describe('getGithub', () => {
    it('constructs a jsdelivr URL', () => {
        expect(getGithub('owner', 'repo', 'main', 'path/file.txt'))
            .toBe('https://fastly.jsdelivr.net/gh/owner/repo@main/path/file.txt');
    });
});

describe('miniIcon', () => {
    it('returns Orz-3/mini icon URL', () => {
        const url = miniIcon('Proxy');
        expect(url).toContain('Orz-3/mini');
        expect(url).toContain('Color/Proxy.png');
    });
});

describe('qureIcon', () => {
    it('returns Koolson/Qure icon URL', () => {
        const url = qureIcon('Streaming');
        expect(url).toContain('Koolson/Qure');
        expect(url).toContain('IconSet/Color/Streaming.png');
    });
});

describe('externalIcon', () => {
    it('returns icons8 URL with given id', () => {
        expect(externalIcon('abc123')).toBe(
            'https://img.icons8.com/?size=100&id=abc123&format=png&color=000000'
        );
    });
});

// ─── Ruleset Helpers ────────────────────────────────────────────────

describe('makeRuleProvider', () => {
    it('creates .mrs rule provider with ipcidr behavior for *ip names', () => {
        const { name, provider } = makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/telegramip.mrs'
        );
        expect(name).toBe('telegramip');
        expect(provider.format).toBe('mrs');
        expect(provider.behavior).toBe('ipcidr');
        expect(provider.type).toBe('http');
        expect(provider.interval).toBe(86400);
        expect(provider.url).toContain('Owner/Repo@main/rules/telegramip.mrs');
        expect(provider.path).toBe('./ruleset/Owner/telegramip.mrs');
    });

    it('creates .mrs provider with domain behavior for non-ip names', () => {
        const { name, provider } = makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/google.mrs'
        );
        expect(name).toBe('google');
        expect(provider.behavior).toBe('domain');
    });

    it('creates .yaml provider with classical behavior', () => {
        const { name, provider } = makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/custom.yaml'
        );
        expect(name).toBe('custom');
        expect(provider.format).toBe('yaml');
        expect(provider.behavior).toBe('classical');
    });

    it('creates .list provider with text format + classical behavior', () => {
        const { name, provider } = makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/mylist.list'
        );
        expect(name).toBe('mylist');
        expect(provider.format).toBe('text');
        expect(provider.behavior).toBe('classical');
    });

    it('throws on unsupported format', () => {
        expect(() => makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/bad.json'
        )).toThrow(/Unsupported ruleset format/);
    });

    it('applies overrides', () => {
        const { provider } = makeRuleProvider(
            'Owner', 'Repo', 'main', 'rules/test.mrs',
            { interval: 3600, extra: true }
        );
        expect(provider.interval).toBe(3600);
        expect(provider.extra).toBe(true);
    });

    it('handles hyphenated and underscored filenames', () => {
        const { name } = makeRuleProvider('O', 'R', 'b', 'dir/my-rule_set.mrs');
        expect(name).toBe('my-rule_set');
    });
});

describe('dustinRule', () => {
    it('creates a DustinWin .mrs rule provider', () => {
        const { name, provider } = dustinRule('proxy');
        expect(name).toBe('proxy');
        expect(provider.url).toContain('DustinWin/ruleset_geodata');
        expect(provider.url).toContain('proxy.mrs');
        expect(provider.format).toBe('mrs');
    });
});

describe('rulesetRule', () => {
    it('creates basic RULE-SET string', () => {
        expect(rulesetRule('provider', 'PROXY'))
            .toBe('RULE-SET,provider,PROXY');
    });

    it('appends options', () => {
        expect(rulesetRule('provider', 'PROXY', 'no-resolve'))
            .toBe('RULE-SET,provider,PROXY,no-resolve');
    });

    it('supports multiple options', () => {
        expect(rulesetRule('p', 'G', 'no-resolve', 'src'))
            .toBe('RULE-SET,p,G,no-resolve,src');
    });
});

// ─── Proxy Group Constants ──────────────────────────────────────────

describe('GROUP_COMMON', () => {
    it('has required default fields', () => {
        expect(GROUP_COMMON.type).toBe('select');
        expect(GROUP_COMMON.url).toBe('https://www.gstatic.com/generate_204');
        expect(GROUP_COMMON.interval).toBe(300);
        expect(GROUP_COMMON.tolerance).toBe(50);
        expect(GROUP_COMMON['max-failed-times']).toBe(2);
    });
});

describe('PRIMITIVE_GROUPS', () => {
    it('contains DIRECT and REJECT', () => {
        expect(PRIMITIVE_GROUPS).toEqual(['DIRECT', 'REJECT']);
    });
});

// ─── reorderProxies ─────────────────────────────────────────────────

describe('reorderProxies', () => {
    it('moves defaultProxy to front', () => {
        expect(reorderProxies(['a', 'b', 'c'], 'b'))
            .toEqual(['b', 'a', 'c']);
    });

    it('no-op when defaultProxy is already first', () => {
        expect(reorderProxies(['a', 'b'], 'a'))
            .toEqual(['a', 'b']);
    });

    it('prepends defaultProxy even if not in original list', () => {
        expect(reorderProxies(['a', 'b'], 'x'))
            .toEqual(['x', 'a', 'b']);
    });

    it('returns copy without mutating input', () => {
        const original = ['a', 'b', 'c'];
        reorderProxies(original, 'c');
        expect(original).toEqual(['a', 'b', 'c']);
    });

    it('returns copy when no defaultProxy', () => {
        expect(reorderProxies(['a', 'b'], null))
            .toEqual(['a', 'b']);
    });
});

// ─── trafficGroup ───────────────────────────────────────────────────

describe('trafficGroup', () => {
    it('creates group with deferred proxies from _allSelectables', () => {
        const final = { _allSelectables: ['HK', 'US', 'JP'] };
        const group = trafficGroup(final, 'Streaming', {
            defaultProxy: 'US',
            icon: 'http://icon.png',
        });

        expect(group.name).toBe('Streaming');
        expect(group.icon).toBe('http://icon.png');
        expect(group.type).toBe('select'); // from GROUP_COMMON
        expect(isDeferred(group.proxies)).toBe(true);

        const resolved = resolveDeferred(group.proxies);
        expect(resolved).toEqual(['US', 'HK', 'JP']);
    });

    it('spreads additional overrides', () => {
        const final = { _allSelectables: [] };
        const group = trafficGroup(final, 'Test', {
            defaultProxy: null,
            icon: '',
            type: 'url-test',
            tolerance: 100,
        });
        expect(group.type).toBe('url-test');
        expect(group.tolerance).toBe(100);
    });
});

// ─── generalGroup ───────────────────────────────────────────────────

describe('generalGroup', () => {
    it('creates group with deferred proxies from _proxies', () => {
        const final = { _proxies: ['proxy1', 'proxy2'] };
        const group = generalGroup(final, { name: 'Manual' });

        expect(group.name).toBe('Manual');
        expect(isDeferred(group.proxies)).toBe(true);
        expect(resolveDeferred(group.proxies)).toEqual(['proxy1', 'proxy2']);
    });

    it('uses explicit proxies when provided', () => {
        const final = { _proxies: ['should-not-see'] };
        const group = generalGroup(final, {
            name: 'Custom',
            proxies: ['a', 'b'],
        });
        expect(group.proxies).toEqual(['a', 'b']);
    });

    it('spreads additional overrides', () => {
        const final = { _proxies: [] };
        const group = generalGroup(final, {
            name: 'UrlTest',
            type: 'url-test',
            interval: 600,
        });
        expect(group.type).toBe('url-test');
        expect(group.interval).toBe(600);
    });
});
