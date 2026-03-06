## ADDED Requirements

### Requirement: mkMerge merges multiple object definitions by key
`mkMerge(definitions)` where all definitions are plain objects (or deferred-that-resolve-to-objects) SHALL collect all keys across definitions, group values per key, and merge each key's values using standard merge rules. The result SHALL be a plain object.

#### Scenario: Two objects with overlapping array keys
- **WHEN** `mkMerge([{ packages: ['vim'] }, { packages: ['git'], port: 80 }])` is evaluated
- **THEN** result SHALL have `packages` as an OrderedList containing both `['vim']` and `['git']` segments, and `port` as `80`

#### Scenario: Objects with conflicting scalar keys
- **WHEN** `mkMerge([{ port: 80 }, { port: 443 }])` is evaluated
- **THEN** SHALL throw a scalar conflict error (same priority 100, different values)

#### Scenario: Objects with priority resolution
- **WHEN** `mkMerge([{ port: mkDefault(80) }, { port: 443 }])` is evaluated
- **THEN** result SHALL have `port` as `443` (priority 100 < 1000)

### Requirement: mkMerge merges multiple value definitions
`mkMerge(definitions)` where definitions are non-object values (arrays, scalars) SHALL fold them using standard merge rules.

#### Scenario: Multiple arrays
- **WHEN** `mkMerge([['a'], mkBefore(['b']), ['c']])` is evaluated
- **THEN** result SHALL be an OrderedList with segments `[{500, ['b']}, {1000, ['a']}, {1000, ['c']}]`

#### Scenario: Scalar with priorities
- **WHEN** `mkMerge([mkDefault(80), 443])` is evaluated
- **THEN** result SHALL be `443` (priority 100 beats 1000)

### Requirement: mkMerge with deferred definitions
When any definition in `mkMerge` is deferred, the result SHALL be a deferred that resolves all definitions, filters out `undefined`, and merges the remaining values.

#### Scenario: Mix of concrete and deferred arrays
- **WHEN** `mkMerge([['vim'], deferred(() => ['firefox'])])` is resolved
- **THEN** result SHALL be an OrderedList containing both `['vim']` and `['firefox']` segments

#### Scenario: Deferred resolves to undefined
- **WHEN** `mkMerge([['vim'], deferred(() => undefined)])` is resolved
- **THEN** result SHALL be equivalent to just `['vim']`

#### Scenario: All deferred resolve to undefined
- **WHEN** `mkMerge([deferred(() => undefined), deferred(() => undefined)])` is resolved
- **THEN** result SHALL be `undefined`

### Requirement: mkMerge composes with mkIf
`mkMerge` SHALL correctly handle mkIf-produced deferred values within both object and value modes.

#### Scenario: Object mode with mkIf fragments
- **WHEN** a module returns `mkMerge([{ packages: ['base'] }, mkIf(() => config.gui, { packages: ['firefox'], theme: 'dark' }), mkIf(() => config.server, { packages: ['nginx'] })])`
- **THEN** with gui=true, server=true: resolved `packages` SHALL be `['base', 'firefox', 'nginx']` and `theme` SHALL be `'dark'`
- **AND** with gui=false, server=false: resolved `packages` SHALL be `['base']` and `theme` SHALL be absent

#### Scenario: Value mode with mkIf
- **WHEN** `packages: mkMerge([['base'], mkIf(() => config.gui, ['firefox'])])` is resolved with gui=true
- **THEN** result SHALL be an OrderedList flattening to `['base', 'firefox']`

### Requirement: mkMerge result participates in cross-module merge
The result of `mkMerge` used as a module's key value SHALL correctly merge with other modules' contributions to the same key.

#### Scenario: mkMerge array merged with another module's array
- **WHEN** Module A sets `packages = mkOrder(500, ['early'])` and Module B sets `packages = mkMerge([['base'], mkIf(() => cond, mkAfter(['late']))])`
- **THEN** with cond=true, resolved `packages` SHALL be `['early', 'base', 'late']`

### Requirement: mkMerge handles empty input
`mkMerge([])` with an empty definitions array SHALL return `undefined`.

#### Scenario: Empty definitions
- **WHEN** `mkMerge([])` is evaluated
- **THEN** result SHALL be `undefined`
