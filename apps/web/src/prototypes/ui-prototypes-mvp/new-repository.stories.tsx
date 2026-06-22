import {
  ActionIcon,
  Autocomplete,
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  useComputedColorScheme,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  AppFrame,
  DeviceFrame,
  EmbossedLabel,
  flat,
  Panel,
  Plug,
  SegmentedToggle,
  StatusLight,
} from './kit';

/**
 * The **New repository** page — reached from the drawer's "New repository" button. A guided *clone /
 * create* flow, not a repo browser. A source toggle (GitHub · Local) sits on top; Local is **deferred
 * for the MVP** (disabled). Under GitHub a second toggle chooses how to pick the repo:
 *
 *   Select repository → editable Organisation dropdown (your orgs, validated) + editable Repository
 *                       dropdown (the repos in that org); Clone is enabled once both resolve.
 *   From URL          → one validated field accepting `https://github.com/<org>/<repo>` or `<org>/<repo>`.
 *
 * Cloning itself no longer lives here: clicking Clone takes you to the repository page, which shows a
 * **"getting ready"** state (saga-driven — retried / abortable) until the clone completes. The
 * `GettingReady` story sketches that destination. Static fake data only.
 *
 * Click actions:
 *   ‹ back            → back to the hub
 *   GitHub / Local    → choose the source (Local disabled for the MVP)
 *   Select / From URL → choose how to identify the GitHub repo
 *   Clone             → start the clone → repository page in its "getting ready" state
 */

// --- Fake data --------------------------------------------------------------

/** The signed-in user's organisations and the repositories under each (what the dropdowns offer). */
const ORG_REPOS: Record<string, string[]> = {
  'nick-boey': ['switchboard', 'dotfiles', 'operator-blog'],
  acme: ['widget-factory', 'design-tokens', 'infra'],
  octocat: ['Hello-World', 'Spoon-Knife'],
};
const ORGS = Object.keys(ORG_REPOS);

/** Accept `https://github.com/<org>/<repo>(.git)` or a bare `<org>/<repo>`; null if it doesn't parse. */
function parseRepoUrl(input: string): { owner: string; repo: string } | null {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

// --- Small pieces -----------------------------------------------------------

/** A left-pointing chevron for the back button — no icon library, so an inline glyph. */
const ChevronLeft = () => (
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

/** A validity dot for an input's right edge — green when the value resolves, red when it doesn't. */
function Validity({ ok }: { ok: boolean }) {
  return (
    <Box pr={4} style={{ lineHeight: 0 }}>
      <StatusLight tone={ok ? 'green' : 'red'} size={10} label={ok ? 'valid' : 'not found'} />
    </Box>
  );
}

// --- GitHub · Select repository ---------------------------------------------

/** Editable Organisation + Repository dropdowns, both validated against the user's GitHub access. */
function SelectRepository() {
  const [org, setOrg] = useState('nick-boey');
  const [repo, setRepo] = useState('');
  const orgValid = ORGS.includes(org);
  const repos = orgValid ? ORG_REPOS[org] : [];
  const repoValid = repos.includes(repo);
  return (
    <Panel>
      <EmbossedLabel>Select a repository</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <Autocomplete
          size="sm"
          label="Organisation"
          placeholder="Your organisations"
          data={ORGS}
          value={org}
          onChange={(v) => {
            setOrg(v);
            setRepo('');
          }}
          rightSection={org ? <Validity ok={orgValid} /> : null}
          error={org && !orgValid ? 'No access to this organisation' : undefined}
          comboboxProps={{ withinPortal: false }}
        />
        <Autocomplete
          size="sm"
          label="Repository"
          placeholder={orgValid ? 'Pick or type a repository' : 'Choose an organisation first'}
          data={repos}
          value={repo}
          onChange={setRepo}
          disabled={!orgValid}
          rightSection={repo ? <Validity ok={repoValid} /> : null}
          error={repo && !repoValid ? 'Not a repository in this organisation' : undefined}
          comboboxProps={{ withinPortal: false }}
        />
        <Button fullWidth disabled={!(orgValid && repoValid)}>
          Clone
        </Button>
      </Stack>
    </Panel>
  );
}

// --- GitHub · From URL ------------------------------------------------------

/** One validated field that accepts a full GitHub URL or a bare owner/repo, with a parsed preview. */
function FromUrl() {
  const [url, setUrl] = useState('');
  const parsed = parseRepoUrl(url);
  const valid = parsed !== null;
  return (
    <Panel>
      <EmbossedLabel>From URL</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <TextInput
          size="sm"
          label="Repository URL"
          placeholder="https://github.com/owner/repo  ·  owner/repo"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
          rightSection={url ? <Validity ok={valid} /> : null}
          error={url && !valid ? 'Use https://github.com/<org>/<repo> or <org>/<repo>' : undefined}
        />
        <Group gap={6} wrap="nowrap" align="center" style={{ minHeight: 18 }}>
          {parsed && (
            <>
              <Text fz="xs" c="dimmed">
                Clones
              </Text>
              <Text fz="xs" ff="monospace" fw={700}>
                {parsed.owner}/{parsed.repo}
              </Text>
            </>
          )}
        </Group>
        <Button fullWidth disabled={!valid}>
          Clone
        </Button>
      </Stack>
    </Panel>
  );
}

// --- Local (deferred for the MVP) -------------------------------------------

/** Create a brand-new local repository. Deferred for the MVP — sketched so the design is on record. */
function LocalRepo() {
  const [name, setName] = useState('');
  return (
    <Panel>
      <EmbossedLabel>New local repository</EmbossedLabel>
      <Stack gap="sm" mt="sm">
        <Group gap={8} wrap="nowrap" align="center">
          <StatusLight tone="yellow" size={10} />
          <Text fz="xs" c="dimmed">
            Deferred for the MVP — creating local repositories isn’t enabled yet.
          </Text>
        </Group>
        <TextInput
          size="sm"
          label="Repository name"
          placeholder="my-project"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          disabled
        />
        <Text fz="xs" c="dimmed">
          Creates an empty repo in{' '}
          <Text span ff="monospace">
            ~/.switchboard/repos/local/&lt;name&gt;
          </Text>
          . GitHub features (PRs, clone status) stay disabled until you push it to a remote.
        </Text>
        <Button fullWidth disabled>
          Create repository
        </Button>
      </Stack>
    </Panel>
  );
}

// --- Screen -----------------------------------------------------------------

interface ScreenProps {
  source?: 'github' | 'local';
  method?: 'select' | 'url';
}

function NewRepository({
  source: initialSource = 'github',
  method: initialMethod = 'select',
}: ScreenProps) {
  const [source, setSource] = useState<'github' | 'local'>(initialSource);
  const [method, setMethod] = useState<'select' | 'url'>(initialMethod);

  const status = (
    <Group gap={8} wrap="nowrap">
      <StatusLight tone="green" size={11} />
      <Text fz="xs" fw={600}>
        nick-boey
      </Text>
    </Group>
  );

  const header = (
    <Group gap="xs" wrap="nowrap" align="center">
      <ActionIcon variant="subtle" color="gray" aria-label="Back to worktrees">
        <ChevronLeft />
      </ActionIcon>
      <Text fz="lg" fw={700}>
        New repository
      </Text>
    </Group>
  );

  return (
    <AppFrame status={status}>
      <Stack gap="md" maw={560} mx="auto" w="100%">
        {header}
        <SegmentedToggle
          fullWidth
          value={source}
          onChange={setSource}
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'local', label: 'Local', disabled: true },
          ]}
        />
        {source === 'github' ? (
          <Stack gap="md">
            <SegmentedToggle
              fullWidth
              value={method}
              onChange={setMethod}
              options={[
                { value: 'select', label: 'Select repository' },
                { value: 'url', label: 'From URL' },
              ]}
            />
            {method === 'select' ? <SelectRepository /> : <FromUrl />}
          </Stack>
        ) : (
          <LocalRepo />
        )}
      </Stack>
    </AppFrame>
  );
}

/**
 * The repository page in its **getting ready** state — where Clone actually lands. The clone runs as a
 * saga (retried on failure, abortable); the page stands in as the repo until it's ready. Its real home
 * is the worktrees hub; sketched here so the clone flow's destination is visible.
 */
function GettingReady({ repo = 'acme/widget-factory' }: { repo?: string }) {
  const status = (
    <Group gap={8} wrap="nowrap">
      <StatusLight tone="yellow" size={11} />
      <Text fz="xs" fw={600}>
        getting ready
      </Text>
    </Group>
  );
  return (
    <AppFrame status={status}>
      <Stack align="center" gap="md" py={56}>
        <Plug status="working" size={30} label="cloning" />
        <Text fz="sm" fw={700}>
          Getting ready…
        </Text>
        <Text fz="xs" c="dimmed" ta="center" maw={300}>
          Cloning{' '}
          <Text span ff="monospace">
            {repo}
          </Text>{' '}
          into{' '}
          <Text span ff="monospace">
            ~/.switchboard/repos
          </Text>
          . This page becomes the repository once it’s ready.
        </Text>
        <Button variant="default" color="signal">
          Abort clone
        </Button>
      </Stack>
    </AppFrame>
  );
}

// --- Meta + framing ---------------------------------------------------------

const meta = {
  ...definePrototypeMeta({
    component: NewRepository,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof NewRepository>;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = 390;
const DESKTOP = 1120;

function Frame({ width, children }: { width: number; children: ReactNode }) {
  const dark = useComputedColorScheme('light') === 'dark';
  return (
    <Box
      p="lg"
      style={{ display: 'flex', justifyContent: 'center', background: flat(dark).ground }}
    >
      <DeviceFrame width={width}>{children}</DeviceFrame>
    </Box>
  );
}

/** Mobile — clone a GitHub repo by selecting an organisation and repository. */
export const Mobile: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository />
    </Frame>
  ),
};

/** From URL — paste a GitHub URL or a bare owner/repo; the field validates and previews the target. */
export const MobileFromUrl: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository method="url" />
    </Frame>
  ),
};

/** Local (deferred) — the create-a-local-repo design, disabled for the MVP. */
export const MobileLocal: Story = {
  render: () => (
    <Frame width={PHONE}>
      <NewRepository source="local" />
    </Frame>
  ),
};

/** Getting ready — the repository page after Clone: the saga runs while the page says "getting ready". */
export const MobileGettingReady: Story = {
  render: () => (
    <Frame width={PHONE}>
      <GettingReady />
    </Frame>
  ),
};

/** Desktop — the same guided flow, centred. */
export const Desktop: Story = {
  render: () => (
    <Frame width={DESKTOP}>
      <NewRepository />
    </Frame>
  ),
};
