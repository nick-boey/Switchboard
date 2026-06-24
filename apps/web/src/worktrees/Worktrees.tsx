import { Box, Group, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  OperationStatus,
  PlugSessionStatus,
  WorktreeListResponse,
  WorktreeSummary,
} from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import {
  deriveSessionStatus,
  dispatchPlugToggle,
  fetchLiveSessions,
  requestLaunch,
  requestStop,
  sessionLivenessQueryKey,
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
      const res = await client.worktrees[':owner'][':repo'].$get({ param: { owner, repo } });
      if (!res.ok) throw new Error(`worktree list failed: ${res.status}`);
      return res.json();
    },
  });

  // Poll a create operation to completion, then refresh the list.
  const createStatus = useQuery({
    queryKey: ['wt-create-status', repoId, pendingWtId],
    enabled: pendingWtId !== null,
    queryFn: async (): Promise<OperationStatus> => {
      const res = await client.worktrees[':owner'][':repo'][':wtId'].status.$get({
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
      const res = await client.worktrees.create.$post({
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
      const res = await client.worktrees.delete.$post({
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
  // self-corrects after an external change. The set holds the `<wt-id>`s with a live session.
  const livenessQuery = useQuery({
    queryKey: sessionLivenessQueryKey(repoId),
    queryFn: () => fetchLiveSessions(client, repoId),
    refetchInterval: 4000,
  });
  const liveSet = livenessQuery.data ?? new Set<string>();

  const invalidateLiveness = (): void => {
    void queryClient.invalidateQueries({ queryKey: sessionLivenessQueryKey(repoId) });
  };
  const launchMut = useMutation({
    mutationFn: (wtId: string) => requestLaunch(client, repoId, wtId),
    onSettled: invalidateLiveness,
  });
  const stopMut = useMutation({
    mutationFn: (wtId: string) => requestStop(client, repoId, wtId),
    onSettled: invalidateLiveness,
  });

  // The worktree whose session is mid-mutation (optimistic transient) or whose last mutation failed.
  const pendingWt = launchMut.isPending
    ? launchMut.variables
    : stopMut.isPending
      ? stopMut.variables
      : undefined;
  const failedWt = launchMut.isError
    ? launchMut.variables
    : stopMut.isError
      ? stopMut.variables
      : undefined;

  const worktrees = listQuery.isError ? undefined : listQuery.data?.worktrees;
  const sessionStatusByWtId: Record<string, PlugSessionStatus> = {};
  for (const wt of worktrees ?? []) {
    sessionStatusByWtId[wt.wtId] = deriveSessionStatus({
      live: liveSet.has(wt.wtId),
      pending: pendingWt === wt.wtId,
      failed: failedWt === wt.wtId,
    });
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
