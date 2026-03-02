import * as v from 'valibot';

export const booleanArgSchema = v.fallback(
    v.union([
        v.boolean(),
        v.pipe(
            v.string(),
            v.transform((s) => s.trim().toLowerCase()),
            v.picklist(['true', 'false', '1', '0'] as const),
            v.transform((s) => s === 'true' || s === '1'),
        ),
        v.pipe(
            v.number(),
            v.transform((n) => n !== 0),
        ),
    ]),
    true,
);

export const positiveIntSchema = v.fallback(
    v.pipe(
        v.union([v.number(), v.string()]),
        v.transform((value) => (typeof value === 'number' ? value : Number.parseInt(value, 10))),
        v.number(),
        v.finite(),
        v.integer(),
        v.minValue(1),
    ),
    10,
);