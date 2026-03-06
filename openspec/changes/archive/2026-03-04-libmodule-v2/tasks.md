## 1. Extract mergeResolvedValues and fix deferred merge

- [x] 1.1 Extract `mergeResolvedValues(key, cur, ext)` from `moduleMerge` loop body in module-merge.ts — handles array concat, deep merge, and scalar priority for concrete values only
- [x] 1.2 Implement `deferredMerge(key, cur, ext)` that returns `deferred(() => ...)` resolving both sides then calling `mergeResolvedValues`
- [x] 1.3 Replace the deferred overwrite logic in `moduleMerge` (lines 193-196 and 234-237) with `deferredMerge` — trigger when `isDeferred(curRaw) || isDeferred(extRaw)`
- [x] 1.4 Add tests: deferred ext with existing array, deferred ext resolving to undefined, both sides deferred, three-module chain, deferred current with concrete ext, deferred with priority wrappers

## 2. Add deep undefined cleanup

- [x] 2.1 Implement `deepCleanUndefined(obj)` in resolve.ts — recursively remove undefined keys, filter undefined from arrays, collapse empty objects to undefined
- [x] 2.2 Integrate `deepCleanUndefined` into `evalModules` and `evalModulesAsync` after `resolveDeferred`
- [x] 2.3 Integrate `deepCleanUndefined` into `applyOverlays` and `applyOverlaysAsync` after `resolveDeferred`
- [x] 2.4 Add tests: deferred resolving to undefined removed, nested cleanup propagation, array filtering, existing behavior not broken

## 3. Add mkIf

- [x] 3.1 Create mkif.ts — `mkIf(condition, value)`: expand plain objects per-key to deferred, wrap non-objects as single deferred
- [x] 3.2 Export `mkIf` from index.ts
- [x] 3.3 Add tests: condition true/false for objects, condition true/false for scalars, keys participate in cross-module merge, preserves mkOrder/mkBefore/mkAfter/mkOverride/mkForce through deferred, no new __type tags introduced

## 4. Add mkMerge

- [x] 4.1 Implement `mkMergeValues(definitions)` in mkmerge.ts — fold concrete values immediately, return deferred if any definition is deferred
- [x] 4.2 Implement `mkMergeObjects(definitions)` in mkmerge.ts — collect keys across objects, merge per-key using mkMergeValues
- [x] 4.3 Implement `mkMerge(definitions)` dispatcher — all-objects → mkMergeObjects, otherwise → mkMergeValues, empty → undefined
- [x] 4.4 Export `mkMerge` from index.ts
- [x] 4.5 Add tests: overlapping array keys, conflicting scalars error, priority resolution, multiple arrays with ordering, deferred definitions, mkIf + mkMerge composition (object mode and value mode), cross-module merge of mkMerge result, empty input

## 5. Unify module function signature

- [x] 5.1 Update `ModuleFn` and `AsyncModuleFn` types in types.ts to `(args: { config: Record<string, unknown> } & Record<string, unknown>) => ...`
- [x] 5.2 Add `args?: Record<string, unknown>` to `EvalModulesOptions`
- [x] 5.3 Update `evalModules` and `evalModulesAsync` in modules.ts — construct `{ config: configProxy, ...options.args }` and pass to modules
- [x] 5.4 Ensure `config` key cannot be overridden by user-provided args
- [x] 5.5 Update existing libmodule tests to use new `({ config }) =>` signature
- [x] 5.6 Add tests: module with config only, module with specialArgs, no args defaults, args don't override config, async variant

## 6. Migrate substore-overlay

- [x] 6.1 Update all module files in packages/substore-overlay/src/modules/ — change from two-layer `(ctx) => (config) => {...}` or `(config) => {...}` to `({ config, ctx }) => {...}` or `({ config }) => {...}`
- [x] 6.2 Update override.ts entrypoint — pass `{ args: { ctx } }` to `evalModules` instead of `modules.map(fn => fn(ctx))`
- [x] 6.3 Remove ModuleContext from modules/lib.ts or update to match new pattern
- [x] 6.4 Run `pnpm test` and `pnpm typecheck` across entire workspace — verify all tests pass
