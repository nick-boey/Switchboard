import {
  ActionIcon,
  Box,
  Button,
  Group,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
  useMantineTheme,
} from '@mantine/core';
import type { ReactNode } from 'react';
import {
  EmbossedLabel,
  flat,
  FLAT_DIVIDER,
  IndicatorSymbol,
  Plug,
  Panel,
  StatusLight,
  type LightTone,
} from './kit';

/**
 * Composed components for the **worktrees hub** — the redesign's centre. The page is built top-down
 * out of these named pieces rather than from bare `Box`/`Group`, so the composition reads as a
 * component breakdown (per the brief). Nothing here is a production primitive; promotion into
 * `src/components/` is implementation work owned by the feature changes. Plain `.tsx` (not
 * `*.stories.tsx`) so the workbench indexer ignores it.
 *
 * Hierarchy:
 *   HubShell ─ brand bar + repo rail/drawer + main pane (+ modal overlay slot)
 *     RepoDrawer ─ cloned repos (org→repo), "New repository", Settings
 *     WorktreeSearchBar ─ search + Active/Inactive filter chips (no card, on the background)
 *     RepoBlock ─ org/repo heading (on background) → single card → WorktreeRow[] → AddWorktreeRow
 *       WorktreeRow ─ branch + Delete; then PlugControl + GitStatusLight + PrStatusLight (symbol-capped)
 *   Modals (in-frame overlay): StopSessionModal · CreateWorktreeModal · IndicatorActionModal
 *
 * ── Click actions (what every interactive element does) ──────────────────────────────────────
 *   Drawer · repo item       → select repo (scrolls/filters the main pane to it)
 *   Drawer · New repository   → open the New repository page (clone existing / pick new)
 *   Drawer · Settings         → open the Settings page
 *   SearchBar · field         → filter cards by repo name + branch name
 *   SearchBar · Active/Inactive chips → toggle which worktrees show
 *   Plug (active/green)        → STOP Claude Code → opens StopSessionModal (warning)
 *   Plug (inactive/neutral)    → START `claude --remote-control` on the worktree (no modal)
 *   Git light                  → opens IndicatorActionModal (deferred: pull/push/…)
 *   PR light                   → opens IndicatorActionModal (deferred: open PR / merge / …)
 *   Delete (trash)             → delete the worktree
 *   Add worktree (empty row)   → opens CreateWorktreeModal (pick base branch → create, Claude stays off)
 */

// --- Domain types -----------------------------------------------------------

/** Remote relationship of a worktree's branch to its upstream — drives the git-status lamp. */
export type RemoteStatus = 'up-to-date' | 'behind' | 'ahead' | 'diverged';

/** Pull-request state — drives the PR lamp. `conflicts-failing` = merge conflicts AND failing checks. */
export type PrStatus =
  | 'none'
  | 'open'
  | 'ready'
  | 'checks-failing'
  | 'conflicts'
  | 'conflicts-failing';

export interface HubWorktree {
  branch: string;
  /** Checkout path tail under `~/.switchboard/repos/<org>/<repo>/` (e.g. `.worktrees/feature-x`). */
  path: string;
  /** `clean`, or a short dirty summary like `3 changes`. */
  dirty: string;
  /** Claude Code (`claude --remote-control`) live on this worktree — the plug. */
  active: boolean;
  remote: RemoteStatus;
  pr: PrStatus;
}

export interface HubRepo {
  /** `org/name` — the clone id and `~/.switchboard/repos/<org>/<name>` path. */
  id: string;
  org: string;
  name: string;
  worktrees: HubWorktree[];
}

// --- Status mappings (single source of truth for tones + accessible labels) --

const REMOTE_TONE: Record<RemoteStatus, LightTone> = {
  'up-to-date': 'neutral',
  behind: 'yellow',
  ahead: 'green',
  diverged: 'red',
};
const REMOTE_LABEL: Record<RemoteStatus, string> = {
  'up-to-date': 'Git: up to date with remote',
  behind: 'Git: behind remote',
  ahead: 'Git: ahead of remote',
  diverged: 'Git: diverged from remote',
};

const PR_TONE: Record<PrStatus, LightTone> = {
  none: 'neutral',
  open: 'blue',
  ready: 'green',
  'checks-failing': 'red',
  conflicts: 'yellow',
  'conflicts-failing': 'red',
};
const PR_LABEL: Record<PrStatus, string> = {
  none: 'PR: none open',
  open: 'PR: open',
  ready: 'PR: ready to merge',
  'checks-failing': 'PR: checks failing',
  conflicts: 'PR: merge conflicts',
  'conflicts-failing': 'PR: merge conflicts + checks failing',
};

// --- Small glyphs (no icon library installed; inline SVG keeps it dependency-free) ---

function Glyph({ d, size = 16 }: { d: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {d}
    </svg>
  );
}

const TrashGlyph = () => (
  <Glyph
    size={15}
    d={
      <>
        <path d="M4 6 H16" />
        <path d="M8 6 V4.5 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V6" />
        <path d="M6 6 V15.5 a1 1 0 0 0 1 1 h6 a1 1 0 0 0 1-1 V6" />
        <path d="M9 9 V13.5 M11 9 V13.5" />
      </>
    }
  />
);
const GearGlyph = () => (
  <Glyph
    d={
      <>
        <circle cx="10" cy="10" r="2.6" />
        <path d="M10 2.6 V4.4 M10 15.6 V17.4 M2.6 10 H4.4 M15.6 10 H17.4 M4.7 4.7 L6 6 M14 14 L15.3 15.3 M15.3 4.7 L14 6 M6 14 L4.7 15.3" />
      </>
    }
  />
);
const PlusGlyph = () => <Glyph d={<path d="M10 4.5 V15.5 M4.5 10 H15.5" />} />;
const SearchGlyph = () => (
  <Glyph
    size={15}
    d={
      <>
        <circle cx="8.5" cy="8.5" r="4.5" />
        <path d="M12 12 L16 16" />
      </>
    }
  />
);
const MenuGlyph = () => <Glyph d={<path d="M3.5 6 H16.5 M3.5 10 H16.5 M3.5 14 H16.5" />} />;
const CloseGlyph = () => <Glyph size={15} d={<path d="M5 5 L15 15 M15 5 L5 15" />} />;
const FolderGlyph = () => (
  <Glyph
    size={15}
    d={
      <path d="M3 6 a1 1 0 0 1 1-1 h3 l1.5 1.5 H16 a1 1 0 0 1 1 1 V15 a1 1 0 0 1 -1 1 H4 a1 1 0 0 1 -1 -1 Z" />
    }
  />
);

// --- Interactive controls ---------------------------------------------------

/** Transparent button wrapper so a lamp/plug is clickable while keeping a single accessible name. */
function LampButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Box
      component="button"
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 2,
        cursor: 'pointer',
        lineHeight: 0,
        borderRadius: '50%',
      }}
    >
      {children}
    </Box>
  );
}

/**
 * The plug toggle — Claude Code's on/off control for a worktree. Green inner disc when live, neutral
 * when idle. Click ON → stop (warning modal); click OFF → start `claude --remote-control`.
 */
export function PlugControl({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <LampButton
      label={
        active ? 'Claude Code live — click to stop' : 'Worktree idle — click to start Claude Code'
      }
      onClick={onClick}
    >
      <Plug status={active ? 'running' : 'idle'} size={26} />
    </LampButton>
  );
}

/**
 * A status lamp captioned by its very small symbol above it. The glyph+lamp group is vertically
 * centred so it lines up with the (larger) plug on the worktree row.
 */
function LampStack({ kind, tone }: { kind: 'git' | 'pr'; tone: LightTone }) {
  return (
    <Stack gap={2} align="center" style={{ lineHeight: 0 }}>
      <Box c="dimmed" style={{ lineHeight: 0 }}>
        <IndicatorSymbol kind={kind} size={10} />
      </Box>
      <StatusLight tone={tone} size={8} />
    </Stack>
  );
}

/** Git-status lamp (symbol above). Click → IndicatorActionModal (deferred: pull / push / …). */
export function GitStatusLight({
  status,
  onClick,
}: {
  status: RemoteStatus;
  onClick?: () => void;
}) {
  return (
    <LampButton label={REMOTE_LABEL[status]} onClick={onClick}>
      <LampStack kind="git" tone={REMOTE_TONE[status]} />
    </LampButton>
  );
}

/** PR-status lamp (symbol above). Click → IndicatorActionModal (deferred: open PR / merge / …). */
export function PrStatusLight({ status, onClick }: { status: PrStatus; onClick?: () => void }) {
  return (
    <LampButton label={PR_LABEL[status]} onClick={onClick}>
      <LampStack kind="pr" tone={PR_TONE[status]} />
    </LampButton>
  );
}

/** Delete the worktree. The only plain button on the row's right edge (brief). */
export function DeleteWorktreeButton({ onClick }: { onClick?: () => void }) {
  return (
    <ActionIcon
      variant="subtle"
      color="gray"
      size="md"
      aria-label="Delete worktree"
      onClick={onClick}
    >
      <TrashGlyph />
    </ActionIcon>
  );
}

// --- Worktree row -----------------------------------------------------------

export interface WorktreeHandlers {
  onPlug?: (wt: HubWorktree) => void;
  onGit?: (wt: HubWorktree) => void;
  onPr?: (wt: HubWorktree) => void;
  onDelete?: (wt: HubWorktree) => void;
}

/**
 * One worktree as a full-width section inside its repo card. Row 1 is the branch name across the
 * panel with the delete button trailing; row 2 is the plug + git/PR lamps (each capped by its small
 * symbol), left-aligned (plug larger, lamps smaller). A full-width divider separates it from the
 * worktree above.
 */
export function WorktreeRow({
  wt,
  divider,
  onPlug,
  onGit,
  onPr,
  onDelete,
}: { wt: HubWorktree; divider: boolean } & WorktreeHandlers) {
  return (
    <Box px="md" py="sm" style={{ borderTop: divider ? `1px solid ${FLAT_DIVIDER}` : undefined }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fz="sm" fw={700} ff="monospace" truncate>
          {wt.branch}
        </Text>
        <DeleteWorktreeButton onClick={() => onDelete?.(wt)} />
      </Group>
      <Group gap={14} wrap="nowrap" mt={8} align="center">
        <PlugControl active={wt.active} onClick={() => onPlug?.(wt)} />
        <Group gap={10} wrap="nowrap" align="center">
          <GitStatusLight status={wt.remote} onClick={() => onGit?.(wt)} />
          <PrStatusLight status={wt.pr} onClick={() => onPr?.(wt)} />
        </Group>
      </Group>
    </Box>
  );
}

/** The empty section at the bottom of every card — click guides the user through creating a worktree. */
export function AddWorktreeRow({ onClick }: { onClick?: () => void }) {
  const theme = useMantineTheme();
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label="Add worktree"
      style={{
        width: '100%',
        padding: '14px 16px',
        background: 'none',
        border: 'none',
        borderTop: '1px dashed rgba(128,128,128,0.45)',
        cursor: 'pointer',
        color: theme.colors.patina[7],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PlusGlyph />
    </Box>
  );
}

// --- Repo heading + card ----------------------------------------------------

/**
 * The repository heading that sits on the page background (no card): the organisation on the top line
 * (small, bold) over the repository name (slightly larger, light).
 */
export function RepoHeading({ org, name }: { org: string; name: string }) {
  return (
    <Box px={2}>
      <Text fz="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.1em' }}>
        {org}
      </Text>
      <Text fz="lg" fw={300} style={{ lineHeight: 1.15 }}>
        {name}
      </Text>
    </Box>
  );
}

/**
 * A cloned repository: its org/repo heading on the background over a single card whose worktrees are
 * full-width sections split by horizontal dividers, capped by the add-worktree row. The card carries
 * the corner screws.
 */
export function RepoBlock({
  repo,
  highlight = false,
  onAddWorktree,
  ...handlers
}: {
  repo: HubRepo;
  highlight?: boolean;
  onAddWorktree?: (repo: HubRepo) => void;
} & WorktreeHandlers) {
  const theme = useMantineTheme();
  return (
    <Stack gap={6}>
      <RepoHeading org={repo.org} name={repo.name} />
      <Panel
        p={0}
        style={
          highlight
            ? { outline: `2px solid ${theme.colors.patina[6]}`, outlineOffset: 1 }
            : undefined
        }
      >
        {repo.worktrees.map((wt, i) => (
          <WorktreeRow key={wt.branch} wt={wt} divider={i > 0} {...handlers} />
        ))}
        <AddWorktreeRow onClick={() => onAddWorktree?.(repo)} />
      </Panel>
    </Stack>
  );
}

// --- Search + filter bar ----------------------------------------------------

function FilterChip({
  label,
  tone,
  on,
  onClick,
}: {
  label: string;
  tone: LightTone;
  on: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      size="compact-sm"
      radius="xl"
      variant={on ? 'light' : 'default'}
      color={on ? 'patina' : 'gray'}
      onClick={onClick}
      leftSection={<StatusLight tone={on ? tone : 'neutral'} size={10} />}
      styles={{ root: { opacity: on ? 1 : 0.6 } }}
    >
      {label}
    </Button>
  );
}

/** Search (repos + branch names) over Active/Inactive filter chips. Sits above the org sections. */
export function WorktreeSearchBar({
  query = '',
  activeOn = true,
  inactiveOn = true,
  onQuery,
  onToggleActive,
  onToggleInactive,
}: {
  query?: string;
  activeOn?: boolean;
  inactiveOn?: boolean;
  onQuery?: (v: string) => void;
  onToggleActive?: () => void;
  onToggleInactive?: () => void;
}) {
  return (
    <Stack gap="xs">
      <TextInput
        size="sm"
        value={query}
        onChange={(e) => onQuery?.(e.currentTarget.value)}
        placeholder="Search repositories and branches…"
        leftSection={<SearchGlyph />}
      />
      <Group gap="xs">
        <Text fz="xs" c="dimmed" fw={600} style={{ letterSpacing: '0.06em' }}>
          FILTER
        </Text>
        <FilterChip label="Active" tone="green" on={activeOn} onClick={onToggleActive} />
        <FilterChip label="Inactive" tone="neutral" on={inactiveOn} onClick={onToggleInactive} />
      </Group>
    </Stack>
  );
}

// --- Repo drawer / rail -----------------------------------------------------

function DrawerRepoItem({
  repo,
  selected,
  onSelect,
}: {
  repo: HubRepo;
  selected: boolean;
  onSelect?: () => void;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const activeCount = repo.worktrees.filter((w) => w.active).length;
  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : 'none',
        border: 'none',
        borderLeft: `3px solid ${selected ? theme.colors.patina[6] : 'transparent'}`,
        cursor: 'pointer',
        padding: '7px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <StatusLight tone={activeCount > 0 ? 'green' : 'neutral'} size={9} />
      <Box style={{ minWidth: 0, flex: 1 }}>
        <Text fz="xs" ff="monospace" truncate c="dimmed">
          {repo.org}
        </Text>
        <Text fz="sm" ff="monospace" fw={selected ? 700 : 600} truncate>
          {repo.name}
        </Text>
      </Box>
      {activeCount > 0 && (
        <Text fz={10} c="patina.7" fw={700} style={{ flex: 'none' }}>
          {activeCount}
        </Text>
      )}
    </Box>
  );
}

/**
 * The repositories drawer/rail — cloned repos grouped by org, a "New repository" button, and a
 * Settings button. Persistent rail on desktop; the same content slides in as an overlay on mobile.
 */
export function RepoDrawer({
  repos,
  selectedRepoId,
  onSelectRepo,
  onNewRepo,
  onSettings,
  onClose,
}: {
  repos: HubRepo[];
  selectedRepoId?: string;
  onSelectRepo?: (repo: HubRepo) => void;
  onNewRepo?: () => void;
  onSettings?: () => void;
  /** Present on mobile only — renders a close affordance in the drawer header. */
  onClose?: () => void;
}) {
  const orgs = groupByOrg(repos);
  return (
    <Stack gap={0} style={{ height: '100%' }}>
      <Group justify="space-between" px="sm" py="xs">
        <EmbossedLabel>Repositories</EmbossedLabel>
        {onClose && (
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label="Close drawer"
            onClick={onClose}
          >
            <CloseGlyph />
          </ActionIcon>
        )}
      </Group>
      <Box px="sm" pb="xs">
        <Button fullWidth size="sm" leftSection={<PlusGlyph />} onClick={onNewRepo}>
          New repository
        </Button>
      </Box>
      <ScrollArea style={{ flex: 1 }} px={4}>
        <Stack gap="xs" py={4}>
          {orgs.map(({ org, repos: orgRepos }) => (
            <Box key={org}>
              <Text
                px={10}
                fz={10}
                fw={700}
                tt="uppercase"
                c="dimmed"
                style={{ letterSpacing: '0.12em' }}
              >
                {org}
              </Text>
              {orgRepos.map((repo) => (
                <DrawerRepoItem
                  key={repo.id}
                  repo={repo}
                  selected={repo.id === selectedRepoId}
                  onSelect={() => onSelectRepo?.(repo)}
                />
              ))}
            </Box>
          ))}
        </Stack>
      </ScrollArea>
      <Box px="sm" py="xs" style={{ borderTop: `1px solid ${FLAT_DIVIDER}` }}>
        <Button
          fullWidth
          size="sm"
          variant="subtle"
          color="gray"
          justify="flex-start"
          leftSection={<GearGlyph />}
          onClick={onSettings}
        >
          Settings
        </Button>
      </Box>
    </Stack>
  );
}

// --- Shell ------------------------------------------------------------------

const RAIL_W = 244;

function railSurface(dark: boolean) {
  return flat(dark).rail;
}

/**
 * The hub shell: a patina brand bar over a [repo rail | main pane] body. On desktop the rail is
 * always shown; on mobile it is hidden behind a menu button and slides in as an overlay. `overlay`
 * is the modal slot (rendered above everything, inside the frame so it screenshots in place).
 */
export function HubShell({
  desktop = false,
  drawer,
  drawerOpen = false,
  onToggleDrawer,
  status,
  overlay,
  children,
}: {
  desktop?: boolean;
  drawer: ReactNode;
  drawerOpen?: boolean;
  onToggleDrawer?: () => void;
  status?: ReactNode;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  const f = flat(dark);
  const rail = railSurface(dark);

  const brand = (
    <Group
      justify="space-between"
      wrap="nowrap"
      px="md"
      py="sm"
      style={{ background: theme.colors.patina[8], color: '#f4f4f4', flex: 'none' }}
    >
      <Group gap="sm" wrap="nowrap">
        {!desktop && (
          <ActionIcon
            variant="transparent"
            color="gray.0"
            aria-label="Open repositories"
            onClick={onToggleDrawer}
          >
            <Box style={{ color: '#f4f4f4', lineHeight: 0 }}>
              <MenuGlyph />
            </Box>
          </ActionIcon>
        )}
        <Plug status="running" size={18} label="Operator line" />
        <Text
          fw={700}
          tt="uppercase"
          style={{ letterSpacing: '0.24em', fontSize: '0.95rem', lineHeight: 1 }}
        >
          Switchboard
        </Text>
      </Group>
      {status}
    </Group>
  );

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {brand}
      {desktop ? (
        <Box style={{ display: 'flex', minHeight: 540 }}>
          <Box
            style={{
              width: RAIL_W,
              flex: 'none',
              background: rail,
              borderRight: `1px solid ${f.border}`,
            }}
          >
            {drawer}
          </Box>
          <Box style={{ flex: 1, minWidth: 0, background: f.body }} p="md">
            {children}
          </Box>
        </Box>
      ) : (
        <Box style={{ position: 'relative', minHeight: 560 }}>
          <Box style={{ background: f.body }} p="md">
            {children}
          </Box>
          {drawerOpen && (
            <>
              <Box
                onClick={onToggleDrawer}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  zIndex: 20,
                }}
              />
              <Box
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 264,
                  maxWidth: '85%',
                  background: rail,
                  boxShadow: '6px 0 18px rgba(0,0,0,0.4)',
                  zIndex: 21,
                }}
              >
                {drawer}
              </Box>
            </>
          )}
        </Box>
      )}
      {overlay && <Box style={{ position: 'absolute', inset: 0, zIndex: 50 }}>{overlay}</Box>}
    </Box>
  );
}

// --- In-frame modals --------------------------------------------------------

/** Base modal — a scrim + centred card rendered inside the device frame (not portaled to body, so
 * the framed screenshot captures it). */
export function ModalSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <Box
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Box
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />
      <Panel p="lg" style={{ position: 'relative', width: '100%', maxWidth: 360, zIndex: 1 }}>
        <Group justify="space-between" align="center" mb="sm">
          <EmbossedLabel>{title}</EmbossedLabel>
          <ActionIcon variant="subtle" color="gray" size="sm" aria-label="Close" onClick={onClose}>
            <CloseGlyph />
          </ActionIcon>
        </Group>
        {children}
      </Panel>
    </Box>
  );
}

/** Warning shown when clicking a LIVE plug — stopping ends the remote-control session. */
export function StopSessionModal({
  branch,
  onConfirm,
  onCancel,
}: {
  branch: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  return (
    <ModalSheet title="Stop Claude Code" onClose={onCancel}>
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Box mt={2}>
            <StatusLight tone="red" />
          </Box>
          <Text fz="sm">
            Claude Code is live on{' '}
            <Text span ff="monospace" fw={700}>
              {branch}
            </Text>
            . Stopping ends the{' '}
            <Text span ff="monospace">
              --remote-control
            </Text>{' '}
            session and exits the worktree process. The conversation history stays in the Claude
            app.
          </Text>
        </Group>
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" onClick={onCancel}>
            Keep running
          </Button>
          <Button color="signal" onClick={onConfirm}>
            Stop session
          </Button>
        </Group>
      </Stack>
    </ModalSheet>
  );
}

/** Guides the user through creating a worktree: new vs existing branch, base branch (default main).
 * On create → a worktree is created but Claude Code stays OFF (plug starts neutral). */
export function CreateWorktreeModal({
  repo,
  baseBranches = ['main', 'develop', 'release/1.0'],
  mode = 'new',
  onCreate,
  onCancel,
}: {
  repo: string;
  baseBranches?: string[];
  mode?: 'new' | 'existing';
  onCreate?: () => void;
  onCancel?: () => void;
}) {
  return (
    <ModalSheet title="New worktree" onClose={onCancel}>
      <Stack gap="sm">
        <Group gap={6}>
          <Text fz="xs" c="dimmed">
            in
          </Text>
          <Text fz="xs" ff="monospace" fw={700}>
            {repo}
          </Text>
        </Group>
        <SegmentedControl
          fullWidth
          size="sm"
          defaultValue={mode}
          data={[
            { label: 'New branch', value: 'new' },
            { label: 'Existing branch', value: 'existing' },
          ]}
        />
        {mode === 'new' ? (
          <TextInput size="sm" label="Branch name" placeholder="feature/remote-control" />
        ) : (
          <Select
            size="sm"
            label="Branch"
            placeholder="Pick a branch"
            data={['feature/remote-control', 'fix/clone-retry', 'spike/ui']}
            comboboxProps={{ withinPortal: false }}
          />
        )}
        <Select
          size="sm"
          label="Base branch"
          defaultValue="main"
          data={baseBranches}
          comboboxProps={{ withinPortal: false }}
        />
        <Group gap={8} wrap="nowrap" align="flex-start">
          <Box mt={2} c="dimmed" style={{ lineHeight: 0 }}>
            <FolderGlyph />
          </Box>
          <Text fz="xs" c="dimmed">
            Checked out under{' '}
            <Text span ff="monospace">
              ~/.switchboard/repos/{repo}/
            </Text>
            . Claude Code stays off — switch the plug on when you’re ready.
          </Text>
        </Group>
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onCreate}>Create worktree</Button>
        </Group>
      </Stack>
    </ModalSheet>
  );
}

/** Placeholder modal opened by clicking a git/PR lamp — actions are deferred (brief). */
export function IndicatorActionModal({
  kind,
  detail,
  onClose,
}: {
  kind: 'git' | 'pr';
  detail: string;
  onClose?: () => void;
}) {
  const future =
    kind === 'git'
      ? 'Pull, push, fetch, and resolve a diverged branch will live here.'
      : 'Open a PR, view checks, resolve conflicts, and merge will live here.';
  return (
    <ModalSheet title={kind === 'git' ? 'Git status' : 'Pull request'} onClose={onClose}>
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap">
          <StatusLight tone={kind === 'git' ? 'yellow' : 'blue'} />
          <Text fz="sm" fw={600}>
            {detail}
          </Text>
        </Group>
        <Panel pressed p="sm">
          <Text fz="xs" c="dimmed">
            {future} (Deferred — these actions aren’t wired yet.)
          </Text>
        </Panel>
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </ModalSheet>
  );
}

// --- Helpers ----------------------------------------------------------------

/** Stable group-by-org preserving first-seen order, then we sort orgs + repos by name in the story. */
export function groupByOrg(repos: HubRepo[]): { org: string; repos: HubRepo[] }[] {
  const order: string[] = [];
  const map = new Map<string, HubRepo[]>();
  for (const repo of repos) {
    if (!map.has(repo.org)) {
      map.set(repo.org, []);
      order.push(repo.org);
    }
    map.get(repo.org)!.push(repo);
  }
  return order
    .sort((a, b) => a.localeCompare(b))
    .map((org) => ({
      org,
      repos: map
        .get(org)!
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
