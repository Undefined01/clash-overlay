import { describe, it, expect } from 'vitest';
import { buildGeoPairCacheId } from '../src/entrypoints/detect_geo.js';

describe('buildGeoPairCacheId', () => {
    it('ignores volatile fields like name/_*', () => {
        const base = {
            name: 'Node A',
            server: '1.1.1.1',
            port: 443,
            _geoEntry: { countryCode: 'US' },
        } as Record<string, unknown>;
        const changed = {
            ...base,
            name: 'Node B',
            _originName: 'Node A',
        } as Record<string, unknown>;

        const keyA = buildGeoPairCacheId(base, { landingApi: 'a' });
        const keyB = buildGeoPairCacheId(changed, { landingApi: 'a' });

        expect(keyA).toBe(keyB);
    });
});
