# github-repos Specification

## Purpose
TBD - created by archiving change repo-clone-browse. Update Purpose after archive.
## Requirements
### Requirement: List repositories and organisations

The GitHub service SHALL list the authenticated user's repositories and the organisations
they belong to, via the GitHub REST API authenticated with the configured fine-grained PAT,
returning only data the PAT is permitted to see.

#### Scenario: Repositories and organisations are returned

- **WHEN** the service lists GitHub resources with a valid configured PAT
- **THEN** it returns the user's organisations and the repositories the PAT can access, each
  carrying at least its owner and repository name

#### Scenario: Repositories scoped to an organisation

- **WHEN** the repositories for a specific organisation in the user's access are requested
- **THEN** only repositories under that organisation are returned

### Requirement: Authenticated account exposed as a selectable owner

The GitHub service SHALL expose the authenticated user's own account (login) as a selectable
owner alongside the user's organisations, so that repositories the user owns personally — which
the listing already returns — can be selected by owner, not only repositories under an
organisation.

#### Scenario: The authenticated account is listed among selectable owners

- **WHEN** the service lists GitHub resources with a valid configured PAT
- **THEN** the set of selectable owners includes the authenticated user's own account (login)
  in addition to each organisation the user belongs to

#### Scenario: Repositories scoped to the authenticated account

- **WHEN** the repositories for the authenticated user's own account are requested
- **THEN** the personal repositories the PAT can access (owned by the authenticated user) are
  returned, distinct from organisation repositories

### Requirement: OAuth-ready provider interface

The GitHub integration MUST be implemented behind a provider interface so the PAT-backed
implementation can later be replaced by an OAuth/keychain implementation without changing
callers.

#### Scenario: PAT implementation satisfies the provider seam

- **WHEN** the GitHub service is constructed for the MVP
- **THEN** it is the PAT-backed implementation of the provider interface, and callers depend
  only on the interface (not on the PAT implementation)

### Requirement: Paginated listing

Listing SHALL aggregate all available pages by following the GitHub `Link: rel="next"`
header, applying a defensive upper bound on the number of pages fetched.

#### Scenario: A multi-page result is fully aggregated

- **WHEN** the GitHub API returns results across more than one page (a `Link` header with
  `rel="next"`)
- **THEN** the service follows the `next` links and returns the combined results from all
  pages

### Requirement: Typed errors without leaking GitHub error bodies

The service SHALL map GitHub failures to typed errors — `unauthorized`, `rate-limited` (with
the rate-limit reset/`retry-after`), and `not-found` — and MUST NOT expose or log the raw
GitHub error response body.

#### Scenario: Missing or invalid PAT

- **WHEN** GitHub responds `401` (no PAT configured or the PAT is invalid)
- **THEN** the service returns an `unauthorized` typed error and no GitHub error body is
  surfaced or logged

#### Scenario: Rate limit exhausted

- **WHEN** GitHub responds `403` with `x-ratelimit-remaining: 0`
- **THEN** the service returns a `rate-limited` typed error carrying the reset time, distinct
  from `unauthorized`

#### Scenario: Resource not found

- **WHEN** GitHub responds `404` for a requested resource
- **THEN** the service returns a `not-found` typed error and the GitHub error body is not
  surfaced or logged

### Requirement: GitHub not configured is reported explicitly

The service SHALL report an explicit `not-configured` state when no PAT is configured, rather
than throwing an opaque failure, so the UI can prompt the user to add a PAT.

#### Scenario: No PAT present

- **WHEN** a listing is requested and no GitHub PAT is configured in `~/.switchboard`
- **THEN** the service reports a `not-configured` state (it does not attempt a GitHub request)

