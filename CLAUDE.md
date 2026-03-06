# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A pnpm monorepo with two packages that build modular Clash/Mihomo proxy configuration scripts using a Nix-style overlay/module system.

- **`packages/libmodule`** — Generic declarative configuration composition library (Nix-style overlays, priorities, ordering, deferred values, module merging)
- **`packages/substore-overlay`** — Clash/Mihomo override scripts and Sub-Store proxy operators that use libmodule

## Commands

```bash
pnpm install              # Install dependencies
pnpm test                 # Run all tests across both packages
pnpm typecheck            # TypeScript type checking across both packages
pnpm build                # Build substore-overlay → dist/ (4 IIFE bundles)
pnpm docs                 # Generate typedoc API docs for libmodule

# Per-package (from package root or with --filter)
pnpm --filter libmodule test
pnpm --filter substore-overlay test
pnpm --filter libmodule test:watch    # Vitest watch mode

# Single test file
cd packages/libmodule && npx vitest run tests/overlay.test.ts
cd packages/substore-overlay && npx vitest run tests/integration.test.ts
```

Build output: `packages/substore-overlay/dist/{override,parse_node_name,detect_geo,rename_nodes}.js`

## Architecture

### libmodule — Overlay/Module System

Core mechanism: `applyOverlays(base, [overlayFn1, overlayFn2, ...], { merge })` applies overlay functions sequentially, then resolves deferred values. Each overlay receives `(final, prev)` where `prev` is the accumulated state and `final` is a lazy Proxy for the fully-merged result (only accessible inside `deferred()`).

Key primitives (all Nix-compatible):
- **Priority** — `mkDefault(v)` (1000), bare values (100), `mkForce(v)` (50). Lower number wins. Same priority + different values = error.
- **Ordering** — `mkBefore(items)` (500), `mkAfter(items)` (1500), `mkOrder(n, items)`. Controls array element positioning.
- **Deferred** — `deferred(() => final.someKey)` for lazy forward references resolved post-merge.
- **moduleMerge** — Default merge strategy: arrays concatenate as ordered segments, objects deep-merge, scalars use priority resolution, `_`-prefixed keys use last-writer-wins.
- **evalModules** — NixOS-style module evaluation with `_imports` support for module composition.

### substore-overlay — Clash Config Builder

**4 entrypoints** built as separate IIFE bundles:

1. **override.ts** — `main(config)`: Evaluates 12 modules via `evalModules()` to compose a full Clash/Mihomo config. Parses `$arguments` (ipv6Enabled, dnsMode) via Valibot schemas.
2. **parse_node_name.ts** — Operator: extracts `_nodeInfo` (countryCode, multiplier, tags) from proxy node names via regex.
3. **detect_geo.ts** — Async operator: resolves entry/landing country codes via IP-API or MMDB, with caching (24h TTL) and configurable concurrency.
4. **rename_nodes.ts** — Operator: renames nodes as `[ENTRY→LANDING] NUM MULT TAGS | SOURCE`.

**Module composition** (ordered by mkOrder values): general → dns → base-groups(500) → landing-proxy(600) → custom(650) → ssh(675) → private(700) → academic(750) → domestic(800) → streaming(850) → gaming(875) → ai(900) → proxy(1100). Each module returns a config fragment that gets merged via moduleMerge.

**Module pattern**: `(ctx: ModuleContext<Args>) => ModuleFn` — modules receive parsed arguments and return overlay functions that declare proxy groups, rule providers, and rules.

**Key helpers** (`lib/clash.ts`): `trafficGroup()` creates proxy groups with deferred proxy lists from `config._allSelectables`; `dustinRule()`/`rulesetRule()` create rule providers and rules using DustinWin MRS format.

**Proxy processor pipeline**: parse_node_name → detect_geo → rename_nodes → override (modules merge). Internal metadata fields (`_nodeInfo`, `_geoEntry`, `_geoLanding`, etc.) are stripped by `cleanup()`.

## Code Conventions

- Language: TypeScript (ES2022 target, ESNext modules, bundler resolution)
- Strict mode with `noUnusedLocals` and `noUnusedParameters`
- Tests: Vitest
- Validation: Valibot schemas for argument parsing
- Build: esbuild (IIFE format, es2020 target, no minification)
- README/docs are in Chinese
- Nix shell available (`shell.nix`) with Node.js + pnpm
