import { Box } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import { GettingReadyView } from './GettingReady';

/**
 * Production stories for the getting-ready screen (task 8.4): in-progress (cloning + Abort), error
 * (Retry + back, friendly copy), ready, aborted, and dark. The polling + abort wiring is covered
 * by the container's E2E; these pin the visual states across schemes.
 */
const meta = { title: 'Repos/Getting ready' } satisfies Meta;
export default meta;
type Story = StoryObj;

const Frame = ({ children }: { children: React.ReactNode }) => <Box p="md">{children}</Box>;

/** In progress — the cloning plug and an Abort action. */
export const InProgress: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <GettingReadyView repoId="acme/widget-factory" status="cloning" />
    </Frame>
  ),
};

/** Error — a friendly, leak-free message with Retry and Back. */
export const ErrorState: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <GettingReadyView repoId="acme/widget-factory" status="error" errorKind="not-found" />
    </Frame>
  ),
};

/** Ready — the repository is cloned and ready. */
export const Ready: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <GettingReadyView repoId="acme/widget-factory" status="ready" />
    </Frame>
  ),
};

/** Aborted — the clone was cancelled. */
export const Aborted: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <GettingReadyView repoId="acme/widget-factory" status="aborted" />
    </Frame>
  ),
};

/** Dark — the in-progress state resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.phone }),
  render: () => (
    <Frame>
      <GettingReadyView repoId="acme/widget-factory" status="cloning" />
    </Frame>
  ),
};
