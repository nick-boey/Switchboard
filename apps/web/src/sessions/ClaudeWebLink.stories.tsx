import { Box, Group, Stack, Text } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { PlugSessionStatus } from '@switchboard/shared';
import { resolvedScheme, schemeTest } from '../storybook/scheme-test';
import { ClaudeWebLink } from './ClaudeWebLink';
import { bridgeLinkFor } from './session-model';

/**
 * The "open in Claude web" deep-link affordance (session-web-link), promoted from the
 * `link-claude-code-online` prototype. The play functions assert the rendered states: a live,
 * bridge-resolved session renders an anchor that deep-links to `claude.ai/code/<id>` in a new tab
 * with `rel="noopener"` and an accessible name; and — via the pure `bridgeLinkFor` rule the
 * worktrees hub uses — the affordance is ABSENT for off/starting/error sessions and for a live
 * session whose bridge id has not resolved yet.
 */
const meta = {
  title: 'Sessions/ClaudeWebLink',
  component: ClaudeWebLink,
} satisfies Meta<typeof ClaudeWebLink>;

export default meta;
type Story = StoryObj<typeof meta>;

const BRIDGE = 'session_011M7D8EPisCss4xNqQ4PNiQ';

/** A live, resolved session: the link deep-links to claude.ai/code in a new tab, safely. */
export const Resolved: Story = {
  args: { bridgeSessionId: BRIDGE, 'data-testid': 'claude-link' },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByTestId('claude-link');
    await expect(link).toHaveAccessibleName('Open in Claude web');
    await expect(link).toHaveAttribute('href', `https://claude.ai/code/${BRIDGE}`);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel') ?? '').toContain('noopener');
  },
};

/**
 * Across session states (the prototype's core behaviour): the link is rendered ONLY for a live
 * (`on`), bridge-resolved row — absent for off/starting/error and for a live-but-unresolved row.
 * Each row applies the same `bridgeLinkFor` gate the worktrees hub applies.
 */
type Row = { label: string; status: PlugSessionStatus; bridge?: string; testid: string };
const ROWS: Row[] = [
  { label: 'off — no session', status: 'off', testid: 'row-off' },
  { label: 'starting — launch in flight', status: 'starting', testid: 'row-starting' },
  { label: 'on — bridge not connected yet', status: 'on', testid: 'row-on-unresolved' },
  { label: 'on — bridge resolved', status: 'on', bridge: BRIDGE, testid: 'row-on-resolved' },
  { label: 'error — launch/stop failed', status: 'error', bridge: BRIDGE, testid: 'row-error' },
];

export const AcrossSessionStates: Story = {
  // A custom render drives this story; `args` only satisfies the required-prop type (it is unused).
  args: { bridgeSessionId: BRIDGE },
  render: () => (
    <Stack gap={6} maw={360}>
      {ROWS.map((r) => {
        const link = bridgeLinkFor(r.status, r.bridge);
        return (
          <Group key={r.testid} justify="space-between" wrap="nowrap" data-testid={r.testid}>
            <Text fz="sm" ff="monospace">
              {r.label}
            </Text>
            {link ? (
              <ClaudeWebLink bridgeSessionId={link} data-testid={`${r.testid}-link`} />
            ) : (
              <Box fz="xs" c="dimmed">
                no link
              </Box>
            )}
          </Group>
        );
      })}
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    // Present ONLY for the live + resolved row.
    await expect(c.getByTestId('row-on-resolved-link')).toBeInTheDocument();
    // Absent everywhere else.
    for (const testid of ['row-off', 'row-starting', 'row-on-unresolved', 'row-error']) {
      expect(c.queryByTestId(`${testid}-link`)).toBeNull();
    }
  },
};

/** Dark — the affordance resolves the patina accent for the dark scheme. */
export const Dark: Story = {
  args: { bridgeSessionId: BRIDGE, 'data-testid': 'claude-link' },
  parameters: schemeTest({ colorScheme: 'dark' }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    const link = within(canvasElement).getByTestId('claude-link');
    await expect(link).toHaveAttribute('href', `https://claude.ai/code/${BRIDGE}`);
  },
};
