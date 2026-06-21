# Testing

Test-driven development is **mandatory** in Switchboard (see the
[development workflow](./development-workflow.md)). Because the project is greenfield, the
test **harness was stood up before any feature code** — every later change's TDD depends on
the conventions below. This document is the contract for that harness: Vitest for unit
tests, Playwright for end-to-end tests with the temp-git fixture, the `RuntimeContext` test
factory for injecting fakes, and the Storybook prototype quarantine.

Run the suites via `just`:

```sh
just test        # Vitest unit suite — no prior build needed
just build       # required before e2e (Playwright resolves the built packages)
just e2e         # Playwright end-to-end suite
```

## Unit tests (Vitest)

Configuration lives in [`vitest.config.ts`](../../../vitest.config.ts) (Vitest 4 — a single
workspace-level config; the old `vitest.workspace.ts` is gone).

**Unit tests live beside the source they cover.** A test file is the source file's name with
a `.test.ts` / `.test.tsx` suffix in the same directory — e.g. `runtime-context.ts` is
tested by `runtime-context.test.ts` next to it. The config collects
`packages/**/*.test.{ts,tsx}` and `apps/**/*.test.{ts,tsx}` and runs them in the `node`
environment.

The unit run resolves workspace packages (`@switchboard/*`) to their **TypeScript source**
via the `switchboard-source` export condition, so `just test` does **not** require a prior
`just build`. The following are excluded from the unit run:

- `**/node_modules/**`, `**/dist/**`, `**/dist-types/**` — never test build output.
- `apps/web/src/prototypes/**` — the [prototype quarantine](#storybook-prototype-quarantine).
- `**/*.stories.*` — Storybook stories are not unit tests.
- `e2e/**` — Playwright owns the end-to-end directory.

### The `RuntimeContext` test factory (`makeTestContext`)

Services and the server entrypoint receive a single `RuntimeContext`
(`{ workspaceRoot, config, logger, telemetry, identity }`) — they read **no** host-global
paths. That design choice is also the **test-double seam**: fakes are injected through the
context, never monkey-patched.

[`makeTestContext`](../../../packages/shared/src/testing/runtime-context.ts), exported from
`@switchboard/shared/testing`, builds a `RuntimeContext` populated with safe fakes — a no-op
logger, a no-op telemetry tracer, an anonymous identity, and a fresh temp `workspaceRoot`.
Override any field via the partial argument:

```ts
import { makeTestContext } from '@switchboard/shared/testing';

const ctx = makeTestContext({
  identity: { login: 'nick-boey@github', source: 'serve' },
});
// pass ctx to start(ctx) or a service under test
```

## End-to-end tests (Playwright)

Configuration lives in [`playwright.config.ts`](../../../playwright.config.ts); specs live
under `e2e/`. Unlike the unit run, Playwright resolves the **built** packages (the `dist`
exports), so **run `just build` before `just e2e`**. The Chromium browser is required once:

```sh
pnpm exec playwright install chromium
```

### The temp-git fixture

Many later changes (repo clone/browse, worktrees, sessions) operate on real git repos. The
harness provides a throwaway-repo fixture so those tests never touch the developer's
checkout.

[`createTempGitRepo()`](../../../packages/shared/src/testing/temp-git.ts), exported from
`@switchboard/shared/testing`, initialises a fresh git repository in the OS temp dir
(`os.tmpdir()`) with a deterministic identity and an initial empty commit on `main`, and
returns a `TempGitRepo`:

```ts
interface TempGitRepo {
  path: string;                 // absolute path to the working tree
  git(...args: string[]): string; // run a git subcommand inside the repo, return stdout
  cleanup(): void;              // remove the repo (idempotent)
}
```

Callers **must** invoke `cleanup()` on teardown. In Playwright, the
[`tempGitRepo` fixture](../../../e2e/fixtures/temp-git.ts) does this automatically — a fresh
repo per test, torn down afterwards:

```ts
import { test, expect } from './fixtures/temp-git';

test('operates on a real repo', ({ tempGitRepo }) => {
  const branch = tempGitRepo.git('rev-parse', '--abbrev-ref', 'HEAD');
  expect(branch).toBe('main');
});
```

The fixture is unused by the foundations skeleton itself, but it is proven here by a smoke
test (`e2e/temp-git.smoke.spec.ts`) so the convention is locked in for the changes that need
it.

## Storybook prototype quarantine

`apps/web` hosts Storybook as the component workbench. UI patterns are sketched as
**throwaway prototype stories** under `apps/web/src/prototypes/<change-name>/` (via the
`/switch-ui-prototype` workflow). These prototypes are **quarantined**: nothing in the
production surface may see them. The quarantine is enforced structurally in five places, so a
stray prototype cannot leak:

| Excluded from | Mechanism |
| --- | --- |
| production Storybook build + visual-snapshot run + autodocs | [`apps/web/.storybook/main.ts`](../../../apps/web/.storybook/main.ts) computes the `stories` glob and filters out any path containing a `prototypes` segment (Storybook 10 does not honour `!` negations) |
| the unit-test run | `vitest.config.ts` excludes `apps/web/src/prototypes/**` (and `**/*.stories.*`) |
| the published package API + production bundles | prototypes are not part of any package `exports`, so production imports cannot resolve them |
| import from app code | [`eslint.config.js`](../../../eslint.config.js) `no-restricted-imports` forbids any module under `apps/web/src/**` (except the prototypes themselves) from importing `prototypes/**` |

The rule of thumb: **no code outside `apps/web/src/prototypes/` may import from inside it.**
Promoting a prototype into production is implementation work (a `tasks.md` item), not
something the quarantine permits implicitly.

## What the harness covers today

The foundations harness stands up the *infrastructure* above and proves it with smoke tests
(the temp-git fixture, the `makeTestContext` factory, a placeholder Storybook story). The
per-capability behavioural tests — `start(ctx)` boot/`/health`/shutdown, the auth-gate and
bind-address tests, the web↔server contract test, and the telemetry-redaction tests — are
authored test-first as those capabilities are implemented. Subprocess / PAT-redaction tests
are deliberately deferred to the change that introduces subprocesses and the GitHub token.

## References

- [`vitest.config.ts`](../../../vitest.config.ts) — unit-test config.
- [`playwright.config.ts`](../../../playwright.config.ts) — e2e config.
- [`packages/shared/src/testing`](../../../packages/shared/src/testing) — `makeTestContext`,
  `createTempGitRepo` (exported at `@switchboard/shared/testing`).
- [`development-workflow.md`](./development-workflow.md) — where TDD sits in the workflow.
- [`README.md`](../../../README.md) — prerequisites and the `just` recipes.
