import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './AppShell';

/**
 * The mobile-first app shell (design Decision 7). Rendered through the global `AppProviders`
 * decorator (Mantine theme + TanStack Query). Without an injected server config the line-status
 * panel shows its connecting/failed state; the E2E (task 6.1) exercises the live bearer path.
 */
const meta = {
  title: 'Foundations/AppShell',
  component: AppShell,
} satisfies Meta<typeof AppShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
