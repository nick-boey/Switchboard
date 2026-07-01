import { Box, Group, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OperationStatus,
  PlugSessionStatus,
  SessionLaunchState,
  SessionLaunchStatus,
  SessionSummary,
  WorktreeListResponse,
  WorktreeSummary,
} from '@switchboard/shared';
import { isTerminalLaunchState } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import {
  deriveSessionStatus,
  dispatchPlugToggle,
  fetchLaunchStatus,
  fetchLiveSessions,
  launchOpFor,
  noLaunchTracking,
  requestLaunch,
  requestStop,
  sessionLivenessQueryKey,
  settleLaunch,
  trackLaunch,
  trackedLaunchIds,
  untrackLaunch,
  type LaunchTracking,
} from '../sessions';
import { Button } from '../ui/controls';
import { StatusLight } from '../ui/lamp';
import { Card } from '../ui/surface';
import { WorktreesView } from './WorktreesView';
import { CreateWorktreeModal, type CreateWorktreeInput } from './CreateWorktreeModal';
import { isWorktreeSafeToDelete } from './worktree-model';

/**
 * The worktrees-hub worktree slice container (design Decision 6): lists a repository's worktrees,
 * creates one through the tracked operation (polling its status, then refreshing the list), and
 * deletes one through the guarded removal (always confirmed in the MVP, then refreshing the list).
 * Server state via TanStack Query against the typed client; the modal/confirm chrome is local.
 */
export interface WorktreesProps {
  repoId: string;
  client?: SwitchboardClient;
  existingBranches?: string[];
  baseBranches?: string[];
}

/** Pull the `<wt-id>` out of a create operation's key (`<owner>/<repo>/<wt-id>`). */
function wtIdFromOpKey(opKey: string): string | undefined {
  const parts = opKey.split('/');
  return parts.length >= 3 ? parts.slice(2).join('/') : undefined;
}

/** A confirmation modal — every MVP deletion is confirmation-gated (Decision 6). */
function ConfirmDeleteModal({
  wt,
  onConfirm,
  onCancel,
}: {
  wt: WorktreeSummary;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const safe = isWorktreeSafeToDelete(wt);
  return (
    <Card title="Remove worktree" data-testid="wt-confirm-delete">
      <Stack gap="sm">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Box mt={2}>
            <StatusLight tone={safe ? 'green' : 'red'} />
          </Box>
          <Text fz="sm">
            Remove the worktree for{' '}
            <Text span ff="monospace" fw={700}>
              {wt.branch}
            </Text>
            ? This deletes only the checkout — the bare clone and the git branch are kept.
            {!safe &&
              ' This worktree is not confirmed safe to remove (no merged PR, or it has uncommitted changes).'}
          </Text>
        </Group>
        <Group justify="flex-end" gap="xs">
          <Button intent="secondary" onClick={onCancel} data-testid="wt-confirm-cancel">
            Keep
          </Button>
          <Button intent="destructive" onClick={onConfirm} data-testid="wt-confirm-remove">
            Remove worktree
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function Worktrees({
  repoId,
  client: injected,
  existingBranches,
  baseBranches,
}: WorktreesProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);
  const queryClient = useQueryClient();
  const [owner, repo] = repoId.split('/');
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<WorktreeSummary | null>(null);
  const [pendingWtId, setPendingWtId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['worktrees', repoId],
    queryFn: async (): Promise<WorktreeListResponse> => {
      const res = await client.api.worktrees[':owner'][':repo'].$get({ param: { owner, repo } });
      if (!res.ok) throw new Error(`worktree list failed: ${res.status}`);
      return res.json();
    },
  });

  // Poll a create operation to completion, then refresh the list.
  const createStatus = useQuery({
    queryKey: ['wt-create-status', repoId, pendingWtId],
    enabled: pendingWtId !== null,
    queryFn: async (): Promise<OperationStatus> => {
      const res = await client.api.worktrees[':owner'][':repo'][':wtId'].status.$get({
        param: { owner, repo, wtId: pendingWtId! },
      });
      if (!res.ok) throw new Error(`worktree status failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: (q) => (q.state.data && q.state.data.status !== 'cloning' ? false : 700),
  });

  useEffect(() => {
    const status = createStatus.data?.status;
    if (status && status !== 'cloning') {
      setPendingWtId(null);
      void queryClient.invalidateQueries({ queryKey: ['worktrees', repoId] });
    }
  }, [createStatus.data?.status, queryClient, repoId]);

  const createMut = useMutation({
    mutationFn: async (input: CreateWorktreeInput): Promise<OperationStatus> => {
      const res = await client.api.worktrees.create.$post({
        json: { repoId, branch: input.branch, mode: input.mode, base: input.base },
      });
      if (!res.ok) throw new Error(`worktree create failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (status) => {
      setCreating(false);
      const wtId = wtIdFromOpKey(status.repoId);
      if (wtId) setPendingWtId(wtId);
      void queryClient.invalidateQueries({ queryKey: ['worktrees', repoId] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (wt: WorktreeSummary) => {
      // The MVP delete path is always confirmation-gated → force the (re-checked) removal.
      const res = await client.api.worktrees.delete.$post({
        json: { repoId, wtId: wt.wtId, force: true },
      });
      return res.json();
    },
    onSuccess: () => {
      setConfirming(null);
      void queryClient.invalidateQueries({ queryKey: ['worktrees', repoId] });
    },
  });

  // Session liveness (claude-session-launch Decision 4/5): tmux truth, re-read so the plug
  // self-corrects after an external change. The map is keyed by `<wt-id>` and carries each live
  // session's summary — existence (`.has`) AND its optional resolved bridge id (session-web-link).
  const livenessQuery = useQuery({
    queryKey: sessionLivenessQueryKey(repoId),
    queryFn: () => fetchLiveSessions(client, repoId),
    refetchInterval: 4000,
  });
  const liveByWtId = livenessQuery.data ?? new Map<string, SessionSummary>();

  const invalidateLiveness = (): void => {
    void queryClient.invalidateQueries({ queryKey: sessionLivenessQueryKey(repoId) });
  };

  // Launch ops are tracked PER worktree (impl review): every plug is independently actionable, so a
  // user can start launch A then launch B before A settles. A single tracked op would only hold the
  // last action — the earlier launch would lose its `starting`/`error` status and fall back to tmux
  // liveness, hiding an async failure as `off`. `tracking` holds the `<wt-id>`s whose launch op
  // governs their plug; `pendingWtIds`/`failedWtIds` hold the worktrees with a mid-flight / failed
  // launch-or-stop POST (per worktree, not a single last-action mutation).
  const [tracking, setTracking] = useState<LaunchTracking>(noLaunchTracking);
  const [pendingWtIds, setPendingWtIds] = useState<ReadonlySet<string>>(() => new Set());
  const [failedWtIds, setFailedWtIds] = useState<ReadonlySet<string>>(() => new Set());

  const withId = (s: ReadonlySet<string>, wtId: string): Set<string> => new Set(s).add(wtId);
  const withoutId = (s: ReadonlySet<string>, wtId: string): Set<string> => {
    const next = new Set(s);
    next.delete(wtId);
    return next;
  };
  // Reset a row's launch-status poll so a relaunch re-enters `starting` instead of sticking on the
  // cached terminal op (a stale `error`/`ready`); the per-id query then re-polls from scratch.
  const resetLaunchStatus = (wtId: string): void => {
    void queryClient.resetQueries({ queryKey: ['session-launch-status', repoId, wtId] });
  };

  const launchMut = useMutation({
    mutationFn: (wtId: string) => requestLaunch(client, repoId, wtId),
    onMutate: (wtId) => {
      setPendingWtIds((s) => withId(s, wtId)); // optimistic transient before the op is tracked
      setFailedWtIds((s) => withoutId(s, wtId));
      resetLaunchStatus(wtId);
    },
    onSuccess: (_status, wtId) => {
      setPendingWtIds((s) => withoutId(s, wtId));
      setTracking((t) => trackLaunch(t, wtId)); // begin polling this launch op
    },
    onError: (_err, wtId) => {
      setPendingWtIds((s) => withoutId(s, wtId));
      setFailedWtIds((s) => withId(s, wtId));
    },
    onSettled: invalidateLiveness,
  });
  const stopMut = useMutation({
    mutationFn: (wtId: string) => requestStop(client, repoId, wtId),
    onMutate: (wtId) => {
      setPendingWtIds((s) => withId(s, wtId));
      setFailedWtIds((s) => withoutId(s, wtId));
      setTracking((t) => untrackLaunch(t, wtId)); // a stop supersedes this row's tracked launch op
      resetLaunchStatus(wtId);
    },
    onSuccess: (_v, wtId) => setPendingWtIds((s) => withoutId(s, wtId)),
    onError: (_err, wtId) => {
      setPendingWtIds((s) => withoutId(s, wtId));
      setFailedWtIds((s) => withId(s, wtId));
    },
    onSettled: invalidateLiveness,
  });

  // Poll EACH tracked launch op independently to a terminal state (then stop). Mirrors the
  // create-status poll's `refetchInterval` that returns `false` once an op settles — one poll per id
  // so concurrent launches never overwrite one another's status.
  const trackedIds = trackedLaunchIds(tracking);
  const launchStatusQueries = useQueries({
    queries: trackedIds.map((wtId) => ({
      queryKey: ['session-launch-status', repoId, wtId],
      queryFn: (): Promise<SessionLaunchStatus | null> => fetchLaunchStatus(client, repoId, wtId),
      refetchInterval: (q: { state: { data?: SessionLaunchStatus | null } }) =>
        q.state.data && isTerminalLaunchState(q.state.data.status) ? false : 700,
    })),
  });
  const launchOpByWtId = new Map<string, SessionLaunchState | undefined>();
  trackedIds.forEach((wtId, i) => launchOpByWtId.set(wtId, launchStatusQueries[i]?.data?.status));

  // When a tracked launch settles, refresh liveness (a `ready` op flips the plug to `on` from the
  // next tmux read) and reconcile tracking: drop `ready`/`aborted` (defer to liveness), RETAIN
  // `error` so the row stays `error` until the user stops or relaunches it. The snapshot key reruns
  // this only when a tracked op's status changes.
  const launchOpSnapshot = trackedIds
    .map((id) => `${id}=${launchOpByWtId.get(id) ?? ''}`)
    .join('|');
  useEffect(() => {
    const terminal = trackedIds.filter((id) => {
      const s = launchOpByWtId.get(id);
      return s !== undefined && isTerminalLaunchState(s);
    });
    if (terminal.length === 0) return;
    void queryClient.invalidateQueries({ queryKey: sessionLivenessQueryKey(repoId) });
    setTracking((t) => {
      let next = t;
      for (const id of terminal) next = settleLaunch(next, id, launchOpByWtId.get(id)!);
      return next;
    });
    // `launchOpSnapshot` captures every tracked op's status (deps lint is not enabled in this repo).
  }, [launchOpSnapshot, queryClient, repoId]);

  const worktrees = listQuery.isError ? undefined : listQuery.data?.worktrees;
  const sessionStatusByWtId: Record<string, PlugSessionStatus> = {};
  const bridgeSessionIdByWtId: Record<string, string | undefined> = {};
  for (const wt of worktrees ?? []) {
    sessionStatusByWtId[wt.wtId] = deriveSessionStatus({
      live: liveByWtId.has(wt.wtId),
      pending: pendingWtIds.has(wt.wtId),
      failed: failedWtIds.has(wt.wtId),
      // Each plug's launch op comes from THAT worktree's tracked poll (or none if untracked).
      launchOp: launchOpFor(tracking, launchOpByWtId, wt.wtId),
    });
    // The resolved bridge id (if any) rides the same liveness read; the view gates its visibility.
    bridgeSessionIdByWtId[wt.wtId] = liveByWtId.get(wt.wtId)?.bridgeSessionId;
  }

  const onToggleSession = (wt: WorktreeSummary, status: PlugSessionStatus): void => {
    dispatchPlugToggle(status, {
      launch: () => launchMut.mutate(wt.wtId),
      stop: () => stopMut.mutate(wt.wtId),
    });
  };

  return (
    <Stack gap="md" data-testid="worktrees">
      <WorktreesView
        repoId={repoId}
        worktrees={worktrees}
        isError={listQuery.isError}
        sessionStatusByWtId={sessionStatusByWtId}
        bridgeSessionIdByWtId={bridgeSessionIdByWtId}
        onToggleSession={onToggleSession}
        onAddWorktree={() => setCreating(true)}
        onRequestDelete={(wt) => setConfirming(wt)}
        onRetry={() => void listQuery.refetch()}
      />
      {creating && (
        <CreateWorktreeModal
          repoId={repoId}
          existingBranches={existingBranches}
          baseBranches={baseBranches}
          onCreate={(input) => createMut.mutate(input)}
          onCancel={() => setCreating(false)}
        />
      )}
      {confirming && (
        <ConfirmDeleteModal
          wt={confirming}
          onConfirm={() => deleteMut.mutate(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </Stack>
  );
}
