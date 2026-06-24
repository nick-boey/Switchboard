import { Box, Group, Stack, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RepoListResponse } from '@switchboard/shared';
import { createSwitchboardClient, type SwitchboardClient } from '../api/client';
import { Button, AutocompleteSelector, SegmentedToggle, TextField } from '../ui/controls';
import { StatusLight } from '../ui/lamp';
import { Card } from '../ui/surface';
import { SectionTitle } from '../ui/typography';
import {
  cloneTargetFromSelection,
  cloneTargetFromUrl,
  isOwnerValid,
  isRepoValid,
  reposForOwner,
  selectableOwners,
} from './repo-selection';

/**
 * The production **New repository** screen (design Decision 7), ported from the
 * `ui-prototypes-mvp` prototype (not imported — the quarantine holds). A GitHub · Local source
 * toggle (Local disabled for the MVP) over Select repository · From URL, validated against the
 * live `github-repos` listing; an unconfigured PAT degrades to a clear empty state. Clone hands
 * the resolved `<owner>/<repo>` to `onClone`, which the flow turns into a tracked clone.
 */

type Source = 'github' | 'local';
type Method = 'select' | 'url';

export interface NewRepositoryViewProps {
  /** The repo-list response; `undefined` while the query is loading. */
  listing: RepoListResponse | undefined;
  onClone?: (repoId: string) => void;
  // Seed initial UI state (stories/tests).
  initialSource?: Source;
  initialMethod?: Method;
  initialOwner?: string;
  initialRepo?: string;
  initialUrl?: string;
}

/** A green/red validity dot for an input's right edge. */
function Validity({ ok }: { ok: boolean }) {
  return (
    <Box pr={4} style={{ lineHeight: 0 }}>
      <StatusLight tone={ok ? 'green' : 'red'} size={10} label={ok ? 'valid' : 'not found'} />
    </Box>
  );
}

/** Left chevron glyph (no icon library). */
function ChevronLeft() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12.5 5 L7.5 10 L12.5 15" />
    </svg>
  );
}

function UnconfiguredNotice({ status }: { status: Exclude<RepoListResponse['status'], 'ok'> }) {
  const message =
    status === 'not-configured'
      ? 'GitHub is not configured. Add a fine-grained PAT to ~/.switchboard to browse and clone your repositories.'
      : status === 'unauthorized'
        ? 'Your GitHub token was rejected. Update the PAT in ~/.switchboard.'
        : status === 'rate-limited'
          ? 'GitHub rate limit reached. Try again later.'
          : 'GitHub returned no accessible repositories.';
  return (
    <Card title="GitHub" data-testid="github-unconfigured">
      <Group gap={8} wrap="nowrap" align="flex-start">
        <StatusLight tone="yellow" size={11} label="not configured" />
        <Text fz="sm" c="dimmed">
          {message}
        </Text>
      </Group>
    </Card>
  );
}

/** Editable owner + repository selectors, validated against the listing. */
function SelectRepository({
  listing,
  owner,
  setOwner,
  repo,
  setRepo,
  onClone,
}: {
  listing: RepoListResponse | undefined;
  owner: string;
  setOwner: (v: string) => void;
  repo: string;
  setRepo: (v: string) => void;
  onClone?: (repoId: string) => void;
}) {
  const owners = selectableOwners(listing).map((o) => o.login);
  const ownerOk = isOwnerValid(listing, owner);
  const repos = reposForOwner(listing, owner);
  const repoOk = isRepoValid(listing, owner, repo);
  const target = cloneTargetFromSelection(listing, owner, repo);
  return (
    <Card title="Select a repository">
      <Stack gap="sm">
        <AutocompleteSelector
          label="Owner"
          placeholder="Your account or organisations"
          data={owners}
          value={owner}
          onChange={(v) => {
            setOwner(v);
            setRepo('');
          }}
          rightSection={owner ? <Validity ok={ownerOk} /> : null}
          error={owner && !ownerOk ? 'No access to this owner' : undefined}
          data-testid="owner-input"
        />
        <AutocompleteSelector
          label="Repository"
          placeholder={ownerOk ? 'Pick or type a repository' : 'Choose an owner first'}
          data={repos}
          value={repo}
          onChange={setRepo}
          disabled={!ownerOk}
          rightSection={repo ? <Validity ok={repoOk} /> : null}
          error={repo && !repoOk ? 'Not a repository for this owner' : undefined}
          data-testid="repo-input"
        />
        <Button
          fullWidth
          disabled={!target}
          data-testid="clone-button"
          onClick={() => target && onClone?.(target)}
        >
          Clone
        </Button>
      </Stack>
    </Card>
  );
}

/** One validated URL/bare-owner-repo field with a parsed preview. */
function FromUrl({
  url,
  setUrl,
  onClone,
}: {
  url: string;
  setUrl: (v: string) => void;
  onClone?: (repoId: string) => void;
}) {
  const target = cloneTargetFromUrl(url);
  const valid = target !== null;
  return (
    <Card title="From URL">
      <Stack gap="sm">
        <TextField
          label="Repository URL"
          placeholder="https://github.com/owner/repo  ·  owner/repo"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          rightSection={url ? <Validity ok={valid} /> : null}
          error={
            url && !valid ? 'Use https://github.com/<owner>/<repo> or <owner>/<repo>' : undefined
          }
          data-testid="url-input"
        />
        <Group
          gap={6}
          wrap="nowrap"
          align="center"
          style={{ minHeight: 18 }}
          data-testid="repo-preview"
        >
          {target && (
            <>
              <Text fz="xs" c="dimmed">
                Clones
              </Text>
              <Text fz="xs" ff="monospace" fw={700}>
                {target}
              </Text>
            </>
          )}
        </Group>
        <Button
          fullWidth
          disabled={!valid}
          data-testid="clone-button"
          onClick={() => target && onClone?.(target)}
        >
          Clone
        </Button>
      </Stack>
    </Card>
  );
}

/** Local repo creation — deferred for the MVP (sketched, disabled). */
function LocalRepo() {
  return (
    <Card title="New local repository" data-testid="local-repo">
      <Stack gap="sm">
        <Group gap={8} wrap="nowrap" align="center">
          <StatusLight tone="yellow" size={10} label="deferred" />
          <Text fz="xs" c="dimmed">
            Deferred for the MVP — creating local repositories isn’t enabled yet.
          </Text>
        </Group>
        <TextField label="Repository name" placeholder="my-project" disabled />
        <Button fullWidth disabled>
          Create repository
        </Button>
      </Stack>
    </Card>
  );
}

export function NewRepositoryView({
  listing,
  onClone,
  initialSource = 'github',
  initialMethod = 'select',
  initialOwner = '',
  initialRepo = '',
  initialUrl = '',
}: NewRepositoryViewProps) {
  const [source, setSource] = useState<Source>(initialSource);
  const [method, setMethod] = useState<Method>(initialMethod);
  const [owner, setOwner] = useState(initialOwner);
  const [repo, setRepo] = useState(initialRepo);
  const [url, setUrl] = useState(initialUrl);

  const header = (
    <Group gap="xs" wrap="nowrap" align="center">
      <Box component="span" c="dimmed" style={{ lineHeight: 0 }} aria-hidden>
        <ChevronLeft />
      </Box>
      <Text fz="lg" fw={700}>
        New repository
      </Text>
    </Group>
  );

  return (
    <Stack gap="md" maw={560} mx="auto" w="100%" data-testid="new-repository">
      {header}
      <SegmentedToggle
        fullWidth
        value={source}
        onChange={setSource}
        data-testid="source-toggle"
        options={[
          { value: 'github', label: 'GitHub' },
          { value: 'local', label: 'Local', disabled: true },
        ]}
      />
      {source === 'local' ? (
        <LocalRepo />
      ) : listing === undefined ? (
        <Card title="GitHub" data-testid="github-loading">
          <Group gap={8} wrap="nowrap">
            <StatusLight tone="yellow" size={11} label="connecting" />
            <Text fz="sm" c="dimmed">
              Connecting to GitHub…
            </Text>
          </Group>
        </Card>
      ) : listing.status !== 'ok' ? (
        <UnconfiguredNotice status={listing.status} />
      ) : (
        <Stack gap="md">
          <SegmentedToggle
            fullWidth
            value={method}
            onChange={setMethod}
            data-testid="method-toggle"
            options={[
              { value: 'select', label: 'Select repository' },
              { value: 'url', label: 'From URL' },
            ]}
          />
          {method === 'select' ? (
            <SelectRepository
              listing={listing}
              owner={owner}
              setOwner={setOwner}
              repo={repo}
              setRepo={setRepo}
              onClone={onClone}
            />
          ) : (
            <FromUrl url={url} setUrl={setUrl} onClone={onClone} />
          )}
        </Stack>
      )}
      <SectionTitle>Local source is disabled for the MVP</SectionTitle>
    </Stack>
  );
}

export interface NewRepositoryProps {
  client?: SwitchboardClient;
  onClone?: (repoId: string) => void;
}

/** Container: fetches the repo-list via TanStack Query and drives the view. */
export function NewRepository({ client: injected, onClone }: NewRepositoryProps) {
  const client = useMemo(() => injected ?? createSwitchboardClient(), [injected]);
  const repos = useQuery({
    queryKey: ['github-repos'],
    queryFn: async (): Promise<RepoListResponse> => {
      const res = await client.repos.github.$get();
      if (!res.ok) throw new Error(`repo list failed: ${res.status}`);
      return res.json();
    },
  });
  return <NewRepositoryView listing={repos.data} onClone={onClone} />;
}
