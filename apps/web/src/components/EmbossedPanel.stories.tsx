import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '@mantine/core';
import { EmbossedPanel } from './EmbossedPanel';

const meta = {
  title: 'Foundations/EmbossedPanel',
  component: EmbossedPanel,
} satisfies Meta<typeof EmbossedPanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Raised: Story = {
  args: {
    children: <Text fw={600}>Raised bakelite panel</Text>,
  },
};

export const Pressed: Story = {
  args: {
    pressed: true,
    children: <Text fw={600}>Pressed (inset) panel</Text>,
  },
};
