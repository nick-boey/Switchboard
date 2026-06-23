import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { AppShell } from './AppShell';

/**
 * The flat app shell (tasks 8.1/8.3/8.5). Rendered through the global `AppProviders` decorator
 * (Mantine theme + TanStack Query); without an injected server config the line-status card shows
 * its connecting state. The play functions assert dark-scheme resolution and the responsive
 * drawer↔rail switch with no horizontal overflow.
 */
const meta = {
  title: 'Foundations/AppShell',
  component: AppShell,
  args: { liveSessions: 2 },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Dark — under emulated `prefers-color-scheme: dark` the shell resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.desktop }),
  play: async () => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
  },
};

/** Mobile — the nav is a drawer behind the burger; no horizontal overflow. */
export const Mobile: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  play: async ({ canvasElement }) => {
    const burger = within(canvasElement).getByTestId('nav-burger');
    await waitFor(() => expect(getComputedStyle(burger).display).not.toBe('none'));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

/** Desktop — a persistent nav rail; the burger is hidden; no horizontal overflow. */
export const Desktop: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  play: async ({ canvasElement }) => {
    const burger = within(canvasElement).getByTestId('nav-burger');
    await waitFor(() => expect(getComputedStyle(burger).display).toBe('none'));
    expect(within(canvasElement).getByTestId('nav-rail').offsetWidth).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};
