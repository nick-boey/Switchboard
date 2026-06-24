## ADDED Requirements

### Requirement: Switchboard colour palette and indicator status colours

The design system SHALL provide four named colour ramps — Bakelite (warm neutral
surfaces), Patina (teal, the primary accent), Brass (amber/gold, the secondary accent),
and Signal (red, reserved for error / destructive / "line busy" states) — each exposed as
a 10-step scale so screens reference palette steps rather than ad-hoc hex values. The four
hardware ramps cannot express two GitHub-convention indicator hues, so the system SHALL
additionally provide two named, scheme-aware **indicator status colours** as theme tokens —
a **cobalt** (the PR `open` lamp) and a **violet** (the PR `merged` lamp) — referenced as
tokens rather than ad-hoc hex, exactly like the ramps.

#### Scenario: The four ramps are available as theme tokens

- **WHEN** a component reads the theme's colour tokens
- **THEN** the `bakelite`, `patina`, `brass`, and `signal` ramps are each present with ten
  ordered steps, and `patina` is configured as the primary colour

#### Scenario: Signal is the error / destructive colour

- **WHEN** a control renders an error, "line busy", or destructive affordance (e.g. an `error`
  plug or a destructive button)
- **THEN** it draws from the Signal ramp, and no non-alarming control uses Signal as its
  resting colour

#### Scenario: Indicator status colours are theme tokens

- **WHEN** a status lamp renders the PR `open` or `merged` state in either colour scheme
- **THEN** it draws its colour from the named cobalt / violet indicator token in the theme
  (resolving in both light and dark), and no component hard-codes these hues as ad-hoc hex

### Requirement: Light and dark colour schemes

The design system SHALL resolve every surface, text, and control token in both a light and
a dark colour scheme, with the active scheme driven solely by the OS `prefers-color-scheme`
media query. There MUST be no in-app light/dark toggle.

#### Scenario: Dark scheme follows the OS preference

- **WHEN** a screen is rendered with the emulated `prefers-color-scheme` set to `dark`
- **THEN** surfaces, dividers, text, and controls resolve to their dark-scheme values and
  remain legible (no light-on-light or dark-on-dark regions)

#### Scenario: No colour-scheme control is exposed

- **WHEN** the rendered UI is inspected for theme controls
- **THEN** there is no light/dark toggle in the interface; the scheme is determined only by
  the OS preference

### Requirement: Flat surface primitives

The design system SHALL provide a flat surface vocabulary: a **raised card** (a flat,
slightly rounded surface with a thin outline and the four-corner-screw motif, which MAY
carry an inset section title) and a **pressed well** (a subtly recessed container with no
screws and no inset title, used for lists and read-outs). A pressed well MUST be
composable inside a raised card as the canonical list / log container.

#### Scenario: Raised card and pressed well are visually distinct

- **WHEN** a raised card and a pressed well are rendered in the same scheme
- **THEN** the card shows the outline-and-corner-screw treatment while the well shows a
  recessed surface without screws, so the two read as different surface levels

#### Scenario: Inset titles belong to cards only

- **WHEN** an inset (engraved) section title is used
- **THEN** it appears on a raised card; pressed wells differentiate their content with plain
  text rather than an inset title

### Requirement: Typography system

The design system SHALL provide a mid-century geometric sans type ramp (wordmark, headings,
and body) together with tracked uppercase micro-labels for section / field labels, and a
monospace family used for machine identifiers (branch names, commit hashes, commands, and
paths).

#### Scenario: Identifiers render in the monospace family

- **WHEN** a branch name, commit hash, command, or filesystem path is displayed
- **THEN** it renders in the monospace family, visually distinct from running body copy

#### Scenario: Section and field labels use the tracked micro-label style

- **WHEN** a section heading or field label is rendered (e.g. "REPOSITORIES", "FILTER",
  "PERSONAL ACCESS TOKEN")
- **THEN** it uses the uppercase, letter-tracked micro-label treatment rather than the body
  style

### Requirement: Session plug indicator

The design system SHALL provide a **plug** control — a thin outer ring around a thicker
inner disc — that communicates a worktree's Claude Code session state as exactly one of five
named statuses: `running`, `working`, `error`, `idle`, and `off`. The plug is the canonical
per-worktree session affordance; there is no separate session-list surface. Because it
replaces that surface, the plug SHALL be an **actionable** control (unlike the display-only
lamps): activating an `off` plug requests a session launch and activating a live (non-`off`)
plug requests a stop, a transient `working` state MAY guard or disable activation, and the
control SHALL expose its current state and the available action to assistive technology. The
concrete launch/stop wiring (session API, Stop-session confirmation) belongs to the consuming
feature change (`claude-session-launch`), not this change.

#### Scenario: Each session state has a distinct plug appearance

- **WHEN** a plug is rendered for each of the five statuses
- **THEN** `running`, `working`, `error`, `idle`, and `off` are each visually distinguishable
  (the inner disc colour reflects the status, with `error` drawing from the Signal ramp)

#### Scenario: The plug exposes a launch / stop affordance

- **WHEN** a user activates a plug in a production screen
- **THEN** activating an `off` plug requests a session launch and activating a live (non-`off`)
  plug requests a stop, a transient `working` plug guards or disables activation, and the
  control's accessible label exposes its current state and the available action

### Requirement: Status indicator lamps

The design system SHALL provide **indicator lamps** — a bezelled lamp capped by a small
symbol naming its column (git or PR) — covering the git statuses `up-to-date`, `behind`,
`ahead`, and `diverged`, and the PR statuses `none`, `open`, `ready`, `checks-failing`,
`conflicts`, `conflicts-failing`, and `merged`. In the MVP the lamps are **display-only**:
they communicate status and MUST NOT expose an interactive action (interactive git/PR helpers
are a roadmapped future stage).

#### Scenario: Git and PR statuses each render their named lamp

- **WHEN** a lamp is rendered for a git status (`up-to-date` / `behind` / `ahead` /
  `diverged`) or a PR status (`none` / `open` / `ready` / `checks-failing` / `conflicts` /
  `conflicts-failing` / `merged`)
- **THEN** the lamp shows the colour and symbol for that status and is labelled to its column

#### Scenario: Lamps are inert in the MVP

- **WHEN** a user activates a git or PR lamp in a production screen
- **THEN** no action is triggered (the lamp is a read-only status indicator)

### Requirement: Action and form controls

The design system SHALL provide the control set the MVP screens compose from: buttons in four
intents (`primary`, `secondary`, `destructive`, `subtle`); a segmented toggle that supports
disabled options; a fixed-list dropdown selector; an editable autocomplete selector; a single
text input; and an icon button. Each control MUST present a resting and a disabled appearance;
the editable autocomplete selector and the text input MUST additionally present an **invalid
(error)** appearance — a validity affordance plus an error message — for values they validate.

#### Scenario: Button intents are distinguishable

- **WHEN** the four button intents are rendered together
- **THEN** `primary`, `secondary`, `destructive`, and `subtle` are visually distinct, with
  `destructive` drawing from the Signal ramp

#### Scenario: A segmented toggle can disable an option

- **WHEN** a segmented toggle renders an option marked unavailable (e.g. a deferred "Local"
  source)
- **THEN** that segment shows a disabled appearance and cannot be selected, while the other
  segments remain selectable

#### Scenario: Selectors and the text input present resting and disabled states

- **WHEN** the fixed-list selector, the editable autocomplete selector, and the text input are
  each rendered in a resting (enabled) state and again in a disabled state
- **THEN** each enabled control shows its placeholder or value and accepts interaction, and each
  disabled control shows a visually distinct, non-interactive appearance

#### Scenario: Validated selectors and inputs show an invalid state

- **WHEN** the autocomplete selector or the text input holds a value it cannot accept (e.g. an
  organisation the user has no access to, or a malformed repository URL)
- **THEN** the control shows an invalid (error) appearance — a validity affordance and an error
  message — distinct from its resting and disabled states

#### Scenario: The icon button presents resting and disabled states

- **WHEN** an icon button is rendered enabled and again disabled
- **THEN** the enabled icon button is actionable and the disabled one shows a muted,
  non-interactive appearance

### Requirement: Mobile-first responsive conventions

The design system SHALL define mobile-first responsive conventions so that a screen composed
from these primitives presents as a single-column mobile layout (with off-canvas navigation
in a slide-in drawer) and as a wider desktop layout (with persistent side navigation) from
the same composition, without a separate mobile-only component set.

#### Scenario: A composed screen adapts across viewport widths

- **WHEN** a screen built from the design-system primitives is rendered at a narrow (mobile)
  width and again at a wide (desktop) width
- **THEN** the mobile width shows the single-column layout with drawer-based navigation and
  the desktop width shows the multi-column layout with a persistent navigation rail, with no
  horizontal overflow at either width

### Requirement: Production delivery and prototype quarantine

The design system SHALL be delivered as production theme tokens plus reusable primitive
components under the web application source, each covered by production Storybook stories and
UI tests. Application code MUST NOT import from `src/prototypes/**`; promoting a pattern is
moving its code into the application slice, not importing the prototype.

#### Scenario: Primitives ship with production stories and tests

- **WHEN** the web package's production Storybook and unit/UI test run are executed
- **THEN** the matured primitives (surfaces, plug, indicator lamps, controls) appear as
  production (non-prototype) stories and are exercised by UI tests

#### Scenario: Application code cannot import prototypes

- **WHEN** application code under `src/` (outside `src/prototypes/**`) imports from
  `src/prototypes/**`
- **THEN** the lint rule (`no-restricted-imports`) fails the build, keeping the prototype
  quarantine boundary intact
