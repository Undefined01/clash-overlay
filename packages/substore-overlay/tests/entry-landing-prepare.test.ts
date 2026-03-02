import { describe, it, expect } from 'vitest';
import { prepareProxiesNodeInfo } from '../src/entrypoints/00_parse_name.js';

describe('prepareProxiesNodeInfo', () => {
    it('writes _nodeInfo from node name', () => {
        const proxies = [
            {
                name: 'HK->US 2x 家宽 GPT IPLC',
                _originName: 'HK->US 2x 家宽 GPT IPLC',
                _subName: 'ikuuu',
                _subDisplayName: '',
            },
        ] as Array<Record<string, unknown>>;

        prepareProxiesNodeInfo(proxies, {
            enabled: true,
            blEnabled: true,
            blgdEnabled: true,
            blkey: 'GPT>AI',
            residentialRegex: /(家宽|住宅|residential|home)/i,
            filterAds: false,
            debug: false,
        });

        const node = proxies[0] as Record<string, unknown>;
        expect((node._nodeInfo as { countryCode: string }).countryCode).toBe('HK');
        expect((node._nodeInfo as { multiplier?: number }).multiplier).toBe(2);
        expect((node._nodeInfo as { tags?: string[] }).tags).toContain('IPLC');
        expect((node._nodeInfo as { tags?: string[] }).tags).toContain('AI');
        expect((node._nodeInfo as { tags?: string[] }).tags).toContain('家宽');
    });

    it('filters ad-like node names when enabled', () => {
        const proxies = [
            { name: '官方订阅流量提醒' },
            { name: 'US 1x' },
        ] as Array<Record<string, unknown>>;

        prepareProxiesNodeInfo(proxies, {
            enabled: true,
            blEnabled: false,
            blgdEnabled: false,
            blkey: '',
            residentialRegex: /(家宽|住宅|residential|home)/i,
            filterAds: true,
            debug: false,
        });

        expect(proxies.length).toBe(1);
        expect(proxies[0].name).toBe('US 1x');
    });
});
