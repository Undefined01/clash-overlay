// substore-overlay/src/types/substore.ts
//
// Sub-Store script runtime types extracted from:
// - ../sub-store-script-guide.md
// - ../backend/src/core/proxy-utils/processors/index.js
// - ../backend/src/vendor/open-api.js
// - ../backend/src/utils/script-resource-cache.js
//
// This file defines importable types for authoring Script Operator / Script Filter /
// file-override scripts in TypeScript with better editor feedback.

/**
 * Supported output targets used by Sub-Store producers/processors.
 *
 * In practice, this is the `targetPlatform` argument passed to
 * `operator(proxies, targetPlatform, context)` or
 * `filter(proxies, targetPlatform, context)`.
 *
 * Example values:
 * - `ClashMeta`
 * - `Surge`
 * - `QX`
 * - `sing-box`
 */
export type TargetPlatform =
    | 'Surge'
    | 'SurgeMac'
    | 'QX'
    | 'Loon'
    | 'Stash'
    | 'Clash'
    | 'ClashMeta'
    | 'mihomo'
    | 'sing-box'
    | 'Egern'
    | 'Shadowrocket'
    | 'Surfboard'
    | 'JSON'
    | string;

/**
 * Raw script arguments passed through `$arguments`.
 *
 * Source of arguments:
 * - Remote script URL hash fragment (`#...`)
 * - Inline script `args.arguments` object in Sub-Store
 *
 * URL example:
 * `https://example.com/script.js#prefix=%5BUS%5D&udp=true&timeout=5000`
 *
 * Runtime value example:
 * `{ prefix: '[US]', udp: 'true', timeout: '5000' }`
 *
 * JSON hash example:
 * `https://example.com/script.js#%7B%22prefix%22%3A%22%5BUS%5D%22%7D`
 *
 * Runtime value example:
 * `{ prefix: '[US]' }`
 */
export type SubStoreArguments = Record<string, unknown>;

/**
 * Runtime environment capabilities exposed by `$substore.env`.
 *
 * These flags indicate where the script executes (Node or app sandbox).
 *
 * Example:
 * ```ts
 * if ($substore.env.isNode) {
 *     // Use Node-specific logic
 * }
 * ```
 */
export interface SubStoreRuntimeEnv {
    isNode: boolean;
    isQX: boolean;
    isLoon: boolean;
    isSurge: boolean;
    isStash: boolean;
    isShadowRocket: boolean;
    isEgern: boolean;
    isLanceX: boolean;
    isGUIforCores: boolean;
    [key: string]: unknown;
}

/**
 * HTTP request options accepted by `$substore.http.<method>()`.
 *
 * Example:
 * ```ts
 * const resp = await $substore.http.get({
 *     url: 'https://api.example.com/data',
 *     headers: { 'User-Agent': 'SubStore' },
 *     timeout: 5000,
 * });
 * ```
 */
export interface SubStoreHttpRequest {
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    /**
     * Platform node string, mainly used by Surge/Loon style runtimes.
     *
     * Example: produce one proxy and pass it as `node` for outbound request.
     */
    node?: string;
    [key: string]: unknown;
}

/**
 * HTTP response shape returned by `$substore.http.<method>()`.
 *
 * Example:
 * ```ts
 * const data = JSON.parse(resp.body);
 * const status = resp.statusCode;
 * const contentType = resp.headers['content-type'];
 * ```
 */
export interface SubStoreHttpResponse {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
    [key: string]: unknown;
}

/**
 * Minimal HTTP client surface exposed by Sub-Store's OpenAPI instance.
 */
export interface SubStoreHttpClient {
    get(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    post(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    put(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    delete(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    head(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    options(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
    patch(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse>;
}

/**
 * Script execution context metadata (`context` argument in operator/filter).
 *
 * `context.env` is runtime/build metadata.
 * `context.source` is source subscription metadata.
 *
 * Common patterns:
 * - Single subscription output:
 *   `{ "sub-name": { name, displayName, ... } }`
 * - Collection output:
 *   `{ "_collection": { name, displayName, subscriptions, ... } }`
 * - Sub in collection:
 *   `{ "sub-name": {...}, "_collection": {...} }`
 */
export interface SubStoreScriptContext {
    env: {
        backend?: string;
        version?: string;
        feature?: Record<string, unknown>;
        meta?: Record<string, unknown>;
        [key: string]: unknown;
    };
    source: Record<string, {
        name?: string;
        displayName?: string;
        [key: string]: unknown;
    }> & {
        _collection?: {
            name?: string;
            displayName?: string;
            subscriptions?: string[];
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}

/**
 * HTTP request/response/query envelope available in `$options`.
 *
 * You can inspect request metadata via `_req` and override response via `_res`.
 *
 * Example:
 * ```ts
 * if ($options) {
 *     $options._res = {
 *         status: 200,
 *         headers: { 'Cache-Control': 'no-cache' },
 *     };
 * }
 * ```
 */
export interface SubStoreRequestOptions {
    _req?: {
        url?: string;
        headers?: Record<string, string | undefined>;
        [key: string]: unknown;
    };
    _res?: {
        status?: number;
        headers?: Record<string, string>;
        body?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

/**
 * Common file input payload used by file/mihomoProfile script execution mode.
 *
 * In file mode, the script input is not proxy array, but a content object.
 *
 * Example shape:
 * ```ts
 * {
 *   $content: '...yaml text...',
 *   $files: ['...raw file text...'],
 *   $file: { type: 'mihomoProfile', sourceType: 'collection', sourceName: 'airport' }
 * }
 * ```
 */
export interface SubStoreFileInput {
    $content?: string;
    $files?: string[];
    $options?: SubStoreRequestOptions;
    $file?: {
        type?: string;
        sourceType?: 'subscription' | 'collection' | 'file' | 'rule' | 'none' | string;
        sourceName?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

/**
 * TTL-based script cache (`scriptResourceCache`).
 *
 * Example:
 * ```ts
 * scriptResourceCache.set('ip:1.1.1.1', { country: 'US' }, 3600 * 1000);
 * const cached = scriptResourceCache.get('ip:1.1.1.1');
 * scriptResourceCache._cleanup('ip:');
 * ```
 */
export interface ScriptResourceCache {
    set(id: string, value: unknown, ttl?: number): void;
    get(id: string, ttl?: number, remove?: boolean): unknown | null;
    gettime(id: string): number | null;
    _cleanup(prefix?: string, ttl?: number): void;
    revokeAll?(): void;
}

/**
 * Artifact producer input for `produceArtifact`.
 *
 * Example:
 * ```ts
 * const clashProxies = await produceArtifact({
 *     type: 'collection',
 *     name: 'airport',
 *     platform: 'ClashMeta',
 *     produceType: 'internal',
 * });
 * ```
 */
export interface ProduceArtifactOptions {
    type: 'subscription' | 'collection' | 'file' | 'rule';
    name?: string;
    platform?: TargetPlatform;
    produceType?: 'internal' | 'raw' | string;
    produceOpts?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    url?: string;
    ua?: string;
    content?: string;
    mergeSources?: 'localFirst' | 'remoteFirst';
    noCache?: boolean;
    proxy?: string;
    $options?: SubStoreRequestOptions;
    [key: string]: unknown;
}

/**
 * Minimal OpenAPI shape passed into scripts as `$substore`.
 *
 * This interface intentionally models only stable script-facing members.
 *
 * Persistence examples:
 * ```ts
 * $substore.write('value', 'my_key');
 * const v = $substore.read('my_key');
 * $substore.delete('my_key');
 * ```
 *
 * For global persistence, scripts can use keys that start with `#`.
 * Example: `#global_token`.
 */
export interface SubStoreOpenAPI {
    env: SubStoreRuntimeEnv;
    http: SubStoreHttpClient;
    read(key: string): unknown;
    write(data: string, key: string): unknown;
    delete(key: string): unknown;
    log(...args: unknown[]): void;
    info(...args: unknown[]): void;
    error(...args: unknown[]): void;
    wait?(t: number): Promise<void>;
    [key: string]: unknown;
}

/**
 * Function signature for Script Operator mode.
 *
 * Proxy mode example:
 * ```ts
 * const op: ScriptOperator = (proxies, targetPlatform, context) => proxies;
 * ```
 *
 * File mode example:
 * ```ts
 * const op: ScriptOperator = (input) => ({ ...input, $content: 'patched' });
 * ```
 */
export type ScriptOperator<TProxy = Record<string, unknown>> = (
    proxies: TProxy[] | SubStoreFileInput,
    targetPlatform: TargetPlatform,
    context: SubStoreScriptContext,
) => TProxy[] | SubStoreFileInput | Promise<TProxy[] | SubStoreFileInput>;

/**
 * Function signature for Script Filter mode.
 *
 * Example:
 * ```ts
 * const filter: ScriptFilter = (proxies) => proxies.map((p) => p.type === 'vmess');
 * ```
 */
export type ScriptFilter<TProxy = Record<string, unknown>> = (
    proxies: TProxy[],
    targetPlatform: TargetPlatform,
    context: SubStoreScriptContext,
) => boolean[] | Promise<boolean[]>;

/**
 * Signature used by mihomoProfile scripts with `main(config)`.
 *
 * Example:
 * ```ts
 * const main: MihomoMain = (config) => {
 *     config.dns = { ...(config.dns as object), enable: true };
 *     return config;
 * };
 * ```
 */
export type MihomoMain = <TConfig extends Record<string, unknown>>(
    config: TConfig,
) => TConfig | Promise<TConfig>;
