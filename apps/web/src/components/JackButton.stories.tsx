import type { Meta, StoryObj } from '@storybook/react-vite';
import { JackButton } from './JackButton';

const meta = {
  title: 'Foundations/JackButton',
  component: JackButton,
  args: { label: 'Operator line' },
} satisfies Meta<typeof JackButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Idle: Story = {};

export const Patched: Story = {
  args: { active: true },
};
