import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * Build-smoke fixture (task 7.1). It deliberately hand-writes a `title` so the build smoke can
 * prove the prototype indexer OVERRIDES it with the location-derived `Prototypes/_smoke-fixture/
 * HandTitled`. It is quarantined like any sketch (under a per-change folder) — excluded from the
 * unit run, production Storybook, and bundles — and is only ever seen by the prototype workbench
 * and its build smoke.
 */
function HandTitled() {
  return <div data-testid="hand-titled-fixture">override fixture</div>;
}

const meta = {
  title: 'Totally/Different/HandWritten',
  component: HandTitled,
} satisfies Meta<typeof HandTitled>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
