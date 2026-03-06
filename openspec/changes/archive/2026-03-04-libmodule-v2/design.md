## Context

libmodule is a Nix-style overlay/module system for JavaScript/TypeScript. It provides declarative configuration composition with priority-based conflict resolution, ordered list merging, and deferred (lazy) values to simulate Nix's pervasive laziness in an eager language.

The library has two layers:
- **Overlay system** (`applyOverlays`): `(final, prev) => extension` — Nix fixpoint overlay semantics
- **Module system** (`evalModules`): `(config) => fragment` — NixOS module-style composition

Both follow a two-phase evaluation: Phase 1 collects and merges fragments, Phase 2 resolves deferred values. The `config`/`final` parameter is a Proxy that throws during Phase 1 and becomes readable in Phase 2 (inside `deferred()` closures).

Current pain points:
1. Deferred values silently overwrite accumulated merge state instead of composing
2. No way to conditionally include config fragments (mkIf) or merge multiple definitions per key (mkMerge)
3. Module functions require a two-layer closure pattern `(ctx) => (config) => {...}` for parameter passing

## Goals / Non-Goals

**Goals:**
- Fix deferred merge to correctly compose with arrays, objects, and priority scalars
- Add mkIf and mkMerge as composable primitives built on existing deferred + undefined semantics
- Unify module function signature to `({ config, ...specialArgs }) => fragment`
- Maintain backward compatibility for the overlay system (`applyOverlays` signature unchanged)
- All new primitives must compose correctly with existing ones (mkOrder, mkBefore, mkAfter, mkOverride, mkDefault, mkForce)

**Non-Goals:**
- Option type system (explicit type declarations per key) — keeping duck-typed merge
- `_module.args` (dynamic inter-module argument injection) — specialArgs covers the use case
- Async-specific primitives — mkIf/mkMerge work with both sync and async paths via existing deferred infrastructure
- Changes to the overlay system's `(final, prev)` signature

## Decisions

### 1. Deferred merge via closure chain

**Decision**: When either side of a merge is deferred, produce a new `deferred()` that captures both sides and applies `mergeResolvedValues` at resolve time.

**Why not resolve eagerly?** Can't — the deferred's value depends on the final config proxy, which isn't available during Phase 1.

**Why not a new `__type` (e.g., `pending-merge`)?** Unnecessary complexity. A deferred closure already captures the merge intent. The resolve phase recursively resolves nested deferreds, so chains of deferred merges unwind naturally.

**Trade-off**: Deep chains of deferred merges (many modules contributing deferred values to the same key) create nested closures. In practice this is bounded by module count and is not a performance concern.

### 2. mkIf as key-level expansion, not a new wrapper type

**Decision**: `mkIf(condition, object)` expands to `{ key1: deferred(...), key2: deferred(...) }` where each deferred returns `value` or `undefined` based on the condition. For non-object values, it wraps as a single deferred.

**Alternative considered**: A new `{ __type: 'conditional', condition, content }` wrapper with merge-time handling. Rejected because:
- Would require changes to moduleMerge, deepMerge, resolve, and normalizeFinal
- The condition cannot be evaluated during Phase 1 anyway, so it must be deferred regardless
- Expanding per-key means each key independently participates in merge — mkIf + mkOrder on a list key correctly produces an ordered segment that may or may not be present

**Trade-off**: The condition function is called once per key during resolve, not once total. For a 10-key object this means 10 calls to the same condition. This is negligible in practice (condition functions are simple boolean reads from config).

### 3. mkMerge dispatches on definition shape

**Decision**: `mkMerge(definitions)` has two modes:
- **Object mode** (all definitions are plain objects or deferred-objects): Collect all keys across definitions, group values per key, merge each key's values using `mergeResolvedValues` (or `mkMergeValues` if deferred). Returns a plain object.
- **Value mode** (definitions are arrays, scalars, etc.): Fold definitions using `mergeResolvedValues`. If any definition is deferred, return a deferred that resolves all then folds.

**Why dispatch on shape?** Object mode must return a `Record<string, unknown>` so it can be used as a module's return value or spread into one. Value mode handles single-key scenarios like `port: mkMerge([mkDefault(80), mkIf(..., 443)])`.

### 4. undefined as "not declared" with post-resolve cleanup

**Decision**: After `resolveDeferred`, run `deepCleanUndefined` to recursively remove keys with `undefined` values. Arrays filter out `undefined` elements. Empty objects after cleanup become `undefined` themselves (propagate upward).

**Why post-resolve rather than in merge?** Merge already skips `undefined` extensions (line 178 of module-merge.ts). The gap is deferred values that *resolve to* `undefined` — these only appear after Phase 2. Cleanup must run after resolve.

**Integration**: `deepCleanUndefined` runs in both `evalModules` and `applyOverlays` (when using moduleMerge), after `resolveDeferred` and before returning.

### 5. Module signature: `({ config, ...args })` with EvalModulesOptions.args

**Decision**: Change `ModuleFn` from `(config: Record<string, unknown>) => Record<string, unknown>` to `(args: { config: Record<string, unknown> } & Record<string, unknown>) => Record<string, unknown>`. `evalModules` constructs the args object as `{ config: configProxy, ...options.args }`.

**Why not a second parameter?** `(config, args)` would work but doesn't match Nix's `{ config, lib, pkgs, ... }:` pattern. The destructuring style is more ergonomic and extensible.

**Migration**: Mechanical — every module function changes from `(config) =>` to `({ config }) =>`. Modules that need specialArgs add destructured fields.

## Risks / Trade-offs

- **[Breaking change in ModuleFn signature]** → Migration is mechanical (add destructuring braces). substore-overlay modules are all in-repo. Document clearly in changelog.
- **[Deferred merge chains may produce confusing stack traces]** → If a merge conflict occurs inside a deferred closure, the error's stack trace goes through resolve rather than the original merge call. Mitigate by including the key name in error messages.
- **[mkIf condition evaluated multiple times per object]** → Negligible cost. Condition functions read from config proxy which is a simple property access.
- **[deepCleanUndefined removes intentional undefined]** → In practice, no module should need to set a key to `undefined` explicitly (they simply don't include it). If needed in future, a sentinel value could be introduced. Not a concern now.
