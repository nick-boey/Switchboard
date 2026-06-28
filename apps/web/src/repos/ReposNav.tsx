import { Stack, UnstyledButton } from '@mantine/core';
import { toRepoId, type RepoTarget } from '@switchboard/shared';
import { Button } from '../ui/controls';
import { SectionTitle } from '../ui/typography';
import type { RepoOrgGroup } from './group-repos';

export interface ReposNavProps {
  /** Org-grouped repositories from a resolved list (empty groups → only "New repository"). */
  groups: RepoOrgGroup[];
  /** Activate a repository's deep-link (navigate home + scroll its section into view). */
  onSelectRepo: (target: RepoTarget) => void;
  /** Open the new-repository (clone) flow. */
  onNewRepository: () => void;
}

/**
 * The presentational sidebar navigation (design "Presentational view + container split"): one
 * subheading per organisation with one deep-link button per repository (shared org-then-repo order),
 * and the "New repository" action pinned to the bottom of the rail. "New repository" always renders;
 * repository buttons render only from the supplied resolved-list groups, so empty groups (the empty
 * list, and — via `AppShell` — the loading/failed list) collapse to a "New repository"-only rail.
 */
export function ReposNav({ groups, onSelectRepo, onNewRepository }: ReposNavProps) {
  return (
    <Stack gap="lg" h="100%" data-testid="repos-nav">
      {groups.map((group) => (
        <Stack gap={6} key={group.owner}>
          <SectionTitle data-testid={`nav-org:${group.owner}`}>{group.owner}</SectionTitle>
          <Stack gap={2}>
            {group.repos.map((target) => (
              <UnstyledButton
                key={toRepoId(target)}
                onClick={() => onSelectRepo(target)}
                data-testid={`nav-repo:${toRepoId(target)}`}
                style={{
                  fontFamily: 'monospace',
                  fontSize: 'var(--mantine-font-size-sm)',
                  fontWeight: 600,
                  padding: '3px 0',
                }}
              >
                {target.repo}
              </UnstyledButton>
            ))}
          </Stack>
        </Stack>
      ))}
      <Button
        intent="primary"
        fullWidth
        mt="auto"
        onClick={onNewRepository}
        data-testid="nav-new-repository"
      >
        New repository
      </Button>
    </Stack>
  );
}
