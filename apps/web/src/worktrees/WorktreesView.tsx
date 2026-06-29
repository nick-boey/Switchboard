import { Box, Group, Stack, Text, useComputedColorScheme, useMantineTheme } from '@mantine/core';
import type { ReactNode } from 'react';
import type { PlugSessionStatus, WorktreeSummary } from '@switchboard/shared';
import { Button, IconButton } from '../ui/controls';
import { GitLamp, PrLamp, StatusLight } from '../ui/lamp';
import { Plug } from '../ui/plug';
import { Card } from '../ui/surface';
import { bridgeLinkFor, ClaudeWebLink, sessionStatusToPlug } from '../sessions';
import { isWorktreeSafeToDelete, prLampStatus } from './worktree-model';

/**
 * The worktrees-hub worktree surface (design Decision 6 + Worktrees-hub screen states), ported
 * from the `ui-prototypes-mvp` prototype — not imported. Renders a repository's worktrees as
 * full-width sections (branch + a display-only plug + the git lamp + a display-only PR lamp + a
 * delete control), plus the list / empty / loading / error states and the "Add worktree…" row.
 *
 * The plug is display-only here (its on/off action is `claude-session-launch`'s); the PR lamp is
 * display-only (no MVP data source). The delete control reflects the safe-to-delete predicate —
 * lit only when safe — but in the MVP no worktree is ever safe (prMerged has no source), so it is
 * never lit and always confirms before removing.
 */

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
const PlusGlyph = () => <Glyph d={<path d="M10 4.5 V15.5 M4.5 10 H15.5" />} />;

/**
 * The delete control — a signal-red icon button that lights only when the worktree is safe to
 * delete. Activating it requests a (confirmed) removal; the confirmation is owned by the container.
 */
export function DeleteWorktreeControl({
  safe,
  onRequestDelete,
  wtId,
}: {
  safe: boolean;
  onRequestDelete: () => void;
  wtId: string;
}) {
  return (
    <IconButton
      icon={<TrashGlyph />}
      label={safe ? 'Delete worktree (safe to remove)' : 'Delete worktree'}
      color="signal"
      lit={safe}
      onClick={onRequestDelete}
      data-testid={`wt-delete-${wtId}`}
    />
  );
}

function WorktreeRow({
  wt,
  sessionStatus,
  bridgeSessionId,
  onToggleSession,
  onRequestDelete,
}: {
  wt: WorktreeSummary;
  sessionStatus: PlugSessionStatus;
  /** The session's resolved cloud bridge id, if any (session-web-link). */
  bridgeSessionId?: string;
  onToggleSession?: (wt: WorktreeSummary, status: PlugSessionStatus) => void;
  onRequestDelete: (wt: WorktreeSummary) => void;
}) {
  const safe = isWorktreeSafeToDelete(wt);
  // The deep link is surfaced ONLY for a live, bridge-resolved session (the rule lives in the pure
  // model so a stale id can never appear on an off/starting/error plug).
  const bridgeLink = bridgeLinkFor(sessionStatus, bridgeSessionId);
  return (
    <Box
      px="md"
      py="sm"
      data-testid={`wt-row-${wt.wtId}`}
      style={{ borderTop: '1px solid var(--sb-divider)' }}
    >
      <Text fz="sm" fw={700} ff="monospace" truncate>
        {wt.branch}
      </Text>
      <Group justify="space-between" wrap="nowrap" mt={8} align="center">
        <Group gap={14} wrap="nowrap" align="center">
          {/* The session plug: off→launch, on→stop, starting→guarded (claude-session-launch). When
              no `onToggleSession` is wired it stays a display-only status image. */}
          <Plug
            status={sessionStatusToPlug(sessionStatus)}
            size={26}
            label={wt.branch}
            onActivate={onToggleSession ? () => onToggleSession(wt, sessionStatus) : undefined}
            data-testid={`wt-plug-${wt.wtId}`}
          />
          {/* "Open in Claude web" — placement A: immediately right of the plug, a benign navigation
              action kept away from the destructive delete control (session-web-link Decision 6). */}
          {bridgeLink && (
            <ClaudeWebLink
              bridgeSessionId={bridgeLink}
              size={26}
              data-testid={`wt-claude-link-${wt.wtId}`}
            />
          )}
          <Group gap={12} wrap="nowrap" align="center">
            <GitLamp status={wt.sync} data-testid={`wt-git-${wt.wtId}`} />
            <PrLamp status={prLampStatus(wt)} data-testid={`wt-pr-${wt.wtId}`} />
          </Group>
        </Group>
        <DeleteWorktreeControl
          safe={safe}
          wtId={wt.wtId}
          onRequestDelete={() => onRequestDelete(wt)}
        />
      </Group>
    </Box>
  );
}

function AddWorktreeRow({ onClick }: { onClick?: () => void }) {
  const theme = useMantineTheme();
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label="Add worktree"
      data-testid="wt-add"
      style={{
        width: '100%',
        padding: '14px 16px',
        border: 'none',
        borderTop: '1px dashed var(--sb-divider)',
        cursor: 'pointer',
        background: 'transparent',
        color: theme.colors.patina[dark ? 4 : 6],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <PlusGlyph />
    </Box>
  );
}

export interface WorktreesViewProps {
  repoId: string;
  /** The worktrees; `undefined` while loading. */
  worktrees: WorktreeSummary[] | undefined;
  /** True when the list query failed. */
  isError?: boolean;
  /**
   * Per-worktree session status (claude-session-launch Decision 5). A worktree with no entry reads
   * `off`. When `onToggleSession` is omitted the plug is display-only.
   */
  sessionStatusByWtId?: Record<string, PlugSessionStatus>;
  /**
   * Per-worktree resolved cloud bridge id (session-web-link). Present only for a live, resolved
   * session; the "open in Claude web" link is rendered from it (and only when the plug is `on`).
   */
  bridgeSessionIdByWtId?: Record<string, string | undefined>;
  /** Activate a worktree's plug — launch (off) or stop (on/error); transient is guarded. */
  onToggleSession?: (wt: WorktreeSummary, status: PlugSessionStatus) => void;
  onAddWorktree?: () => void;
  onRequestDelete?: (wt: WorktreeSummary) => void;
  onRetry?: () => void;
}

export function WorktreesView({
  repoId,
  worktrees,
  isError = false,
  sessionStatusByWtId,
  bridgeSessionIdByWtId,
  onToggleSession,
  onAddWorktree,
  onRequestDelete,
  onRetry,
}: WorktreesViewProps) {
  if (isError) {
    return (
      <Card title={repoId} data-testid="worktrees-error">
        <Stack gap="sm" align="center" py="md">
          <StatusLight tone="red" size={14} label="worktrees failed" />
          <Text fz="sm" c="dimmed">
            Couldn’t load this repository’s worktrees.
          </Text>
          <Button intent="secondary" onClick={onRetry} data-testid="worktrees-retry">
            Retry
          </Button>
        </Stack>
      </Card>
    );
  }

  if (worktrees === undefined) {
    return (
      <Card title={repoId} data-testid="worktrees-loading">
        <Group gap={8} wrap="nowrap">
          <StatusLight tone="yellow" size={11} label="loading" />
          <Text fz="sm" c="dimmed">
            Loading worktrees…
          </Text>
        </Group>
      </Card>
    );
  }

  return (
    <Card p={0} title={undefined} data-testid="worktrees-list">
      <Box px="md" pt="md" pb={worktrees.length ? 'xs' : 0}>
        <Text fz="xs" tt="uppercase" c="dimmed" style={{ letterSpacing: '0.08em' }}>
          {repoId}
        </Text>
        {worktrees.length === 0 && (
          <Text fz="sm" c="dimmed" mt={4} data-testid="worktrees-empty">
            No worktrees yet.
          </Text>
        )}
      </Box>
      {worktrees.map((wt) => (
        <WorktreeRow
          key={wt.wtId}
          wt={wt}
          sessionStatus={sessionStatusByWtId?.[wt.wtId] ?? 'off'}
          bridgeSessionId={bridgeSessionIdByWtId?.[wt.wtId]}
          onToggleSession={onToggleSession}
          onRequestDelete={(w) => onRequestDelete?.(w)}
        />
      ))}
      <AddWorktreeRow onClick={onAddWorktree} />
    </Card>
  );
}
