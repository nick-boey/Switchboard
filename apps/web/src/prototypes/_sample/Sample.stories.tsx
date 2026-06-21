import type { Meta, StoryObj } from '@storybook/react-vite';
import { definePrototypeMeta } from '../define-prototype-meta';

/**
 * A quarantined sample prototype. The production Storybook excludes `src/prototypes/**`, so this
 * story is absent from the build/snapshot/autodocs runs — proving the quarantine works. It is
 * viewable only via the dedicated `storybook:prototypes` workbench, where the indexer derives the
 * `Prototypes/_sample/Sample` title from this file's location (no `title` is set here) and
 * `definePrototypeMeta` supplies the quarantine tags.
 */
function SampleProto() {
  return <div data-testid="sample-prototype">quarantined prototype — not in production</div>;
}

const meta = {
  ...definePrototypeMeta({ component: SampleProto }),
} satisfies Meta<typeof SampleProto>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
