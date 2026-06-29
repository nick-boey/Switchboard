/**
 * Shared prototype parts for the `branches-control-panel` change (quarantined — not production).
 *
 * These sketch the *new* pieces the design needs and that the catalogue lacks:
 *   - `BranchLamp`     — the six-state branch indicator, reusing the real `StatusLight` for the four
 *                        standard tones and adding the two NEW purple variants (dim/steady for
 *                        remote-only, flashing for remote-ahead).
 *   - `FilterToggleGroup` — independent on/off filter switches (the real `SegmentedToggle` is
 *                        single-select, so it does not fit).
 *   - `BranchPlug`     — the plug's NEW dashed (no-worktree) state + the create→launch progress.
 *   - `BranchRow` / `RepoSection` — the home reframed around the branch.
 *
 * The four standard tones, the PR lamp, the card, and the text field are the real components.
 */
import {
  Box,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import type { ReactNode } from 'react';
import { IndicatorSymbol, type LampTone, PrLamp, type PrStatus, StatusLight } from '../../ui/lamp';
import { Plug, type PlugStatus } from '../../ui/plug';
import { Card } from '../../ui/surface';
import { TextField } from '../../ui/controls';

// --- keyframes (injected once per story via <ProtoStyles/>) -----------------------------------
export function ProtoStyles() {
  return (
    <style>{`@keyframes sbp-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
  );
}

/** A padded, scheme-aware frame so each sketch reads like the app body in screenshots. */
export function Frame({ children, width = 760 }: { children: ReactNode; width?: number }) {
  return (
    <>
      <ProtoStyles />
      <Box style={{ minHeight: '100vh', background: 'var(--sb-body)', padding: 24 }}>
        <Box style={{ maxWidth: width, margin: '0 auto' }}>
          <Stack gap="md">{children}</Stack>
        </Box>
      </Box>
    </>
  );
}

// --- Branch indicator (six states) -----------------------------------------------------------
export type BranchState =
  | 'local-only'
  | 'synced'
  | 'ahead'
  | 'diverged'
  | 'remote-ahead'
  | 'remote-only';

const BRANCH_TONE: Record<'local-only' | 'synced' | 'ahead' | 'diverged', LampTone> = {
  'local-only': 'blue',
  synced: 'green',
  ahead: 'yellow',
  diverged: 'red',
};

export const BRANCH_LABEL: Record<BranchState, string> = {
  'local-only': 'Local only — no remote branch',
  synced: 'Synced — local matches remote',
  ahead: 'Ahead — local is ahead of remote',
  diverged: 'Diverged — local and remote each have unique commits',
  'remote-ahead': 'Remote ahead — local is behind remote',
  'remote-only': 'Remote only — not checked out locally',
};

/** A bezelled purple bulb in either the dim (steady) or flashing variant — the two NEW states. */
function PurpleBulb({ size = 12, variant }: { size?: number; variant: 'dim' | 'flashing' }) {
  const fill = 'var(--sb-pr-merged)';
  const flashing = variant === 'flashing';
  return (
    <span
      data-sb-lamp=""
      data-tone="purple"
      data-variant={variant}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1.5px solid var(--sb-screw)',
        background: fill,
        opacity: variant === 'dim' ? 0.4 : 1,
        boxShadow: flashing ? `0 0 ${Math.round(size * 0.5)}px ${fill}` : 'none',
        display: 'inline-block',
        flex: 'none',
        animation: flashing ? 'sbp-pulse 1.2s ease-in-out infinite' : undefined,
      }}
    />
  );
}

/** The branch indicator: git caption + the state-coloured bulb, wrapped in a naming tooltip. */
export function BranchLamp({
  state,
  size = 12,
  caption = true,
}: {
  state: BranchState;
  size?: number;
  caption?: boolean;
}) {
  const bulb =
    state === 'remote-ahead' ? (
      <PurpleBulb size={size} variant="flashing" />
    ) : state === 'remote-only' ? (
      <PurpleBulb size={size} variant="dim" />
    ) : (
      <StatusLight tone={BRANCH_TONE[state]} size={size} />
    );
  return (
    <Tooltip label={BRANCH_LABEL[state]} withArrow position="top">
      <Stack
        gap={2}
        align="center"
        role="img"
        aria-label={BRANCH_LABEL[state]}
        style={{ lineHeight: 0 }}
      >
        {caption && (
          <Box c="dimmed" style={{ lineHeight: 0 }}>
            <IndicatorSymbol kind="git" size={14} />
          </Box>
        )}
        {bulb}
      </Stack>
    </Tooltip>
  );
}

// --- Filter toggles (independent on/off switches) --------------------------------------------
export type FilterKey = 'worktrees' | 'local' | 'remote' | 'pr';
export type Filters = Record<FilterKey, boolean>;

export const FILTER_LABEL: Record<FilterKey, string> = {
  worktrees: 'Worktrees',
  local: 'Local branches',
  remote: 'Remote branches',
  pr: 'PR exists',
};

/** The default control-panel state: only Worktrees on. */
export const DEFAULT_FILTERS: Filters = { worktrees: true, local: false, remote: false, pr: false };

/** A single switch: an indicator light (green=on) + label, raised when on, recessed when off. */
function FilterToggle({
  label,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  on: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onToggle}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 13px',
        borderRadius: 'calc(var(--sb-panel-radius) - 2px)',
        border: `1px solid ${on ? 'var(--sb-border)' : 'transparent'}`,
        background: on ? 'var(--sb-surface)' : 'transparent',
        color: on ? 'var(--sb-text)' : 'var(--mantine-color-dimmed)',
        fontSize: 'var(--mantine-font-size-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <StatusLight tone={on ? 'green' : 'neutral'} size={8} />
      {label}
    </Box>
  );
}

/** A recessed track of independent filter switches. */
export function FilterToggleGroup({
  value,
  onToggle,
  keys = ['worktrees', 'local', 'remote', 'pr'],
}: {
  value: Filters;
  onToggle?: (key: FilterKey) => void;
  keys?: FilterKey[];
}) {
  return (
    <Box
      role="group"
      aria-label="Branch filters"
      style={{
        display: 'inline-flex',
        gap: 3,
        padding: 3,
        borderRadius: 'var(--sb-panel-radius)',
        background: 'var(--sb-well)',
        border: '1px solid var(--sb-divider)',
      }}
    >
      {keys.map((k) => (
        <FilterToggle
          key={k}
          label={FILTER_LABEL[k]}
          on={value[k]}
          onToggle={() => onToggle?.(k)}
        />
      ))}
    </Box>
  );
}

function SearchGlyph() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 L14 14" />
    </svg>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search branches…',
}: {
  value: string;
  onChange?: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <TextField
      value={value}
      onChange={(e) => onChange?.(e.currentTarget.value)}
      placeholder={placeholder}
      leftSection={<SearchGlyph />}
      aria-label="Search branches"
      style={{ flex: 1, minWidth: 200 }}
    />
  );
}

/** The home control panel: search + the independent filter switches. */
export function ControlPanel({
  search,
  onSearch,
  filters,
  onToggle,
  keys,
}: {
  search: string;
  onSearch?: (v: string) => void;
  filters: Filters;
  onToggle?: (key: FilterKey) => void;
  keys?: FilterKey[];
}) {
  return (
    <Card p="sm" data-testid="control-panel">
      <Group justify="space-between" wrap="wrap" gap="sm" align="center">
        <SearchField value={search} onChange={onSearch} />
        <FilterToggleGroup value={filters} onToggle={onToggle} keys={keys} />
      </Group>
    </Card>
  );
}

// --- Branch plug (adds the dashed no-worktree state + create→launch progress) ----------------
export type BranchPlugState = 'no-worktree' | 'creating' | 'launching' | 'running' | 'error';

export const BRANCH_PLUG_LABEL: Record<BranchPlugState, string> = {
  'no-worktree': 'no worktree — click to create a worktree and start',
  creating: 'creating worktree…',
  launching: 'starting session…',
  running: 'session running',
  error: 'failed',
};

export function BranchPlug({
  state,
  size = 26,
  label,
  onActivate,
}: {
  state: BranchPlugState;
  size?: number;
  label?: string;
  onActivate?: () => void;
}) {
  const theme = useMantineTheme();
  const dashed = state === 'no-worktree' || state === 'creating';
  const pulsing = state === 'creating' || state === 'launching';
  const disc: Record<BranchPlugState, string> = {
    'no-worktree': 'transparent',
    creating: theme.colors.brass[6],
    launching: theme.colors.brass[6],
    running: theme.colors.patina[6],
    error: theme.colors.signal[6],
  };
  const visual = (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `1.5px ${dashed ? 'dashed' : 'solid'} var(--sb-screw)`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <span
        style={{
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: '50%',
          background: disc[state],
          border: state === 'no-worktree' ? '1px dashed var(--sb-screw)' : undefined,
          animation: pulsing ? 'sbp-pulse 1.1s ease-in-out infinite' : undefined,
        }}
      />
    </span>
  );
  const name = `${label ?? 'Branch'}: ${BRANCH_PLUG_LABEL[state]}`;
  if (!onActivate) {
    return (
      <span role="img" aria-label={name} data-status={state} style={{ display: 'inline-flex' }}>
        {visual}
      </span>
    );
  }
  const guarded = pulsing;
  return (
    <UnstyledButton
      aria-label={name}
      data-status={state}
      disabled={guarded}
      onClick={guarded ? undefined : onActivate}
      style={{ display: 'inline-flex', cursor: guarded ? 'not-allowed' : 'pointer', borderRadius: '50%' }}
    >
      {visual}
    </UnstyledButton>
  );
}

// --- Branch row + repo section ---------------------------------------------------------------
export interface MockBranch {
  name: string;
  state: BranchState;
  /** PR lamp slot — display-only in Phase 1 (data arrives in the pr-indicators change). */
  pr: PrStatus;
  hasWorktree: boolean;
  /** Session state when the branch has a worktree. */
  session?: PlugStatus;
}

export function isLocal(b: MockBranch): boolean {
  return b.state !== 'remote-only';
}
export function isRemote(b: MockBranch): boolean {
  return b.state !== 'local-only';
}

/** Union filter (overlapping): show a branch if it matches ANY enabled toggle, narrowed by search. */
export function filterBranches(branches: MockBranch[], filters: Filters, search: string): MockBranch[] {
  const q = search.trim().toLowerCase();
  return branches.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q)) return false;
    return (
      (filters.worktrees && b.hasWorktree) ||
      (filters.local && isLocal(b)) ||
      (filters.remote && isRemote(b)) ||
      (filters.pr && b.pr !== 'none')
    );
  });
}

export function BranchRow({ b }: { b: MockBranch }) {
  return (
    <Box px="md" py="sm" style={{ borderTop: '1px solid var(--sb-divider)' }}>
      <Text fz="sm" fw={700} ff="monospace" truncate>
        {b.name}
      </Text>
      <Group gap={14} wrap="nowrap" align="center" mt={8}>
        {b.hasWorktree ? (
          <Plug status={b.session ?? 'off'} size={26} label={b.name} onActivate={() => {}} />
        ) : (
          <BranchPlug state="no-worktree" size={26} label={b.name} onActivate={() => {}} />
        )}
        <Group gap={12} wrap="nowrap" align="center">
          <BranchLamp state={b.state} />
          <PrLamp status={b.pr} />
        </Group>
      </Group>
    </Box>
  );
}

export function RepoSection({ repoId, branches }: { repoId: string; branches: MockBranch[] }) {
  return (
    <Card p={0} data-testid={`repo-${repoId}`}>
      <Box px="md" pt="md" pb={branches.length ? 'xs' : 'md'}>
        <Text fz="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {repoId}
        </Text>
        {branches.length === 0 && (
          <Text fz="sm" c="dimmed" mt={4}>
            No branches match the filters.
          </Text>
        )}
      </Box>
      {branches.map((b) => (
        <BranchRow key={b.name} b={b} />
      ))}
    </Card>
  );
}

// --- Mock data -------------------------------------------------------------------------------
export const MOCK_REPO = 'acme/switchboard';

export const MOCK_BRANCHES: MockBranch[] = [
  { name: 'main', state: 'synced', pr: 'none', hasWorktree: true, session: 'running' },
  { name: 'feature/control-panel', state: 'ahead', pr: 'open', hasWorktree: true, session: 'off' },
  { name: 'fix/lamp-tones', state: 'diverged', pr: 'checks-failing', hasWorktree: true, session: 'error' },
  { name: 'spike/local-notes', state: 'local-only', pr: 'none', hasWorktree: false },
  { name: 'feature/branch-listing', state: 'remote-ahead', pr: 'conflicts', hasWorktree: false },
  { name: 'release-2.0', state: 'remote-only', pr: 'ready', hasWorktree: false },
];

export const MOCK_BRANCHES_2: MockBranch[] = [
  { name: 'main', state: 'synced', pr: 'none', hasWorktree: true, session: 'off' },
  { name: 'chore/deps', state: 'remote-only', pr: 'open', hasWorktree: false },
];
