import * as v from 'valibot';

export type RawArguments = Record<string, unknown>;

export const scalarSchema = v.union([v.string(), v.number(), v.boolean()]);

export type ScalarArg = v.InferOutput<typeof scalarSchema>;

export function pickScalarArg(rawArgs: RawArguments, keys: readonly string[]): ScalarArg | undefined {
    for (const key of keys) {
        const value = rawArgs[key];
        if (value === null || typeof value === 'undefined') continue;
        const parsed = v.safeParse(scalarSchema, value);
        if (parsed.success) return parsed.output;
    }
    return undefined;
}

export function parseBooleanArg(rawArgs: RawArguments, keys: readonly string[], fallback: boolean): boolean {
    const scalarValue = pickScalarArg(rawArgs, keys);
    if (typeof scalarValue === 'undefined') return fallback;
    if (typeof scalarValue === 'boolean') return scalarValue;
    const normalized = String(scalarValue).trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return fallback;
}

export function parsePositiveIntArg(rawArgs: RawArguments, keys: readonly string[], fallback: number): number {
    const scalarValue = pickScalarArg(rawArgs, keys);
    if (typeof scalarValue === 'undefined') return fallback;
    const parsed = Number.parseInt(String(scalarValue), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

export function parsePositiveFloatArg(rawArgs: RawArguments, keys: readonly string[], fallback: number): number {
    const scalarValue = pickScalarArg(rawArgs, keys);
    if (typeof scalarValue === 'undefined') return fallback;
    const parsed = Number.parseFloat(String(scalarValue));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
}

export function parseStringArg(rawArgs: RawArguments, keys: readonly string[], fallback: string): string {
    const scalarValue = pickScalarArg(rawArgs, keys);
    if (typeof scalarValue === 'undefined') return fallback;
    return String(scalarValue);
}

export function parseRegexArg(
    rawArgs: RawArguments,
    keys: readonly string[],
    fallbackSource: string,
    flags = 'i',
): RegExp {
    const source = parseStringArg(rawArgs, keys, fallbackSource);
    try {
        return new RegExp(source, flags);
    } catch (_error) {
        return new RegExp(fallbackSource, flags);
    }
}

