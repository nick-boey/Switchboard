import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { composeStories, setProjectAnnotations } from '@storybook/react-vite';
import previewAnnotations from '../../.storybook/preview';
import * as stories from './AppShell.stories';

// Shell smoke-story assertion (task 6.1, paired with the Playwright E2E): the app-shell story
// renders its mobile-first chrome through the real providers. We render the COMPOSED story
// (Mantine theme + TanStack Query via the global preview decorator) to static markup — no
// browser, no network — and assert the shell chrome is present. The live bearer round trip is
// covered by the E2E.
setProjectAnnotations(previewAnnotations);

const { Default } = composeStories(stories);

describe('AppShell smoke story', () => {
  it('renders the mobile-first shell chrome', () => {
    const html = renderToStaticMarkup(<Default />);
    expect(html).toContain('data-testid="app-shell"');
    expect(html).toContain('Switchboard');
  });
});
