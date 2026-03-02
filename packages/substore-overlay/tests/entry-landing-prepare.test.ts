import { describe, it, expect } from 'vitest';
import { parseNodeInfoFromName } from '../src/entrypoints/parse_node_name.js';

describe('parseNodeInfoFromName', () => {
    it('writes _nodeInfo from node name', () => {
        (globalThis as unknown as { ProxyUtils?: Record<string, unknown> }).ProxyUtils = {
            getISO(name: string): string | undefined {
                if (name.includes('香港')) return 'HK';
                return undefined;
            },
        };

        const nodeInfo = parseNodeInfoFromName('香港 2x 家宽 GPT IPLC');

        expect(nodeInfo.countryCode).toBe('HK');
        expect(nodeInfo.multiplier).toBe(2);
        expect(nodeInfo.tags).toContain('IPLC');
        expect(nodeInfo.tags).toContain('GPT');
        expect(nodeInfo.tags).toContain('家宽');
    });
});
