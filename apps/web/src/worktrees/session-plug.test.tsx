import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import type { PlugSessionStatus, WorktreeSummary } from '@switchboard/shared';
import { switchboardTheme } from '../theme/theme';
import { dispatchPlugToggle } from '../sessions';
import { WorktreesView } from './WorktreesView';

/**
 * The plug made actionable on the worktrees hub (task 10.1, design Decision 5 / Gate #1 + #2). Each
 * worktree's plug renders its session status; activating an `off` plug fires a launch and a live
 * plug fires a stop; a transient (`starting`) plug is guarded; and there is NO standalone session
 * screen and NO post-launch mobile-app handoff toast. The web test env is node, so interaction is
 * asserted via the structural render (actionable = a `<button>`; guarded = `disabled`) plus the
 * pure toggle-dispatch.
 */
const render = (ui: ReactNode): string =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

const wt = (over: Partial<WorktreeSummary> = {}): WorktreeSummary => ({
  wtId: 'feature-x--0123456789ab',
  branch: 'feature/x',
  path: 'repos/acme/infra/worktrees/feature-x--0123456789ab',
  dirty: false,
  sync: 'up-to-date',
  ...over,
});

function plugTag(html: string, wtId: string): string {
  const m = html.match(new RegExp(`<[a-z]+[^>]*data-testid="wt-plug-${wtId}"[^>]*>`));
  if (!m) throw new Error(`no plug element with data-testid="wt-plug-${wtId}"`);
  return m[0];
}

function claudeLinkTag(html: string, wtId: string): string | null {
  const m = html.match(new RegExp(`<a[^>]*data-testid="wt-claude-link-${wtId}"[^>]*>`));
  return m ? m[0] : null;
}

describe('worktrees hub plug (session status + actionability)', () => {
  const status = (s: PlugSessionStatus) => ({ [wt().wtId]: s });

  it('renders the plug visual derived from the worktree’s session status', () => {
    const live = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('on')}
        onToggleSession={() => {}}
      />,
    );
    expect(plugTag(live, wt().wtId)).toContain('data-status="running"');

    const off = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('off')}
        onToggleSession={() => {}}
      />,
    );
    expect(plugTag(off, wt().wtId)).toContain('data-status="off"');

    const err = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('error')}
        onToggleSession={() => {}}
      />,
    );
    expect(plugTag(err, wt().wtId)).toContain('data-status="error"');
  });

  it('an off/on/error plug is actionable (a button); a transient starting plug is guarded (disabled)', () => {
    const offHtml = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('off')}
        onToggleSession={() => {}}
      />,
    );
    // Actionable plugs render as a <button>.
    expect(plugTag(offHtml, wt().wtId).startsWith('<button')).toBe(true);

    const transient = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('starting')}
        onToggleSession={() => {}}
      />,
    );
    const tag = plugTag(transient, wt().wtId);
    expect(tag).toContain('data-status="working"');
    expect(tag).toContain('disabled'); // guarded — no action
  });

  it('is display-only when no onToggleSession is provided (role image, not a button)', () => {
    const html = render(<WorktreesView repoId="acme/infra" worktrees={[wt()]} />);
    expect(plugTag(html, wt().wtId).startsWith('<button')).toBe(false);
  });

  it('shows no standalone session screen and no mobile-app handoff toast', () => {
    const html = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={status('on')}
        onToggleSession={() => {}}
      />,
    );
    expect(html).not.toContain('data-testid="session-screen"');
    expect(html).not.toContain('data-testid="sessions-list"');
    expect(html).not.toContain('data-testid="session-handoff"');
    expect(html.toLowerCase()).not.toContain('open the claude');
    expect(html.toLowerCase()).not.toContain('mobile app');
  });
});

describe('worktrees hub "open in Claude web" link (session-web-link)', () => {
  const wtId = wt().wtId;
  const bridge = 'session_011M7D8EPisCss4xNqQ4PNiQ';

  it('renders the deep link for a live, bridge-resolved session (href, new tab, noopener, name)', () => {
    const html = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={{ [wtId]: 'on' }}
        bridgeSessionIdByWtId={{ [wtId]: bridge }}
        onToggleSession={() => {}}
      />,
    );
    const tag = claudeLinkTag(html, wtId);
    expect(tag).not.toBeNull();
    expect(tag!).toContain(`href="https://claude.ai/code/${bridge}"`);
    expect(tag!).toContain('target="_blank"');
    expect(tag!).toContain('noopener');
    expect(tag!).toContain('aria-label="Open in Claude web"');
  });

  it('renders NO link for a live session whose bridge id has not resolved yet', () => {
    const html = render(
      <WorktreesView
        repoId="acme/infra"
        worktrees={[wt()]}
        sessionStatusByWtId={{ [wtId]: 'on' }}
        onToggleSession={() => {}}
      />,
    );
    expect(claudeLinkTag(html, wtId)).toBeNull();
  });

  it('renders NO link for off / starting / error sessions (even if a stale bridge id is present)', () => {
    for (const status of ['off', 'starting', 'error'] as const) {
      const html = render(
        <WorktreesView
          repoId="acme/infra"
          worktrees={[wt()]}
          sessionStatusByWtId={{ [wtId]: status }}
          bridgeSessionIdByWtId={{ [wtId]: bridge }}
          onToggleSession={() => {}}
        />,
      );
      expect(claudeLinkTag(html, wtId)).toBeNull();
    }
  });
});

describe('dispatchPlugToggle (off launches, live stops, transient guarded)', () => {
  it('off → launch', () => {
    const launch = vi.fn();
    const stop = vi.fn();
    dispatchPlugToggle('off', { launch, stop });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });

  it('on/error → stop', () => {
    const launch = vi.fn();
    const stop = vi.fn();
    dispatchPlugToggle('on', { launch, stop });
    dispatchPlugToggle('error', { launch, stop });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(launch).not.toHaveBeenCalled();
  });

  it('starting → guarded (neither)', () => {
    const launch = vi.fn();
    const stop = vi.fn();
    dispatchPlugToggle('starting', { launch, stop });
    expect(launch).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });
});
