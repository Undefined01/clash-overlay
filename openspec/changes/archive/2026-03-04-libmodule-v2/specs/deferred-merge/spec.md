## ADDED Requirements

### Requirement: Deferred values participate in merge
When `moduleMerge` encounters a deferred value on either side (current or extension) of a key merge, it SHALL create a new deferred that captures both sides and applies the standard merge rules (`mergeResolvedValues`) at resolve time, rather than overwriting.

#### Scenario: Deferred extension with existing array
- **WHEN** current value for key `packages` is `OrderedList([{1000, ['vim']}])` and extension is `deferred(() => ['firefox'])`
- **THEN** result SHALL be a deferred that, when resolved with condition true, produces `OrderedList` containing both `['vim']` and `['firefox']` segments

#### Scenario: Deferred extension resolving to undefined
- **WHEN** current value for key `packages` is `OrderedList([{1000, ['vim']}])` and extension is `deferred(() => undefined)`
- **THEN** result SHALL be a deferred that, when resolved, produces the original `OrderedList([{1000, ['vim']}])`

#### Scenario: Both sides deferred
- **WHEN** current value is `deferred(() => ['a'])` and extension is `deferred(() => ['b'])`
- **THEN** result SHALL be a deferred that, when resolved, merges both arrays into a single OrderedList

#### Scenario: Three modules contributing deferred to same array key
- **WHEN** Module A sets `packages = ['vim']`, Module B sets `packages = deferred(() => cond1 ? ['firefox'] : undefined)`, Module C sets `packages = deferred(() => cond2 ? ['vscode'] : undefined)`
- **THEN** with cond1=true and cond2=true, resolved result SHALL be `['vim', 'firefox', 'vscode']` with no data loss

#### Scenario: Deferred current with concrete extension
- **WHEN** current value is `deferred(() => mkDefault(80))` and extension is `443` (bare, priority 100)
- **THEN** result SHALL be a deferred that, when resolved, applies priority comparison (100 < 1000 → 443 wins)

### Requirement: mergeResolvedValues handles concrete values
A reusable `mergeResolvedValues(key, cur, ext)` function SHALL handle merging of concrete (non-deferred) values following existing rules: array-like values concat as ordered segments, plain objects deep merge, scalars compare by priority.

#### Scenario: Array-like merge
- **WHEN** cur is `['a']` and ext is `mkBefore(['b'])`
- **THEN** result SHALL be an OrderedList with segments `[{500, ['b']}, {1000, ['a']}]`

#### Scenario: Type mismatch
- **WHEN** cur is `['a']` and ext is `'string'`
- **THEN** mergeResolvedValues SHALL throw a type mismatch error

#### Scenario: Scalar priority
- **WHEN** cur is `mkDefault(80)` and ext is `443`
- **THEN** result SHALL be `443` (priority 100 < 1000)

### Requirement: Post-resolve undefined cleanup
After `resolveDeferred` completes, `evalModules` and `applyOverlays` (when using moduleMerge) SHALL recursively remove keys whose values are `undefined`. Array elements that are `undefined` SHALL be filtered out. Empty objects resulting from cleanup SHALL themselves become `undefined` and propagate upward.

#### Scenario: Deferred resolves to undefined
- **WHEN** a key's value is `deferred(() => undefined)` and resolve produces `undefined`
- **THEN** that key SHALL be absent from the final result

#### Scenario: Nested undefined cleanup
- **WHEN** an object `{ a: { b: undefined } }` results from resolve
- **THEN** `a.b` SHALL be removed, and if `a` becomes empty, `a` SHALL also be removed

#### Scenario: Array undefined filtering
- **WHEN** an array `[1, undefined, 3]` results from resolve
- **THEN** result SHALL be `[1, 3]`
