// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import type { RepoTarget } from '@switchboard/shared';
import type { SwitchboardClient } from '../api/client';
import { AppProviders } from '../providers/AppProviders';
import { sessionLivenessQueryKey } from '../sessions/session-queries';
import { AppShell } from './AppShell';

/**
 * Mounted self-correction regression (fix-live-session-indicator, Codex Implementation finding).
 * A static two-snapshot render only proves two independent caches render different numbers — it
 * would still pass if the mounted shell never updated. Here we mount ONCE under a single
 * `QueryClient`, then mutate the SHARED `sessionLivenessQueryKey` data and assert the already-mounted
 * header re-reads and the count decreases / the indicator flips off — i.e. it self-corrects from
 * tmux truth on the next liveness read, exactly as the worktrees hub's plug does.
 *
 * jsdom does not implement `matchMedia` / `ResizeObserver`, which Mantine touches; stub both. Seeded
 * queries use `staleTime: Infinity` so no background refetch runs (the injected client is never
 * called) — cache mutations alone drive the updates under test.
 */
beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  window.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as typeof window.ResizeObserver;
});

afterEach(() => cleanup());

const REPOS: RepoTarget[] = [
  { owner: 'acme', repo: 'infra' },
  { owner: 'nick-boey', repo: 'switchboard' },
];

function plugLabel(counter: HTMLElement): string | null | undefined {
  return counter.querySelector('[role="img"]')?.getAttribute('aria-label');
}

describe('AppShell header live-session count — mounted self-correction', () => {
  it('decreases the already-mounted count when shared liveness data shrinks', async () => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
      },
    });
    qc.setQueryData(['cloned-repos'], { repos: REPOS });
    qc.setQueryData(sessionLivenessQueryKey('acme/infra'), new Set(['a--1', 'b--2']));
    qc.setQueryData(sessionLivenessQueryKey('nick-boey/switchboard'), new Set(['c--3']));

    const { getByTestId } = render(
      <AppProviders queryClient={qc}>
        <AppShell client={{} as SwitchboardClient} />
      </AppProviders>,
    );
    const counter = getByTestId('live-session-count');

    // Initial mount: 3 live across both repos, indicator on.
    await waitFor(() => expect(counter.textContent).toBe('3'));
    expect(plugLabel(counter)).toBe('3 live sessions: running');

    // A session ends outside the header's own actions → the SHARED cache updates → the mounted
    // header must re-read and decrease (not stay pinned to its initial snapshot).
    qc.setQueryData(sessionLivenessQueryKey('acme/infra'), new Set(['a--1']));
    qc.setQueryData(sessionLivenessQueryKey('nick-boey/switchboard'), new Set<string>());
    await waitFor(() => expect(counter.textContent).toBe('1'));
    expect(plugLabel(counter)).toBe('1 live sessions: running');

    // All sessions end → count 0 and the indicator flips off.
    qc.setQueryData(sessionLivenessQueryKey('acme/infra'), new Set<string>());
    await waitFor(() => {
      expect(counter.textContent).toBe('0');
      expect(plugLabel(counter)).toBe('0 live sessions: off');
    });
  });
});
