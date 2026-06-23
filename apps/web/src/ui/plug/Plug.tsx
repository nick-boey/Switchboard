import { UnstyledButton, useMantineTheme } from '@mantine/core';

/**
 * The session plug (ui-prototypes-mvp Decisions 3 + the affordance contract): a thin outer ring
 * around a thicker inner disc communicating a worktree's Claude Code session as one of five states.
 * Unlike the display-only lamps, the plug is **actionable** — an `off` plug requests a launch, a
 * live (non-`off`) plug requests a stop, and a transient `working` plug is guarded (disabled). The
 * concrete launch/stop wiring is the consuming feature change's job (claude-session-launch).
 */
export type PlugStatus = 'running' | 'working' | 'error' | 'idle' | 'off';

/** What activating the plug requests for each state (`null` = guarded, no action). */
const ACTION: Record<PlugStatus, 'start' | 'stop' | null> = {
  off: 'start',
  running: 'stop',
  idle: 'stop',
  error: 'stop',
  working: null,
};

export interface PlugProps {
  status?: PlugStatus;
  /** Outer ring diameter in px. */
  size?: number;
  /** Session/worktree label for the accessible name (e.g. the branch). */
  label?: string;
  /** Activate handler; when omitted the plug is a display-only status image. */
  onActivate?: () => void;
  'data-testid'?: string;
}

export function Plug({
  status = 'idle',
  size = 20,
  label,
  onActivate,
  'data-testid': testId,
}: PlugProps) {
  const theme = useMantineTheme();
  const disc: Record<PlugStatus, string> = {
    running: theme.colors.patina[6],
    working: theme.colors.brass[6],
    error: theme.colors.signal[6],
    idle: 'var(--sb-screw)',
    off: 'transparent',
  };

  const action = ACTION[status];
  const actionable = Boolean(onActivate);
  const guarded = status === 'working';
  const verb = action === 'start' ? 'start session' : action === 'stop' ? 'stop session' : null;
  const name = `${label ?? 'Session'}: ${status}${verb && actionable ? `, ${verb}` : ''}`;

  const visual = (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1.5px solid var(--sb-screw)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 'none',
      }}
    >
      <span
        data-sb-plug-disc=""
        style={{
          width: size * 0.56,
          height: size * 0.56,
          borderRadius: '50%',
          background: disc[status],
          border: status === 'off' ? '1px solid var(--sb-screw)' : undefined,
        }}
      />
    </span>
  );

  if (!actionable) {
    return (
      <span
        role="img"
        aria-label={name}
        data-testid={testId}
        data-status={status}
        style={{ display: 'inline-flex' }}
      >
        {visual}
      </span>
    );
  }

  return (
    <UnstyledButton
      aria-label={name}
      data-testid={testId}
      data-status={status}
      disabled={guarded}
      onClick={guarded ? undefined : onActivate}
      style={{
        display: 'inline-flex',
        cursor: guarded ? 'not-allowed' : 'pointer',
        borderRadius: '50%',
      }}
    >
      {visual}
    </UnstyledButton>
  );
}
