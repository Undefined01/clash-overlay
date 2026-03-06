## ADDED Requirements

### Requirement: ModuleFn receives args object with config
`ModuleFn` signature SHALL be `(args: { config: Record<string, unknown> } & TArgs) => Record<string, unknown>` where `config` is the lazy config proxy and `TArgs` are specialArgs.

#### Scenario: Module with config only
- **WHEN** a module is defined as `({ config }) => ({ port: deferred(() => config.defaultPort) })`
- **THEN** `evalModules` SHALL pass `{ config: configProxy }` and the module SHALL function correctly

#### Scenario: Module with specialArgs
- **WHEN** `evalModules(base, modules, { args: { env: 'production' } })` is called
- **THEN** each module SHALL receive `{ config: configProxy, env: 'production' }` and can destructure `({ config, env }) => ...`

### Requirement: EvalModulesOptions supports args field
`EvalModulesOptions` SHALL include an optional `args` field of type `Record<string, unknown>`. When provided, all key-value pairs SHALL be merged into the args object passed to each module, alongside `config`.

#### Scenario: No args provided
- **WHEN** `evalModules(base, modules)` is called without options.args
- **THEN** modules SHALL receive `{ config: configProxy }` (no extra args)

#### Scenario: Args do not override config
- **WHEN** `evalModules(base, modules, { args: { config: 'should-not-override' } })` is called
- **THEN** the `config` field SHALL still be the config proxy, not the user-provided value

### Requirement: AsyncModuleFn uses same args signature
`AsyncModuleFn` SHALL use the same `(args: { config } & TArgs) => ...` signature as `ModuleFn`.

#### Scenario: Async module with specialArgs
- **WHEN** `evalModulesAsync(base, modules, { args: { db: dbClient } })` is called
- **THEN** each async module SHALL receive `{ config: configProxy, db: dbClient }`

### Requirement: Overlay function signatures unchanged
`applyOverlays` and `OverlayFn` signatures SHALL NOT change. The `(final, prev) => extension` pattern is unaffected by this change.

#### Scenario: Existing overlay code works
- **WHEN** `applyOverlays(base, [(final, prev) => ({ port: 80 })])` is called
- **THEN** behavior SHALL be identical to the current implementation
