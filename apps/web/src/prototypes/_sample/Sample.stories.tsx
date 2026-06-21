import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * A quarantined sample prototype. The production Storybook stories glob negates
 * `src/prototypes/**`, so this story is excluded from the build/snapshot/autodocs runs —
 * proving the quarantine works.
 */
function SampleProto() {
  return <div data-testid="sample-prototype">quarantined prototype — not in production</div>;
}

const meta = {
  title: 'Prototypes/_sample/Sample',
  component: SampleProto,
} satisfies Meta<typeof SampleProto>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
