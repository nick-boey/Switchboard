# web-navigation Specification

## Purpose
Define how the web SPA maps its pages to distinct, shareable URL paths and integrates with
the browser history stack, so that top-level pages are addressable, deep links (including the
`/<owner>/<repo>` repo-anchor path) resolve on load and reload, Back/Forward move between
pages, and the shell chrome persists across navigation while indicating the active page.
## Requirements
### Requirement: Pages are addressable by distinct URLs

The web SPA SHALL give each top-level page a distinct URL path, and navigating to a page
SHALL update the browser address bar to that page's path without a full document reload.

The page-to-path mapping is:

| Path | Page |
|---|---|
| `/` | Repositories home (all cloned repositories) |
| `/new-repo` | New repository |
| `/<owner>/<repo>` | The repositories home, scrolled to that repository's section |

#### Scenario: Navigating updates the address bar

- **WHEN** the user opens New repository from the navigation rail
- **THEN** the address bar changes to `/new-repo`
- **AND** the page content updates without a full document reload

#### Scenario: Each top-level page has its own path

- **WHEN** the user opens New repository and then returns to the repositories home
- **THEN** the address bar shows `/new-repo` and then `/` respectively

### Requirement: The URL determines the rendered page on load and reload

The web SPA SHALL render the page named by the current URL when the app is loaded or
reloaded at that URL, so that a URL can be bookmarked or shared and resolves to the same
page (rather than always returning to the home).

This load/reload behaviour depends on the **serving host returning `index.html` for unknown
paths** (a SPA history fallback): the SPA cannot render a deep URL the host 404s before the
app boots. Vite dev (`5173`) and `vite preview` provide this fallback, so the requirement is
fully met and verifiable in those environments today; any production host that serves the
*built* SPA MUST provide the same fallback for this requirement to hold there (tracked as an
archive-gating obligation in `dependencies.md`).

#### Scenario: Loading a deep URL shows that page

- **WHEN** the app is loaded directly at `/new-repo`
- **THEN** the New repository flow is rendered (not the repositories home)

#### Scenario: A page survives a reload

- **WHEN** the user is on `/new-repo` and reloads the browser
- **THEN** the New repository flow is rendered again after reload

### Requirement: Browser history navigation moves between pages

The web SPA SHALL integrate with the browser history stack so that the Back and Forward
buttons move between previously visited pages.

#### Scenario: Back returns to the previous page

- **WHEN** the user navigates the repositories home → New repository, then presses the
  browser Back button
- **THEN** the repositories home is shown again with the address bar at `/`

#### Scenario: Forward returns to the next page

- **WHEN** the user (continuing from the Back scenario, now on the repositories home) presses
  the browser Forward button
- **THEN** the New repository flow is shown again with the address bar back at `/new-repo`

#### Scenario: Back and Forward move between repository anchors

- **WHEN** the user navigates from repository A's deep-link (`/<ownerA>/<repoA>`) to
  repository B's (`/<ownerB>/<repoB>`) via the sidebar — both currently cloned — and then
  presses the browser Back button
- **THEN** the address bar returns to `/<ownerA>/<repoA>` and repository A's section is
  scrolled into view
- **AND** pressing the browser Forward button returns the address bar to `/<ownerB>/<repoB>`
  and repository B's section is scrolled into view

  <!-- Each repo deep-link is a distinct history push (design D7), so a `replace`-style
       navigation that collapses the two repositories into one history entry fails this. -->

### Requirement: Deep-link to a repository scrolls to its section

The web SPA SHALL resolve `/<owner>/<repo>` to the repositories home and bring the canonical
`<owner>/<repo>` repository's section into view when that repository is currently cloned. When
the path does not name a currently-cloned repository — whether because the id is
malformed/unsafe or because no such repository has been cloned — the SPA SHALL render the
repositories home unchanged, with no redirect and no error (the scroll target is simply not
present).

#### Scenario: A cloned repository id scrolls to its section

- **WHEN** the app is loaded at `/<owner>/<repo>` for a currently-cloned repository
- **THEN** the repositories home is rendered and that repository's section is scrolled into
  view

#### Scenario: A repository deep-link survives a reload

- **WHEN** the user is on `/<owner>/<repo>` for a currently-cloned repository and reloads the
  browser
- **THEN** the repositories home is rendered and that repository's section is scrolled into
  view again after reload

#### Scenario: An unknown repository id renders the home without scrolling

- **WHEN** the app is loaded at `/<owner>/<repo>` where `<owner>/<repo>` is malformed/unsafe
  or names no currently-cloned repository
- **THEN** the repositories home is rendered (no redirect, no error) and no repository section
  is scrolled into view

### Requirement: The shell chrome persists across pages

The web SPA SHALL keep the application shell chrome (header and navigation rail) mounted
across navigation, updating only the main content region per page, and the navigation SHALL
indicate which page is currently active.

#### Scenario: Chrome persists while content changes

- **WHEN** the user navigates between top-level pages
- **THEN** the header and navigation rail remain present while only the main content region
  changes

#### Scenario: Active navigation reflects the current page

- **WHEN** the current page is a repository deep-link (`/<owner>/<repo>`) for a cloned
  repository
- **THEN** the navigation rail marks that repository's link as the active item

