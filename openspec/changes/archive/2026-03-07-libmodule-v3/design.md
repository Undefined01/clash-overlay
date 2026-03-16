## Context

libmodule v3 introduced per-key merge, OptionType, `_options`, and `defer()`. This design document covers refinements identified by auditing the v3 implementation against NixOS module system semantics and real-world usage in substore-overlay.

The repo is self-use. No backward compatibility constraints — we remove old APIs rather than shim them.

## Decisions

### 1. Single `MARKER` Symbol for all marker types

**Decision**: Replace all `__type` string markers with one shared Symbol:

```typescript
export const MARKER = Symbol.for('libmodule:marker');
```

Every libmodule marker (Override, Ordered, OrderedList, DeferProxy) carries `[MARKER]` with a string discriminant:

```typescript
// Override
{ [MARKER]: 'override', priority: 100, value: 42 }

// Ordered
{ [MARKER]: 'order', order: 500, items: ['a', 'b'] }

// OrderedList (internal)
{ [MARKER]: 'order-list', segments: [...] }

// DeferProxy (via Proxy handler)
get(_target, prop) {
    if (prop === MARKER) return 'defer';
    ...
}
```

Detection functions check the discriminant:

```typescript
function isOverride(val: unknown): val is Override {
    return val !== null && typeof val === 'object' &&
        (val as any)[MARKER] === 'override';
}
```

`isPlainObject` collapses to one check:

```typescript
function isPlainObject(val: unknown): val is Record<string, unknown> {
    return (
        val !== null &&
        typeof val === 'object' &&
        !Array.isArray(val) &&
        !(MARKER in (val as object)) &&
        !(val instanceof RegExp) &&
        !(val instanceof Date)
    );
}
```

Protocol keys (`_imports`, `_options`, `_module`, `_assertions`, `_warnings`) stay as string keys — users write these by hand and ergonomics matter.

**Why one Symbol, not one per type?** One `in` check in `isPlainObject` catches all markers including future ones. Individual type checks use the discriminant string. Adding a new marker type never requires updating `isPlainObject`.

### 2. `defer()` as the only lazy mechanism

**Decision**: Remove `deferred()` entirely. `defer()` is the only lazy primitive.

Relax the type constraint to accept any `T` (not just objects). The Proxy always wraps a dummy `{}`, but `forceDefer()` returns the cached concrete value regardless of type:

```typescript
export function defer<T>(fn: () => T): DeferProxy<T> {
    let cached: T | undefined;
    let forced = false;

    return new Proxy({} as object, {
        get(_target, prop) {
            if (prop === MARKER) return 'defer';
            if (prop === DEFER_SYMBOL) return fn;
            if (prop === FORCE_SYMBOL) {
                if (!forced) { cached = fn(); forced = true; }
                return cached;
            }
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || cached === undefined) return undefined;
            if (typeof cached !== 'object' && typeof cached !== 'function') return undefined;
            return (cached as Record<string | symbol, unknown>)[prop];
        },
        has(_target, prop) {
            if (prop === MARKER) return true;
            if (prop === DEFER_SYMBOL) return true;
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return false;
            return prop in (cached as object);
        },
        ownKeys() {
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return [];
            return Reflect.ownKeys(cached as object);
        },
        getOwnPropertyDescriptor(_target, prop) {
            if (!forced) { cached = fn(); forced = true; }
            if (cached === null || typeof cached !== 'object') return undefined;
            return Object.getOwnPropertyDescriptor(cached as object, prop);
        },
        // Node.js inspect for debugging
        // (handled inside get trap for Symbol.for('nodejs.util.inspect.custom'))
    }) as DeferProxy<T>;
}
```

When the factory returns a primitive:
- `isDefer(val)` → true (Proxy is always an object with the Symbol)
- `forceDefer(val)` → the primitive (42, "hello", true)
- Property access → undefined (harmless — you wouldn't access properties on a lazy number)
- After `resolveDeferred` runs in Phase 3, concrete values are in the config

Internal merge engine uses `defer()` for wrapping lazy merge results (replacing `deferred()`).

**What about `{ ...deferProxy }`?** Spread forces the Proxy (triggers ownKeys + getOwnPropertyDescriptor), returns the real value's keys. This is correct behavior — old `deferred()` would copy `{ __type, fn }` literally (broken).

### 3. Cross-module `_options` merge

**Decision**: Multiple modules can declare `_options`. Declarations are unioned by key.

Same key declared by multiple modules:
- Same type name → later module wins for `default`, `description`, `apply`
- Different type names → error

```typescript
export function extractOptions(
    fragments: Array<Record<string, unknown>>,
): Map<string, OptionDeclaration> {
    const result = new Map<string, OptionDeclaration>();

    for (let i = 0; i < fragments.length; i++) {
        const frag = fragments[i];
        if (!('_options' in frag) || frag._options === undefined) continue;

        const incoming = new Map<string, OptionDeclaration>();
        flattenOptions(frag._options as Record<string, unknown>, '', incoming);

        for (const [key, decl] of incoming) {
            const existing = result.get(key);
            if (existing) {
                if (existing.type.name !== decl.type.name) {
                    throw new Error(
                        `Option "${key}" declared with conflicting types: ` +
                        `${existing.type.name} vs ${decl.type.name}.`,
                    );
                }
                if ('default' in decl) existing.default = decl.default;
                if (decl.description) existing.description = decl.description;
                if (decl.apply) existing.apply = decl.apply;
            } else {
                result.set(key, { ...decl });
            }
        }
    }

    return result;
}
```

This enables the core NixOS pattern: each module declares its own options.

### 4. `types.submodule`

**Decision**: Add `types.submodule(options)` for typed nested config namespaces.

```typescript
function submodule(
    options: Record<string, OptionDeclaration>,
): OptionType<Record<string, unknown>> {
    const optionMap = new Map(Object.entries(options));

    return makeType(
        `submodule({${[...optionMap.keys()].join(', ')}})`,
        (v) => isPlainObject(v),
        (key, defs) => {
            const subKeys = new Set<string>();
            for (const def of defs) {
                for (const k of Object.keys(def as Record<string, unknown>)) {
                    subKeys.add(k);
                }
            }

            const result: Record<string, unknown> = {};
            for (const subKey of subKeys) {
                const subDefs = defs
                    .map(d => (d as Record<string, unknown>)[subKey])
                    .filter(v => v !== undefined);
                const subType = optionMap.get(subKey)?.type ?? types.anything;
                result[subKey] = subDefs.length === 1
                    ? subDefs[0]
                    : subType.merge(`${key}.${subKey}`, subDefs);
            }

            for (const [subKey, decl] of optionMap) {
                if (!(subKey in result)) {
                    if ('default' in decl) result[subKey] = decl.default;
                    else if (decl.type.emptyValue) result[subKey] = decl.type.emptyValue();
                }
            }

            return result;
        },
        () => {
            const result: Record<string, unknown> = {};
            for (const [subKey, decl] of optionMap) {
                if ('default' in decl) result[subKey] = decl.default;
                else if (decl.type.emptyValue) result[subKey] = decl.type.emptyValue();
            }
            return result;
        },
    );
}
```

Composes with `attrsOf` for NixOS-style keyed namespaces:
```typescript
types.attrsOf(types.submodule({
    enable: { type: types.bool, default: false },
    port:   { type: types.int },
}))
```

### 5. `types.keyedListOf` — lists merged by key

**Decision**: Add `types.keyedListOf(keyFn, elemType)` for Clash proxy-groups/proxies pattern.

During merge: groups elements by key across all definitions, merges same-key elements via `elemType.merge`, respects mkOrder for ordering. Output: flat `Array<T>` ordered by first-seen insertion order.

```typescript
function keyedListOf<T extends Record<string, unknown>>(
    keyFn: (elem: T) => string,
    elemType: OptionType<T>,
): OptionType<T[]> {
    return makeType(
        `keyedListOf(${elemType.name})`,
        (v) => Array.isArray(v),
        (key, defs) => {
            // Flatten all ordered segments
            const allSegments: Segment[] = [];
            for (const def of defs) {
                if (isArrayLike(def)) allSegments.push(...toSegments(def));
                else if (Array.isArray(def)) allSegments.push({ order: DEFAULT_ORDER, items: def });
            }
            const sorted = [...allSegments].sort((a, b) => a.order - b.order);

            // Group by key, preserving first-seen order
            const groups = new Map<string, T[]>();
            for (const seg of sorted) {
                for (const item of seg.items as T[]) {
                    const k = keyFn(item);
                    if (!groups.has(k)) groups.set(k, []);
                    groups.get(k)!.push(item);
                }
            }

            // Merge each group
            const result: T[] = [];
            for (const [, items] of groups) {
                result.push(
                    items.length === 1
                        ? items[0]
                        : elemType.merge(key, items),
                );
            }
            return result;
        },
        () => [] as T[],
    );
}
```

This replaces the `_proxyGroupMap` / `_proxyMap` / `listToMap` hack in substore-overlay:

```
Before (hack):                          After (types.keyedListOf):
─────────────────────────────────       ─────────────────────────────
modules.concat([                        _options: {
  listToMap('proxy-groups',               'proxy-groups': {
    '_proxyGroupMap',                       type: types.keyedListOf(
    item => item.name),                       g => g.name,
  listToMap('proxies',                        types.submodule({
    '_proxyMap',                                 name:    { type: types.str },
    item => item.name),                         type:    { type: types.str },
])                                              proxies: { type: types.listOf(types.str) },
                                              }),
merged['proxy-groups'] =                    ),
  Object.values(merged._proxyGroupMap);   },
merged.proxies =                        }
  Object.values(merged._proxyMap);
                                        // No post-processing needed
```

### 6. `types.uniqueListOf` — ordered list with dedup

**Decision**: Thin wrapper around `listOf` that deduplicates after ordering.

```typescript
function uniqueListOf<T>(
    elem: OptionType<T>,
    keyFn: (item: T) => string = String,
): OptionType<T[]> {
    const inner = listOf(elem);
    return makeType(
        `uniqueListOf(${elem.name})`,
        inner.check,
        (key, defs) => {
            const merged = inner.merge(key, defs);
            const seen = new Set<string>();
            return merged.filter(item => {
                const k = keyFn(item);
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            });
        },
        inner.emptyValue,
    );
}
```

For Clash rules: `types.uniqueListOf(types.str)` gives ordered concat with duplicate removal. First occurrence wins (which is the highest-priority by order).

### 7. Shared `coreMerge`

**Decision**: Extract the common deep-merge logic into a single `coreMerge` function. Three callers layer their own concerns on top.

```typescript
// core-merge.ts (internal)

/**
 * Merge two concrete, priority-unwrapped values.
 * Arrays: ordered concat. Objects: recursive deep merge. Scalars: must equal.
 */
export function coreMerge(key: string, cur: unknown, ext: unknown): unknown {
    if (ext === undefined) return cur;
    if (cur === undefined) return ext;

    const curArr = isArrayLike(cur) || Array.isArray(cur);
    const extArr = isArrayLike(ext) || Array.isArray(ext);
    if (curArr || extArr) {
        if (!curArr || !extArr) {
            throw new Error(`Type mismatch: cannot merge array with non-array for "${key}"`);
        }
        return { [MARKER]: 'order-list', segments: [...toSegments(cur), ...toSegments(ext)] };
    }

    if (isPlainObject(cur) && isPlainObject(ext)) {
        return coreDeepMerge(key, cur, ext);
    }

    if (cur === ext) return cur;
    throw new Error(
        `Scalar conflict for "${key}": ${JSON.stringify(cur)} vs ${JSON.stringify(ext)}.`,
    );
}

function coreDeepMerge(
    key: string,
    target: Record<string, unknown>,
    source: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...target };
    for (const [k, value] of Object.entries(source)) {
        if (k in result && result[k] !== undefined) {
            result[k] = coreMerge(`${key}.${k}`, result[k], value);
        } else {
            result[k] = value;
        }
    }
    return result;
}
```

Callers:

| Caller | Responsibility layered on top |
|---|---|
| `types.anything.merge` | Pairwise fold of N defs, defer wrapping when lazy values present |
| `mergeResolvedValues` | Priority unwrap before calling `coreMerge`, `uniqueKeyFields` check |
| `mergeDeepValue` | Defer wrapping for nested lazy values, then `coreMerge` |

### 8. Phase 4 expansion

**Decision**: Phase 4 gains three new steps — type validation, warning processing, system key stripping.

```
Phase 4: Finalize
  4a. Type validation     — for each declared option, call type.check(resolved[key])
  4b. Apply transforms    — for each option with apply, transform the value
  4c. Evaluate assertions — throw on assertion === false
  4d. Process warnings    — call onWarning callback or console.warn
  4e. Strip system keys   — remove _assertions, _warnings, _options, _imports, _module
  4f. Clean undefined     — deep remove undefined values
```

System keys to strip:

```typescript
const SYSTEM_KEYS = new Set(['_assertions', '_warnings', '_options', '_imports', '_module']);
```

User `_`-prefixed keys (e.g. `_allSelectables`, `_ctx`) are NOT stripped — those are the user's responsibility.

Warning processing via `EvalModulesOptions`:

```typescript
interface EvalModulesOptions {
    args?: Record<string, unknown>;
    onWarning?: (message: string) => void;
}
```

### 9. Export `makeType`

**Decision**: Export `makeType` from the public API so custom OptionTypes can be created ergonomically:

```typescript
export { types, isOptionType, makeType } from './option-types.js';
```

### 10. Remove legacy code paths

Since no backward compat is needed:

- Remove `deferred.ts` entirely (no `deferred()`, no `isDeferred()`)
- Remove `options.merge` parameter from `EvalModulesOptions` (no pairwise fold fallback in evalModules)
- Remove `evalModulesLegacy` / `evalModulesAsyncLegacy` functions
- `moduleMerge` and `createModuleMerge` stay — they're used by `applyOverlays` which is a different abstraction
- Remove all `isDeferred(v) || isDefer(v)` dual checks — just `isDefer(v)`

## Clash config schema design

The target schema for substore-overlay, enabled by the new types:

```typescript
const clashSchema = () => ({
    _options: {
        'proxy-groups': {
            type: types.keyedListOf(
                (g: ProxyGroup) => g.name,
                types.submodule({
                    name:    { type: types.str },
                    type:    { type: types.str, default: 'select' },
                    proxies: { type: types.listOf(types.str), default: [] },
                }),
            ),
            default: [],
        },
        proxies: {
            type: types.keyedListOf(
                (p: Record<string, unknown>) => String(p.name),
                types.anything,
            ),
            default: [],
        },
        rules: {
            type: types.uniqueListOf(types.str),
            default: [],
        },
        'rule-providers': {
            type: types.attrsOf(types.anything),
            default: {},
        },
    },
});
```

Module composition becomes:
```typescript
// Module A adds a proxy group
() => ({
    'proxy-groups': mkBefore([
        { name: '手动选择', type: 'select', proxies: ['延迟测试'] },
    ]),
})

// Module B adds proxies to the SAME group (merged by name)
() => ({
    'proxy-groups': mkOrder(850, [
        { name: '手动选择', proxies: ['新代理'] },
    ]),
})

// Result: [{ name: '手动选择', type: 'select', proxies: ['延迟测试', '新代理'] }]
```

No `_proxyGroupMap` hack. No `listToMap` post-processing. The type system handles it.
