import type {
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