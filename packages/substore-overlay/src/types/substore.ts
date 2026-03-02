// substore-overlay/src/types/substore.ts
//
// Sub-Store script runtime types extracted from:
// - ../sub-store-script-guide.md
// - ../backend/src/core/proxy-utils/processors/index.js (createDynamicFunction injection surface)
// - ../backend/src/vendor/open-api.js (OpenAPI / HTTP / ENV)
// - ../backend/src/core/proxy-utils/index.js (ProxyUtils surface)
// - ../backend/src/utils/script-resource-cache.js (scriptResourceCache)
// - ../backend/src/utils/yaml.js (YAML wrapper)
// - ../backend/src/utils/flow.js (flowUtils)
// - ../backend/src/utils/download.js (ProxyUtils.download / downloadFile)
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
 * Notes:
 * - `timeout` is expressed in **milliseconds**. Sub-Store converts it to seconds for
 *   some app runtimes internally.
 * - Some fields only have effect in specific runtimes (for example `proxy` is mainly
 *   used in Node backend runtime).
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
    /** Absolute URL (recommended). Some internal helpers support `baseURL` via wrappers. */
    url: string;
    headers?: Record<string, string>;
    body?: string;
    /**
     * Timeout in milliseconds.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.get({ url: 'https://example.com', timeout: 8000 });
     * // resp.statusCode => 200
     * ```
     */
    timeout?: number;
    /**
     * Platform node string, mainly used by Surge/Loon style runtimes.
     *
     * Example: produce one proxy and pass it as `node` for outbound request.
     */
    node?: string;
    /**
     * Explicit proxy URL used by Node backend runtime and some desktop runtimes.
     *
     * Supported formats depend on runtime, but commonly include:
     * - `http://127.0.0.1:7890`
     * - `socks5://127.0.0.1:7891`
     */
    proxy?: string;
    /**
     * Quantumult X request options.
     *
     * Commonly used to select a policy:
     * `{ opts: { policy: 'ProxyName' } }`
     */
    opts?: Record<string, unknown>;
    /**
     * TLS/security controls (mainly Node backend runtime).
     *
     * - `insecure: true` or `strictSSL: false` disables TLS certificate validation.
     */
    insecure?: boolean;
    strictSSL?: boolean;
    rejectUnauthorized?: boolean;
    /**
     * Node backend runtime response decoding.
     *
     * When `encoding` is set to `null`, Sub-Store may return an `ArrayBuffer` as
     * `resp.body` instead of a string.
     */
    encoding?: null | string;
    /** Extra TLS options for Node backend runtime. */
    tls?: Record<string, unknown>;
    /**
     * Request lifecycle hooks.
     *
     * @example
     * ```ts
     * await $substore.http.get({
     *   url: 'https://example.com',
     *   events: {
     *     onRequest: (method, options) => $substore.info(`${method} ${options.url}`),
     *   },
     * });
     * ```
     */
    events?: SubStoreHttpEvents;
    [key: string]: unknown;
}

/**
 * Optional request hooks supported by `$substore.http`.
 */
export interface SubStoreHttpEvents<TBody = string> {
    onRequest?: (method: string, options: SubStoreHttpRequest) => void;
    onResponse?: (
        response: SubStoreHttpResponse<TBody>,
    ) => SubStoreHttpResponse<TBody> | Promise<SubStoreHttpResponse<TBody>>;
    onTimeout?: () => void;
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
export interface SubStoreHttpResponse<TBody = string> {
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: TBody;
    [key: string]: unknown;
}

/**
 * Minimal HTTP client surface exposed by Sub-Store's OpenAPI instance.
 */
export interface SubStoreHttpClient {
    /**
     * Perform an HTTP GET request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.get({ url: 'https://httpbin.org/get' });
     * // resp.statusCode => 200
     * // resp.body => '{ ... }'
     * ```
     */
    get<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP POST request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.post({
     *   url: 'https://httpbin.org/post',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ a: 1 }),
     * });
     * // resp.statusCode => 200
     * ```
     */
    post<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP PUT request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.put({ url: 'https://example.com', body: 'x=1' });
     * // resp.statusCode => number
     * ```
     */
    put<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP DELETE request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.delete({ url: 'https://example.com/resource/1' });
     * // resp.statusCode => number
     * ```
     */
    delete<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP HEAD request.
     *
     * Commonly used for checking `subscription-userinfo` response headers.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.head({ url: 'https://example.com/sub.txt' });
     * // resp.headers['subscription-userinfo'] => 'upload=...; download=...; total=...'
     * ```
     */
    head<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP OPTIONS request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.options({ url: 'https://example.com' });
     * // resp.statusCode => number
     * ```
     */
    options<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;

    /**
     * Perform an HTTP PATCH request.
     *
     * @example
     * ```ts
     * const resp = await $substore.http.patch({
     *   url: 'https://example.com/resource/1',
     *   headers: { 'Content-Type': 'application/json' },
     *   body: JSON.stringify({ a: 2 }),
     * });
     * // resp.statusCode => number
     * ```
     */
    patch<TBody = string>(req: SubStoreHttpRequest): Promise<SubStoreHttpResponse<TBody>>;
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
    };
}

/**
 * TTL-based script cache (`scriptResourceCache`).
 *
 * This cache is persisted by Sub-Store backend and shared across script runs.
 *
 * TTL unit:
 * - All TTL parameters are in **milliseconds**.
 *
 * "Minimum remaining TTL" behavior:
 * - `get(id, ttl)` and `_cleanup(prefix, ttl)` treat the `ttl` argument as the minimum remaining time.
 *   If an entry will expire within `ttl` milliseconds, it is treated as "not valid enough" and will
 *   not be returned (and may be cleaned up).
 *
 * Example:
 * ```ts
 * scriptResourceCache.set('ip:1.1.1.1', { country: 'US' }, 3600 * 1000);
 * const cached = scriptResourceCache.get('ip:1.1.1.1');
 * scriptResourceCache._cleanup('ip:');
 * ```
 */
export interface ScriptResourceCache {
    /**
     * Set a cache entry.
     *
     * @param id Unique cache key.
     * @param value Cached value (must be JSON-serializable).
     * @param ttl Expiration TTL in milliseconds. If omitted, Sub-Store uses configured default TTL.
     *
     * @example
     * ```ts
     * scriptResourceCache.set('geo:1.1.1.1', { countryCode: 'US' }, 24 * 3600 * 1000);
     * ```
     */
    set(id: string, value: unknown, ttl?: number): void;

    /**
     * Get a cache entry.
     *
     * @param id Unique cache key.
     * @param ttl Minimum remaining TTL in milliseconds. If provided and the entry will expire sooner
     * than `ttl`, this returns `null`.
     * @param remove When `true`, remove the entry immediately if it is expired/insufficient.
     *
     * @example
     * ```ts
     * const cached = scriptResourceCache.get('geo:1.1.1.1');
     * // cached => { countryCode: 'US' } | null
     * ```
     */
    get(id: string, ttl?: number, remove?: boolean): unknown | null;

    /**
     * Get the stored expiration timestamp for a cache entry.
     *
     * @returns Expiration time in milliseconds since epoch, or `null` if missing/expired.
     *
     * @example
     * ```ts
     * const exp = scriptResourceCache.gettime('geo:1.1.1.1');
     * // exp => 1710000000000 | null
     * ```
     */
    gettime(id: string): number | null;

    /**
     * Cleanup cache entries.
     *
     * @param prefix Optional prefix filter. When set, only keys starting with `prefix` are considered.
     * @param ttl Minimum remaining TTL in milliseconds. Entries expiring earlier than now + ttl are deleted.
     *
     * @example
     * ```ts
     * // Delete all `geo:` entries that will expire within the next hour.
     * scriptResourceCache._cleanup('geo:', 3600 * 1000);
     * ```
     */
    _cleanup(prefix?: string, ttl?: number): void;

    /**
     * Clear all cached entries.
     *
     * @example
     * ```ts
     * scriptResourceCache.revokeAll();
     * ```
     */
    revokeAll(): void;
}

/**
 * Artifact producer input for `produceArtifact`.
 *
 * `produceArtifact` is Sub-Store's internal "render anything" helper:
 * - subscription -> parse proxies -> apply processors -> produce for platform
 * - collection   -> merge subscriptions -> apply processors -> produce for platform
 * - file         -> download/merge raw files -> apply processors -> return `$content` (or full object)
 * - rule         -> download/merge rules -> produce for platform
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
    /**
     * Artifact type.
     *
     * Aliases:
     * - `sub` is an alias of `subscription`
     * - `col` is an alias of `collection`
     */
    type: 'subscription' | 'sub' | 'collection' | 'col' | 'file' | 'rule';
    name?: string;
    platform?: TargetPlatform;
    /**
     * Produce output type.
     *
     * Common values:
     * - `internal`: return an internal representation (for proxy producers this usually means a string array)
     * - `raw`: for some file producers, return raw JSON stringified payload
     */
    produceType?: 'internal' | 'raw' | string;
    produceOpts?: Record<string, unknown>;
    subscription?: Record<string, unknown>;
    url?: string;
    ua?: string;
    content?: string;
    mergeSources?: 'localFirst' | 'remoteFirst';
    /**
     * Override subscription-level `ignoreFailedRemoteSub`.
     *
     * Observed values:
     * - `false`: throw on remote download errors
     * - `true`: ignore remote download errors
     * - `'enabled'`: ignore errors and send a notification
     */
    ignoreFailedRemoteSub?: boolean | 'enabled' | string;
    /**
     * Override file-level `ignoreFailedRemoteFile`.
     *
     * Observed values:
     * - `false`: throw on remote download errors
     * - `true`: ignore remote download errors
     * - `'enabled'`: ignore errors and send a notification
     */
    ignoreFailedRemoteFile?: boolean | 'enabled' | string;
    /**
     * When `true`, Sub-Store will try to update a custom cache key synchronously
     * while still returning cached content.
     */
    awaitCustomCache?: boolean;
    noCache?: boolean;
    proxy?: string;
    $options?: SubStoreRequestOptions;
    /**
     * For `type: 'file'`:
     * - `all: true` returns the full processed object (`{ $content, $files, $options, $file }`)
     * - otherwise returns `processed.$content` only
     */
    all?: boolean;
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
    /** Instance name used as the default persistence namespace. */
    name?: string;
    /** Enable debug logs for `$substore.log(...)`. */
    debug?: boolean;

    env: SubStoreRuntimeEnv;
    http: SubStoreHttpClient;

    /**
     * Read a persisted value by key.
     *
     * Key namespaces:
     * - Normal keys: persisted within the Sub-Store instance namespace.
     * - Keys containing `#`: treated as "global keys" and stored outside the instance namespace.
     *
     * @example
     * ```ts
     * $substore.write('hello', 'my_key');
     * const v = $substore.read('my_key');
     * // v => 'hello'
     * ```
     *
     * @example
     * ```ts
     * $substore.write('token', '#global_token');
     * const token = $substore.read('#global_token');
     * // token => 'token'
     * ```
     */
    read(key: string): unknown;

    /**
     * Persist a value by key.
     *
     * Notes:
     * - Values must be JSON-serializable for non-global keys.
     * - For "global keys" (`#...`), prefer writing strings.
     *
     * @example
     * ```ts
     * $substore.write(JSON.stringify({ a: 1 }), 'my_json');
     * ```
     */
    write(data: unknown, key: string): unknown;

    /**
     * Delete a persisted value by key.
     *
     * @example
     * ```ts
     * $substore.delete('my_key');
     * $substore.delete('#global_token');
     * ```
     */
    delete(key: string): unknown;

    /**
     * Send a notification.
     *
     * Sub-Store will map `open-url`/`media-url` to platform-specific fields.
     *
     * @example
     * ```ts
     * $substore.notify('Sub-Store', 'Hello', 'World', { 'open-url': 'https://example.com' });
     * ```
     */
    notify(
        title: string,
        subtitle?: string,
        content?: string,
        options?: Record<string, unknown>,
    ): void;

    /**
     * Debug log (only prints when `debug` is enabled).
     *
     * @param message Message text.
     *
     * @example
     * ```ts
     * $substore.log('debug: starting rename');
     * ```
     */
    log(message: string): void;

    /**
     * Info log.
     *
     * @param message Message text.
     *
     * @example
     * ```ts
     * $substore.info('processed 100 proxies');
     * ```
     */
    info(message: string): void;

    /**
     * Error log.
     *
     * @param message Message text.
     *
     * @example
     * ```ts
     * $substore.error('unexpected input');
     * ```
     */
    error(message: string): void;

    /**
     * Sleep for `t` milliseconds.
     *
     * @example
     * ```ts
     * await $substore.wait(1000);
     * ```
     */
    wait(t: number): Promise<void>;

    /**
     * Finish a script with a custom response object.
     *
     * This is mainly meaningful in app runtimes that expose `$done(...)` (QX/Loon/Surge).
     * In Node backend runtime, Sub-Store may write to an internal `$context`.
     *
     * @example
     * ```ts
     * $substore.done({ statusCode: 200, body: 'ok' });
     * ```
     */
    done?(value?: { headers?: Record<string, string>; statusCode?: number; body?: string }): void;

    /**
     * Node-only helpers (available when `$substore.env.isNode` is true).
     *
     * Sub-Store exposes `fs` for some internal operations; scripts may access it
     * but should treat it as an advanced feature.
     */
    node?: {
        fs?: unknown;
        [key: string]: unknown;
    } | null;

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
export type ScriptOperator<TProxy = ProxyNode, TOutProxy = TProxy> = (
    proxies: TProxy[] & SubStoreFileInput,
    targetPlatform: TargetPlatform,
    context: SubStoreScriptContext,
) => TOutProxy[] | Promise<TOutProxy[]>;

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

/**
 * Node-style `require` optionally injected into the Sub-Store script runtime.
 *
 * Availability:
 * - Present in Node runtime (Sub-Store backend).
 * - Usually `undefined` in mobile app sandboxes.
 *
 * Example:
 * ```ts
 * const fs = require?.('fs') as { readFileSync(path: string, enc: string): string } | undefined;
 * const content = fs?.readFileSync('/tmp/a.txt', 'utf8');
 * ```
 */
export type SubStoreRequire = (id: string) => unknown;

/**
 * YAML helper object injected as `yaml` (also available as `ProxyUtils.yaml`).
 *
 * Backed by `static-js-yaml` with a Sub-Store retry wrapper to work around edge cases.
 *
 * Notes:
 * - `safeLoad`/`safeDump` are the most common pair used in scripts.
 * - `parse` is an alias of `safeLoad`, `stringify` is an alias of `safeDump`.
 */
export interface SubStoreYaml {
    /**
     * Parse YAML into a JS value (safe mode).
     *
     * @example
     * ```ts
     * const obj = yaml.safeLoad<{ a: number }>('a: 1');
     * // obj => { a: 1 }
     * ```
     */
    safeLoad<T = unknown>(content: string, ...args: unknown[]): T;

    /**
     * Parse YAML into a JS value.
     *
     * @example
     * ```ts
     * const obj = yaml.load('a: 1');
     * // obj => { a: 1 }
     * ```
     */
    load<T = unknown>(content: string, ...args: unknown[]): T;

    /**
     * Dump a JS value into YAML (safe mode).
     *
     * @example
     * ```ts
     * const text = yaml.safeDump({ a: 1 });
     * // text => 'a: 1\\n'
     * ```
     */
    safeDump(content: unknown, ...args: unknown[]): string;

    /**
     * Dump a JS value into YAML.
     *
     * @example
     * ```ts
     * const text = yaml.dump({ a: 1 });
     * // text => 'a: 1\\n'
     * ```
     */
    dump(content: unknown, ...args: unknown[]): string;

    /**
     * Alias of {@link SubStoreYaml.safeLoad}.
     *
     * @example
     * ```ts
     * const obj = yaml.parse('a: 1');
     * // obj => { a: 1 }
     * ```
     */
    parse<T = unknown>(content: string, ...args: unknown[]): T;

    /**
     * Alias of {@link SubStoreYaml.safeDump}.
     *
     * @example
     * ```ts
     * const text = yaml.stringify({ a: 1 });
     * // text => 'a: 1\\n'
     * ```
     */
    stringify(content: unknown, ...args: unknown[]): string;
}

/**
 * Minimal `Buffer` instance surface used in Sub-Store scripts.
 *
 * Sub-Store injects a Node-compatible Buffer implementation as `Buffer`
 * (also available as `ProxyUtils.Buffer`).
 */
export interface SubStoreBuffer {
    /**
     * Convert buffer to a string.
     *
     * Common encodings:
     * - `utf8`
     * - `base64`
     * - `hex`
     *
     * @example
     * ```ts
     * const b = Buffer.from('hello', 'utf8');
     * const s = b.toString('base64');
     * // s => 'aGVsbG8='
     * ```
     */
    toString(encoding?: string): string;

    /** Byte length. */
    readonly length: number;
}

/**
 * Minimal `Buffer` constructor surface injected into scripts.
 */
export interface SubStoreBufferConstructor {
    /**
     * Create a buffer from a string or bytes.
     *
     * @example
     * ```ts
     * const token = Buffer.from('user:pass', 'utf8').toString('base64');
     * // token => 'dXNlcjpwYXNz'
     * ```
     */
    from(data: string, encoding?: string): SubStoreBuffer;
    from(data: Uint8Array | ArrayBuffer | ReadonlyArray<number>): SubStoreBuffer;

    /**
     * Allocate a new buffer.
     *
     * @example
     * ```ts
     * const b = Buffer.alloc(4);
     * // b.length => 4
     * ```
     */
    alloc(size: number, fill?: string | number, encoding?: string): SubStoreBuffer;

    /**
     * Type guard.
     *
     * @example
     * ```ts
     * const v: unknown = Buffer.from('a');
     * if (Buffer.isBuffer(v)) {
     *   // v is SubStoreBuffer
     *   const s = v.toString('utf8');
     *   // s => 'a'
     * }
     * ```
     */
    isBuffer(value: unknown): value is SubStoreBuffer;
}

/**
 * js-base64 compatible object (injected as `ProxyUtils.Base64`).
 */
export interface SubStoreBase64 {
    /**
     * Base64-encode a string.
     *
     * @example
     * ```ts
     * const out = ProxyUtils.Base64.encode('hello');
     * // out => 'aGVsbG8='
     * ```
     */
    encode(input: string): string;

    /**
     * Base64-decode into a string.
     *
     * @example
     * ```ts
     * const out = ProxyUtils.Base64.decode('aGVsbG8=');
     * // out => 'hello'
     * ```
     */
    decode(input: string): string;

    [key: string]: unknown;
}

/**
 * Base64 decode helper injected as `b64d`.
 *
 * Equivalent to `ProxyUtils.Base64.decode`.
 */
export type SubStoreBase64Decode = (input: string) => string;

/**
 * Base64 encode helper injected as `b64e`.
 *
 * Equivalent to `ProxyUtils.Base64.encode`.
 */
export type SubStoreBase64Encode = (input: string) => string;

/**
 * Parsed `subscription-userinfo` style traffic metadata.
 *
 * This matches Sub-Store's internal `parseFlowHeaders` output.
 *
 * Units:
 * - `upload`/`download`/`total` are **kilobytes (KB)** in the header format.
 * - Many scripts convert them into bytes or human-readable strings.
 */
export interface SubStoreFlowInfo {
    /** Expiration timestamp in seconds (UNIX time). */
    expires?: number;
    /** Total quota in KB. */
    total: number;
    /** Usage in KB. */
    usage: {
        upload: number;
        download: number;
    };
    /** Optional reset day in month (from `reset_day=`), or computed remaining days. */
    remainingDays?: number;
    /** Optional subscription web page URL. */
    appUrl?: string;
    /** Optional plan name. */
    planName?: string;
}

export type SubStoreFlowUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB' | 'EB' | 'ZB' | 'YB';

/**
 * Result of `flowTransfer`.
 */
export interface SubStoreFlowTransferResult {
    value: string;
    unit: SubStoreFlowUnit;
}

/**
 * Normalized response headers when `normalizeFlowHeader(..., true)` is used.
 */
export interface SubStoreNormalizedFlowHeaders {
    'subscription-userinfo': string;
    'profile-web-page-url'?: string;
    'plan-name'?: string;
    [key: string]: unknown;
}

/**
 * Flow header utilities injected as `flowUtils`.
 *
 * This is a stable, script-facing wrapper around Sub-Store's internal traffic helpers.
 */
export interface SubStoreFlowUtils {
    /**
     * Extract a normalized `subscription-userinfo`-like string from HTTP response headers.
     *
     * It reads (case-insensitive) keys:
     * - `subscription-userinfo`
     * - `profile-web-page-url` (mapped to `app_url=...`)
     * - `plan-name` (mapped to `plan_name=...`)
     *
     * @example
     * ```ts
     * const field = flowUtils.getFlowField({
     *   'subscription-userinfo': 'upload=1; download=2; total=100',
     *   'profile-web-page-url': 'https://example.com',
     * });
     * // field => 'upload=1; download=2; total=100; app_url=https%3A%2F%2Fexample.com'
     * ```
     */
    getFlowField(headers: Record<string, string>): string;

    /**
     * Fetch flow headers from a subscription URL.
     *
     * Behavior (simplified):
     * - Parse `#...` fragment arguments in the URL (supports JSON or `a=b&c=d`).
     * - If `noFlow` is truthy, returns `undefined`.
     * - Prefer `HEAD` request, fall back to `GET` if needed.
     * - Cache results internally (unless `noCache` is set).
     *
     * Important: this function is primarily designed for Sub-Store internal usage.
     * Scripts can call it, but should handle `undefined` and errors gracefully.
     *
     * @example
     * ```ts
     * const flowHeader = await flowUtils.getFlowHeaders(
     *   'https://example.com/sub.txt',
     *   'clash.meta/v1.19.16',
     *   8000,
     * );
     * // flowHeader => 'upload=...; download=...; total=...; expire=...'
     * ```
     */
    getFlowHeaders(
        rawUrl?: string,
        ua?: string,
        timeout?: number,
        customProxy?: string,
        flowUrl?: string,
    ): Promise<string | undefined>;

    /**
     * Parse a `subscription-userinfo` header string into a structured object.
     *
     * @example
     * ```ts
     * const flow = flowUtils.parseFlowHeaders('upload=1; download=2; total=100; expire=1710000000');
     * // flow => { expires: 1710000000, total: 100, usage: { upload: 1, download: 2 }, ... }
     * ```
     */
    parseFlowHeaders(flowHeaders?: string): SubStoreFlowInfo | undefined;

    /**
     * Convert a numeric flow amount into a human-readable value + unit.
     *
     * Note: this utility assumes the input is already in bytes when using the default unit `B`.
     *
     * @example
     * ```ts
     * const t = flowUtils.flowTransfer(1024);
     * // t => { value: '1', unit: 'KB' }
     * ```
     */
    flowTransfer(flow: number, unit?: SubStoreFlowUnit): SubStoreFlowTransferResult;

    /**
     * Validate a parsed flow header object.
     *
     * It throws when:
     * - Flow is missing.
     * - The subscription is expired (`expires` < now).
     * - The quota is exhausted (`total - upload - download < 0`).
     *
     * @example
     * ```ts
     * const flow = flowUtils.parseFlowHeaders('upload=1; download=2; total=100')!;
     * flowUtils.validCheck(flow);
     * // returns void (no error)
     * ```
     */
    validCheck(flow: SubStoreFlowInfo | undefined): void;

    /**
     * Compute remaining days until reset.
     *
     * Supported modes:
     * - Monthly reset: pass `resetDay` (1-31)
     * - Cycle reset: pass `startDate` + `cycleDays`
     *
     * @example
     * ```ts
     * const days = flowUtils.getRmainingDays({ resetDay: 1 });
     * // days => number | undefined
     * ```
     */
    getRmainingDays(
        opt?:
            | { resetDay?: string | number; startDate?: string; cycleDays?: string | number }
            | string
            | number,
    ): number | undefined;

    /**
     * Normalize a flow header string into a stable format.
     *
     * When `splitHeaders` is:
     * - `true`: returns a headers object with `subscription-userinfo`, `profile-web-page-url`, `plan-name`.
     * - `false`/`undefined`: returns the normalized `subscription-userinfo` string.
     *
     * @example
     * ```ts
     * const normalized = flowUtils.normalizeFlowHeader('upload=1; download=2; total=100');
     * // normalized => 'upload=1; download=2; total=100'
     * ```
     */
    normalizeFlowHeader(flowHeaders: string, splitHeaders?: false | undefined): string;
    normalizeFlowHeader(flowHeaders: string, splitHeaders: true): SubStoreNormalizedFlowHeaders;
}

/**
 * `$persistentStore` (Surge/Loon) compatibility layer.
 *
 * Sub-Store passes this object into scripts for Loon via `createDynamicFunction`,
 * and it may also exist as a global in Surge/Loon runtimes.
 */
export interface SubStorePlatformPersistentStore {
    /**
     * Read a value by key.
     *
     * @example
     * ```ts
     * const value = $persistentStore.read('my_key');
     * // value => string | null
     * ```
     */
    read(key: string): string | null;

    /**
     * Write a value by key.
     *
     * Passing `null` is commonly used to delete a key.
     *
     * @example
     * ```ts
     * $persistentStore.write('hello', 'my_key');
     * $persistentStore.write(null, 'my_key'); // delete
     * ```
     */
    write(value: string | null, key: string): boolean;
}

/**
 * `$notification` (Surge/Loon) compatibility layer.
 */
export interface SubStorePlatformNotification {
    /**
     * Post a notification.
     *
     * The `options` shape varies by client:
     * - Surge: `{ url?: string }`
     * - Loon: `{ openUrl?: string; mediaUrl?: string }`
     *
     * @example
     * ```ts
     * $notification.post('Title', 'Subtitle', 'Body');
     * ```
     */
    post(
        title: string,
        subtitle: string,
        body: string,
        options?: Record<string, unknown>,
    ): void;
}

/**
 * `$httpClient` (Surge/Loon) callback-style HTTP client.
 *
 * This is exposed by client runtimes; Sub-Store also uses it internally.
 *
 * Note: Prefer `$substore.http` when possible; it returns Promises and normalizes response shape.
 */
export interface SubStorePlatformHttpClient {
    /**
     * Perform a GET request (callback-style).
     *
     * @param options Request options (shape differs by client; `url` is required).
     * @param callback Callback receiving `(error, response, body)`.
     *
     * @example
     * ```ts
     * $httpClient?.get({ url: 'https://example.com' }, (err, resp, body) => {
     *   if (err) return;
     *   // resp.status || resp.statusCode => number
     *   // body => string
     * });
     * ```
     */
    get(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform a POST request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.post(
     *   { url: 'https://example.com', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
     *   (err, resp, body) => {
     *     if (err) return;
     *     // body => string
     *   },
     * );
     * ```
     */
    post(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform a PUT request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.put({ url: 'https://example.com', body: 'a=2' }, (err, resp, body) => {
     *   if (err) return;
     *   // body => string
     * });
     * ```
     */
    put(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform a DELETE request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.delete({ url: 'https://example.com/resource/1' }, (err, resp, body) => {
     *   if (err) return;
     *   // resp.statusCode => number
     * });
     * ```
     */
    delete(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform a HEAD request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.head({ url: 'https://example.com/sub.txt' }, (err, resp) => {
     *   if (err) return;
     *   const flow = resp.headers?.['subscription-userinfo'];
     *   // flow => 'upload=...; download=...; total=...'
     * });
     * ```
     */
    head(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform an OPTIONS request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.options({ url: 'https://example.com' }, (err, resp, body) => {
     *   if (err) return;
     *   // body => string
     * });
     * ```
     */
    options(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;

    /**
     * Perform a PATCH request (callback-style).
     *
     * @example
     * ```ts
     * $httpClient?.patch({ url: 'https://example.com/resource/1', body: 'a=3' }, (err, resp, body) => {
     *   if (err) return;
     *   // body => string
     * });
     * ```
     */
    patch(options: SubStoreHttpRequest, callback: SubStorePlatformHttpCallback): void;
}

/**
 * Callback used by `$httpClient.<method>()`.
 *
 * @param error Network/runtime error (implementation-specific). `null`/`undefined` on success.
 * @param response Response metadata. Different clients use `status` or `statusCode`.
 * @param body Response body text.
 *
 * @example
 * ```ts
 * const cb: SubStorePlatformHttpCallback = (err, resp, body) => {
 *   if (err) return;
 *   const code = Number(resp.statusCode || resp.status || 0);
 *   // code => 200
 *   // body => '...'
 * };
 * ```
 */
export type SubStorePlatformHttpCallback = (
    error: unknown,
    response: {
        status?: number;
        statusCode?: number;
        headers?: Record<string, string | string[] | undefined>;
        [key: string]: unknown;
    },
    body: string,
) => void;

/**
 * Minimal proxy/node object parsed and produced by Sub-Store ProxyUtils.
 *
 * Sub-Store supports many proxy types; scripts generally treat proxies as plain objects.
 */
export abstract class ProxyNode {
    /**
     * Node display name.
     *
     * This value is frequently rewritten by scripts (for example rename operators).
     */
    name!: string;

    /**
     * Node type (example: `ss`, `vmess`, `vless`, `trojan`, `hysteria2`, ...).
     *
     * Sub-Store uses this to select producer/parser logic for different platforms.
     */
    type!: string;

    // Sub-Store proxies carry many fields depending on `type`.
    // Use `any` to match Sub-Store's JS runtime behavior and keep scripts ergonomic.
    [key: string]: any;
}

/**
 * Default proxy object shape returned by `ProxyUtils.parse(...)` and consumed by `ProxyUtils.process(...)`.
 *
 * This is a structural type: plain objects with `name` + `type` fields will match.
 */
export interface SubStoreProxy extends ProxyNode {
    server?: string;
    port?: number;
}

/**
 * Operator/processor item used by `ProxyUtils.process`.
 *
 * Sub-Store uses a list of these items to apply processors (built-in or script-based).
 */
export interface SubStoreProcessorItem {
    type: string;
    args?: Record<string, unknown>;
    disabled?: boolean;
    [key: string]: unknown;
}

/**
 * DNS-over-HTTPS request options for `ProxyUtils.doh(...)`.
 */
export interface SubStoreDoHRequestOptions {
    /** DoH endpoint URL (example: `https://1.1.1.1/dns-query`). */
    url: string;
    /** Domain name to resolve (example: `example.com`). */
    domain: string;
    /** Query type (example: `A`, `AAAA`). Default is `A` in Sub-Store implementation. */
    type?: string;
    /** Request timeout in milliseconds. */
    timeout?: number;
    /** Optional EDNS client subnet (IP string). */
    edns?: string;
    [key: string]: unknown;
}

/**
 * Minimal decoded DNS answer record returned by `ProxyUtils.doh(...)`.
 */
export interface SubStoreDoHAnswer {
    type?: string;
    name?: string;
    ttl?: number;
    data?: unknown;
    [key: string]: unknown;
}

/**
 * Minimal decoded DNS packet returned by `ProxyUtils.doh(...)`.
 *
 * Sub-Store uses `dns-packet` to decode `application/dns-message` responses.
 */
export interface SubStoreDoHPacket {
    type?: string;
    id?: number;
    flags?: number;
    questions?: Array<Record<string, unknown>>;
    answers?: SubStoreDoHAnswer[];
    additionals?: Array<Record<string, unknown>>;
    [key: string]: unknown;
}

/**
 * Minimal JSON5 helper object exposed as `ProxyUtils.JSON5`.
 */
export interface SubStoreJson5 {
    /**
     * Parse JSON5 text.
     *
     * @example
     * ```ts
     * const obj = ProxyUtils.JSON5.parse('{a: 1,}');
     * // obj => { a: 1 }
     * ```
     */
    parse<T = unknown>(text: string): T;

    /**
     * Stringify a JS value to JSON5 text.
     *
     * @example
     * ```ts
     * const text = ProxyUtils.JSON5.stringify({ a: 1 });
     * // text => '{a:1}'
     * ```
     */
    stringify(value: unknown, replacer?: unknown, space?: unknown): string;

    [key: string]: unknown;
}

/**
 * MaxMind DB helper class exposed as `ProxyUtils.MMDB`.
 *
 * Only meaningful in Node backend runtime where MMDB files are available.
 */
export interface SubStoreMMDBInstance {
    /**
     * Lookup ISO country code by IP address.
     *
     * @returns ISO-3166 alpha-2 country code (example: `US`) or `undefined` when not available.
     *
     * @example
     * ```ts
     * const mmdb = new ProxyUtils.MMDB();
     * const iso = mmdb.geoip('1.1.1.1');
     * // iso => 'US' | undefined
     * ```
     */
    geoip(ip: string): string | undefined;

    /**
     * Lookup autonomous system organization (ASO) by IP address.
     *
     * @example
     * ```ts
     * const mmdb = new ProxyUtils.MMDB();
     * const aso = mmdb.ipaso('1.1.1.1');
     * // aso => 'Cloudflare, Inc.' | undefined
     * ```
     */
    ipaso(ip: string): string | undefined;

    /**
     * Lookup autonomous system number (ASN) by IP address.
     *
     * @example
     * ```ts
     * const mmdb = new ProxyUtils.MMDB();
     * const asn = mmdb.ipasn('1.1.1.1');
     * // asn => 13335 | undefined
     * ```
     */
    ipasn(ip: string): number | undefined;
}

export interface SubStoreMMDBConstructor {
    /**
     * Create an MMDB helper.
     *
     * In Node runtime, Sub-Store reads MMDB file paths from:
     * - `options.country` / `process.env.SUB_STORE_MMDB_COUNTRY_PATH`
     * - `options.asn` / `process.env.SUB_STORE_MMDB_ASN_PATH`
     *
     * @example
     * ```ts
     * const mmdb = new ProxyUtils.MMDB({
     *   country: '/path/to/GeoLite2-Country.mmdb',
     *   asn: '/path/to/GeoLite2-ASN.mmdb',
     * });
     * ```
     */
    new (options?: { country?: string; asn?: string }): SubStoreMMDBInstance;
}

/**
 * GitHub/GitLab gist/snippet helper exposed as `ProxyUtils.Gist`.
 */
export interface SubStoreGistInstance {
    /**
     * Locate an existing gist/snippet by `key`.
     *
     * @returns Provider-specific metadata object, or `undefined` if not found.
     *
     * @example
     * ```ts
     * const gist = new ProxyUtils.Gist({ token: '***', key: 'Sub-Store Sync' });
     * const meta = await gist.locate();
     * // meta => object | undefined
     * ```
     */
    locate(): Promise<unknown>;

    /**
     * Upload files to the gist/snippet.
     *
     * Input format: `{ [filename]: { content } }`.
     * - When `content` is `null`/`''`, Sub-Store may delete the file (provider-dependent).
     *
     * @returns HTTP response of the provider API call.
     *
     * @example
     * ```ts
     * const gist = new ProxyUtils.Gist({ token: '***', key: 'Sub-Store Sync' });
     * const resp = await gist.upload({
     *   'config.yaml': { content: 'proxies: []\\n' },
     * });
     * // resp.statusCode => 200
     * ```
     */
    upload(input: Record<string, { content?: string | null }>): Promise<SubStoreHttpResponse>;
}

export interface SubStoreGistConstructor {
    /**
     * Create a gist/snippet client.
     *
     * @param options.token GitHub token or GitLab private token.
     * @param options.key   Gist description (GitHub) or snippet title (GitLab).
     * @param options.syncPlatform `'github'` (default) or `'gitlab'`.
     *
     * @example
     * ```ts
     * const gh = new ProxyUtils.Gist({ token: '***', key: 'Sub-Store Sync', syncPlatform: 'github' });
     * const gl = new ProxyUtils.Gist({ token: '***', key: 'Sub-Store Sync', syncPlatform: 'gitlab' });
     * ```
     */
    new (options: { token: string; key: string; syncPlatform?: 'github' | 'gitlab' | string }): SubStoreGistInstance;
}

/**
 * Minimal lodash subset injected as `lodash`.
 *
 * Sub-Store injects the full lodash library; this type only documents a commonly used subset.
 * Unknown lodash members are still accessible through the index signature.
 */
export interface SubStoreLodash {
    /**
     * Get a value by path (safe).
     *
     * Path formats:
     * - dot path: `'a.b[0].c'`
     * - array path: `['a', 'b', 0, 'c']`
     *
     * @example
     * ```ts
     * const v = lodash.get({ a: { b: [ { c: 1 } ] } }, 'a.b[0].c');
     * // v => 1
     * ```
     */
    get<TObject, TDefault = undefined>(
        object: TObject,
        path: string | ReadonlyArray<string | number>,
        defaultValue?: TDefault,
    ): unknown | TDefault;

    /**
     * Set a value by path (mutating).
     *
     * @example
     * ```ts
     * const obj: Record<string, unknown> = {};
     * lodash.set(obj, 'a.b', 1);
     * // obj => { a: { b: 1 } }
     * ```
     */
    set<TObject>(object: TObject, path: string | ReadonlyArray<string | number>, value: unknown): TObject;

    /** Check whether a path exists on an object. */
    has(object: unknown, path: string | ReadonlyArray<string | number>): boolean;

    /** Deep-merge sources into the target object (mutating). */
    merge<TObject>(object: TObject, ...sources: unknown[]): TObject;

    /** Deep clone a value. */
    cloneDeep<T>(value: T): T;

    /** Remove duplicate entries from an array. */
    uniq<T>(array: ReadonlyArray<T>): T[];

    /** Remove duplicates by a computed key. */
    uniqBy<T>(array: ReadonlyArray<T>, iteratee: (value: T) => unknown): T[];

    /** Group items by a computed key. */
    groupBy<T>(array: ReadonlyArray<T>, iteratee: (value: T) => string): Record<string, T[]>;

    /** Index items by a computed key. */
    keyBy<T>(array: ReadonlyArray<T>, iteratee: (value: T) => string): Record<string, T>;

    /** Sort items by a computed value (ascending). */
    sortBy<T>(array: ReadonlyArray<T>, iteratee: (value: T) => unknown): T[];

    /** Sort items by multiple iteratees and orders. */
    orderBy<T>(
        array: ReadonlyArray<T>,
        iteratees: Array<(value: T) => unknown> | ((value: T) => unknown),
        orders?: Array<'asc' | 'desc'> | 'asc' | 'desc',
    ): T[];

    /** Create a shallow object with only the picked keys. */
    pick<TObject extends Record<string, unknown>, TKey extends keyof TObject>(
        object: TObject,
        keys: ReadonlyArray<TKey>,
    ): Pick<TObject, TKey>;

    /** Create a shallow object omitting the provided keys. */
    omit<TObject extends Record<string, unknown>, TKey extends keyof TObject>(
        object: TObject,
        keys: ReadonlyArray<TKey>,
    ): Omit<TObject, TKey>;

    /** Deep structural equality check. */
    isEqual(a: unknown, b: unknown): boolean;

    /** Check whether a value is "empty" (collection/string/object). */
    isEmpty(value: unknown): boolean;
    [key: string]: unknown;
}

/**
 * Proxy utility namespace injected as `ProxyUtils`.
 *
 * This models the stable parts most scripts rely on. Extra members exist at runtime,
 * and are accessible via the index signature.
 */
export interface SubStoreProxyUtils {
    /**
     * Parse a subscription text into a proxy array.
     *
     * @example
     * ```ts
     * const proxies = ProxyUtils.parse('ss://...\\nvmess://...');
     * // proxies => [{ name: '...', type: 'ss', ... }, ...]
     * ```
     */
    parse(raw: string): SubStoreProxy[];

    /**
     * Apply processors/operators to a proxy list (or file input).
     *
     * @example
     * ```ts
     * const out = await ProxyUtils.process(proxies, [{ type: 'Remove Duplicate Filter' }], 'ClashMeta', {});
     * // out => processed proxies
     * ```
     */
    process<TInput extends SubStoreProxy[] | SubStoreFileInput>(
        input: TInput,
        operators?: SubStoreProcessorItem[],
        targetPlatform?: TargetPlatform,
        source?: SubStoreScriptContext['source'],
        $options?: SubStoreRequestOptions,
    ): Promise<TInput>;

    /**
     * Produce proxies for a target platform.
     *
     * When `type` is:
     * - `'internal'`: return a list of lines (string array), without joining.
     * - otherwise/omitted: return a single string.
     *
     * @example
     * ```ts
     * const text = ProxyUtils.produce(proxies, 'ClashMeta');
     * // text => 'proxies:\\n  - name: ...\\n'
     * ```
     */
    produce(
        proxies: SubStoreProxy[],
        targetPlatform: TargetPlatform,
        type: 'internal',
        opts?: Record<string, unknown>,
    ): string[];
    produce(
        proxies: SubStoreProxy[],
        targetPlatform: TargetPlatform,
        type?: string,
        opts?: Record<string, unknown>,
    ): string;

    /**
     * Check whether a string is IPv4.
     *
     * @example
     * ```ts
     * ProxyUtils.isIPv4('1.1.1.1'); // => true
     * ProxyUtils.isIPv4('::1');     // => false
     * ```
     */
    isIPv4(ip: string): boolean;
    /**
     * Check whether a string is IPv6.
     *
     * @example
     * ```ts
     * ProxyUtils.isIPv6('::1');     // => true
     * ProxyUtils.isIPv6('1.1.1.1'); // => false
     * ```
     */
    isIPv6(ip: string): boolean;
    /**
     * Check whether a string is IPv4 or IPv6.
     *
     * @example
     * ```ts
     * ProxyUtils.isIP('1.1.1.1'); // => true
     * ProxyUtils.isIP('::1');     // => true
     * ProxyUtils.isIP('nope');    // => false
     * ```
     */
    isIP(ip: string): boolean;

    /**
     * DNS-over-HTTPS resolver.
     *
     * Sub-Store implements this helper using:
     * - `dns-packet` for encode/decode
     * - `$substore.http.get` with `Accept: application/dns-message`
     *
     * @example
     * ```ts
     * const packet = await ProxyUtils.doh({
     *   url: 'https://1.1.1.1/dns-query',
     *   domain: 'example.com',
     *   type: 'A',
     *   timeout: 5000,
     * });
     * const ip = packet.answers?.find(a => a.type === 'A')?.data;
     * // ip => '93.184.216.34' (best-effort)
     * ```
     */
    doh(options: SubStoreDoHRequestOptions): Promise<SubStoreDoHPacket>;

    /**
     * Pick a random port from a port expression.
     *
     * Supported formats:
     * - `80`
     * - `80,443`
     * - `10000-20000`
     * - `80/443` (some producers use `/` separator)
     *
     * @example
     * ```ts
     * const p = ProxyUtils.getRandomPort('80,443');
     * // p => 80 or 443
     * ```
     */
    getRandomPort(portString: string): number;

    /** YAML helper injected as `yaml`. */
    yaml: SubStoreYaml;
    /** Buffer constructor injected as `Buffer`. */
    Buffer: SubStoreBufferConstructor;
    /** Base64 helper object. */
    Base64: SubStoreBase64;

    /**
     * Infer a flag emoji from a node name (best-effort).
     *
     * This is primarily a heuristic based on keywords and ISO codes contained in the name.
     *
     * @example
     * ```ts
     * const flag = ProxyUtils.getFlag('US - Los Angeles');
     * // flag => '🇺🇸' (best-effort)
     * ```
     */
    getFlag(name: string): string;
    /**
     * Remove flag emojis from a string.
     *
     * @example
     * ```ts
     * const out = ProxyUtils.removeFlag('🇺🇸 US - Los Angeles');
     * // out => 'US - Los Angeles'
     * ```
     */
    removeFlag(value: string): string;
    /**
     * Return ISO country code inferred from a name (best-effort).
     *
     * @example
     * ```ts
     * const iso = ProxyUtils.getISO('US - Los Angeles');
     * // iso => 'US' | undefined
     * ```
     */
    getISO(name: string): string | undefined;

    /** MaxMind DB helper class. */
    MMDB: SubStoreMMDBConstructor;
    /** Gist/snippet helper class. */
    Gist: SubStoreGistConstructor;

    /**
     * Download a URL with Sub-Store's downloader (with caching and helpers).
     *
     * This is the same utility Sub-Store uses to fetch subscriptions/files.
     *
     * @example
     * ```ts
     * const raw = await ProxyUtils.download('https://example.com/sub.txt');
     * // raw => '...subscription text...'
     * ```
     */
    download(
        rawUrl?: string,
        ua?: string,
        timeout?: number,
        customProxy?: string,
        skipCustomCache?: boolean,
        awaitCustomCache?: boolean,
        noCache?: boolean,
        preprocess?: boolean,
    ): Promise<string>;

    /**
     * Download a file to disk (Node runtime only).
     *
     * @example
     * ```ts
     * const savedPath = await ProxyUtils.downloadFile('https://example.com/a.bin', '/tmp/a.bin');
     * // savedPath => '/tmp/a.bin'
     * ```
     */
    downloadFile(url: string, filePath: string): Promise<string>;

    /**
     * Validate a UUID format (vless/vmess).
     *
     * @example
     * ```ts
     * ProxyUtils.isValidUUID('00000000-0000-0000-0000-000000000000'); // => true
     * ProxyUtils.isValidUUID('not-a-uuid'); // => false
     * ```
     */
    isValidUUID(uuid: string): boolean;

    /** JSON5 helper. */
    JSON5: SubStoreJson5;

    [key: string]: unknown;
}

/**
 * Convenience shape describing the globals injected into Sub-Store dynamic scripts.
 *
 * This is not a real runtime object; it is only used for documentation/type navigation.
 */
export interface SubStoreInjectedGlobals {
    $arguments: SubStoreArguments;
    $options: SubStoreRequestOptions | undefined;
    $substore: SubStoreOpenAPI;
    lodash: SubStoreLodash;
    ProxyUtils: SubStoreProxyUtils;
    yaml: SubStoreYaml;
    Buffer: SubStoreBufferConstructor;
    b64d: SubStoreBase64Decode;
    b64e: SubStoreBase64Encode;
    scriptResourceCache: ScriptResourceCache;
    flowUtils: SubStoreFlowUtils;
    produceArtifact: (
        options: ProduceArtifactOptions,
    ) => Promise<string | string[] | SubStoreFileInput | unknown>;
    require: SubStoreRequire | undefined;
    $persistentStore: SubStorePlatformPersistentStore | undefined;
    $httpClient: SubStorePlatformHttpClient | undefined;
    $notification: SubStorePlatformNotification | undefined;
}
