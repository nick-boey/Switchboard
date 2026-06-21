set shell := ["bash", "-uc"]

# List recipes by default.
default:
    @just --list

# Install all workspace dependencies.
install:
    pnpm install

# Build every workspace package (tsc for shared/server, tsup for the cli bin, vite for web).
build:
    pnpm -r build

# Lint (ESLint flat config) and check formatting (Prettier).
lint:
    pnpm exec eslint .
    pnpm exec prettier --check .

# Type-check every TS project via project references.
typecheck:
    pnpm exec tsc -b

# Run unit tests (Vitest).
test:
    pnpm exec vitest run

# Run end-to-end tests (Playwright). Assumes `just build` has run (resolves built packages).
e2e:
    pnpm exec playwright test
