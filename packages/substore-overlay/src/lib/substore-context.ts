import type {
    ProxyNode,
    SubStoreArguments,
    SubStoreRequestOptions,
    SubStoreRuntimeEnv,
    SubStoreScriptContext,
} from '../types/substore.js';

export interface SubscriptionNodeInfo {
    _subName?: string;
    _subDisplayName?: string;
}

export interface MergeNodeInfo extends SubscriptionNodeInfo {
    _collectionName?: string;
    _collectionDisplayName?: string;
}

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
    proxies: ProxyNode[];
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
    if (!isSubstoreModuleContext(raw)) {
        throw new Error('Missing _ctx in module state.');
    }
    return raw;
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

export interface GetNodeSubscriptionNameOptions {
    includeCollectionName?: boolean;
    fallbackToNodeName?: boolean;
}

export function getNodeSubscriptionName(
    node: MergeNodeInfo & { name?: string; _originName?: string },
    options: GetNodeSubscriptionNameOptions = {},
): string {
    const includeCollectionName = options.includeCollectionName ?? true;
    const fallbackToNodeName = options.fallbackToNodeName ?? true;
    const subDisplay = nonEmpty(node._subDisplayName);
    if (subDisplay) return subDisplay;

    const subName = nonEmpty(node._subName);
    const collectionDisplay = nonEmpty(node._collectionDisplayName);
    const collectionName = nonEmpty(node._collectionName);

    if (includeCollectionName && subName && collectionDisplay) return `${collectionDisplay}/${subName}`;
    if (includeCollectionName && subName && collectionName) return `${collectionName}/${subName}`;
    if (subName) return subName;
    if (includeCollectionName && collectionDisplay) return collectionDisplay;
    if (includeCollectionName && collectionName) return collectionName;

    if (!fallbackToNodeName) return '';
    const originName = nonEmpty(node._originName);
    if (originName) return originName;
    const name = nonEmpty(node.name);
    if (name) return name;
    return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSubstoreModuleContext(value: unknown): value is SubstoreModuleContext {
    if (!isRecord(value)) return false;
    if (!(value.arguments instanceof Map)) return false;
    if (!isRecord(value.runtime)) return false;
    return true;
}

function nonEmpty(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
