import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { OperationStatus } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { NewRepository } from './NewRepository';
import { GettingReady } from './GettingReady';

/**
 * The repo-clone-browse flow (design Decision 6): the New repository screen starts a tracked clone
 * and the app navigates to the getting-ready screen, which polls to ready. Retry re-starts a fresh
 * clone; back returns to New repository. A minimal state-based navigator (no router dependency).
 */
export interface ReposFlowProps {
  client?: SwitchboardClient;
}

export function ReposFlow({ client: injected }: ReposFlowProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);
  const [repoId, setRepoId] = useState<string | null>(null);

  const startClone = useMutation({
    mutationFn: async (target: string): Promise<OperationStatus> => {
      const res = await client.repos.clone.$post({ json: { target } });
      if (!res.ok) throw new Error(`clone failed: ${res.status}`);
      return res.json();
    },
    onSuccess: (status) => setRepoId(status.repoId),
  });

  if (repoId) {
    return (
      <GettingReady
        repoId={repoId}
        client={client}
        onRetry={() => startClone.mutate(repoId)}
        onBack={() => setRepoId(null)}
      />
    );
  }
  return <NewRepository client={client} onClone={(target) => startClone.mutate(target)} />;
}
