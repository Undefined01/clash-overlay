// substore-overlay/src/types/substore-runtime.d.ts
// Global declarations for Sub-Store script runtime variables.

import type {
    SubStoreArguments,
    SubStoreOpenAPI,
    SubStoreRequestOptions,
    ScriptResourceCache,
    ProduceArtifactOptions,
    SubStoreBase64Decode,
    SubStoreBase64Encode,
    SubStoreBufferConstructor,
    SubStoreFlowUtils,
    SubStoreLodash,
    SubStorePlatformHttpClient,
    SubStorePlatformNotification,
    SubStorePlatformPersistentStore,
    SubStoreProxyUtils,
    SubStoreRequire,
    SubStoreYaml,
    SubStoreFileInput,
} from './substore.js';

declare global {
    /**
     * Arguments passed from script URL hash / inline config.
     *
     * URL example:
     * `https://example.com/script.js#prefix=%5BUS%5D&udp=true`
     *
     * Runtime example:
     * `$arguments = { prefix: '[US]', udp: 'true' }`
     */
    const $arguments: SubStoreArguments;

    /**
     * Sub-Store OpenAPI runtime object.
     *
     * Common usage:
     * `await $substore.http.get({ url: 'https://api.example.com' })`
     */
    const $substore: SubStoreOpenAPI;

    /**
     * Current request/response options envelope used in script runtime.
     *
     * Typical use is setting `$options._res` to customize status/headers.
     */
    const $options: SubStoreRequestOptions | undefined;

    /**
     * Lodash utility library injected into script runtime as `lodash`.
     *
     * Sub-Store injects the full lodash object; this type documents a commonly used subset.
     *
     * @example
     * ```ts
     * const v = lodash.get({ a: { b: 1 } }, 'a.b');
     * // v => 1
     * ```
     */
    const lodash: SubStoreLodash;

    /**
     * YAML helper injected into script runtime.
     *
     * Alias: `ProxyUtils.yaml`.
     *
     * @example
     * ```ts
     * const obj = yaml.safeLoad('a: 1');
     * // obj => { a: 1 }
     * ```
     */
    const yaml: SubStoreYaml;

    /**
     * Node-compatible Buffer implementation injected into script runtime.
     *
     * Alias: `ProxyUtils.Buffer`.
     */
    const Buffer: SubStoreBufferConstructor;

    /**
     * Base64 decode helper injected as `b64d`.
     *
     * Alias: `ProxyUtils.Base64.decode`.
     *
     * @example
     * ```ts
     * const out = b64d('aGVsbG8=');
     * // out => 'hello'
     * ```
     */
    const b64d: SubStoreBase64Decode;

    /**
     * Base64 encode helper injected as `b64e`.
     *
     * Alias: `ProxyUtils.Base64.encode`.
     *
     * @example
     * ```ts
     * const out = b64e('hello');
     * // out => 'aGVsbG8='
     * ```
     */
    const b64e: SubStoreBase64Encode;

    /**
     * Per-script server object used by shortcut mode scripts.
     *
     * Example:
     * `$server.name = '[My] ' + String($server.name)`
     */
    const $server: Record<string, unknown>;

    /**
     * File override content input for shortcut mode.
     *
     * `$content` is mutable; `$files` is source file text list.
     */
    let $content: string | undefined;
    const $files: string[] | undefined;

    /**
     * Cache utility persisted by Sub-Store backend.
     *
     * Example: `scriptResourceCache.get('my:key')`
     */
    const scriptResourceCache: ScriptResourceCache;

    /**
     * Flow (traffic) helper utilities injected as `flowUtils`.
     *
     * These utilities parse and normalize `subscription-userinfo` headers.
     *
     * @example
     * ```ts
     * const flow = flowUtils.parseFlowHeaders('upload=1; download=2; total=100')!;
     * flowUtils.validCheck(flow);
     * const usage = flowUtils.flowTransfer(flow.usage.upload + flow.usage.download, 'KB');
     * // usage => { value: '3', unit: 'KB' }
     * ```
     */
    const flowUtils: SubStoreFlowUtils;

    /**
     * Produce other artifacts/subscriptions during script execution.
     *
     * This is Sub-Store's internal "render artifact" entrypoint, exposed to scripts.
     *
     * Common use cases:
     * - Generate another subscription/collection output and reuse it in the current script.
     * - Download and process a file artifact (optionally returning the full `{ $content, $files, ... }` object).
     *
     * @example
     * ```ts
     * const text = await produceArtifact({
     *   type: 'collection',
     *   name: 'airport',
     *   platform: 'ClashMeta',
     * });
     * // text => 'proxies:\\n  - name: ...\\n'
     * ```
     *
     * @example
     * ```ts
     * const file = await produceArtifact({
     *   type: 'file',
     *   name: 'my-file',
     *   all: true,
     * });
     * // file => { $content: string, $files?: string[], $file?: object, $options?: object, ... }
     * ```
     */
    function produceArtifact(
        options: ProduceArtifactOptions,
    ): Promise<string | string[] | SubStoreFileInput | unknown>;

    /**
     * Commonly injected utility namespace in script runtime.
     *
     * Includes YAML/Base64 helpers and proxy utility functions.
     */
    const ProxyUtils: SubStoreProxyUtils;

    /**
     * Legacy persistent store object (mainly Surge/Loon).
     *
     * Availability:
     * - Loon: passed into script by Sub-Store in some modes.
     * - Surge: often available globally.
     * - Node/QX: usually not present.
     */
    const $persistentStore: SubStorePlatformPersistentStore | undefined;

    /**
     * Legacy callback-style HTTP client (mainly Surge/Loon).
     *
     * Availability:
     * - Loon: passed into script by Sub-Store in some modes.
     * - Surge: often available globally.
     * - Node/QX: usually not present.
     */
    const $httpClient: SubStorePlatformHttpClient | undefined;

    /**
     * Legacy notification API (mainly Surge/Loon).
     *
     * Availability:
     * - Loon: passed into script by Sub-Store in some modes.
     * - Surge: available globally.
     * - Node: usually not present.
     */
    const $notification: SubStorePlatformNotification | undefined;

    /** Dynamic require support in Node runtime. */
    const require: SubStoreRequire | undefined;
}

export {};
