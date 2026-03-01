// substore-overlay/src/types/substore-runtime.d.ts
// Global declarations for Sub-Store script runtime variables.

import type {
    SubStoreArguments,
    SubStoreOpenAPI,
    SubStoreRequestOptions,
    ScriptResourceCache,
    ProduceArtifactOptions,
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
     * Produce other artifacts/subscriptions during script execution.
     *
     * Example: `await produceArtifact({ type: 'collection', name: 'airport' })`
     */
    function produceArtifact(options: ProduceArtifactOptions): Promise<unknown>;

    /**
     * Commonly injected utility namespace in script runtime.
     *
     * Includes YAML/Base64 helpers and proxy utility functions.
     */
    const ProxyUtils: Record<string, unknown>;

    /** Dynamic require support in Node runtime. */
    const require: ((id: string) => unknown) | undefined;
}

export {};
