import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
import * as stories from './AppShell.stories';

/**
 * Flat app-shell chrome (task 8.3). We render the COMPOSED story (real providers via the global
 * preview decorator) to static markup and assert the flat header is built from the matured
 * primitives — tracked wordmark, brand plug, burger→drawer, live-session count, and the line-status
 * card. The responsive drawer↔rail behaviour and dark resolution are asserted in the browser by the
 * Mobile / Desktop / Dark stories under the test-runner.
 */
setProjectAnnotations(previewAnnotations);

const { Default } = composeStories(stories);

describe('AppShell flat header', () => {
  it('renders the flat header chrome from the matured primitives', () => {
    const html = renderToStaticMarkup(<Default />);
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('Switchboard');
    expect(html).toContain('data-testid="nav-burger"');
    expect(html).toContain('data-testid="brand-mark"');
    expect(html).toContain('data-testid="live-session-count"');
    expect(html).toContain('data-testid="line-status"');
  });

  it('shows the live session count', () => {
    const html = renderToStaticMarkup(<Default liveSessions={3} />);
    expect(html).toContain('3 live');
  });
});
