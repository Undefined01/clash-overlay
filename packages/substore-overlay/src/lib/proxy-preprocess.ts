import type { ParsedArgs } from './helpers.js';
import type { SubStoreArguments, SubStoreScriptContext } from '../types/substore.js';

export interface ProxyPreprocessContext {
    args: ParsedArgs;
    rawArgs: SubStoreArguments;
    scriptContext?: SubStoreScriptContext;
}

export type MutableProxy = Record<string, unknown>;

export type ProxyPreprocessor = (
    proxies: MutableProxy[],
    ctx: ProxyPreprocessContext,
) => void | Promise<void>;

export async function runProxyPreprocessors(
    preprocessors: ProxyPreprocessor[],
    proxies: MutableProxy[],
    ctx: ProxyPreprocessContext,
): Promise<void> {
    for (const preprocessor of preprocessors) {
        await preprocessor(proxies, ctx);
    }
}
