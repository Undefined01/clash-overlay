import { describe, it, expect } from 'vitest';
import {
    createArgumentMap,
    getBooleanArg,
    getSubstoreContext,
} from '../src/lib/substore-context.js';

describe('substore-context', () => {
    it('builds string Map from raw arguments', () => {
        const map = createArgumentMap({
            a: 1,
            b: true,
            c: 'x',
            d: null,
            e: undefined,
        });
        expect(map.get('a')).toBe('1');
        expect(map.get('b')).toBe('true');
        expect(map.get('c')).toBe('x');
        expect(map.has('d')).toBe(false);
        expect(map.has('e')).toBe(false);
    });

    it('reads boolean argument with fallback', () => {
        const ctx = {
            arguments: new Map([
                ['on', 'true'],
                ['off', '0'],
            ]),
            rawArguments: {},
            runtime: {},
        };
        expect(getBooleanArg(ctx, 'on', false)).toBe(true);
        expect(getBooleanArg(ctx, 'off', true)).toBe(false);
        expect(getBooleanArg(ctx, 'missing', true)).toBe(true);
    });

    it('extracts _ctx from state', () => {
        const ctx = { arguments: new Map(), rawArguments: {}, runtime: {} };
        expect(getSubstoreContext({ _ctx: ctx })).toBe(ctx);
    });
});
