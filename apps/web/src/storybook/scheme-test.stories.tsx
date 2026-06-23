import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest, VIEWPORTS } from './scheme-test';

/**
 * Test-infrastructure smoke (task 1.2): proves the colour-scheme + viewport emulation helpers
 * drive a real production story under the Storybook test-runner. This is harness plumbing, not a
 * design-system primitive — it renders a marker the play function reads back after the runner has
 * emulated the dark scheme and the phone width.
 */
function SchemeProbe() {
  return <output data-testid="scheme-probe">ready</output>;
}

const meta = {
  title: 'Storybook/Scheme test harness',
  component: SchemeProbe,
} satisfies Meta<typeof SchemeProbe>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Emulated dark + phone width — the play function confirms both reached the rendered story. */
export const DarkPhone: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.phone }),
  play: async ({ canvasElement }) => {
    const probe = within(canvasElement).getByTestId('scheme-probe');
    await expect(probe).toHaveTextContent('ready');
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    expect(window.innerWidth).toBe(VIEWPORTS.phone);
  },
};
