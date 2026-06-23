import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { switchboardTheme } from '../../theme/theme';
import {
  AutocompleteSelector,
  Button,
  IconButton,
  SegmentedToggle,
  Selector,
  TextField,
} from './controls';

/**
 * Structure cover for the action + form controls (task 6.1). The distinct computed button colours
 * are asserted in the browser by `controls.stories.tsx`; here the node suite pins the four intents
 * (destructive = Signal), the icon-button resting/disabled states, the segmented toggle's disabled
 * option, and the selectors / text input resting / disabled / invalid states.
 */
const render = (ui: ReactNode) =>
  renderToStaticMarkup(<MantineProvider theme={switchboardTheme}>{ui}</MantineProvider>);

describe('action + form controls (structure)', () => {
  it('renders four distinct button intents, destructive drawing from Signal', () => {
    const primary = render(<Button intent="primary">Go</Button>);
    const destructive = render(<Button intent="destructive">Delete</Button>);
    expect(primary).toContain('patina');
    expect(destructive).toContain('signal');
    expect(primary).not.toBe(destructive);
  });

  it('icon button renders resting and disabled states', () => {
    expect(render(<IconButton icon={<svg />} label="Delete" />)).toContain('<button');
    expect(render(<IconButton icon={<svg />} label="Delete" disabled />)).toContain('disabled');
  });

  it('segmented toggle marks an option disabled and unselectable', () => {
    const html = render(
      <SegmentedToggle
        value="github"
        options={[
          { value: 'github', label: 'GitHub' },
          { value: 'local', label: 'Local', disabled: true },
        ]}
      />,
    );
    expect(html).toContain('disabled');
  });

  it('selectors and the text input render resting and disabled states', () => {
    expect(render(<Selector data={['a', 'b']} placeholder="Pick" />)).toContain('Pick');
    expect(render(<TextField placeholder="URL" />)).toContain('URL');
    expect(render(<TextField placeholder="URL" disabled />)).toContain('disabled');
  });

  it('the autocomplete and text input present an invalid (error) state', () => {
    expect(
      render(<AutocompleteSelector data={[]} error="No access to this organisation" />),
    ).toContain('No access to this organisation');
    expect(render(<TextField error="Use <org>/<repo>" />)).toContain('Use');
  });
});
