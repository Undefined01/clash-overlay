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

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Merge lists, filtering out falsy values. Supports nested arrays.
 * mergeList([1, 2], 3, [true && 4, false && 5]) => [1, 2, 3, 4]
 */
export function mergeList<T>(...elements: Array<T | T[] | false | null | undefined | 0 | ''>): T[] {
    return (elements as unknown[]).flat().filter(Boolean) as T[];
}
