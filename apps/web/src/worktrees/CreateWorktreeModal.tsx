import { Box, Group, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import type { WorktreeMode } from '@switchboard/shared';
import { AutocompleteSelector, Button, SegmentedToggle, TextField } from '../ui/controls';
import { Card } from '../ui/surface';
import { canCreateWorktree } from './worktree-model';

/**
 * The create-worktree modal (design Decision 6 + Worktrees-hub screen states), ported from the
 * `ui-prototypes-mvp` worktrees prototype — not imported (the quarantine holds). Choose an existing
 * remote branch or a new branch (with a base-branch selector); Create is enabled only for a valid
 * branch selection. The plug stays off — starting Claude Code is `claude-session-launch`'s job.
 */
export interface CreateWorktreeInput {
  branch: string;
  mode: WorktreeMode;
  base?: string;
}

export interface CreateWorktreeModalProps {
  repoId: string;
  /** Existing remote branches to pick from (the existing-branch mode). */
  existingBranches?: string[];
  /** Base branches a new branch can fork from (defaults to the first). */
  baseBranches?: string[];
  initialMode?: WorktreeMode;
  // Seed initial form state (stories / tests).
  initialBranch?: string;
  initialExistingBranch?: string;
  onCreate?: (input: CreateWorktreeInput) => void;
  onCancel?: () => void;
}

export function CreateWorktreeModal({
  repoId,
  existingBranches = [],
  baseBranches = ['main'],
  initialMode = 'new',
  initialBranch = '',
  initialExistingBranch,
  onCreate,
  onCancel,
}: CreateWorktreeModalProps) {
  const [mode, setMode] = useState<WorktreeMode>(initialMode);
  const [newBranch, setNewBranch] = useState(initialBranch);
  const [existingBranch, setExistingBranch] = useState(initialExistingBranch ?? '');
  const [base, setBase] = useState(baseBranches[0] ?? 'main');

  const branch = mode === 'new' ? newBranch : existingBranch;
  const valid = canCreateWorktree({ mode, branch });

  const submit = (): void => {
    if (!valid) return;
    onCreate?.({ branch, mode, base: mode === 'new' ? base || undefined : undefined });
  };

  return (
    <Card title="New worktree" data-testid="create-worktree-modal">
      <Stack gap="sm">
        <Group gap={6}>
          <Text fz="xs" c="dimmed">
            in
          </Text>
          <Text fz="xs" ff="monospace" fw={700}>
            {repoId}
          </Text>
        </Group>

        <SegmentedToggle
          fullWidth
          value={mode}
          onChange={setMode}
          data-testid="wt-mode-toggle"
          options={[
            { value: 'new', label: 'New branch' },
            { value: 'existing-remote', label: 'Existing branch' },
          ]}
        />

        {mode === 'new' ? (
          <>
            <TextField
              label="Branch name"
              placeholder="feature/remote-control"
              value={newBranch}
              onChange={(e) => setNewBranch(e.currentTarget.value)}
              data-testid="wt-branch-input"
            />
            <AutocompleteSelector
              label="Base branch"
              placeholder="main"
              data={baseBranches}
              value={base}
              onChange={setBase}
              comboboxProps={{ withinPortal: false }}
              data-testid="wt-base-select"
            />
          </>
        ) : (
          <AutocompleteSelector
            label="Branch"
            placeholder="Pick or type a remote branch"
            data={existingBranches}
            value={existingBranch}
            onChange={setExistingBranch}
            comboboxProps={{ withinPortal: false }}
            data-testid="wt-existing-select"
          />
        )}

        <Box>
          <Button fullWidth disabled={!valid} onClick={submit} data-testid="wt-create-button">
            Create worktree
          </Button>
        </Box>
        <Button intent="subtle" fullWidth onClick={onCancel} data-testid="wt-cancel-button">
          Cancel
        </Button>
      </Stack>
    </Card>
  );
}
