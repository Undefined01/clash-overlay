## Why

libmodule's `moduleMerge` has a correctness bug: deferred values directly overwrite existing values instead of participating in merge. When multiple modules contribute to the same array key and any contribution is deferred, earlier contributions are silently lost. Additionally, the library lacks two essential Nix module system primitives (`mkIf`, `mkMerge`) needed for conditional configuration, and the module function signature requires awkward two-layer functions for parameter passing.

## What Changes

- **Fix deferred-aware merge**: When either side of a merge is deferred, create a new deferred that resolves both sides at resolve time then merges them using the same rules (array concat, deep merge, priority compare). Extract `mergeResolvedValues()` as a reusable single-key merge function for concrete values.
- **Add `mkIf`**: Conditional configuration primitive. For plain objects: expands each key into `deferred(() => condition() ? value : undefined)`. For other values: wraps as single deferred. No new `__type` tag — pure sugar over deferred + undefined.
- **Add `mkMerge`**: Allows multiple definitions for the same key within a single module. For arrays of plain objects: collects keys and merges per-key. For value arrays: merges immediately if all concrete, returns deferred if any deferred.
- **Add deep undefined cleanup**: After `resolveDeferred`, recursively strip keys that resolved to `undefined`. Supports mkIf semantics where false conditions should act as "never declared".
- **BREAKING**: Unify `ModuleFn` signature from `(config) => {...}` to `({ config, ...args }) => {...}`. Add `args` option to `EvalModulesOptions` for passing specialArgs to all modules. Eliminates the two-layer function pattern.

## Capabilities

### New Capabilities
- `deferred-merge`: Correct deferred-aware merge semantics in moduleMerge — deferred values participate in merge rather than overwriting
- `mkif`: Conditional configuration primitive (`mkIf`) that gates attribute sets on lazy conditions
- `mkmerge`: Multi-definition merge primitive (`mkMerge`) for combining multiple contributions to a single key within one module
- `module-args`: Unified module function signature with specialArgs support

### Modified Capabilities

(none — no existing specs)

## Impact

- **packages/libmodule/src/**: module-merge.ts, resolve.ts, modules.ts, overlay.ts, types.ts modified; mkif.ts and mkmerge.ts added; index.ts updated for new exports
- **packages/libmodule/tests/**: New test files for mkIf, mkMerge, deferred merge; existing merge/module tests updated
- **packages/substore-overlay/src/**: All module files migrated to new `({ config, ... })` signature (mechanical, **BREAKING** for downstream consumers of `ModuleFn` type)
- **API surface**: New exports `mkIf`, `mkMerge`; `ModuleFn`/`AsyncModuleFn`/`EvalModulesOptions` type signatures change
