// tests/modules.test.ts — Tests for evalModules / evalModulesAsync
import { describe, it, expect } from 'vitest';
import {
    defer,
    mkDefault,
    mkForce,
    mkOverride,
    evalModules,
    evalModulesAsync,
} from '../src/index.js';
import { types } from '../src/option-types.js';
import type { AsyncModuleFn, ModuleFn } from '../src/index.js';

describe('evalModules', () => {
    it('merges module fragments using moduleMerge by default', () => {
        const a: ModuleFn = () => ({ port: 7890, rules: ['a'] });
        const b: ModuleFn = () => ({ rules: ['b', 'c'] });
        expect(evalModules({}, [a, b])).toEqual({
            port: 7890,
            rules: ['a', 'b', 'c'],
        });
    });

    it('throws on scalar conflict at same priority', () => {
        const a: ModuleFn = () => ({ port: 1 });
        const b: ModuleFn = () => ({ port: 2 });
        expect(() => evalModules({}, [a, b])).toThrow(/Scalar conflict.*port/);
    });

    it('undefined is is ignored', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: { b: 1 } } });
        const b: ModuleFn = () => ({ proxyGroups: undefined });
        expect(evalModules({}, [a, b])).toEqual({ proxyGroups: { a: { b: 1 } } });
    });

    it('deep attrsets are merged', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: { b: [ 1, 2 ] } } });
        const b: ModuleFn = () => ({ proxyGroups: { a: { b: [ 3 ], c: 2 } } });
        expect(evalModules({}, [a, b])).toEqual({ proxyGroups: { a: { b: [ 1, 2, 3 ], c: 2 } } });
    });

    it('deferred deep attrsets are merged', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: { b: [ 1, 2 ] } } });
        const b: ModuleFn = () => ({ proxyGroups: { a: defer(() => ({ b: [ 3 ], c: 2 })) } });
        expect(evalModules({}, [a, b])).toEqual({ proxyGroups: { a: { b: [ 1, 2, 3 ], c: 2 } } });
    });

    it('respects Nix-style priorities for scalars', () => {
        const a: ModuleFn = () => ({ port: mkDefault(7890) });
        const b: ModuleFn = () => ({ port: 1080 });
        const c: ModuleFn = () => ({ port: mkForce(443) });
        const d: ModuleFn = () => ({ port: mkOverride(25, 9999) });
        expect(evalModules({}, [a, b, c, d]).port).toBe(9999);
    });

    it('allows referencing final config values via defer', () => {
        const a: ModuleFn = () => ({ x: 10 });
        const b: ModuleFn = ({ config }) => ({
            y: defer(() => (config.x as number) * 2),
        });
        const result = evalModules({}, [a, b]);
        expect(result).toEqual({ x: 10, y: 20 });
    });

    it('supports forward references (later module defines key)', () => {
        const a: ModuleFn = ({ config }) => ({
            x: defer(() => config.y),
        });
        const b: ModuleFn = () => ({ y: 42 });
        const result = evalModules({}, [a, b]);
        expect(result.x).toBe(42);
    });

    it('applies transforms declared on option types during finalization', () => {
        const a: ModuleFn = () => ({
            _options: {
                greeting: { type: types.lines },
            },
        });
        const b: ModuleFn = () => ({ greeting: ['hello', 'world'] });

        expect(evalModules({}, [a, b])).toEqual({
            greeting: 'hello\nworld',
        });
    });

    it('normalizes config access inside deferred (arrays are plain arrays)', () => {
        const a: ModuleFn = () => ({ items: ['a'] });
        const b: ModuleFn = () => ({ items: ['b'] });
        const c: ModuleFn = ({ config }) => ({
            count: defer(() => (config.items as unknown[]).length),
        });
        const result = evalModules({}, [a, b, c]);
        expect(result.items).toEqual(['a', 'b']);
        expect(result.count).toBe(2);
    });

    it('normalizes config access inside deferred (overrides are unwrapped)', () => {
        const a: ModuleFn = () => ({ port: mkDefault(100) });
        const b: ModuleFn = ({ config }) => ({
            portPlus: defer(() => (config.port as number) + 1),
        });
        expect(evalModules({}, [a, b]).portPlus).toBe(101);
    });

    it('deferred deep attrsets merge with later concrete attrsets', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: defer(() => ({ b: [1] })) } });
        const b: ModuleFn = () => ({ proxyGroups: { a: { b: [2], c: 3 } } });
        expect(evalModules({}, [a, b])).toEqual({
            proxyGroups: { a: { b: [1, 2], c: 3 } },
        });
    });

    it('deferred deep attrsets merge with later deferred attrsets', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: defer(() => ({ b: [1] })) } });
        const b: ModuleFn = () => ({ proxyGroups: { a: defer(() => ({ b: [2], c: 3 })) } });
        expect(evalModules({}, [a, b])).toEqual({
            proxyGroups: { a: { b: [1, 2], c: 3 } },
        });
    });

    it('deferred deep merge concatenates arrays', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: { b: [1] } } });
        const b: ModuleFn = () => ({ proxyGroups: { a: { b: defer(() => [2, 3]) } } });
        expect(evalModules({}, [a, b])).toEqual({
            proxyGroups: { a: { b: [1, 2, 3] } },
        });
    });

    it('deferred deep merge throws on array/non-array mismatch', () => {
        const a: ModuleFn = () => ({ proxyGroups: { a: { b: [1] } } });
        const b: ModuleFn = () => ({ proxyGroups: { a: { b: defer(() => 'x') } } });
        expect(() => evalModules({}, [a, b])).toThrow(/Type mismatch in deep merge/);
    });

    it('throws on eager config access in module body', () => {
        const a: ModuleFn = () => ({ a: 1 });
        const bad: ModuleFn = ({ config }) => ({ b: config.a });
        expect(() => evalModules({}, [a, bad])).toThrow(/Cannot eagerly access config\.a/);
    });

    it('throws on "in" checks against config during module evaluation', () => {
        const bad: ModuleFn = ({ config }) => ({ ok: 'a' in config });
        expect(() => evalModules({}, [bad])).toThrow(/Cannot check 'config' membership/);
    });

    it('throws on enumeration of config during module evaluation', () => {
        const bad: ModuleFn = ({ config }) => ({ keys: Object.keys(config) });
        expect(() => evalModules({}, [bad])).toThrow(/Cannot enumerate 'config'/);
    });

    it('supports `_imports` (imports are evaluated before the importer)', () => {
        const imported: ModuleFn = () => ({ items: ['imported'] });
        const root: ModuleFn = () => ({ _imports: [imported], items: ['root'] });
        expect(evalModules({}, [root]).items).toEqual(['imported', 'root']);
    });

    it('supports nested imports with stable ordering', () => {
        const c: ModuleFn = () => ({ items: ['c'] });
        const b: ModuleFn = () => ({ _imports: [c], items: ['b'] });
        const a: ModuleFn = () => ({ _imports: [b], items: ['a'] });
        expect(evalModules({}, [a]).items).toEqual(['c', 'b', 'a']);
    });

    it('respects `_imports` list order', () => {
        const a: ModuleFn = () => ({ items: ['a'] });
        const b: ModuleFn = () => ({ items: ['b'] });
        const root: ModuleFn = () => ({ _imports: [b, a], items: ['root'] });
        expect(evalModules({}, [root]).items).toEqual(['b', 'a', 'root']);
    });

    it('dedupes imported modules by identity', () => {
        let called = 0;
        const shared: ModuleFn = () => {
            called += 1;
            return { items: ['shared'] };
        };
        const a: ModuleFn = () => ({ _imports: [shared], items: ['a'] });
        const b: ModuleFn = () => ({ _imports: [shared], items: ['b'] });
        const result = evalModules({}, [a, b]);
        expect(called).toBe(1);
        expect(result.items).toEqual(['shared', 'a', 'b']);
    });

    it('dedupes duplicate root modules by identity', () => {
        let called = 0;
        const mod: ModuleFn = () => {
            called += 1;
            return { items: ['x'] };
        };
        expect(evalModules({}, [mod, mod]).items).toEqual(['x']);
        expect(called).toBe(1);
    });

    it('allows imported modules to reference importer-defined values via defer', () => {
        const imported: ModuleFn = ({ config }) => ({
            seen: defer(() => config.flag),
        });
        const root: ModuleFn = () => ({ _imports: [imported], flag: true });
        expect(evalModules({}, [root]).seen).toBe(true);
    });

    it('omits `_imports` from final config', () => {
        const root: ModuleFn = () => ({ _imports: [], a: 1 });
        const result = evalModules({}, [root]);
        expect(result).toEqual({ a: 1 });
        expect('_imports' in result).toBe(false);
    });

    it('throws on circular imports', () => {
        let a: ModuleFn;
        let b: ModuleFn;

        a = () => ({ _imports: [b], a: 1 });
        b = () => ({ _imports: [a], b: 1 });

        expect(() => evalModules({}, [a])).toThrow(/Circular module imports detected/);
    });

    it('throws when `_imports` is not an array', () => {
        const bad: ModuleFn = () => ({ _imports: 'nope' as unknown as ModuleFn[] });
        expect(() => evalModules({}, [bad])).toThrow(/"_imports" which is not an array/);
    });

    it('throws when `_imports` contains non-function entries', () => {
        const bad: ModuleFn = () => ({ _imports: [1 as unknown as ModuleFn] });
        expect(() => evalModules({}, [bad])).toThrow(/"_imports" containing a non-function import/);
    });

    it('throws when module list contains non-functions', () => {
        expect(() => evalModules({}, [1 as unknown as ModuleFn]))
            .toThrow(/Expected module to be a function/);
    });

    it('throws when a module does not return a record', () => {
        const bad: ModuleFn = () => null as unknown as Record<string, unknown>;
        expect(() => evalModules({}, [bad])).toThrow(/must return a plain object record/);
    });

    it('throws when a module returns a non-plain object instance', () => {
        const bad: ModuleFn = () => new Date() as unknown as Record<string, unknown>;
        expect(() => evalModules({}, [bad])).toThrow(/must return a plain object record/);
    });

    it('throws in sync mode when a module returns Promise', () => {
        const asyncMod: AsyncModuleFn = async () => ({ a: 1 });
        expect(() => evalModules({}, [asyncMod as unknown as ModuleFn]))
            .toThrow(/Use evalModulesAsync/);
    });

    it('does not mutate the base object', () => {
        const base = { a: 1 };
        const mod: ModuleFn = () => ({ b: 2 });
        evalModules(base, [mod]);
        expect(base).toEqual({ a: 1 });
    });
});

// ─── specialArgs ────────────────────────────────────────────────────

describe('evalModules — specialArgs', () => {
    it('passes specialArgs to modules', () => {
        const mod: ModuleFn = ({ ctx }) => ({
            greeting: defer(() => `hello ${(ctx as any).user}`),
        });
        const result = evalModules({}, [mod], { args: { ctx: { user: 'alice' } } });
        expect(result.greeting).toBe('hello alice');
    });

    it('modules without specialArgs still work (config only)', () => {
        const mod: ModuleFn = () => ({ a: 1 });
        const result = evalModules({}, [mod]);
        expect(result).toEqual({ a: 1 });
    });

    it('specialArgs cannot override config', () => {
        const mod: ModuleFn = () => ({ a: 1 });
        expect(() => evalModules({}, [mod], { args: { config: {} } }))
            .toThrow(/Cannot override "config"/);
    });

    it('multiple specialArgs are available', () => {
        const mod: ModuleFn = ({ lib, ctx }) => ({
            result: defer(() => `${(lib as any).prefix}-${(ctx as any).name}`),
        });
        const result = evalModules({}, [mod], {
            args: { lib: { prefix: 'test' }, ctx: { name: 'foo' } },
        });
        expect(result.result).toBe('test-foo');
    });
});

// ─── async ──────────────────────────────────────────────────────────

describe('evalModulesAsync', () => {
    it('supports async module functions', async () => {
        const a: AsyncModuleFn = async () => ({ a: 1 });
        const b: AsyncModuleFn = async ({ config }) => ({
            b: defer(() => (config.a as number) + 1),
        });
        await expect(evalModulesAsync({}, [a, b])).resolves.toEqual({ a: 1, b: 2 });
    });

    it('supports async deferred resolvers', async () => {
        const a: AsyncModuleFn = () => ({ base: 40 });
        const b: AsyncModuleFn = ({ config }) => ({
            answer: defer(async () => (config.base as number) + 2),
        });
        const result = await evalModulesAsync({}, [a, b]);
        expect(result.answer).toBe(42);
    });

    it('supports async imports', async () => {
        const imported: AsyncModuleFn = async () => ({ items: ['imported'] });
        const root: AsyncModuleFn = () => ({ _imports: [imported], items: ['root'] });
        const result = await evalModulesAsync({}, [root]);
        expect(result.items).toEqual(['imported', 'root']);
    });

    it('normalizes config access inside deferred in async mode', async () => {
        const a: AsyncModuleFn = () => ({ items: ['a'] });
        const b: AsyncModuleFn = () => ({ items: ['b'] });
        const c: AsyncModuleFn = ({ config }) => ({
            count: defer(async () => (config.items as unknown[]).length),
        });
        const result = await evalModulesAsync({}, [a, b, c]);
        expect(result.items).toEqual(['a', 'b']);
        expect(result.count).toBe(2);
    });

    it('merges deferred deep attrsets in async mode', async () => {
        const a: AsyncModuleFn = () => ({ proxyGroups: { a: { b: [1, 2] } } });
        const b: AsyncModuleFn = () => ({
            proxyGroups: {
                a: defer(async () => ({ b: [3], c: 2 })),
            },
        });
        await expect(evalModulesAsync({}, [a, b])).resolves.toEqual({
            proxyGroups: { a: { b: [1, 2, 3], c: 2 } },
        });
    });

    it('dedupes imports in async mode', async () => {
        let called = 0;
        const shared: AsyncModuleFn = async () => {
            called += 1;
            return { items: ['shared'] };
        };
        const a: AsyncModuleFn = () => ({ _imports: [shared], items: ['a'] });
        const b: AsyncModuleFn = () => ({ _imports: [shared], items: ['b'] });
        const result = await evalModulesAsync({}, [a, b]);
        expect(called).toBe(1);
        expect(result.items).toEqual(['shared', 'a', 'b']);
    });

    it('dedupes duplicate root modules in async mode', async () => {
        let called = 0;
        const mod: AsyncModuleFn = async () => {
            called += 1;
            return { items: ['x'] };
        };
        const result = await evalModulesAsync({}, [mod, mod]);
        expect(result.items).toEqual(['x']);
        expect(called).toBe(1);
    });

    it('passes specialArgs in async mode', async () => {
        const mod: AsyncModuleFn = async ({ ctx }) => ({
            name: (ctx as any).name,
        });
        const result = await evalModulesAsync({}, [mod], {
            args: { ctx: { name: 'test' } },
        });
        expect(result.name).toBe('test');
    });
});

// ─── v3 Pipeline: _options, apply, assertions, warnings, _module ────

describe('evalModules — v3 pipeline features', () => {
    it('full pipeline with _options + apply + assertions', () => {
        const optionsMod: ModuleFn = () => ({
            _options: {
                port: { type: types.int },
                tags: { type: types.listOf(types.str), default: [] },
                label: {
                    type: types.str,
                    apply: (v: unknown) => `[${v}]`,
                },
            },
        });
        const dataMod: ModuleFn = () => ({
            port: 8080,
            tags: ['web'],
            label: 'prod',
            _assertions: [{ assertion: true, message: 'should pass' }],
        });
        const result = evalModules({}, [optionsMod, dataMod]);
        expect(result.port).toBe(8080);
        expect(result.tags).toEqual(['web']);
        expect(result.label).toBe('[prod]');
    });

    it('pipeline without _options is fully backward compatible', () => {
        const a: ModuleFn = () => ({ x: 1 });
        const b: ModuleFn = () => ({ y: 2 });
        expect(evalModules({}, [a, b])).toEqual({ x: 1, y: 2 });
    });

    it('_module.check=true rejects undeclared keys', () => {
        const optsMod: ModuleFn = () => ({
            _module: { check: true },
            _options: { port: { type: types.int } },
        });
        const dataMod: ModuleFn = () => ({ port: 80, unknown: 'oops' });
        expect(() => evalModules({}, [optsMod, dataMod])).toThrow('Undeclared option');
    });

    it('_module.freeformType used for undeclared keys', () => {
        const optsMod: ModuleFn = () => ({
            _module: { check: true, freeformType: types.anything },
            _options: { port: { type: types.int } },
        });
        const dataMod: ModuleFn = () => ({ port: 80, extra: 'ok' });
        const result = evalModules({}, [optsMod, dataMod]);
        expect(result.port).toBe(80);
        expect(result.extra).toBe('ok');
    });

    it('option defaults applied when no module provides value', () => {
        const optsMod: ModuleFn = () => ({
            _options: { port: { type: types.int, default: 3000 } },
        });
        const result = evalModules({}, [optsMod]);
        expect(result.port).toBe(3000);
    });

    it('assertion failure throws', () => {
        const mod: ModuleFn = () => ({
            _assertions: [{ assertion: false, message: 'port must be > 0' }],
        });
        expect(() => evalModules({}, [mod])).toThrow('port must be > 0');
    });

    it('passing assertions do not throw', () => {
        const mod: ModuleFn = () => ({
            port: 80,
            _assertions: [{ assertion: true, message: 'should not throw' }],
        });
        expect(evalModules({}, [mod]).port).toBe(80);
    });

    it('assertions from multiple modules are merged', () => {
        const a: ModuleFn = () => ({
            _assertions: [{ assertion: true, message: 'a ok' }],
        });
        const b: ModuleFn = () => ({
            _assertions: [{ assertion: false, message: 'b failed' }],
        });
        expect(() => evalModules({}, [a, b])).toThrow('b failed');
    });

    it('apply transforms run after deferred resolution', () => {
        const optsMod: ModuleFn = () => ({
            _options: {
                count: {
                    type: types.int,
                    apply: (v: unknown) => (v as number) + 100,
                },
            },
        });
        const dataMod: ModuleFn = ({ config }) => ({
            items: ['a', 'b'],
            count: defer(() => (config.items as unknown[]).length),
        });
        const result = evalModules({}, [optsMod, dataMod]);
        expect(result.count).toBe(102); // 2 + 100
    });

    it('type validation catches wrong type', () => {
        const optsMod: ModuleFn = () => ({
            _options: { port: { type: types.int } },
        });
        const dataMod: ModuleFn = () => ({ port: 'not-a-number' });
        expect(() => evalModules({}, [optsMod, dataMod])).toThrow(/Type error for "port"/);
    });

    it('type validation runs after resolve (deferred values are concrete)', () => {
        const optsMod: ModuleFn = () => ({
            _options: { port: { type: types.int } },
        });
        const dataMod: ModuleFn = () => ({ port: defer(() => 8080) });
        expect(evalModules({}, [optsMod, dataMod]).port).toBe(8080);
    });

    it('warnings processed via onWarning callback', () => {
        const warnings: string[] = [];
        const mod: ModuleFn = () => ({
            _warnings: ['watch out', 'be careful'],
        });
        evalModules({}, [mod], { onWarning: (msg) => warnings.push(msg) });
        expect(warnings).toEqual(['watch out', 'be careful']);
    });

    it('system keys absent from output', () => {
        const mod: ModuleFn = () => ({
            _options: { port: { type: types.int } },
            _assertions: [{ assertion: true, message: 'ok' }],
            _warnings: ['info'],
            _module: { check: false },
            port: 80,
        });
        const warnings: string[] = [];
        const result = evalModules({}, [mod], { onWarning: (msg) => warnings.push(msg) });
        expect(result).toEqual({ port: 80 });
        expect('_options' in result).toBe(false);
        expect('_assertions' in result).toBe(false);
        expect('_warnings' in result).toBe(false);
        expect('_module' in result).toBe(false);
    });

    it('cross-module _options merge in evalModules', () => {
        const optsA: ModuleFn = () => ({
            _options: { port: { type: types.int, default: 80 } },
        });
        const optsB: ModuleFn = () => ({
            _options: { host: { type: types.str, default: 'localhost' } },
        });
        const result = evalModules({}, [optsA, optsB]);
        expect(result.port).toBe(80);
        expect(result.host).toBe('localhost');
    });
});
