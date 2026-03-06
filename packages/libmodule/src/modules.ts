// libmodule/src/modules.ts
// Nix-style module system evaluation with support for `_imports`.

import { moduleMerge } from './module-merge.js';
import { deepCleanUndefined, normalizeFinal, resolveDeferred, resolveDeferredAsync } from './resolve.js';
import type { AsyncModuleFn, EvalModulesOptions, ModuleArgs, ModuleFn } from './types.js';

const IMPORTS_KEY = '_imports';

export function evalModules(
    base: Record<string, unknown>,
    modules: ModuleFn[],
    options: EvalModulesOptions = {},
): Record<string, unknown> {
    const merge = options.merge ?? moduleMerge;

    let finalResolved: Record<string, unknown> | null = null;
    const configProxy = createConfigProxy(() => finalResolved);

    // Construct module args: config is always present, user args cannot override it
    const userArgs = options.args ?? {};
    if ('config' in userArgs) {
        throw new Error('Cannot override "config" in module args.');
    }
    const moduleArgs: ModuleArgs = { ...userArgs, config: configProxy };

    const evaluated = collectModules(modules, moduleArgs);

    let current: Record<string, unknown> = stripImports({ ...base });
    for (const ext of evaluated) {
        current = merge(current, ext);
    }

    finalResolved = normalizeFinal(current) as Record<string, unknown>;
    const resolved = resolveDeferred(current) as Record<string, unknown>;
    finalResolved = resolved;

    const cleaned = deepCleanUndefined(stripImports(resolved));
    return (cleaned ?? {}) as Record<string, unknown>;
}

export async function evalModulesAsync(
    base: Record<string, unknown>,
    modules: AsyncModuleFn[],
    options: EvalModulesOptions = {},
): Promise<Record<string, unknown>> {
    const merge = options.merge ?? moduleMerge;

    let finalResolved: Record<string, unknown> | null = null;
    const configProxy = createConfigProxy(() => finalResolved);

    const userArgs = options.args ?? {};
    if ('config' in userArgs) {
        throw new Error('Cannot override "config" in module args.');
    }
    const moduleArgs: ModuleArgs = { ...userArgs, config: configProxy };

    const evaluated = await collectModulesAsync(modules, moduleArgs);

    let current: Record<string, unknown> = stripImports({ ...base });
    for (const ext of evaluated) {
        current = merge(current, ext);
    }

    finalResolved = normalizeFinal(current) as Record<string, unknown>;
    const resolved = await resolveDeferredAsync(current) as Record<string, unknown>;
    finalResolved = resolved;

    const cleaned = deepCleanUndefined(stripImports(resolved));
    return (cleaned ?? {}) as Record<string, unknown>;
}

function collectModules(
    modules: ModuleFn[],
    args: ModuleArgs,
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

    function visit(mod: ModuleFn): void {
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

        const imports = readImports(raw, formatModule(mod));
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

async function collectModulesAsync(
    modules: AsyncModuleFn[],
    args: ModuleArgs,
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

    async function visit(mod: AsyncModuleFn): Promise<void> {
        if (visited.has(mod)) return;
        if (visiting.has(mod)) {
            const cycle = formatCycle(mod);
            throw new Error(`Circular module imports detected: ${cycle}`);
        }

        visiting.add(mod);
        stack.push(mod);

        const raw = await mod(args);
        assertPlainRecord(raw, formatModule(mod));

        const imports = readImports(raw, formatModule(mod));
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

function readImports(
    moduleResult: Record<string, unknown>,
    moduleLabel: string,
): ModuleFn[] {
    if (!(IMPORTS_KEY in moduleResult)) return [];

    const value = moduleResult[IMPORTS_KEY];
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        throw new Error(`Module ${moduleLabel} returned "${IMPORTS_KEY}" which is not an array.`);
    }

    const imports: ModuleFn[] = [];
    for (const item of value) {
        if (typeof item !== 'function') {
            throw new Error(
                `Module ${moduleLabel} returned "${IMPORTS_KEY}" containing a non-function import.`,
            );
        }
        imports.push(item as ModuleFn);
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
    if (val === null || typeof val !== 'object' || Array.isArray(val)) {
        throw new Error(`Module ${moduleLabel} must return a plain object record.`);
    }
}

function createConfigProxy(
    getFinal: () => Record<string, unknown> | null,
): Record<string, unknown> {
    return new Proxy(Object.create(null) as Record<string, unknown>, {
        get(_: Record<string, unknown>, prop: string | symbol): unknown {
            if (prop === '__isConfigProxy') return true;
            const final = getFinal();
            if (final === null) {
                throw new Error(
                    `Cannot eagerly access config.${String(prop)} during module evaluation. ` +
                    `Wrap in deferred(() => config.${String(prop)}).`,
                );
            }
            return final[prop as string];
        },
        has(_: Record<string, unknown>, prop: string | symbol): boolean {
            const final = getFinal();
            if (final === null) {
                throw new Error(`Cannot check 'config' membership during module evaluation.`);
            }
            return (prop as string) in final;
        },
        ownKeys(): Array<string | symbol> {
            const final = getFinal();
            if (final === null) {
                throw new Error(`Cannot enumerate 'config' during module evaluation.`);
            }
            return Reflect.ownKeys(final);
        },
        getOwnPropertyDescriptor(_: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
            const final = getFinal();
            if (final === null) return undefined;
            if ((prop as string) in final) {
                return { value: final[prop as string], writable: true, enumerable: true, configurable: true };
            }
            return undefined;
        },
    });
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'then' in value &&
        typeof (value as { then?: unknown }).then === 'function'
    );
}
