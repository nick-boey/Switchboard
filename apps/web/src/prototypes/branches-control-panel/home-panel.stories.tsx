import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  ControlPanel,
  DEFAULT_FILTERS,
  type FilterKey,
  type Filters,
  Frame,
  MOCK_BRANCHES,
  MOCK_BRANCHES_2,
  MOCK_REPO,
  RepoSection,
  filterBranches,
} from './parts';

/**
 * The reframed home: the control panel over repository sections that now list filtered BRANCHES
 * (not just worktrees). Toggling the switches re-filters live. Phase 1 shows three switches;
 * the default (Worktrees only) reads much like today.
 */
const PHASE1_KEYS: FilterKey[] = ['worktrees', 'local', 'remote'];

function HomeDemo({ initialFilters = DEFAULT_FILTERS }: { initialFilters?: Filters }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [search, setSearch] = useState('');
  const toggle = (k: FilterKey) => setFilters((f) => ({ ...f, [k]: !f[k] }));
  return (
    <Frame>
      <ControlPanel
        search={search}
        onSearch={setSearch}
        filters={filters}
        onToggle={toggle}
        keys={PHASE1_KEYS}
      />
      <RepoSection repoId={MOCK_REPO} branches={filterBranches(MOCK_BRANCHES, filters, search)} />
      <RepoSection repoId="acme/cli" branches={filterBranches(MOCK_BRANCHES_2, filters, search)} />
    </Frame>
  );
}

const meta = {
  ...definePrototypeMeta({ component: HomeDemo, parameters: { layout: 'fullscreen' } }),
} satisfies Meta<typeof HomeDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: 'Default (Worktrees only)',
  render: () => <HomeDemo initialFilters={DEFAULT_FILTERS} />,
};

export const AllFiltersOn: Story = {
  name: 'All filters on',
  render: () => (
    <HomeDemo initialFilters={{ worktrees: true, local: true, remote: true, pr: false }} />
  ),
};
