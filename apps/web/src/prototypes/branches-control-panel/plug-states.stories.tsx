import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  BRANCH_PLUG_LABEL,
  BranchPlug,
  type BranchPlugState,
  Frame,
} from './parts';
import { Plug, type PlugStatus } from '../../ui/plug';
import { Card } from '../../ui/surface';
import { Button } from '../../ui/controls';

/**
 * The per-branch plug. A branch WITH a worktree keeps the existing session plug (off/running/
 * working/error). A branch WITHOUT a worktree gets the NEW dashed plug; clicking it runs the
 * server-owned create→launch as one operation (creating → launching → running), guarded while in
 * progress.
 */
function Cell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Stack gap={8} align="center" style={{ width: 120 }}>
      {children}
      <Text fz="xs" c="dimmed" ta="center">
        {label}
      </Text>
    </Stack>
  );
}

function Gallery() {
  const session: PlugStatus[] = ['off', 'running', 'working', 'error'];
  const branch: BranchPlugState[] = ['no-worktree', 'creating', 'launching', 'running'];
  return (
    <Frame width={620}>
      <Card>
        <Text fz="sm" fw={700} mb="sm">
          Branch has a worktree — session plug (existing)
        </Text>
        <Group gap="lg" wrap="wrap">
          {session.map((s) => (
            <Cell key={s} label={s}>
              <Plug status={s} size={28} label="branch" onActivate={() => {}} />
            </Cell>
          ))}
        </Group>
      </Card>
      <Card>
        <Text fz="sm" fw={700} mb="sm">
          No worktree — dashed plug + create→launch (new)
        </Text>
        <Group gap="lg" wrap="wrap">
          {branch.map((s) => (
            <Cell key={s} label={BRANCH_PLUG_LABEL[s]}>
              <BranchPlug state={s} size={28} label="branch" onActivate={() => {}} />
            </Cell>
          ))}
        </Group>
      </Card>
    </Frame>
  );
}

function CreateFlow() {
  const [state, setState] = useState<BranchPlugState>('no-worktree');
  const start = () => {
    if (state !== 'no-worktree') return;
    setState('creating');
    window.setTimeout(() => setState('launching'), 1100);
    window.setTimeout(() => setState('running'), 2300);
  };
  return (
    <Frame width={520}>
      <Card>
        <Group gap="md" align="center" wrap="nowrap">
          <BranchPlug state={state} size={30} label="release-2.0" onActivate={start} />
          <Box>
            <Text fz="sm" fw={700} ff="monospace">
              release-2.0
            </Text>
            <Text fz="xs" c="dimmed">
              {BRANCH_PLUG_LABEL[state]}
            </Text>
          </Box>
          <Button intent="subtle" onClick={() => setState('no-worktree')} style={{ marginLeft: 'auto' }}>
            Reset
          </Button>
        </Group>
        <Text fz="xs" c="dimmed" mt="md">
          Click the dashed plug to create the worktree from this branch and start the session — one
          server-owned operation, guarded while it runs.
        </Text>
      </Card>
    </Frame>
  );
}

const meta = {
  ...definePrototypeMeta({ component: Gallery, parameters: { layout: 'fullscreen' } }),
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Gallery_: Story = { name: 'Gallery', render: () => <Gallery /> };
export const CreateFlow_: Story = { name: 'Create flow (interactive)', render: () => <CreateFlow /> };
