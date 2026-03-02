import { describe, it, expect } from 'vitest';
import { prepareProxiesNodeInfo } from '../src/entrypoints/00_parse_name.js';
import { renameProxiesByNodeInfo } from '../src/entrypoints/02_rename.js';

describe('renameProxiesByNodeInfo', () => {
    it('sorts by country/multiplier and applies per-country numbering', () => {
        const proxies = [
            {
                name: 'A 2x',
                _originName: 'A 2x',
                _subDisplayName: 'SubA',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'HK', multiplier: 2, tags: ['IPLC'] },
            },
            {
                name: 'B 1x',
                _originName: 'B 1x',
                _subDisplayName: 'SubB',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'JP', multiplier: 1, tags: ['家宽'] },
            },
            {
                name: 'C',
                _originName: 'C',
                _subDisplayName: 'SubC',
                _geoEntry: { countryCode: 'SG' },
            },
        ] as Array<Record<string, unknown>>;

        renameProxiesByNodeInfo(proxies, {
            enabled: true,
            defaultMultiplier: 1,
            showResidential: true,
        });

        expect(proxies[0].name).toBe('SG 01 1x | SubC');
        expect(proxies[1].name).toBe('US 01 1x 家宽 | SubB');
        expect(proxies[2].name).toBe('US 02 2x IPLC | SubA');
    });

    it('supports disabling residential tag and default multiplier fallback', () => {
        const proxies = [
            {
                name: 'No multiplier',
                _originName: 'No multiplier',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'US', tags: ['家宽'] },
            },
        ] as Array<Record<string, unknown>>;

        renameProxiesByNodeInfo(proxies, {
            enabled: true,
            defaultMultiplier: 1.5,
            showResidential: false,
        });

        expect(proxies[0].name).toBe('US 01 1.5x | No multiplier');
    });

    it('uses 00 prepared node info for country/multiplier/tags', () => {
        const proxies = [
            {
                name: 'HK->US 2x 家宽',
                _originName: 'HK->US 2x 家宽',
                _subDisplayName: 'SubA',
            },
            {
                name: '新加坡 1x',
                _originName: '新加坡 1x',
                _subDisplayName: 'SubB',
            },
        ] as Array<Record<string, unknown>>;

        prepareProxiesNodeInfo(proxies, {
            enabled: true,
            blEnabled: true,
            blgdEnabled: true,
            blkey: '',
            residentialRegex: /(家宽|住宅|residential|home)/i,
            filterAds: false,
            debug: false,
        });

        renameProxiesByNodeInfo(proxies, {
            enabled: true,
            defaultMultiplier: 1,
            showResidential: true,
        });

        expect(proxies[0].name).toBe('HK 01 2x 家宽 | SubA');
        expect(proxies[1].name).toBe('SG 01 1x | SubB');
    });

    it('falls back to _subName/_collectionName when _subDisplayName is empty', () => {
        const proxies = [
            {
                name: 'US 1x',
                _originName: 'US 1x',
                _subName: 'ikuuu',
                _subDisplayName: '',
            },
            {
                name: 'HK 1x',
                _originName: 'HK 1x',
                _subName: 'rn',
                _subDisplayName: '',
                _collectionName: 'test',
                _collectionDisplayName: '',
            },
        ] as Array<Record<string, unknown>>;

        prepareProxiesNodeInfo(proxies, {
            enabled: true,
            blEnabled: true,
            blgdEnabled: false,
            blkey: '',
            residentialRegex: /(家宽|住宅|residential|home)/i,
            filterAds: false,
            debug: false,
        });

        renameProxiesByNodeInfo(proxies, {
            enabled: true,
            defaultMultiplier: 1,
            showResidential: true,
        });

        expect(proxies[0].name).toBe('HK 01 1x | rn');
        expect(proxies[1].name).toBe('US 01 1x | ikuuu');
    });
});
