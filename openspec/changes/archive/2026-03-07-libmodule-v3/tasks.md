## Phase 1 (v3 core — DONE)

- [x] 1. Proxy-based `defer()` with Symbol detection
- [x] 2. `OptionType<T>` interface and 12 type constructors
- [x] 3. `_options` declaration system (single-module)
- [x] 4. All-at-once per-key merge engine
- [x] 5. 4-phase `evalModules` pipeline
- [x] 6. `apply`, `_assertions`, `_warnings` support
- [x] 7. Public API exports
- [x] 8. All existing tests pass, typecheck clean, build succeeds

## Phase 2 (v3 refinements)

### 9. Shared MARKER Symbol

- [x] 9.1 Create `symbols.ts` — export `MARKER = Symbol.for('libmodule:marker')` and `DEFER_SYMBOL = Symbol.for('libmodule:defer')`
- [x] 9.2 Rewrite `priority.ts` — Override uses `{ [MARKER]: 'override', priority, value }`
- [x] 9.3 Rewrite `order.ts` — Ordered uses `{ [MARKER]: 'order', order, items }`, OrderedList uses `{ [MARKER]: 'order-list', segments }`
- [x] 9.4 Update `defer.ts` — add `MARKER` to Proxy handler
- [x] 9.5 Replace all `isPlainObject` implementations with `!(MARKER in val)` version
- [x] 9.6 Update `types.ts` — interfaces use `[MARKER]` instead of `__type`
- [x] 9.7 Update tests — all marker detection tests, all spread/Object.keys assertions

### 10. Remove `deferred()`, consolidate on `defer()`

- [x] 10.1 Delete `deferred.ts`
- [x] 10.2 Relax `defer<T>` type constraint, handle primitive cached values
- [x] 10.3 Replace all internal `deferred()` calls with `defer()`
- [x] 10.4 Replace all dual `isDeferred || isDefer` checks with `isDefer(v)`
- [x] 10.5 Replace all force patterns with `isDefer(v) ? forceDefer(v) : v`
- [x] 10.6 Remove `deferred`, `isDeferred` exports from index.ts
- [x] 10.7 Update all tests — remove deferred-specific tests, use `defer()`

### 11. Cross-module `_options` merge

- [x] 11.1 Rewrite `extractOptions` — union declarations, same type last-writer-wins, different type throws
- [x] 11.2 Remove single-module restriction
- [x] 11.3 Add tests for cross-module merge scenarios

### 12. `types.submodule`

- [x] 12.1 Implement `types.submodule(options)` in option-types.ts
- [x] 12.2 Add tests: single def, multiple defs, undeclared sub-key, defaults, nested submodule

### 13. `types.keyedListOf`

- [x] 13.1 Implement `types.keyedListOf(keyFn, elemType)` in option-types.ts
- [x] 13.2 Add tests: single module, same key merge, mkOrder, insertion order

### 14. `types.uniqueListOf`

- [x] 14.1 Implement `types.uniqueListOf(elem, keyFn?)` in option-types.ts
- [x] 14.2 Add tests: passthrough, dedup, mkOrder + dedup, custom keyFn

### 15. Shared `coreMerge`

- [x] 15.1 Create `core-merge.ts` — implement `coreMerge(key, cur, ext)` and `coreDeepMerge(key, target, source)`.
- [x] 15.2 Refactor `types.anything.merge` — pairwise fold using `coreMerge`.
- [x] 15.3 Refactor `mergeResolvedValues` (module-merge.ts) — priority unwrap then `coreMerge`.
- [x] 15.4 Refactor `mergeDeepValue` (module-merge.ts) — defer wrapping then `coreMerge`.
- [x] 15.5 Delete duplicate functions from option-types.ts and module-merge.ts.
- [x] 15.6 Add tests: coreMerge matches existing merge behavior.

### 16. Phase 4 expansion

- [x] 16.1 Type validation step
- [x] 16.2 Warning processing
- [x] 16.3 `onWarning` in `EvalModulesOptions`
- [x] 16.4 System key stripping
- [x] 16.5 Remove legacy pairwise fold path — remove `options.merge` from `EvalModulesOptions`
- [x] 16.6 Add Phase 4 tests

### 17. Export `makeType`

- [x] 17.1 Export `makeType` from option-types.ts and index.ts
- [x] 17.2 Add test: custom OptionType via makeType

### 18. Update substore-overlay

- [x] 18.1 Replace all `deferred()` calls with `defer()` in substore-overlay.
- [x] 18.2 Replace `_proxyGroupMap` / `_proxyMap` / `listToMap` hack with `keyedListOf` option schema.
- [x] 18.3 Add Clash option schema module (proxy-groups, proxies, rules, rule-providers type declarations).
- [x] 18.4 All substore-overlay tests pass, typecheck clean, build succeeds.

### 19. Final validation

- [x] 19.1 `pnpm test` — all tests pass across both packages.
- [x] 19.2 `pnpm typecheck` — no type errors.
- [x] 19.3 `pnpm build` — all 4 IIFE bundles build successfully.
