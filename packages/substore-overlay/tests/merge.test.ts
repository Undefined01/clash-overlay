// tests/merge.test.ts — Tests for Clash-specific merge behavior
//
// Generic moduleMerge tests live in libmodule/tests/module-merge.test.ts.
// This file only tests Clash-specific configuration:
//   - rule-providers unique-key conflict detection
//   - mergeModules with _ctx initial injection
//   - cleanup delegation
import { describe, it, expect } from 'vitest';
import {
    mkDefault,
    mkBefore, mkAfter, mkOrder,
    applyOverlays,
} from 'libmodule';
import {
    clashModuleMerge,
    mergeModules,
    cleanup,
    buildModuleContext,
} from '../src/lib/merge.js';

// Helper: apply overlays with clashModuleMerge
function mergeWith(...overlays: Array<Record<string, unknown>>): Record<string, unknown> {
    return applyOverlays(
        {},
        overlays.map(o => () => o),
        { merge: clashModuleMerge },
    );
}

// ─── rule-providers conflict detection ──────────────────────────────

describe('clashModuleMerge — rule-providers', () => {
    it('detects duplicate rule-provider keys', () => {
        expect(() => mergeWith(
            { 'rule-providers': { foo: { type: 'http' } } },
            { 'rule-providers': { foo: { type: 'file' } } },
        )).toThrow(/Unique-key conflict in "rule-providers": sub-key "foo"/);
    });

    it('merges non-conflicting rule-providers', () => {
        const result = mergeWith(
            { 'rule-providers': { a: { type: 'http' } } },
            { 'rule-providers': { b: { type: 'file' } } },
        );
        expect(result['rule-providers']).toEqual({
            a: { type: 'http' },
            b: { type: 'file' },
        });
    });

    it('inherits all generic merge behavior (arrays, scalars, priorities)', () => {
        // Quick smoke test: array ordering
        const result = mergeWith(
            { rules: mkAfter(['last']) },
            { rules: mkBefore(['first']) },
        );
        expect(result.rules).toEqual(['first', 'last']);

        // Scalar priority
        const result2 = mergeWith({ port: mkDefault(7890) }, { port: 1080 });
        expect(result2.port).toBe(1080);
    });
});

// ─── mergeModules ───────────────────────────────────────────────────

describe('mergeModules', () => {
    it('merges modules and exposes _ctx via config', async () => {
        const mod1 = () => ({
            mode: 'rule',
            'proxy-groups': mkBefore([{ name: 'select', proxies: ['HK', 'US'] }]),
        });
        const mod2 = (config: Record<string, unknown>) => ({
            rules: mkOrder(800, ['MATCH,DIRECT']),
            marker: (config._ctx as { arguments: Map<string, string> }).arguments.get('k'),
        });

        const result = await mergeModules(
            [mod1, mod2],
            { proxies: [{ name: 'HK' }, { name: 'US' }] },
            buildModuleContext({
                arguments: new Map([['k', 'v']]),
                rawArguments: { k: 'v' },
            }),
        );

        expect(result.mode).toBe('rule');
        expect((result['proxy-groups'] as Array<{ proxies: string[] }>)[0].proxies).toEqual(['HK', 'US']);
        expect(result.rules).toEqual(['MATCH,DIRECT']);
        expect(result.marker).toBe('v');
    });

    it('handles empty modules list', async () => {
        const result = await mergeModules(
            [],
            { proxies: [] },
            buildModuleContext({ arguments: new Map(), rawArguments: {} }),
        );
        expect(result.proxies).toEqual([]);
        expect(result.rules).toEqual([]);
    });
});

// ─── cleanup ────────────────────────────────────────────────────────

describe('cleanup', () => {
    it('removes _* metadata keys', () => {
        expect(cleanup({ a: 1, _meta: 'x' })).toEqual({ a: 1 });
    });

    it('removes undefined values', () => {
        expect(cleanup({ a: 1, b: undefined })).toEqual({ a: 1 });
    });

    it('removes empty plain objects', () => {
        expect(cleanup({ a: 1, empty: {} })).toEqual({ a: 1 });
    });

    it('keeps non-empty objects', () => {
        expect(cleanup({ dns: { enable: true } })).toEqual({ dns: { enable: true } });
    });

    it('keeps arrays (even empty)', () => {
        expect(cleanup({ rules: [] })).toEqual({ rules: [] });
    });

    it('keeps falsy non-undefined values', () => {
        expect(cleanup({ a: 0, b: '', c: false, d: null })).toEqual({
            a: 0, b: '', c: false, d: null,
        });
    });
});
