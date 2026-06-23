import { Box, Group, Stack, Text } from '@mantine/core';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CloneErrorKind, CloneStatus, OperationStatus } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { Button } from '../ui/controls';
import { Plug } from '../ui/plug';
import { StatusLight } from '../ui/lamp';

/**
 * The repository **getting-ready** screen (design Decision 6), ported from the prototype. It
 * polls the clone operation status and renders the in-progress (cloning indicator + Abort), error
 * (Retry + back; never raw command/GitHub output), ready, and aborted states. The Abort action is
 * backed by the typed client's abort method (Decision 6 cancellation).
 */

/** Friendly, leak-free copy for each typed clone error. */
const ERROR_COPY: Record<CloneErrorKind, string> = {
  unauthorized: 'GitHub denied access. Check the PAT in ~/.switchboard and try again.',
  'not-found': 'That repository could not be found or is not accessible to your token.',
  'rate-limited': 'GitHub rate limit reached. Wait a little, then retry.',
  'git-failure': 'The clone did not finish. You can retry or go back.',
};

export interface GettingReadyViewProps {
  repoId: string;
  status: CloneStatus;
  errorKind?: CloneErrorKind;
  onAbort?: () => void;
  onRetry?: () => void;
  onBack?: () => void;
  aborting?: boolean;
}

export function GettingReadyView({
  repoId,
  status,
  errorKind,
  onAbort,
  onRetry,
  onBack,
  aborting,
}: GettingReadyViewProps) {
  return (
    <Stack align="center" gap="md" py={48} data-testid="getting-ready" data-status={status}>
      {status === 'cloning' && (
        <>
          <Plug status="working" size={30} label="cloning" data-testid="cloning-indicator" />
          <Text fz="sm" fw={700}>
            Getting ready…
          </Text>
          <Text fz="xs" c="dimmed" ta="center" maw={320}>
            Cloning{' '}
            <Text span ff="monospace">
              {repoId}
            </Text>{' '}
            into{' '}
            <Text span ff="monospace">
              ~/.switchboard/repos
            </Text>
            . This page becomes the repository once it’s ready.
          </Text>
          <Button
            intent="secondary"
            onClick={onAbort}
            disabled={aborting}
            data-testid="clone-abort"
          >
            Abort clone
          </Button>
        </>
      )}

      {status === 'error' && (
        <>
          <StatusLight tone="red" size={16} label="clone failed" />
          <Text fz="sm" fw={700}>
            Couldn’t get the repository ready
          </Text>
          <Text fz="xs" c="dimmed" ta="center" maw={320} data-testid="clone-error-message">
            {ERROR_COPY[errorKind ?? 'git-failure']}
          </Text>
          <Group gap="sm">
            <Button onClick={onRetry} data-testid="clone-retry">
              Retry
            </Button>
            <Button intent="secondary" onClick={onBack} data-testid="clone-back">
              Back
            </Button>
          </Group>
        </>
      )}

      {status === 'aborted' && (
        <>
          <StatusLight tone="yellow" size={16} label="aborted" />
          <Text fz="sm" fw={700} data-testid="clone-aborted">
            Clone aborted
          </Text>
          <Group gap="sm">
            <Button onClick={onRetry} data-testid="clone-retry">
              Retry
            </Button>
            <Button intent="secondary" onClick={onBack} data-testid="clone-back">
              Back
            </Button>
          </Group>
        </>
      )}

      {status === 'ready' && (
        <>
          <Plug status="running" size={30} label="ready" />
          <Text fz="sm" fw={700} data-testid="repo-ready">
            Repository ready
          </Text>
          <Box>
            <Text fz="xs" c="dimmed" ta="center" maw={320}>
              <Text span ff="monospace">
                {repoId}
              </Text>{' '}
              is cloned and ready to work on.
            </Text>
          </Box>
        </>
      )}
    </Stack>
  );
}

export interface GettingReadyProps {
  repoId: string;
  client?: SwitchboardClient;
  onRetry?: () => void;
  onBack?: () => void;
}

/** Container: polls the clone status and wires the abort mutation to the typed client. */
export function GettingReady({ repoId, client: injected, onRetry, onBack }: GettingReadyProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);
  const queryClient = useQueryClient();
  const [owner, repo] = repoId.split('/');

  const statusQuery = useQuery({
    queryKey: ['clone-status', repoId],
    queryFn: async (): Promise<OperationStatus> => {
      const res = await client.repos[':owner'][':repo'].status.$get({ param: { owner, repo } });
      if (!res.ok) throw new Error(`status failed: ${res.status}`);
      return res.json();
    },
    // Poll while the clone is in flight; stop once it reaches a terminal state.
    refetchInterval: (query) => (query.state.data?.status === 'cloning' ? 1000 : false),
  });

  const abort = useMutation({
    // The abort route returns the terminal `OperationStatus` (200) or a not-found body (404).
    mutationFn: async () => {
      const res = await client.repos.abort.$post({ json: { repoId } });
      return res.json();
    },
    onSuccess: (data) => {
      if ('status' in data) queryClient.setQueryData(['clone-status', repoId], data);
    },
  });

  const status: CloneStatus = statusQuery.data?.status ?? 'cloning';

  return (
    <GettingReadyView
      repoId={repoId}
      status={status}
      errorKind={statusQuery.data?.error?.kind}
      onAbort={() => abort.mutate()}
      aborting={abort.isPending}
      onRetry={onRetry}
      onBack={onBack}
    />
  );
}
