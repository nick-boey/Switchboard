# Prototype quarantine

Stories under `apps/web/src/prototypes/<change-name>/` are **quarantined** (design
Decision 7). They are excluded from:

- the production Storybook build and visual-snapshot run (stories glob negates this dir),
- autodocs,
- the unit run (`vitest.config.ts` excludes `apps/web/src/prototypes/**`),
- the package `exports` and production bundles, and
- import from app code (ESLint `no-restricted-imports` forbids importing `prototypes/**`).

Sketch UI patterns here via the `switch-ui-prototype` workflow before recording a design
decision. Nothing in `apps/web/src` outside this folder may import from it.
