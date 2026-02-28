// src/lib/helpers.js
// Pure utility functions — no Clash domain knowledge.

// ─── Argument Parsing ───────────────────────────────────────────────

export function parseBool(value, defaultValue = false) {
    if (value === null || typeof value === "undefined") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        if (value.toLowerCase() === "true" || value === "1") return true;
        if (value.toLowerCase() === "false" || value === "0") return false;
    }
    throw new Error(`Invalid boolean value: ${value}`);
}

export function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") return defaultValue;
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

export function parseString(defaultValue) {
    return (value) => {
        if (value === null || typeof value === "undefined") return defaultValue;
        return String(value);
    };
}

export function parseArgs(args) {
    const spec = {
        ipv6Enabled: parseBool,
        dnsMode: parseString("fake-ip"),
    };
    return Object.entries(spec).reduce((acc, [name, parseFunc]) => {
        acc[name] = parseFunc(args[name]);
        return acc;
    }, {});
}

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Merge lists, filtering out falsy values. Supports nested arrays.
 * mergeList([1, 2], 3, [true && 4, false && 5]) => [1, 2, 3, 4]
 */
export function mergeList(...elements) {
    return elements.flat().filter(Boolean);
}
