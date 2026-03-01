// substore-overlay/src/lib/helpers.ts
// Pure utility functions — no Clash domain knowledge.

// ─── Argument Parsing ───────────────────────────────────────────────

export function parseBool(value: unknown, defaultValue = false): boolean {
    if (value === null || typeof value === 'undefined') return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true' || value === '1') return true;
        if (value.toLowerCase() === 'false' || value === '0') return false;
    }
    throw new Error(`Invalid boolean value: ${value}`);
}

export function parseNumber(value: unknown, defaultValue = 0): number {
    if (value === null || typeof value === 'undefined') return defaultValue;
    const num = parseInt(String(value), 10);
    return isNaN(num) ? defaultValue : num;
}

export function parseString(defaultValue: string): (value: unknown) => string {
    return (value: unknown): string => {
        if (value === null || typeof value === 'undefined') return defaultValue;
        return String(value);
    };
}

export interface ParsedArgs {
    /**
     * Whether to enable IPv6 in generated mihomo config.
     *
     * Source: `$arguments.ipv6Enabled`.
     *
     * URL example:
     * `...?ipv6Enabled=true`
     *
     * Runtime raw value example:
     * `$arguments.ipv6Enabled === 'true'`
     */
    ipv6Enabled: boolean;
    /**
     * DNS mode for generated config.
     *
     * Source: `$arguments.dnsMode`.
     *
     * URL example:
     * `...?dnsMode=redir-host`
     *
     * Runtime raw value example:
     * `$arguments.dnsMode === 'redir-host'`
     */
    dnsMode: string;
}

/**
 * Parse user-provided script arguments to strongly-typed config values.
 *
 * Unknown fields are ignored.
 * Missing values fall back to defaults:
 * - `ipv6Enabled: false`
 * - `dnsMode: 'fake-ip'`
 */
export function parseArgs(args: Record<string, unknown>): ParsedArgs {
    const spec: Record<string, (val: unknown) => unknown> = {
        ipv6Enabled: parseBool,
        dnsMode: parseString('fake-ip'),
    };
    return Object.entries(spec).reduce((acc, [name, parseFunc]) => {
        (acc as Record<string, unknown>)[name] = parseFunc(args[name]);
        return acc;
    }, {} as ParsedArgs);
}

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Merge lists, filtering out falsy values. Supports nested arrays.
 * mergeList([1, 2], 3, [true && 4, false && 5]) => [1, 2, 3, 4]
 */
export function mergeList<T>(...elements: Array<T | T[] | false | null | undefined | 0 | ''>): T[] {
    return (elements as unknown[]).flat().filter(Boolean) as T[];
}
