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
    createModuleMerge, cleanup as genericCleanup, mergeModule as genericMergeModule,
} from 'libmodule';
import type { MergeFn, ModuleFn } from 'libmodule';
import type {
    SubStoreArguments,
    SubStoreRequestOptions,
    SubStoreRuntimeEnv,
    SubStoreScriptContext,
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
    proxies: Array<{ name: string; [key: string]: unknown }>;
    [key: string]: unknown;
}

export type ClashModule = ModuleFn;

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
    return genericMergeModule(base, modules, { merge: clashModuleMerge });
}

/**
 * Remove internal metadata keys (_* prefix) and empty objects from config.
 */
export function cleanup(config: Record<string, unknown>): Record<string, unknown> {
    return genericCleanup(config);
}
