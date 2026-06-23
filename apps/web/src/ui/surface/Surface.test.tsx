import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../../theme/theme';
import { Card, Well } from './Surface';

/**
 * Structural cover for the flat surfaces (task 3.1). The visual contract — distinct computed
 * surface colours and dark-scheme resolution — is asserted by the play functions in
 * `Surface.stories.tsx` under the test-runner; here we pin the screw / title / nesting structure in
 * the fast node suite. Mantine primitives need a provider even for SSR markup.
 */
const render = (ui: ReactNode) =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);
const screwCount = (html: string) => (html.match(/data-sb-screw/g) ?? []).length;

describe('flat surface primitives (structure)', () => {
  it('a raised card shows four corner screws and an optional inset title', () => {
    const html = render(<Card title="Line status">body</Card>);
    expect(html).toContain('data-sb-surface="card"');
    expect(screwCount(html)).toBe(4);
    expect(html).toContain('data-sb-title');
    expect(html).toContain('Line status');
  });

  it('a card can drop its screws', () => {
    const html = render(<Card screws={false}>body</Card>);
    expect(screwCount(html)).toBe(0);
  });

  it('a pressed well has no screws and no inset title', () => {
    const html = render(<Well>log</Well>);
    expect(html).toContain('data-sb-surface="well"');
    expect(screwCount(html)).toBe(0);
    expect(html).not.toContain('data-sb-title');
  });

  it('a well nests inside a card', () => {
    const html = render(
      <Card title="Worktrees">
        <Well>row</Well>
      </Card>,
    );
    const cardIdx = html.indexOf('data-sb-surface="card"');
    const wellIdx = html.indexOf('data-sb-surface="well"');
    expect(cardIdx).toBeGreaterThanOrEqual(0);
    expect(wellIdx).toBeGreaterThan(cardIdx);
  });
});
