import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../../theme/theme';
import { FieldLabel, Mono, SectionTitle } from './Type';

/**
 * Structure cover for the typography helpers (task 7.1). The computed monospace family and the
 * tracked-uppercase rendering are asserted in the browser by `Type.stories.tsx`; here the node
 * suite pins the semantic markers and the tracked-label styling.
 */
const render = (ui: ReactNode) =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

describe('typography helpers (structure)', () => {
  it('renders machine identifiers via the monospace helper', () => {
    const html = render(<Mono>feature/login</Mono>);
    expect(html).toContain('data-sb-mono');
    expect(html).toContain('feature/login');
  });

  it('renders field labels with uppercase tracked styling', () => {
    const html = render(<FieldLabel>Personal access token</FieldLabel>);
    expect(html).toContain('data-sb-field-label');
    expect(html).toContain('letter-spacing');
  });

  it('renders section titles', () => {
    const html = render(<SectionTitle>Repositories</SectionTitle>);
    expect(html).toContain('data-sb-section-title');
  });
});
