import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Group, SimpleGrid, Text } from '@mantine/core';
import { definePrototypeMeta } from '../define-prototype-meta';
import { BRANCH_LABEL, BranchLamp, type BranchState, Frame } from './parts';
import { Card } from '../../ui/surface';

/**
 * The branch indicator's six states. Blue/green/yellow/red reuse the production `StatusLight`; the
 * two purple variants are NEW — dim+steady for a remote-only branch, flashing for remote-ahead
 * (animation is visible live, not in a still screenshot). Every lamp carries a naming tooltip.
 */
const STATES: BranchState[] = [
  'local-only',
  'synced',
  'ahead',
  'diverged',
  'remote-ahead',
  'remote-only',
];

const TONE_NOTE: Record<BranchState, string> = {
  'local-only': 'blue',
  synced: 'green',
  ahead: 'yellow',
  diverged: 'red',
  'remote-ahead': 'flashing purple',
  'remote-only': 'dim purple',
};

function Gallery() {
  return (
    <Frame width={700}>
      <Card>
        <Text fz="sm" fw={700} mb="md">
          Branch indicator — six states
        </Text>
        <SimpleGrid cols={2} spacing="xl" verticalSpacing="lg">
          {STATES.map((s) => (
            <Group key={s} gap="md" wrap="nowrap" align="center">
              <BranchLamp state={s} size={16} />
              <Box>
                <Text fz="sm" fw={600}>
                  {s}{' '}
                  <Text span c="dimmed" fz="xs">
                    · {TONE_NOTE[s]}
                  </Text>
                </Text>
                <Text fz="xs" c="dimmed">
                  {BRANCH_LABEL[s]}
                </Text>
              </Box>
            </Group>
          ))}
        </SimpleGrid>
      </Card>
    </Frame>
  );
}

const meta = {
  ...definePrototypeMeta({ component: Gallery, parameters: { layout: 'fullscreen' } }),
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery_: Story = { name: 'Gallery', render: () => <Gallery /> };
