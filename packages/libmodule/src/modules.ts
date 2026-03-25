// libmodule/src/modules.ts
// Nix-style module system evaluation with support for `_imports`.
//
// 4-phase evaluation pipeline:
// Phase 1: Collect — call modules, resolve _imports, extract _options
// Phase 2: Per-key merge — collect definitions, filter overrides, type.merge
// Phase 3: Resolve deferred — force defer values
// Phase 4: Finalize — validate, apply transforms, assertions, warnings, cleanup

import { deepCleanUndefined, normalizeFinal, resolveDeferred, resolveDeferredAsync } from './resolve.js';
import { extractOptions, resolveOptionType, getOptionDefault } from './options.js';
import { collectDefinitions, mergeKey } from './merge-engine.js';
import { isPlainObject, isPromiseLike } from './core-merge.js';
import { types } from './option-types.js';
import type { OptionType } from './option-types.js';
import type { OptionDeclaration } from './options.js';
import type { AsyncModuleFn, EvalModulesOptions, ModuleArgs, ModuleFn } from './types.js';
import { createLazyRecordProxy } from './lazy-record-proxy.js';

const IMPORTS_KEY = '_imports';
const SYSTEM_KEYS = new Set(['_assertions', '_warnings', '_options', '_imports', '_module']);

export function evalModules<TArgs extends Record<string, unknown> & { config?: never } = {}>(
    base: Record<string, unknown>,
    modules: Array<ModuleFn<TArgs, Record<string, unknown>>>,
    options: EvalModulesOptions<TArgs> = {},
): Record<string, unknown> {
    let finalResolved: Record<string, unknown> | null = null;
    const configProxy = createConfigProxy(() => finalResolved);
    const moduleArgs = createModuleArgs(configProxy, options);

    // ── Phase 1: Collect ──
    const fragments = collectModules(modules, moduleArgs);
    const { merged, optionDecls } = buildMergedConfig(base, fragments);

    // ── Phase 3: Resolve deferred ──
    finalResolved = normalizeFinal(merged) as Record<string, unknown>;
    const resolved = resolveDeferred(merged) as Record<string, unknown>;
    finalResolved = resolved;

    return finalizeModules(resolved, optionDecls, options.onWarning);
}

export async function evalModulesAsync<TArgs extends Record<string, unknown> & { config?: never } = {}>(
    base: Record<string, unknown>,
    modules: Array<AsyncModuleFn<TArgs, Record<string, unknown>>>,
    options: EvalModulesOptions<TArgs> = {},
): Promise<Record<string, unknown>> {
    let finalResolved: Record<string, unknown> | null = null;
    const configProxy = createConfigProxy(() => finalResolved);
    const moduleArgs = createModuleArgs(configProxy, options);

    // ── Phase 1: Collect ──
    const fragments = await collectModulesAsync(modules, moduleArgs);
    const { merged, optionDecls } = buildMergedConfig(base, fragments);

    // ── Phase 3: Resolve deferred ──
    finalResolved = normalizeFinal(merged) as Record<string, unknown>;
    const resolved = await resolveDeferredAsync(merged) as Record<string, unknown>;
    finalResolved = resolved;

    return finalizeModules(resolved, optionDecls, options.onWarning);
}

// ─── _module settings ───────────────────────────────────────────────

interface ModuleSettings {
    check: boolean;
    freeformType?: OptionType;
}

function readModuleSettings(fragments: Array<Record<string, unknown>>): ModuleSettings {
    let check = false;
    let freeformType: OptionType | undefined;

    for (const frag of fragments) {
        if ('_module' in frag && isPlainObject(frag._module)) {
            const mod = frag._module;
            if ('check' in mod && typeof mod.check === 'boolean') {
                check = mod.check;
            }
            if ('freeformType' in mod && mod.freeformType) {
                freeformType = mod.freeformType as OptionType;
            }
        }
    }

    return { check, freeformType };
}

// ─── Implicit options ───────────────────────────────────────────────

function ensureImplicitOptions(optionDecls: Map<string, OptionDeclaration>): void {
    if (!optionDecls.has('_assertions')) {
        optionDecls.set('_assertions', { type: types.listOf(types.raw) as OptionType, default: [] });
    }
    if (!optionDecls.has('_warnings')) {
        optionDecls.set('_warnings', { type: types.listOf(types.raw) as OptionType, default: [] });
    }
}

// ─── Phase 4 helpers ────────────────────────────────────────────────

function validateOptions(
    resolved: Record<string, unknown>,
    optionDecls: Map<string, OptionDeclaration>,
): void {
    for (const [key, decl] of optionDecls) {
        if (key === '_assertions' || key === '_warnings') continue;
        if (!(key in resolved)) continue;
        if (!decl.type.check(resolved[key])) {
            throw new Error(
                `Type error for "${key}": expected ${decl.type.name}, ` +
                `got ${JSON.stringify(resolved[key])}.`,
            );
        }
    }
}

function applyOptionTransforms(
    resolved: Record<string, unknown>,
    optionDecls: Map<string, OptionDeclaration>,
): void {
    for (const [key, decl] of optionDecls) {
        if (!(key in resolved)) continue;
        const apply = decl.apply ?? decl.type.apply;
        if (apply) {
            resolved[key] = apply(resolved[key]);
        }
    }
}

function evaluateAssertions(resolved: Record<string, unknown>): void {
    const assertions = resolved._assertions;
    if (!Array.isArray(assertions)) return;

    for (const entry of assertions) {
        if (
            typeof entry === 'object' &&
            entry !== null &&
            'assertion' in entry &&
            (entry as Record<string, unknown>).assertion === false
        ) {
            const message = (entry as Record<string, unknown>).message ?? 'Assertion failed';
            throw new Error(`Assertion failed: ${message}`);
        }
    }
}

function processWarnings(
    resolved: Record<string, unknown>,
    onWarning?: (message: string) => void,
): void {
    const warnings = resolved._warnings;
    if (!Array.isArray(warnings)) return;
    const handler = onWarning ?? ((msg: string) => console.warn(`[libmodule] ${msg}`));
    for (const msg of warnings) {
        if (typeof msg === 'string') handler(msg);
    }
}

function createModuleArgs<TArgs extends Record<string, unknown> & { config?: never }>(
    config: Record<string, unknown>,
    options: EvalModulesOptions<TArgs>,
): ModuleArgs<TArgs> {
    const userArgs = options.args ?? {};
    if ('config' in userArgs) {
        throw new Error('Cannot override "config" in module args.');
    }
    return { ...userArgs, config } as ModuleArgs<TArgs>;
}

function buildMergedConfig(
    base: Record<string, unknown>,
    fragments: Array<Record<string, unknown>>,
): {
    merged: Record<string, unknown>;
    optionDecls: Map<string, OptionDeclaration>;
} {
    const allFragments = [stripImports({ ...base }), ...fragments];
    const optionDecls = extractOptions(allFragments);
    const moduleSettings = readModuleSettings(allFragments);
    const definitions = collectDefinitions(allFragments);

    ensureImplicitOptions(optionDecls);

    const merged: Record<string, unknown> = {};
    for (const [key, defs] of definitions) {
        const optionType = resolveOptionType(
            key,
            optionDecls,
            moduleSettings.check,
            moduleSettings.freeformType,
        );
        merged[key] = mergeKey(key, defs, optionType);
    }

    for (const [key] of optionDecls) {
        if (key === '_assertions' || key === '_warnings') continue;
        if (key in merged) continue;

        const { hasDefault, value } = getOptionDefault(key, optionDecls);
        if (hasDefault) {
            merged[key] = value;
        }
    }

    return { merged, optionDecls };
}

function finalizeModules(
    resolved: Record<string, unknown>,
    optionDecls: Map<string, OptionDeclaration>,
    onWarning?: (message: string) => void,
): Record<string, unknown> {
    validateOptions(resolved, optionDecls);
    applyOptionTransforms(resolved, optionDecls);
    evaluateAssertions(resolved);
    processWarnings(resolved, onWarning);

    const stripped = stripSystemKeys(resolved);
    const cleaned = deepCleanUndefined(stripped);
    return (cleaned ?? {}) as Record<string, unknown>;
}

function stripSystemKeys(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!SYSTEM_KEYS.has(key)) result[key] = value;
    }
    return result;
}

// ─── Module collection ──────────────────────────────────────────────

function collectModules<TArgs extends Record<string, unknown> & { config?: never }>(
    modules: Array<ModuleFn<TArgs, Record<string, unknown>>>,
    args: ModuleArgs<TArgs>,
): Array<Record<string, unknown>> {
    const ids = new WeakMap<Function, number>();
    let nextId = 1;

    const visited = new WeakSet<Function>();
    const visiting = new WeakSet<Function>();
    const stack: Function[] = [];
    const extensions: Array<Record<string, unknown>> = [];

    for (const mod of modules) {
        if (typeof mod !== 'function') {
            throw new Error('Expected module to be a function.');
        }
        visit(mod);
    }

    return extensions;

    function visit(mod: ModuleFn<TArgs, Record<string, unknown>>): void {
        if (visited.has(mod)) return;
        if (visiting.has(mod)) {
            const cycle = formatCycle(mod);
            throw new Error(`Circular module imports detected: ${cycle}`);
        }

        visiting.add(mod);
        stack.push(mod);

        const raw = mod(args);
        if (isPromiseLike(raw)) {
            throw new Error(
                `Module ${formatModule(mod)} returned a Promise in sync mode. ` +
                `Use evalModulesAsync() instead.`,
            );
        }
        assertPlainRecord(raw, formatModule(mod));

        const imports = readImports<ModuleFn<TArgs, Record<string, unknown>>>(raw, formatModule(mod));
        for (const imp of imports) {
            visit(imp);
        }

        extensions.push(stripImports(raw));

        stack.pop();
        visiting.delete(mod);
        visited.add(mod);
    }

    function formatModule(mod: Function): string {
        const id = ids.get(mod) ?? nextId++;
        if (!ids.has(mod)) ids.set(mod, id);
        return mod.name ? `${mod.name}#${id}` : `<module#${id}>`;
    }

    function formatCycle(leaf: Function): string {
        const idx = stack.indexOf(leaf);
        const cycle = [...stack.slice(idx), leaf].map(formatModule).join(' -> ');
        return cycle;
    }
}

async function collectModulesAsync<TArgs extends Record<string, unknown> & { config?: never }>(
    modules: Array<AsyncModuleFn<TArgs, Record<string, unknown>>>,
    args: ModuleArgs<TArgs>,
): Promise<Array<Record<string, unknown>>> {
    const ids = new WeakMap<Function, number>();
    let nextId = 1;

    const visited = new WeakSet<Function>();
    const visiting = new WeakSet<Function>();
    const stack: Function[] = [];
    const extensions: Array<Record<string, unknown>> = [];

    for (const mod of modules) {
        if (typeof mod !== 'function') {
            throw new Error('Expected module to be a function.');
        }
        await visit(mod);
    }

    return extensions;

    async function visit(mod: AsyncModuleFn<TArgs, Record<string, unknown>>): Promise<void> {
        if (visited.has(mod)) return;
        if (visiting.has(mod)) {
            const cycle = formatCycle(mod);
            throw new Error(`Circular module imports detected: ${cycle}`);
        }

        visiting.add(mod);
        stack.push(mod);

        const raw = await mod(args);
        assertPlainRecord(raw, formatModule(mod));

        const imports = readImports<AsyncModuleFn<TArgs, Record<string, unknown>>>(raw, formatModule(mod));
        for (const imp of imports) {
            await visit(imp);
        }

        extensions.push(stripImports(raw));

        stack.pop();
        visiting.delete(mod);
        visited.add(mod);
    }

    function formatModule(mod: Function): string {
        const id = ids.get(mod) ?? nextId++;
        if (!ids.has(mod)) ids.set(mod, id);
        return mod.name ? `${mod.name}#${id}` : `<module#${id}>`;
    }

    function formatCycle(leaf: Function): string {
        const idx = stack.indexOf(leaf);
        const cycle = [...stack.slice(idx), leaf].map(formatModule).join(' -> ');
        return cycle;
    }
}

function readImports<TModule extends (...args: never[]) => unknown>(
    moduleResult: Record<string, unknown>,
    moduleLabel: string,
): TModule[] {
    if (!(IMPORTS_KEY in moduleResult)) return [];

    const value = moduleResult[IMPORTS_KEY];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(`Module ${moduleLabel} returned "${IMPORTS_KEY}" which is not an array.`);
    }

    const imports: TModule[] = [];
    for (const item of value) {
        if (typeof item !== 'function') {
            throw new Error(
                `Module ${moduleLabel} returned "${IMPORTS_KEY}" containing a non-function import.`,
            );
        }
        imports.push(item as TModule);
    }
    return imports;
}

function stripImports(record: Record<string, unknown>): Record<string, unknown> {
    if (!(IMPORTS_KEY in record)) return record;
    const copy = { ...record };
    delete copy[IMPORTS_KEY];
    return copy;
}

function assertPlainRecord(val: unknown, moduleLabel: string): asserts val is Record<string, unknown> {
    if (!isPlainObject(val)) {
        throw new Error(`Module ${moduleLabel} must return a plain object record.`);
    }
}

function createConfigProxy(
    getFinal: () => Record<string, unknown> | null,
): Record<string, unknown> {
    return createLazyRecordProxy(getFinal, { name: 'config', phase: 'module evaluation' });
}
