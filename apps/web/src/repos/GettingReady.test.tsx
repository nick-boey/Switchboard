import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../theme/theme';
import { GettingReadyView } from './GettingReady';

/**
 * Structure cover for the getting-ready screen (task 8.3). Pins the in-progress (cloning indicator
 * + Abort), error (Retry + back, friendly copy with no raw command/GitHub output), ready, and
 * aborted states. Polling + the abort mutation wiring are exercised by the stories and the E2E.
 */
const render = (ui: ReactNode): string =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

describe('getting-ready screen (structure)', () => {
  it('in-progress: shows a cloning indicator and an Abort action', () => {
    const html = render(<GettingReadyView repoId="acme/infra" status="cloning" />);
    expect(html).toContain('data-testid="cloning-indicator"');
    expect(html).toContain('data-testid="clone-abort"');
    expect(html).toContain('Getting ready');
  });

  it('error: shows friendly copy with Retry and Back, never raw command/GitHub output', () => {
    const html = render(
      <GettingReadyView repoId="acme/infra" status="error" errorKind="not-found" />,
    );
    expect(html).toContain('data-testid="clone-retry"');
    expect(html).toContain('data-testid="clone-back"');
    expect(html).toContain('could not be found');
    // No leaked clone URL or git command.
    expect(html).not.toContain('https://');
    expect(html).not.toContain('--bare');
  });

  it('ready: shows the repository-ready state', () => {
    const html = render(<GettingReadyView repoId="acme/infra" status="ready" />);
    expect(html).toContain('data-testid="repo-ready"');
  });

  it('aborted: reflects the aborted state', () => {
    const html = render(<GettingReadyView repoId="acme/infra" status="aborted" />);
    expect(html).toContain('data-testid="clone-aborted"');
  });
});
