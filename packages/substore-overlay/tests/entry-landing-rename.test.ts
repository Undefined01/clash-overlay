import { describe, it, expect } from 'vitest';
import { operator as parseNodeNames } from '../src/entrypoints/parse_node_name.js';
import { renameNodes } from '../src/entrypoints/rename_nodes.js';
import { SubStoreScriptContext } from '../src/types/substore.js';

describe('renameNodes', () => {
    it('sorts by country/multiplier and applies per-country numbering', () => {
        const proxies = [
            {
                name: 'A 2x',
                type: 'ss',
                _subDisplayName: 'SubA',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'HK', multiplier: 2, tags: ['IPLC'] },
            },
            {
                name: 'B 1x',
                type: 'ss',
                _subDisplayName: 'SubB',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'JP', multiplier: 1, tags: ['家宽'] },
            },
            {
                name: 'C',
                type: 'ss',
                _subDisplayName: 'SubC',
                _geoEntry: { countryCode: 'SG' },
            },
        ];

        renameNodes(proxies);

        expect(proxies[0].name).toBe('US→HK 01 2x IPLC | SubA');
        expect(proxies[1].name).toBe('US→JP 01 1x 家宽 | SubB');
        expect(proxies[2].name).toBe('SG→ZZ 01 1x | SubC');
    });

    it('falls back to 1x multiplier when _nodeInfo.multiplier is absent', () => {
        const proxies = [
            {
                name: 'No multiplier',
                type: 'ss',
                _geoEntry: { countryCode: 'US' },
                _nodeInfo: { countryCode: 'US', tags: ['家宽'] },
            },
        ];

        renameNodes(proxies);

        expect(proxies[0].name).toBe('US 01 1x 家宽');
    });

    it('uses parse_node_name output for country/multiplier/tags', () => {
        (globalThis as unknown as { ProxyUtils?: Record<string, unknown> }).ProxyUtils = {
            getISO(name: string): string | undefined {
                if (name.includes('香港')) return 'HK';
                if (name.includes('新加坡')) return 'SG';
                return undefined;
            },
        };

        const proxies = [
            {
                name: '香港 2x 家宽',
                type: 'ss',
                _subName: 'SubA',
                _subDisplayName: 'SubA',
            },
            {
                name: '新加坡 1x',
                type: 'ss',
                _subName: 'SubB',
                _subDisplayName: 'SubB',
            },
        ];

        parseNodeNames(proxies, 'Surge', undefined as unknown as SubStoreScriptContext);
        renameNodes(proxies);

        expect(proxies[0].name).toBe('HK 01 2x 家宽 | SubA');
        expect(proxies[1].name).toBe('SG 01 1x | SubB');
    });

    it('falls back to _subName/_collectionName when _subDisplayName is empty', () => {
        (globalThis as unknown as { ProxyUtils?: Record<string, unknown> }).ProxyUtils = {
            getISO(name: string): string | undefined {
                if (name.includes('US')) return 'US';
                if (name.includes('HK')) return 'HK';
                return undefined;
            },
        };

        const proxies = [
            {
                name: 'US 1x',
                type: 'ss',
                _subName: 'ikuuu',
                _subDisplayName: '',
            },
            {
                name: 'HK 1x',
                type: 'ss',
                _subName: 'rn',
                _subDisplayName: '',
                _collectionName: 'test',
                _collectionDisplayName: '',
            },
        ];

        parseNodeNames(proxies, 'Surge', undefined as unknown as SubStoreScriptContext);
        renameNodes(proxies);

        expect(proxies[0].name).toBe('HK 01 1x | rn');
        expect(proxies[1].name).toBe('US 01 1x | ikuuu');
    });
});
