# CLAUDE.md — @switchboard/web

Module-specific guidance; see the repo-root CLAUDE.md for shared commands and workflow.

React 19 + Mantine UI, built with Vite. This is the **UI layer of a vertical slice**.

- Server state via **TanStack Query**; talk to the API through the typed client/contract from `@switchboard/server` and schemas from `@switchboard/shared`. Don't hand-roll fetch shapes.
- **Storybook prototypes** live in `src/prototypes/**` and are quarantined: app code under `src/**` must not import from them (ESLint enforces it). For new UI surfaces, explore in a Storybook prototype first via the `switch-ui-prototype` skill, then promote by moving the code into the slice.
- Run the app: `pnpm --filter @switchboard/web dev`. Storybook: `pnpm --filter @switchboard/web storybook`.
