// substore-overlay/src/lib/merge.ts
// Clash configuration module system.
//
// Delegates all generic merge logic to libmodule's `createModuleMerge`.
// This file only provides:
//   - Clash-specific merge configuration (uniqueKeyFields for rule-providers)
//   - Substore module context and initial state builder
//   - mergeModules: async overlay merge entry
//   - cleanup: re-exported from libmodule

import {
    createModuleMerge, cleanup as genericCleanup, resolveDeferredAsync,
} from 'libmodule';
import type { MergeFn } from 'libmodule';
import type {
    SubStoreArguments,
    SubStoreRequestOptions,
    SubStoreRuntimeEnv,
    SubStoreScriptContext,
    ProxyNode,
} from '../types/substore.js';
import type { SubstoreModuleContext } from './substore-context.js';

// ─── Clash-Specific Merge ───────────────────────────────────────────

/**
 * Clash module merge — generic module merge with:
 *   - `rule-providers`: duplicate sub-key detection
 */
export const clashModuleMerge: MergeFn = createModuleMerge({
    uniqueKeyFields: ['rule-providers'],
});

// ─── Module System ──────────────────────────────────────────────────

export interface ClashConfigInput {
    proxies: ProxyNode[];
    [key: string]: unknown;
}

export type ClashModule = (
    config: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

export interface BuildModuleContextOptions {
    arguments: Map<string, string>;
    rawArguments: SubStoreArguments;
    options?: SubStoreRequestOptions;
    scriptContext?: SubStoreScriptContext;
    runtimeEnv?: SubStoreRuntimeEnv;
}

export function buildModuleContext(options: BuildModuleContextOptions): SubstoreModuleContext {
    return {
        arguments: options.arguments,
        rawArguments: options.rawArguments,
        options: options.options,
        scriptContext: options.scriptContext,
        runtime: { env: options.runtimeEnv },
    };
}

/**
 * Initial empty state for the Clash module system.
 */
function initialModuleState(
    config: ClashConfigInput,
    substoreContext: SubstoreModuleContext,
): Record<string, unknown> {
    return {
        proxies: config.proxies || [],
        'proxy-groups': [],
        rules: [],
        'rule-providers': {},
        _ctx: substoreContext,
    };
}

/**
 * Merge modules into a Clash configuration.
 */
export async function mergeModules(
    modules: ClashModule[],
    config: ClashConfigInput,
    substoreContext: SubstoreModuleContext,
): Promise<Record<string, unknown>> {
    const base = initialModuleState(config, substoreContext);
    return runModules(base, modules, clashModuleMerge);
}

/**
 * Remove internal metadata keys (_* prefix) and empty objects from config.
 */
export function cleanup(config: Record<string, unknown>): Record<string, unknown> {
    return genericCleanup(config);
}

async function runModules(
    base: Record<string, unknown>,
    modules: ClashModule[],
    merge: MergeFn,
): Promise<Record<string, unknown>> {
    let current: Record<string, unknown> = { ...base };
    let finalResolved: Record<string, unknown> | null = null;

    const configProxy = new Proxy(Object.create(null) as Record<string, unknown>, {
        get(_: Record<string, unknown>, prop: string | symbol): unknown {
            const source = finalResolved ?? current;
            return source[prop as string];
        },
        has(_: Record<string, unknown>, prop: string | symbol): boolean {
            const source = finalResolved ?? current;
            return (prop as string) in source;
        },
        ownKeys(): Array<string | symbol> {
            const source = finalResolved ?? current;
            return Reflect.ownKeys(source);
        },
        getOwnPropertyDescriptor(_: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
            const source = finalResolved ?? current;
            if ((prop as string) in source) {
                return {
                    value: source[prop as string],
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
            return undefined;
        },
    });

    for (const module of modules) {
        const ext = await module(configProxy);
        current = merge(current, ext);
    }

    finalResolved = current;
    const resolved = await resolveDeferredAsync(current) as Record<string, unknown>;
    finalResolved = resolved;
    return resolved;
}
