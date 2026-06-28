import { Button, Stack } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import { toRepoId } from '@switchboard/shared';
import { SectionTitle } from '../ui/typography';
import type { RepoOrgGroup } from './group-repos';

export interface ReposNavProps {
  /** Org-grouped repositories from a resolved list (empty groups → only "New repository"). */
  groups: RepoOrgGroup[];
}

/**
 * The presentational sidebar navigation (design D6): one subheading per organisation with one typed
 * router `Link` per repository (to `/$owner/$repo`, marked active on that route), and the "New
 * repository" `Link` (to `/new-repo`) pinned to the bottom of the rail. The links are URL-driven —
 * clicking one navigates and (for a repo) the route scrolls its home section into view — so the
 * sidebar holds no callbacks. "New repository" always renders; repository links render only from the
 * supplied resolved-list groups, so an empty/loading/failed list collapses to a "New repository"-only
 * rail.
 */
/** Resting repo link. */
const REPO_LINK_STYLE = {
  fontFamily: 'monospace',
  fontSize: 'var(--mantine-font-size-sm)',
  fontWeight: 600,
  padding: '3px 0',
  textDecoration: 'none',
  color: 'inherit',
} as const;

/** Active repo link — the current route's repository, marked with the patina accent + a bar. */
const REPO_LINK_ACTIVE_STYLE = {
  ...REPO_LINK_STYLE,
  fontWeight: 700,
  color: 'var(--mantine-color-patina-6)',
  borderLeft: '2px solid var(--mantine-color-patina-6)',
  paddingLeft: 8,
  marginLeft: -10,
} as const;

export function ReposNav({ groups }: ReposNavProps) {
  return (
    <Stack gap="lg" h="100%" data-testid="repos-nav">
      {groups.map((group) => (
        <Stack gap={6} key={group.owner}>
          <SectionTitle data-testid={`nav-org:${group.owner}`}>{group.owner}</SectionTitle>
          <Stack gap={2}>
            {group.repos.map((target) => (
              <Link
                key={toRepoId(target)}
                to="/$owner/$repo"
                params={{ owner: target.owner, repo: target.repo }}
                data-testid={`nav-repo:${toRepoId(target)}`}
                style={REPO_LINK_STYLE}
                activeProps={{ 'data-active': 'true', style: REPO_LINK_ACTIVE_STYLE }}
              >
                {target.repo}
              </Link>
            ))}
          </Stack>
        </Stack>
      ))}
      <Button
        component={Link}
        to="/new-repo"
        variant="filled"
        color="patina"
        fullWidth
        mt="auto"
        data-testid="nav-new-repository"
        activeProps={{
          'data-active': 'true',
          style: { outline: '2px solid var(--mantine-color-patina-3)', outlineOffset: 2 },
        }}
      >
        New repository
      </Button>
    </Stack>
  );
}
