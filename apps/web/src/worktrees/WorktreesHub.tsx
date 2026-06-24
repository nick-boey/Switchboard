import { Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toRepoId, type RepoTarget } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { Button } from '../ui/controls';
import { StatusLight } from '../ui/lamp';
import { Card } from '../ui/surface';
import { SectionTitle } from '../ui/typography';
import { Worktrees } from './Worktrees';

/**
 * The worktrees hub (design Decision 6) — the centre of the app. Lists the cloned repositories and,
 * on selecting one, shows its worktrees (the create / list / delete slice). The repo drawer chrome
 * is `repo-clone-browse` / `ui-prototypes-mvp`'s; this contributes the per-repo worktree sections.
 */
export interface WorktreesHubProps {
  client?: SwitchboardClient;
}

export function WorktreesHub({ client: injected }: WorktreesHubProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);
  const [selected, setSelected] = useState<string | null>(null);

  const cloned = useQuery({
    queryKey: ['cloned-repos'],
    queryFn: async (): Promise<{ repos: RepoTarget[] }> => {
      const res = await client.repos.cloned.$get();
      if (!res.ok) throw new Error(`cloned repos failed: ${res.status}`);
      return res.json();
    },
  });

  if (selected) {
    return (
      <Stack gap="md" data-testid="worktrees-hub">
        <Button intent="subtle" onClick={() => setSelected(null)} data-testid="wt-hub-back">
          ← Repositories
        </Button>
        <Worktrees repoId={selected} client={client} />
      </Stack>
    );
  }

  const repos = cloned.data?.repos ?? [];
  return (
    <Stack gap="md" data-testid="worktrees-hub">
      <SectionTitle>Repositories</SectionTitle>
      {cloned.isLoading && (
        <Group gap={8}>
          <StatusLight tone="yellow" size={11} label="loading" />
          <Text fz="sm" c="dimmed">
            Loading cloned repositories…
          </Text>
        </Group>
      )}
      {!cloned.isLoading && repos.length === 0 && (
        <Card data-testid="worktrees-hub-empty">
          <Text fz="sm" c="dimmed">
            No repositories cloned yet. Clone one from New repository to add worktrees.
          </Text>
        </Card>
      )}
      <Stack gap="xs">
        {repos.map((r) => {
          const id = toRepoId(r);
          return (
            <UnstyledButton
              key={id}
              data-testid={`wt-hub-repo-${r.owner}-${r.repo}`}
              onClick={() => setSelected(id)}
              style={{
                fontFamily: 'monospace',
                fontSize: 'var(--mantine-font-size-sm)',
                fontWeight: 600,
              }}
            >
              {id}
            </UnstyledButton>
          );
        })}
      </Stack>
    </Stack>
  );
}
