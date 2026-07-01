## MODIFIED Requirements

### Requirement: New repository and getting-ready screens

The web app SHALL provide the New repository screen and the repository getting-ready screen,
and MUST specify their empty, in-progress, and error states. The New repository screen offers
a GitHub source (with Local disabled for the MVP) and either Select repository (validated,
editable owner and repository selectors, where the owner options include the authenticated
user's own account and their organisations) or From URL (validated); the getting-ready screen
renders the clone's in-progress, error, and ready states. The New repository screen's GitHub
source MUST distinguish three outcomes of loading the repository list — an in-progress
(connecting) state, a **failed-fetch error** state, and the resolved states (the not-configured
empty state or the ready selectors) — and MUST NOT remain in the connecting state indefinitely
when the repository-list request fails. Both adapt to mobile and desktop.

#### Scenario: Local source is disabled

- **WHEN** the New repository screen is shown
- **THEN** the source toggle offers GitHub and Local, with Local disabled (not selectable) for
  the MVP

#### Scenario: Select repository validates owner and repository before Clone enables

- **WHEN** the user picks an owner and a repository using the editable selectors
- **THEN** the owner is validated against the user's selectable owners (the authenticated
  user's own account or one of their organisations), the repository is validated against the
  repositories listed for that owner, and Clone is enabled only once both resolve

#### Scenario: A personal-account repository can be selected and cloned

- **WHEN** the user selects their own account as the owner and a repository they own personally
- **THEN** the repository validates against the personal repositories in the GitHub listing,
  Clone is enabled, and starting the clone targets `<account>/<repo>`

#### Scenario: An organisation repository can be selected and cloned

- **WHEN** the user selects one of their organisations as the owner and a repository in that
  organisation
- **THEN** the repository validates against that organisation's repositories in the GitHub
  listing, Clone is enabled, and starting the clone targets `<org>/<repo>`

#### Scenario: From URL validates and previews the target

- **WHEN** the user enters a `https://github.com/<owner>/<repo>` URL (optionally with a trailing
  `.git`) or a bare `<owner>/<repo>`
- **THEN** the field shows validity, previews the parsed `<owner>/<repo>` (with any trailing
  `.git` stripped), and Clone is enabled only for a value that parses

#### Scenario: Clone lands on the getting-ready in-progress state

- **WHEN** the user starts a clone
- **THEN** the app navigates to the repository getting-ready screen showing the in-progress
  state (a cloning indicator and an Abort action) while the clone operation runs

#### Scenario: Clone error state offers retry and abort

- **WHEN** the clone operation fails
- **THEN** the getting-ready screen shows the error state with Retry and Abort/back actions,
  without exposing raw command or GitHub output

#### Scenario: GitHub not configured empty state

- **WHEN** the New repository screen is shown and no GitHub PAT is configured
- **THEN** it shows an empty/unconfigured state prompting the user to add a PAT to
  `~/.switchboard`, rather than failing opaquely

#### Scenario: GitHub repository-list fetch failure shows an error state (regression)

- **WHEN** the New repository screen's GitHub repository-list request fails to resolve (for
  example the `/api/repos/github` call errors with a non-OK status such as `401`, or the network
  request fails)
- **THEN** the screen shows an explicit error state — distinct from the connecting/loading state
  and from the not-configured empty state — offering a retry, rather than remaining on
  "Connecting to GitHub…" indefinitely
