// clash-overlay/src/lib/merge.ts
// Clash configuration module system.
//
// Delegates all generic merge logic to liboverlay's `createModuleMerge`.
// This file only provides:
//   - Clash-specific merge configuration (uniqueKeyFields for rule-providers)
//   - ModuleContext / ClashModule types
//   - mergeModules: wires up modules with ctx injection
//   - cleanup: re-exported from liboverlay

import {
    applyOverlays, createModuleMerge, cleanup as genericCleanup,
} from 'liboverlay';
import type { MergeFn } from 'liboverlay';

// ─── Clash-Specific Merge ───────────────────────────────────────────

/**
 * Clash module merge — generic module merge with:
 *   - `rule-providers`: duplicate sub-key detection
 */
export const clashModuleMerge: MergeFn = createModuleMerge({
    uniqueKeyFields: ['rule-providers'],
});

// ─── Module System ──────────────────────────────────────────────────

export interface ModuleContext {
    args: Record<string, unknown>;
    config: {
        proxies: Array<{ name: string; [key: string]: unknown }>;
        [key: string]: unknown;
    };
}

export type ClashModule = (
    final: Record<string, unknown>,
    prev: Record<string, unknown>,
    ctx: ModuleContext,
) => Record<string, unknown>;

/**
 * Initial empty state for the Clash module system.
 */
function initialModuleState(config: ModuleContext['config']): Record<string, unknown> {
    return {
        proxies: config.proxies || [],
        'proxy-groups': [],
        rules: [],
        'rule-providers': {},
    };
}

/**
 * Merge modules into a Clash configuration.
 */
export function mergeModules(modules: ClashModule[], ctx: ModuleContext): Record<string, unknown> {
    const overlays = modules.map(mod => {
        return (final: Record<string, unknown>, prev: Record<string, unknown>) =>
            mod(final, prev, ctx);
    });

    const base = initialModuleState(ctx.config);
    return applyOverlays(base, overlays, { merge: clashModuleMerge });
}

/**
 * Remove internal metadata keys (_* prefix) and empty objects from config.
 */
export function cleanup(config: Record<string, unknown>): Record<string, unknown> {
    return genericCleanup(config);
}
