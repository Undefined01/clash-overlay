import { describe, it, expect } from 'vitest';
import { renameProxiesByEntryLanding } from '../src/entrypoints/02_rename_by_entry_landing.js';

describe('renameProxiesByEntryLanding', () => {
    it('sorts by landing/multiplier and applies per-landing numbering', () => {
        const proxies = [
            {
                name: 'A 2x',
                _originName: 'A 2x',
                _subDisplayName: 'SubA',
                _geoEntry: { countryCode: 'HK' },
                _geoLanding: { countryCode: 'US', isResidential: false },
            },
            {
                name: 'B 1x',
                _originName: 'B 1x',
                _subDisplayName: 'SubB',
                _geoEntry: { countryCode: 'JP' },
                _geoLanding: { countryCode: 'US', isResidential: true },
            },
            {
                name: 'C',
                _originName: 'C',
                _subDisplayName: 'SubC',
                _geoEntry: { countryCode: 'SG' },
                _geoLanding: { countryCode: 'SG', isResidential: false },
            },
        ] as Array<Record<string, unknown>>;

        renameProxiesByEntryLanding(proxies, {
            enabled: true,
            defaultMultiplier: 1,
            showResidential: true,
        });

        expect(proxies[0].name).toBe('SG 01 1x | SubC');
        expect(proxies[1].name).toBe('JP->US 01 1x 家宽 | SubB');
        expect(proxies[2].name).toBe('HK->US 02 2x | SubA');
    });

    it('supports disabling residential tag and default multiplier fallback', () => {
        const proxies = [
            {
                name: 'No multiplier',
                _originName: 'No multiplier',
                _geoEntry: { countryCode: 'US' },
                _geoLanding: { countryCode: 'US', isResidential: true },
            },
        ] as Array<Record<string, unknown>>;

        renameProxiesByEntryLanding(proxies, {
            enabled: true,
            defaultMultiplier: 1.5,
            showResidential: false,
        });

        expect(proxies[0].name).toBe('US 01 1.5x');
    });
});
