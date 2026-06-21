## ADDED Requirements

### Requirement: Dedicated Storybook renders prototype stories in light and dark

The web package SHALL provide a dedicated Storybook configuration that renders every story
under `src/prototypes/**`, launchable via a `storybook:prototypes` script, rendering each story
through the Mantine retro theme with the color scheme following the OS `prefers-color-scheme`
so both light and dark can be previewed.

#### Scenario: A prototype story is viewable in the prototype Storybook

- **WHEN** a story file exists at `src/prototypes/<change-name>/<name>.stories.tsx` and the
  prototype Storybook is built or served
- **THEN** that story appears in the prototype Storybook's index and renders with the Mantine
  retro theme applied

#### Scenario: Only prototype stories are included

- **WHEN** the prototype Storybook resolves its story list
- **THEN** the list contains only paths under `src/prototypes/**` and excludes the production
  stories under the rest of `src/`

#### Scenario: Dark mode follows the emulated OS color scheme

- **WHEN** a prototype story is rendered with the emulated `prefers-color-scheme` set to `dark`
- **THEN** the Mantine provider resolves to its dark color scheme — because the prototype
  preview wraps stories in its own `AppProviders` decorator with `colorScheme="auto"`

### Requirement: Production Storybook build excludes prototypes

The production Storybook configuration SHALL exclude every path under `src/prototypes/**` from
its resolved story list, so prototypes never reach the production Storybook build, its
visual-snapshot run, or autodocs. Exclusion from the application bundle and any future package
`exports` is guaranteed structurally — app code may not import `src/prototypes/**` (ESLint
`no-restricted-imports`) and the package declares no `exports` map — so there is no path for a
prototype to leak into shipped output.

#### Scenario: Production story list excludes prototypes

- **WHEN** the production `.storybook` configuration resolves its story list
- **THEN** no entry in the list is under `src/prototypes/`

#### Scenario: Production build output contains no prototype story

- **WHEN** the production Storybook is built
- **THEN** the built index contains none of the stories defined under `src/prototypes/**`

### Requirement: Prototype grouping and tags are derived from file location

Prototype stories SHALL be grouped under a `Prototypes/<change-name>` sidebar root and carry
the `prototype` and `!autodocs` tags, derived from the story file's location by the prototype
config's indexer and overriding any hand-written `title`.

#### Scenario: Title and tags derive from file location

- **WHEN** a story file at `src/prototypes/<change-name>/<name>.stories.tsx` is indexed by the
  prototype Storybook
- **THEN** its sidebar title is `Prototypes/<change-name>/<name>` (with each named export nested
  beneath that root) and it is tagged `prototype` and `!autodocs`

#### Scenario: Tags survive into the built index

- **WHEN** the prototype Storybook is built
- **THEN** the indexed `_sample` entry carries the `prototype` and `!autodocs` tags and is
  therefore excluded from autodocs

### Requirement: definePrototypeMeta helper

The web package SHALL export a typed `definePrototypeMeta` helper from
`src/prototypes/define-prototype-meta.ts` that returns a Storybook `Meta` pre-filled with the
quarantine tags from a single shared constant, intended to be spread into a story's `meta`
object literal. The helper SHALL NOT set the title (the indexer derives it from location).

#### Scenario: Helper pre-fills the quarantine tags and preserves caller props

- **WHEN** a story builds its meta as `{ ...definePrototypeMeta({ component }) }`
- **THEN** the resulting meta carries the `prototype` and `!autodocs` tags and preserves the
  caller-supplied `component`/`parameters`, and sets no `title`
