import type {
    SubStoreArguments,
    SubStoreRequestOptions,
    SubStoreRuntimeEnv,
    SubStoreScriptContext,
} from '../types/substore.js';

export interface SubstoreModuleContext {
    arguments: Map<string, string>;
    rawArguments: SubStoreArguments;
    options?: SubStoreRequestOptions;
    scriptContext?: SubStoreScriptContext;
    runtime: {
        env?: SubStoreRuntimeEnv;
    };
}

export interface ClashState {
    proxies: Array<Record<string, unknown>>;
    _ctx: SubstoreModuleContext;
    [key: string]: unknown;
}

export function createArgumentMap(args: SubStoreArguments): Map<string, string> {
    const map = new Map<string, string>();
    for (const [key, value] of Object.entries(args)) {
        if (value === null || typeof value === 'undefined') continue;
        map.set(key, String(value));
    }
    return map;
}

export function getSubstoreContext(state: Record<string, unknown>): SubstoreModuleContext {
    const raw = state._ctx;
    if (!isRecord(raw)) {
        throw new Error('Missing _ctx in module state.');
    }
    const args = raw.arguments;
    if (!(args instanceof Map)) {
        throw new Error('_ctx.arguments must be Map<string, string>.');
    }
    return raw as unknown as SubstoreModuleContext;
}

export function getArg(ctx: SubstoreModuleContext, key: string): string | undefined {
    return ctx.arguments.get(key);
}

export function getBooleanArg(
    ctx: SubstoreModuleContext,
    key: string,
    defaultValue: boolean,
): boolean {
    const value = ctx.arguments.get(key);
    if (typeof value === 'undefined') return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return defaultValue;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
