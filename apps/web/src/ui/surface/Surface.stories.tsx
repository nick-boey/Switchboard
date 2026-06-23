import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest } from '../../storybook/scheme-test';
import { Card, Well } from './Surface';

/**
 * Flat surfaces (task 3.1): a raised card with the corner-screw motif + inset title, and a pressed
 * well nested inside it. The play functions assert the visual contract in a real browser —
 * distinct surface colours, four screws on the card / none on the well, and dark-scheme resolution.
 */
function CardWithWell() {
  return (
    <Card title="Line status" data-testid="card" maw={360}>
      <Well data-testid="well">recessed read-out</Well>
    </Card>
  );
}

const meta = {
  title: 'UI/Surface',
  component: CardWithWell,
} satisfies Meta<typeof CardWithWell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Light — card and well are visually distinct; the well nests in the card. */
export const CardAndWell: Story = {
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByTestId('card');
    const well = within(canvasElement).getByTestId('well');
    expect(card.querySelectorAll('[data-sb-screw]')).toHaveLength(4);
    expect(well.querySelectorAll('[data-sb-screw]')).toHaveLength(0);
    expect(card.contains(well)).toBe(true);
    expect(getComputedStyle(card).backgroundColor).not.toBe(getComputedStyle(well).backgroundColor);
  },
};

/** Dark — the card surface resolves to its dark-scheme token (#212121). */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark' }),
  play: async ({ canvasElement }) => {
    const card = within(canvasElement).getByTestId('card');
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    await waitFor(() => expect(getComputedStyle(card).backgroundColor).toBe('rgb(33, 33, 33)'));
  },
};
