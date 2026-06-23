import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../../theme/theme';
import { GitLamp, PrLamp, type GitStatus, type PrStatus } from './Lamp';

/**
 * Structure cover for the display-only lamps (task 5.1). The computed cobalt/violet colours are
 * asserted in the browser by `Lamp.stories.tsx`; here the node suite pins every named status, the
 * per-column accessible label, the token-driven (no ad-hoc hex) PR open/merged fills, and the inert
 * (non-button) nature of the lamps.
 */
const render = (ui: ReactNode) =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

const GIT: GitStatus[] = ['up-to-date', 'behind', 'ahead', 'diverged'];
const PR: PrStatus[] = [
  'none',
  'open',
  'ready',
  'checks-failing',
  'conflicts',
  'conflicts-failing',
  'merged',
];

describe('status indicator lamps (structure)', () => {
  it('renders every git status labelled to its column', () => {
    for (const s of GIT) {
      const html = render(<GitLamp status={s} />);
      expect(html).toContain('Git:');
      expect(html).toContain('data-sb-lamp');
    }
  });

  it('renders every PR status labelled to its column', () => {
    for (const s of PR) {
      expect(render(<PrLamp status={s} />)).toContain('PR:');
    }
  });

  it('draws PR open / merged from the cobalt / violet tokens (no ad-hoc hex)', () => {
    expect(render(<PrLamp status="open" />)).toContain('var(--sb-pr-open)');
    expect(render(<PrLamp status="merged" />)).toContain('var(--sb-pr-merged)');
  });

  it('is inert — a status image, never a button', () => {
    const html = render(<PrLamp status="open" />);
    expect(html).toContain('role="img"');
    expect(html).not.toContain('<button');
  });
});
