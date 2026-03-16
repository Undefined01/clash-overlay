// libmodule/src/options.ts
// _options declaration system — modules declare option schemas
// with types, defaults, and apply transforms.

import { types, isOptionType } from './option-types.js';
import type { OptionType } from './option-types.js';
import { isPlainObject } from './core-merge.js';

// ─── Option Declaration ─────────────────────────────────────────────

export interface OptionDeclaration<T = unknown> {
    type: OptionType<T>;
    default?: T;
    description?: string;
    apply?: (value: T) => unknown;
}

// ─── Options Extraction ─────────────────────────────────────────────

/**
 * Extract and normalize _options from module fragments.
 * Supports both flat dotted keys and nested dicts.
 *
 * Cross-module merge semantics:
 * - Multiple modules can declare _options
 * - Same key + same type name = last-writer-wins for default/description/apply
 * - Same key + different type name = error
 *
 * @param fragments - Module result fragments
 * @returns Flat map of dotted key → OptionDeclaration
 */
export function extractOptions(
    fragments: Array<Record<string, unknown>>,
): Map<string, OptionDeclaration> {
    const result = new Map<string, OptionDeclaration>();

    for (let i = 0; i < fragments.length; i++) {
        const frag = fragments[i];
        if (!('_options' in frag) || frag._options === undefined) continue;

        const raw = frag._options;
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            throw new Error('_options must be a plain object.');
        }

        const incoming = new Map<string, OptionDeclaration>();
        flattenOptions(raw as Record<string, unknown>, '', incoming);

        // Merge incoming declarations into result
        for (const [key, decl] of incoming) {
            const existing = result.get(key);
            if (existing) {
                if (existing.type.name !== decl.type.name) {
                    throw new Error(
                        `Conflicting _options type for "${key}": ` +
                        `"${existing.type.name}" vs "${decl.type.name}".`,
                    );
                }
                // Same type name — last-writer-wins for default/description/apply
                result.set(key, { ...existing, ...decl });
            } else {
                result.set(key, decl);
            }
        }
    }

    return result;
}

/**
 * Recursively flatten nested option dicts to flat dotted keys.
 *
 * An entry is an OptionDeclaration if it has a `type` field that is an OptionType.
 * Otherwise, if it's a plain object, it's treated as a nested dict.
 */
function flattenOptions(
    obj: Record<string, unknown>,
    prefix: string,
    result: Map<string, OptionDeclaration>,
): void {
    for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (isOptionDeclaration(value)) {
            result.set(fullKey, value);
        } else if (isPlainObject(value)) {
            flattenOptions(value, fullKey, result);
        } else {
            throw new Error(`Invalid _options entry at "${fullKey}": expected OptionDeclaration or nested object.`);
        }
    }
}

function isOptionDeclaration(val: unknown): val is OptionDeclaration {
    return (
        val !== null &&
        typeof val === 'object' &&
        'type' in (val as Record<string, unknown>) &&
        isOptionType((val as Record<string, unknown>).type)
    );
}

// ─── Option Type Resolution ─────────────────────────────────────────

/**
 * Look up the OptionType for a key, with fallback behavior.
 *
 * @param key - The config key
 * @param options - Extracted _options declarations
 * @param moduleCheck - If true, undeclared keys throw
 * @param freeformType - Custom fallback type for undeclared keys (when check=true)
 */
export function resolveOptionType(
    key: string,
    options: Map<string, OptionDeclaration>,
    moduleCheck: boolean,
    freeformType?: OptionType,
): OptionType {
    const decl = options.get(key);
    if (decl) return decl.type;

    if (moduleCheck) {
        if (freeformType) return freeformType;
        throw new Error(
            `Undeclared option "${key}". ` +
            `Set _module.check = false or declare it in _options.`,
        );
    }

    return types.anything;
}

/**
 * Get the default value for a declared option, if any.
 */
export function getOptionDefault(
    key: string,
    options: Map<string, OptionDeclaration>,
): { hasDefault: boolean; value: unknown } {
    const decl = options.get(key);
    if (decl && 'default' in decl) {
        return { hasDefault: true, value: decl.default };
    }
    if (decl?.type.emptyValue) {
        return { hasDefault: true, value: decl.type.emptyValue() };
    }
    return { hasDefault: false, value: undefined };
}
