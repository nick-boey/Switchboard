---
name: switch-ui-prototype
description: Sketch and iterate on web UI patterns as quarantined Storybook prototypes before recording design decisions. Use when exploring a new UI surface for Switchboard, or when the user asks to prototype, sketch, or mock up a component or layout in the Switchboard web UI.
---

Sketch UI patterns as throwaway Storybook stories under
`src/prototypes/<change-name>/`, iterate on them visually in light and
dark colour schemes, and track each one in the change's `prototypes.md` ledger. This is
the prototyping stage of the OpenSpec workflow — it runs *before* design decisions are
recorded, so you can react to a rendered pattern instead of imagining it.

## Hard boundaries

- **Write only under `src/prototypes/<change-name>/`.** You MAY define
  new components inside that folder. You MUST NOT modify production components, the
  `package.json` exports map, design tokens/styles, or anything outside the prototype
  folder. Promoting a pattern into production is implementation work for `tasks.md`, not
  this skill.
- Every story file you create gets a matching row in the change's `prototypes.md` **in
  the same turn**.

## Steps

### 1. Resolve the change

A prototype must belong to an OpenSpec change (its ledger home).

- If the user named a change, use it. If a sketch clearly belongs to an in-progress
  change, use that. Otherwise derive a short kebab-case `<change-name>` from the request.
- **If no matching change exists**, scaffold one before sketching:
  ```bash
  openspec new change <change-name> --schema switch-feature-ui
  ```
  Then write a stub `proposal.md` whose Why states honestly what is being explored
  (e.g. "Exploring the density and grouping options for the results panel").
  A stub proposal is a truthful statement of the work's state — exploration in progress.
- Announce: "Prototyping under change `<change-name>` (`src/prototypes/<change-name>/`)."

### 2. Compose from the catalogue first

Before writing new components, reach for what already exists in Switchboard's web UI:

- Primitives: the `ui/<name>` components (Button, Dialog, Input, Card, …).
- Layout: the `layout` components (Panel, SplitPane) — the shell tiles.
- Features: the `features/<name>` components.
- Read the Storybook `Docs/` MDX pages (Introduction, Design tokens, Shell layout,
  Prototyping) for the token vocabulary and shell composition rules. Inside the package
  source, import via the repo's path alias (e.g. `@/ui/button`).

Only define a new component (inside the prototype folder) when the catalogue genuinely
lacks the piece — that gap is often the point of the prototype.

### 3. Write the prototype story

Use `definePrototypeMeta` so the sketch is quarantined (no visual-regression snapshot, no
autodocs, excluded from the unit-test run, grouped under the `Prototypes/<change-name>`
sidebar root). The meta **must be spread into an object literal** — Storybook's static
indexer rejects `export default definePrototypeMeta(...)` directly.

```tsx
// src/prototypes/<change-name>/density.stories.tsx
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Panel } from "@/layout";
import { Button } from "@/ui/button";
import { definePrototypeMeta } from "../define-prototype-meta";

const meta = {
  ...definePrototypeMeta("<change-name>", {
    component: Panel,
    parameters: { layout: "fullscreen" },
  }),
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof Panel>;

export const Compact: Story = {
  render: () => (
    <Panel>{/* sketch the pattern here */}</Panel>
  ),
};
```

The `Prototypes/<change-name>` title and the `prototype` / `!autodocs` tags are applied
automatically by the location-based indexer in `.storybook/main.ts`; you do not write
them by hand.

### 4. Record the ledger row

Add (or update) a row in `openspec/changes/<change-name>/prototypes.md` for every story
file, in the same turn you create it:

```
| density.stories.tsx | Compact vs comfortable row spacing for the results panel | open | open |
```

Columns are `Story file | Explores | Disposition | Status`. New sketches start with
Disposition and Status both `open` — the disposition is decided later (during implement
or at archive). Never invent a `promote`/`delete` disposition while still sketching.

### 5. Verify visually in both colour schemes

The design system's dark mode is `prefers-color-scheme` only — there is no UI toggle, so
dark mode is exercised by emulation.

1. **Ensure Storybook is up on `:6006`.** Check `http://localhost:6006`; if it is not
   responding, start it in the background:
   ```bash
   pnpm storybook
   ```
   (run as a background task; wait for it to come up).
2. **Get the story's preview URL.** Prefer the Storybook MCP server (`storybook-mcp`,
   `preview-stories` tool) to resolve the story id and URL. If the MCP endpoint is
   unavailable, derive it: the story id is the kebab-case of the title plus `--` plus the
   kebab-case export name (e.g. title `Prototypes/<change-name>` + export `Compact` →
   `prototypes-<change-name>--compact`). Manager URL: `http://localhost:6006/?path=/story/<id>`;
   isolated render for clean screenshots: `http://localhost:6006/iframe.html?id=<id>&viewMode=story`.
3. **Screenshot light and dark** with Playwright, using `emulateMedia` to drive the
   media query (use the `playwright-cli` skill / Playwright MCP):
   ```js
   await page.emulateMedia({ colorScheme: "light" });
   await page.goto("http://localhost:6006/iframe.html?id=<id>&viewMode=story");
   await page.screenshot({ path: "/tmp/<id>-light.png" });
   await page.emulateMedia({ colorScheme: "dark" });
   await page.reload();
   await page.screenshot({ path: "/tmp/<id>-dark.png" });
   ```
4. **Present both renders** to the user and iterate on the story from their feedback.
   Repeat steps 3–5 each iteration.

## When sketching is done

The prototypes stay tracked in `prototypes.md`. When the real implementation lands (during
`/openspec-apply-change`), resolve each ledger row, and at archive time run
`/switch-openspec-archive`, which reconciles the folder against the ledger and executes
the dispositions. Do not promote or delete prototype files yourself from this skill.
