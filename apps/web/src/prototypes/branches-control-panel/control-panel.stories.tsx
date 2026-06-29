import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '@mantine/core';
import { useState } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  ControlPanel,
  DEFAULT_FILTERS,
  type FilterKey,
  type Filters,
  Frame,
} from './parts';

/**
 * The home control panel: a search field + independent on/off filter switches. Phase 1 ships three
 * switches (Worktrees / Local / Remote); the `WithPrToggle` story previews where the Phase-2
 * "PR exists" switch lands.
 */
const PHASE1_KEYS: FilterKey[] = ['worktrees', 'local', 'remote'];

function ControlPanelDemo({
  initialFilters = DEFAULT_FILTERS,
  initialSearch = '',
  keys = PHASE1_KEYS,
}: {
  initialFilters?: Filters;
  initialSearch?: string;
  keys?: FilterKey[];
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState(initialSearch);
  const toggle = (k: FilterKey) => setFilters((f) => ({ ...f, [k]: !f[k] }));
  return (
    <Frame>
      <ControlPanel
        search={search}
        onSearch={setSearch}
        filters={filters}
        onToggle={toggle}
        keys={keys}
      />
      <Text fz="xs" c="dimmed">
        Default = only “Worktrees” on. Switches combine as a union (a branch shows if it matches any
        enabled switch); each switch carries its own indicator light. Search narrows by branch name.
      </Text>
    </Frame>
  );
}

const meta = {
  ...definePrototypeMeta({ component: ControlPanelDemo, parameters: { layout: 'fullscreen' } }),
} satisfies Meta<typeof ControlPanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ControlPanelDemo initialFilters={DEFAULT_FILTERS} />,
};

export const AllOn: Story = {
  render: () => (
    <ControlPanelDemo initialFilters={{ worktrees: true, local: true, remote: true, pr: false }} />
  ),
};

export const WithSearch: Story = {
  render: () => (
    <ControlPanelDemo
      initialFilters={{ worktrees: true, local: true, remote: true, pr: false }}
      initialSearch="feature"
    />
  ),
};

export const WithPrToggle: Story = {
  name: 'With PR toggle (Phase 2 preview)',
  render: () => (
    <ControlPanelDemo
      initialFilters={{ worktrees: true, local: false, remote: false, pr: true }}
      keys={['worktrees', 'local', 'remote', 'pr']}
    />
  ),
};
