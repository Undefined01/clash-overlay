## ADDED Requirements

### Requirement: mkIf conditionalizes plain objects by key
`mkIf(condition, object)` where `object` is a plain object SHALL return a new plain object where each key's value is wrapped in `deferred(() => condition() ? originalValue : undefined)`.

#### Scenario: Condition true
- **WHEN** `mkIf(() => true, { a: 1, b: ['x'] })` is evaluated and resolved
- **THEN** result SHALL be `{ a: 1, b: ['x'] }`

#### Scenario: Condition false
- **WHEN** `mkIf(() => false, { a: 1, b: ['x'] })` is evaluated, resolved, and cleaned
- **THEN** result SHALL be `{}` (both keys removed by undefined cleanup)

#### Scenario: Keys participate in cross-module merge
- **WHEN** Module A sets `rules = ['always']` and Module B uses `...mkIf(() => config.extra, { rules: mkOrder(500, ['conditional']) })`
- **THEN** with condition true, resolved `rules` SHALL contain both `['conditional', 'always']` (ordered by mkOrder 500 before default 1000)
- **AND** with condition false, resolved `rules` SHALL contain only `['always']`

### Requirement: mkIf conditionalizes non-object values
`mkIf(condition, value)` where `value` is not a plain object SHALL return `deferred(() => condition() ? value : undefined)`.

#### Scenario: Single scalar value
- **WHEN** `mkIf(() => true, 443)` is resolved
- **THEN** result SHALL be `443`

#### Scenario: Single array value
- **WHEN** `mkIf(() => false, ['nginx'])` is resolved and cleaned
- **THEN** result SHALL be `undefined`

### Requirement: mkIf preserves wrapped primitives
Values inside mkIf that are wrapped in `mkOrder`, `mkBefore`, `mkAfter`, `mkOverride`, `mkDefault`, `mkForce` SHALL be preserved through the deferred wrapper and participate correctly in merge after resolve.

#### Scenario: mkIf with mkBefore
- **WHEN** `mkIf(() => true, mkBefore(['early']))` is resolved
- **THEN** result SHALL be `mkBefore(['early'])` (an Ordered with order 500)

#### Scenario: mkIf wrapping object with mkForce
- **WHEN** `mkIf(() => true, { port: mkForce(443) })` is spread into a module return, and another module sets `port: 80`
- **THEN** resolved `port` SHALL be `443` (mkForce priority 50 wins over bare priority 100)

### Requirement: mkIf does not introduce new type tags
mkIf SHALL NOT create any new `__type` values. It SHALL only produce `deferred` wrappers over existing value types.

#### Scenario: Type inspection
- **WHEN** `mkIf(() => true, { a: 1 })` is called
- **THEN** the returned object's values SHALL satisfy `isDeferred(value) === true`
- **AND** no value in the result SHALL have `__type === 'conditional'` or any other new type tag
