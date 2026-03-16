## Why

libmodule v3 introduced all-at-once per-key merge, an `OptionType<T>` system, `_options` declarations, and Proxy-based `defer()`. But the implementation has gaps that prevent it from being a proper NixOS-style module system:

1. **Two coexisting lazy mechanisms** — `deferred()` (marker objects) and `defer()` (Proxy) both exist, forcing every code path to check both. `deferred()` leaks `__type` into `Object.keys()` and breaks spread.
2. **`__type` string markers on Override, Ordered, OrderedList** — same enumeration/collision/spread problems as deferred. Inconsistent with defer/OptionType which already use Symbols.
3. **Single-module `_options` restriction** — only one module can declare options. This breaks the core NixOS composability model where any module can declare options for any path.
4. **No `types.submodule`** — can't express typed nested config namespaces. Forces `types.anything` (untyped) for structured sub-objects.
5. **No `types.keyedListOf`** — Clash configs use "list of objects keyed by name" (proxy-groups, proxies) which requires manual `_proxyGroupMap` hacks.
6. **`check()` never called** — every OptionType declares validation but the pipeline never runs it.
7. **Warnings collected but never processed.**
8. **System keys leak into output** — `_assertions`, `_warnings` appear in the final config.
9. **Duplicate merge logic** — three separate deep-merge implementations with subtle differences.
10. **`makeType` not exported** — can't create custom OptionTypes without using raw Symbols.

## What Changes

### Symbol-based markers

Replace all `__type` string markers with a single shared `Symbol.for('libmodule:marker')`. Override, Ordered, OrderedList, and DeferProxy all carry this Symbol with a string discriminant. Eliminates `Object.keys()` pollution, spread breakage, and user-data collision. Simplifies `isPlainObject` to a single `!(MARKER in val)` check.

Remove `deferred()` entirely. `defer()` becomes the only lazy mechanism — Proxy-based, Symbol-detected, works for both objects and primitives (relaxed `T` constraint). All internal merge engine output uses `defer()`.

### Cross-module `_options` merge

Multiple modules can declare `_options`. Declarations are unioned across modules. Same key with same type name: later module wins for default/description/apply. Same key with different types: error.

### New type constructors

- **`types.submodule(options)`** — nested module system inside an option. Merge groups sub-key definitions and delegates to declared sub-types. Enables `types.attrsOf(types.submodule({...}))` for NixOS-style keyed namespaces.
- **`types.keyedListOf(keyFn, elemType)`** — list of objects merged by key, output as ordered array. Replaces the `_proxyGroupMap` hack for Clash proxy-groups/proxies.
- **`types.uniqueListOf(elem, keyFn?)`** — ordered list with post-merge deduplication. For Clash rules.

### Pipeline fixes

- **Type validation** — Phase 4 calls `check()` on all declared options after resolve.
- **Warning processing** — Phase 4 processes `_warnings` via `onWarning` callback (default: `console.warn`).
- **System key stripping** — Phase 4 strips `_assertions`, `_warnings`, `_options`, `_imports`, `_module` from output. User `_`-prefixed keys are untouched.
- **Shared `coreMerge`** — single implementation of array-concat / deep-object-merge / scalar-equality, used by `types.anything`, `mergeResolvedValues`, and `mergeDeepValue`.
- **Export `makeType`** — enables custom OptionType creation.

## Capabilities

### New

- `marker-symbol`: Shared `MARKER` Symbol for all libmodule marker types
- `submodule`: Recursive typed config namespaces
- `keyed-list`: List-of-objects merged by key, output as array
- `unique-list`: Ordered list with deduplication
- `cross-module-options`: Multiple modules declare options for different keys
- `type-validation`: Phase 4 check enforcement
- `warning-processing`: Callback-based warning handler

### Modified

- `defer`: Now the only lazy mechanism (removes `deferred()`)
- `priority`: Override uses MARKER Symbol instead of `__type`
- `ordering`: Ordered/OrderedList use MARKER Symbol instead of `__type`
- `pipeline`: Phase 4 expanded (validation, warnings, system key cleanup)
- `merge-engine`: Shared `coreMerge` replaces three duplicate implementations

### Removed

- `deferred()` / `isDeferred()` — replaced by `defer()` / `isDefer()`
- `__type` string marker detection on all marker types
- Legacy pairwise fold path in `evalModules` (no `options.merge` fallback)

## Impact

- **packages/libmodule/src/**: Remove deferred.ts. Rewrite priority.ts, order.ts to use MARKER Symbol. New core-merge.ts (shared merge logic). Update option-types.ts (submodule, keyedListOf, uniqueListOf, coreMerge integration). Update options.ts (cross-module merge). Update modules.ts (remove legacy path, add validation/warnings/cleanup to Phase 4). Update resolve.ts (defer only, no isDeferred). Update module-merge.ts, mkif.ts, mkmerge.ts (defer only, MARKER Symbol).
- **packages/libmodule/tests/**: Update all tests to use `defer()`. Add tests for new types. Remove deferred-specific tests.
- **packages/substore-overlay/src/**: Replace `deferred()` calls with `defer()`. Replace `_proxyGroupMap`/`_proxyMap` hack with `keyedListOf` option schema. Optional: add Clash option schema module.
