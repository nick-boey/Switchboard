# Prototype quarantine

Stories under `apps/web/src/prototypes/<change-name>/` are **quarantined** (design
Decision 7). They are excluded from:

- the production Storybook build and visual-snapshot run (the production `.storybook` config
  globs everything _except_ `src/prototypes/**` via the shared `resolveStories` helper),
- autodocs (each prototype carries the `!autodocs` tag),
- the unit run — per-change sketch folders (`src/prototypes/<change-name>/**`) and all
  `*.stories.*` files are excluded by `vitest.config.ts`; shared prototype-harness modules at
  the `src/prototypes/` root (e.g. `define-prototype-meta.ts`) and their co-located tests are
  collected,
- the package `exports` and production bundles, and
- import from app code (ESLint `no-restricted-imports` forbids importing `prototypes/**`).

Sketch UI patterns here via the `switch-ui-prototype` workflow before recording a design
decision. Nothing in `apps/web/src` outside this folder may import from it.

## Viewing prototypes

Prototypes render only in the **dedicated prototype workbench** — a separate, dev-only
Storybook (the production one on `:6006` excludes this folder):

```bash
pnpm --filter @switchboard/web storybook:prototypes   # dev server on http://localhost:6007
pnpm --filter @switchboard/web storybook:prototypes:build   # static build (used by the build smoke)
```

The workbench preview wraps every story in `AppProviders` with `colorScheme="auto"`, so the
OS `prefers-color-scheme` drives **light and dark** — there is no in-UI toggle; emulate the
media query (e.g. Playwright `emulateMedia({ colorScheme: 'dark' })`) to preview dark.

## Authoring a prototype

Spread `definePrototypeMeta` into the story's `meta` literal — Storybook's static indexer
rejects `export default definePrototypeMeta(...)`:

```tsx
// src/prototypes/<change-name>/density.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { definePrototypeMeta } from '../define-prototype-meta';

function Density() {
  return <div>{/* sketch the pattern here */}</div>;
}

const meta = {
  ...definePrototypeMeta({ component: Density }),
} satisfies Meta<typeof Density>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
```

`definePrototypeMeta` takes **no `change-name` argument and sets no `title`**. The workbench's
location-based indexer (`.storybook-prototypes/main.ts`) derives the
`Prototypes/<change-name>/<name>` sidebar title from the file path — overriding any
hand-written `title` — and applies the `prototype` / `!autodocs` tags.
