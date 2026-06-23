import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../../theme/theme';
import { Plug, type PlugStatus } from './Plug';

/**
 * Structure + a11y cover for the session plug (tasks 4.1/4.3). The distinguishable computed disc
 * colours and the click behaviour (off→launch / live→stop / working guarded) are asserted in the
 * browser by `Plug.stories.tsx`; here the node suite pins the five states, the Signal-ramp error
 * colour, the actionable-vs-display element, and the accessible action verbs.
 */
const render = (ui: ReactNode) =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);
const STATES: PlugStatus[] = ['running', 'working', 'error', 'idle', 'off'];

describe('session plug (structure + a11y)', () => {
  it('renders all five session states', () => {
    for (const s of STATES) {
      expect(render(<Plug status={s} />)).toContain(`data-status="${s}"`);
    }
  });

  it('draws the error disc from the Signal ramp', () => {
    const html = render(<Plug status="error" />).toLowerCase();
    expect(html).toContain(switchboardTheme.colors!.signal![6].toLowerCase());
  });

  it('is a button when actionable and a status image otherwise', () => {
    expect(render(<Plug status="off" onActivate={() => {}} />)).toContain('<button');
    expect(render(<Plug status="off" />)).toContain('role="img"');
  });

  it('exposes the action in the accessible name and guards the working state', () => {
    expect(render(<Plug status="off" label="feat" onActivate={() => {}} />)).toContain(
      'start session',
    );
    expect(render(<Plug status="running" label="feat" onActivate={() => {}} />)).toContain(
      'stop session',
    );
    const working = render(<Plug status="working" label="feat" onActivate={() => {}} />);
    expect(working).toContain('disabled');
    expect(working).not.toContain('start session');
    expect(working).not.toContain('stop session');
  });
});
