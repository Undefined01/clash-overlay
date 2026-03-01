import { moduleMerge } from './module-merge.js';
import { resolveDeferredAsync } from './resolve.js';
import type { AsyncOverlayFn, MergeFn } from './types.js';

export const REMOVE = Symbol('libmodule.remove');

export interface ApplyOverlayOptions {
    merge?: MergeFn;
}

export interface MergeModuleOptions {
    merge?: MergeFn;
}

export type ModuleFn = (
    config: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Nixpkgs-like overlay processor for attrsets.
 * Supports:
 * - final/prev overlay semantics
 * - add/override keys
 * - delete keys via `REMOVE` or `null`
 */
export async function applyOverlay(
    base: Record<string, unknown>,
    overlays: AsyncOverlayFn[],
    options: ApplyOverlayOptions = {},
): Promise<Record<string, unknown>> {
    return runLayers(base, overlays, options.merge ?? overlayAttrMerge);
}

/**
 * NixOS-like module processor.
 * Modules only receive final config (`config`) and return a config fragment.
 */
export async function mergeModule(
    base: Record<string, unknown>,
    modules: ModuleFn[],
    options: MergeModuleOptions = {},
): Promise<Record<string, unknown>> {
    const overlays: AsyncOverlayFn[] = modules.map(mod => {
        return (config: Record<string, unknown>) => mod(config);
    });
    return runLayers(base, overlays, options.merge ?? moduleMerge);
}

function overlayAttrMerge(
    current: Record<string, unknown>,
    extension: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(extension)) {
        if (value === null || value === REMOVE) {
            delete result[key];
            continue;
        }
        result[key] = value;
    }
    return result;
}

async function runLayers(
    base: Record<string, unknown>,
    layers: AsyncOverlayFn[],
    merge: MergeFn,
): Promise<Record<string, unknown>> {
    let current: Record<string, unknown> = { ...base };
    let finalResolved: Record<string, unknown> | null = null;

    const configProxy = new Proxy(Object.create(null) as Record<string, unknown>, {
        get(_: Record<string, unknown>, prop: string | symbol): unknown {
            const source = finalResolved ?? current;
            return source[prop as string];
        },
        has(_: Record<string, unknown>, prop: string | symbol): boolean {
            const source = finalResolved ?? current;
            return (prop as string) in source;
        },
        ownKeys(): Array<string | symbol> {
            const source = finalResolved ?? current;
            return Reflect.ownKeys(source);
        },
        getOwnPropertyDescriptor(_: Record<string, unknown>, prop: string | symbol): PropertyDescriptor | undefined {
            const source = finalResolved ?? current;
            if ((prop as string) in source) {
                return {
                    value: source[prop as string],
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };
            }
            return undefined;
        },
    });

    for (const layer of layers) {
        const ext = await layer(configProxy, current);
        current = merge(current, ext);
    }

    finalResolved = current;
    const resolved = await resolveDeferredAsync(current) as Record<string, unknown>;
    finalResolved = resolved;
    return resolved;
}
