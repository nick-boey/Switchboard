import { Group, Stack } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest } from '../../storybook/scheme-test';
import { GitLamp, PrLamp, type GitStatus, type PrStatus } from './Lamp';

/**
 * Display-only git / PR indicator lamps (task 5.1). The play functions assert every named status
 * renders, PR `open`/`merged` resolve to the cobalt/violet tokens (light + dark), and the lamps are
 * inert (status images, not buttons).
 */
const GIT: GitStatus[] = ['up-to-date', 'behind', 'ahead', 'diverged'];
const PR: PrStatus[] = [
  'none',
  'open',
  'ready',
  'checks-failing',
  'conflicts',
  'conflicts-failing',
  'merged',
];

function Lamps() {
  return (
    <Stack>
      <Group>
        {GIT.map((s) => (
          <GitLamp key={s} status={s} data-testid={`git-${s}`} />
        ))}
      </Group>
      <Group>
        {PR.map((s) => (
          <PrLamp key={s} status={s} data-testid={`pr-${s}`} />
        ))}
      </Group>
    </Stack>
  );
}

const meta = {
  title: 'UI/Lamp',
  component: Lamps,
} satisfies Meta<typeof Lamps>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Light — every status renders; PR open/merged use the cobalt/violet tokens; lamps are inert. */
export const AllStatuses: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    for (const s of GIT) expect(c.getByTestId(`git-${s}`)).toBeInTheDocument();
    for (const s of PR) expect(c.getByTestId(`pr-${s}`)).toBeInTheDocument();
    // cobalt / violet resolved from the tokens
    expect(getComputedStyle(c.getByTestId('pr-open')).backgroundColor).toBe('rgb(47, 106, 168)');
    expect(getComputedStyle(c.getByTestId('pr-merged')).backgroundColor).toBe('rgb(112, 72, 196)');
    // inert: a status image, no button anywhere
    await expect(c.getByTestId('pr-open')).toHaveAttribute('role', 'img');
    expect(c.queryByRole('button')).toBeNull();
  },
};

/** Dark — the cobalt PR-open token resolves to its dark value. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark' }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    const open = within(canvasElement).getByTestId('pr-open');
    await waitFor(() => expect(getComputedStyle(open).backgroundColor).toBe('rgb(107, 166, 224)'));
  },
};
