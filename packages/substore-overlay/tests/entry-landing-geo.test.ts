import { describe, it, expect } from 'vitest';
import { buildGeoPairCacheId } from '../src/entrypoints/01_detect_entry_landing_geo.js';

describe('buildGeoPairCacheId', () => {
    it('ignores volatile fields like name/id/_*', () => {
        const base = {
            name: 'Node A',
            id: 'abc',
            server: '1.1.1.1',
            port: 443,
            _geoEntry: { countryCode: 'US' },
        } as Record<string, unknown>;
        const changed = {
            ...base,
            name: 'Node B',
            id: 'def',
            _originName: 'Node A',
        } as Record<string, unknown>;

        const keyA = buildGeoPairCacheId(base, { landingApi: 'a' });
        const keyB = buildGeoPairCacheId(changed, { landingApi: 'a' });

        expect(keyA).toBe(keyB);
    });
});
