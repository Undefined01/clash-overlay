// tests/clash.test.ts — Tests for Clash helpers
import { describe, it, expect } from 'vitest';
import {
    getGithub, miniIcon, qureIcon, externalIcon,
    makeRuleProvider, dustinRule, rulesetRule,
    GROUP_COMMON, PRIMITIVE_GROUPS,
    reorderProxies, trafficGroup, generalGroup,
} from '../src/lib/clash.js';
import { isDeferred, resolveDeferred } from 'liboverlay';

// ─── URL / Icon Helpers ─────────────────────────────────────────────

describe('getGithub', () => {
    it('constructs a jsdelivr URL', () => {
        expect(getGithub('owner', 'repo', 'main', 'path/file.txt'))
            .toBe('https://fastly.jsdelivr.net/gh/owner/repo@main/path/file.txt');
    });
});

describe('icon helpers', () => {
    it('miniIcon returns Orz-3/mini URL', () => {
        expect(miniIcon('Proxy')).toContain('Orz-3/mini');
        expect(miniIcon('Proxy')).toContain('Color/Proxy.png');
    });

    it('qureIcon returns Koolson/Qure URL', () => {
        expect(qureIcon('Streaming')).toContain('Koolson/Qure');
    });

    it('externalIcon returns icons8 URL', () => {
        expect(externalIcon('abc')).toBe(
            'https://img.icons8.com/?size=100&id=abc&format=png&color=000000',
        );
    });
});

// ─── Ruleset Helpers ────────────────────────────────────────────────

describe('makeRuleProvider', () => {
    it('creates .mrs provider with ipcidr behavior for *ip names', () => {
        const { name, provider } = makeRuleProvider('O', 'R', 'main', 'rules/telegramip.mrs');
        expect(name).toBe('telegramip');
        expect(provider.format).toBe('mrs');
        expect(provider.behavior).toBe('ipcidr');
        expect(provider.type).toBe('http');
    });

    it('creates .mrs provider with domain behavior for non-ip names', () => {
        const { name, provider } = makeRuleProvider('O', 'R', 'main', 'rules/google.mrs');
        expect(name).toBe('google');
        expect(provider.behavior).toBe('domain');
    });

    it('creates .yaml provider with classical behavior', () => {
        const { provider } = makeRuleProvider('O', 'R', 'main', 'rules/custom.yaml');
        expect(provider.format).toBe('yaml');
        expect(provider.behavior).toBe('classical');
    });

    it('creates .list provider', () => {
        const { provider } = makeRuleProvider('O', 'R', 'main', 'rules/mylist.list');
        expect(provider.format).toBe('text');
        expect(provider.behavior).toBe('classical');
    });

    it('throws on unsupported format', () => {
        expect(() => makeRuleProvider('O', 'R', 'main', 'rules/bad.json')).toThrow(/Unsupported/);
    });

    it('applies overrides', () => {
        const { provider } = makeRuleProvider('O', 'R', 'main', 'rules/test.mrs', { interval: 3600 });
        expect(provider.interval).toBe(3600);
    });
});

describe('dustinRule', () => {
    it('creates a DustinWin .mrs rule provider', () => {
        const { name, provider } = dustinRule('proxy');
        expect(name).toBe('proxy');
        expect(provider.url).toContain('DustinWin/ruleset_geodata');
    });
});

describe('rulesetRule', () => {
    it('creates basic RULE-SET string', () => {
        expect(rulesetRule('provider', 'PROXY')).toBe('RULE-SET,provider,PROXY');
    });

    it('appends options', () => {
        expect(rulesetRule('p', 'G', 'no-resolve')).toBe('RULE-SET,p,G,no-resolve');
    });

    it('supports multiple options', () => {
        expect(rulesetRule('p', 'G', 'no-resolve', 'src')).toBe('RULE-SET,p,G,no-resolve,src');
    });
});

// ─── Proxy Group Constants ──────────────────────────────────────────

describe('GROUP_COMMON', () => {
    it('has default fields', () => {
        expect(GROUP_COMMON.type).toBe('select');
        expect(GROUP_COMMON.url).toBe('https://www.gstatic.com/generate_204');
        expect(GROUP_COMMON.interval).toBe(300);
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
        expect(reorderProxies(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    });

    it('no-op when already first', () => {
        expect(reorderProxies(['a', 'b'], 'a')).toEqual(['a', 'b']);
    });

    it('prepends if not in list', () => {
        expect(reorderProxies(['a', 'b'], 'x')).toEqual(['x', 'a', 'b']);
    });

    it('returns copy without mutating', () => {
        const original = ['a', 'b', 'c'];
        reorderProxies(original, 'c');
        expect(original).toEqual(['a', 'b', 'c']);
    });

    it('returns copy when null defaultProxy', () => {
        expect(reorderProxies(['a', 'b'], null)).toEqual(['a', 'b']);
    });
});

// ─── trafficGroup / generalGroup ────────────────────────────────────

describe('trafficGroup', () => {
    it('creates group with deferred proxies', () => {
        const final = { _allSelectables: ['HK', 'US', 'JP'] };
        const group = trafficGroup(final, 'Streaming', {
            defaultProxy: 'US',
            icon: 'http://icon.png',
        });

        expect(group.name).toBe('Streaming');
        expect(isDeferred(group.proxies)).toBe(true);
        expect(resolveDeferred(group.proxies)).toEqual(['US', 'HK', 'JP']);
    });
});

describe('generalGroup', () => {
    it('creates group with deferred proxies from _proxies', () => {
        const final = { _proxies: ['p1', 'p2'] };
        const group = generalGroup(final, { name: 'Manual' });
        expect(isDeferred(group.proxies)).toBe(true);
        expect(resolveDeferred(group.proxies)).toEqual(['p1', 'p2']);
    });

    it('uses explicit proxies when provided', () => {
        const final = { _proxies: ['x'] };
        const group = generalGroup(final, { name: 'Custom', proxies: ['a', 'b'] });
        expect(group.proxies).toEqual(['a', 'b']);
    });
});
