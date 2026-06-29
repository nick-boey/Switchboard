## MODIFIED Requirements

### Requirement: Launch a Claude session detached in a worktree's tmux session

The system SHALL launch `claude --remote-control` **detached in a tmux session rooted at the
worktree's checkout** (`~/.switchboard/repos/<owner>/<repo>/worktrees/<wt-id>`), so the session
survives the request and the official Claude mobile app can drive it. The launched session SHALL be
**named after its repository and branch slug** — `<repo>/<branch-slug>`, where `<repo>` is the
repository name and `<branch-slug>` is the `<wt-id>` with its trailing `--<hash>` suffix removed
(e.g. repo `acme/widget-factory` + `<wt-id>` `name-sessions--7130389dc45a` →
`widget-factory/name-sessions`) — passed to `claude` on both naming surfaces it exposes via the
exact argv `['claude', '--remote-control=<name>', '--name', '<name>']`: the `--name` display name and
the Remote Control session name. The Remote Control name MUST use the `--remote-control=<name>`
equals form — `--remote-control` takes an *optional* value, so a space-separated token would not bind
and the session would fall back to its auto-generated name. With the name on both surfaces the
session is identifiable by repo and branch in Claude's Remote Control list, the `/resume` picker, and
the terminal title. The name SHALL be a deterministic, forward-only function of `(repo-id, wt-id)` —
including the repository **name** so the same branch in two differently-named repositories stays
distinct (the owner is not folded in, so two same-named repositories under different owners produce
the same name, an accepted collision) — and MUST NOT read or pass the exact git branch (which stays
sensitive). The derived name is itself sensitive (it embeds the branch-derived slug) and MUST appear
in telemetry only under redacted (blocklisted) attribute keys, never unredacted. The launch command
and the derived name MUST be passed as argv (never a shell line), MUST rely on the host's existing
`claude` login (no per-session pairing UI), and MUST require an existing worktree.

#### Scenario: A launch starts a detached tmux session rooted at the worktree

- **WHEN** a session is launched for an existing worktree
- **THEN** a detached tmux session is created with its working directory set to that worktree's
  checkout path, running `claude --remote-control` named after the worktree's repo and branch slug

#### Scenario: The launched session is named after its repo and branch slug

- **WHEN** a session is launched for `(repo-id, wt-id)` whose `<wt-id>` is `<slug>--<hash>` (e.g.
  repo `acme/widget-factory`, `<wt-id>` `name-sessions--7130389dc45a`)
- **THEN** the argv passed to tmux is `['claude', '--remote-control=<repo>/<slug>', '--name', '<repo>/<slug>']`
  (e.g. `<repo>/<slug>` = `widget-factory/name-sessions` — the repository name and the `<wt-id>` with
  the trailing `--<hash>` removed), carrying the name on both naming surfaces: the `--name` display
  name and the Remote Control session name
- **AND** the Remote Control name uses the `--remote-control=<name>` equals form, never a
  space-separated `['--remote-control', '<name>']` — `--remote-control` takes an *optional* value that
  a space-separated token would not bind, leaving the session auto-named
- **AND** the name is derived forward from `(repo-id, wt-id)` only; the exact git branch is never read
  or passed

#### Scenario: The same branch in differently-named repositories yields distinct session names

- **WHEN** two worktrees in repositories with different repository names share the same branch (and
  therefore the same `<wt-id>`, since `<wt-id>` is a function of the branch alone)
- **THEN** their launched Claude session names differ, because the name includes the repository name,
  not the `<wt-id>` alone

#### Scenario: Worktrees that resolve to the same `<repo>/<slug>` share a name (accepted, deterministic)

- **WHEN** two distinct worktrees resolve to the same `<repo>/<slug>` — either two same-named
  repositories under **different owners** (e.g. `acme/widget` and `other/widget`, since the owner is
  not folded into the name), or two worktrees in one repository whose slugs coincide (case-folding
  branch pairs, or branches whose long names slugify to the same length-capped value)
- **THEN** the same name is produced for both — the name is a deterministic function of
  `(repo-id, wt-id)`, and residual disambiguation beyond `<repo>/<slug>` (the dropped owner and hash)
  is intentionally out of scope for this fix

#### Scenario: The launch command and derived name are argv, not a shell line

- **WHEN** a session is launched for a worktree whose **exact branch** contains adversarial
  characters (which `idForBranch` still maps to a safe, path-safe `<wt-id>`, and whose `<repo-id>` is
  validated)
- **THEN** the derived `<repo>/<slug>` session name, the launch command, and the worktree path are
  passed as argv to tmux, with no shell interpolation of the name, the path, or the command

#### Scenario: The derived session name never escapes telemetry unredacted

- **WHEN** a session launch emits telemetry spans
- **THEN** the derived `<repo>/<slug>` session name — like the tmux session name, the worktree path,
  the `<wt-id>`, its slug, and the exact branch — appears only under redacted (blocklisted) attribute
  keys and never as an unredacted attribute value

#### Scenario: The session rides the host's existing login

- **WHEN** a session is launched
- **THEN** no per-session pairing or remote-control auth step is performed; the launch relies on the
  host's existing `claude` login
