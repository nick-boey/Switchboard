import { Group } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest } from '../../storybook/scheme-test';
import { Plug, type PlugStatus } from './Plug';

/**
 * The session plug (tasks 4.1–4.4). The play functions assert the five states are distinguishable
 * (with `error` from the Signal ramp), the actionable affordance (off→launch, live→stop, working
 * guarded), and dark-scheme resolution of the scheme-aware neutral disc.
 */
const meta = {
  title: 'UI/Plug',
  component: Plug,
  args: { label: 'feature-x' },
} satisfies Meta<typeof Plug>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL: PlugStatus[] = ['running', 'working', 'error', 'idle', 'off'];
const disc = (el: HTMLElement) => el.querySelector('[data-sb-plug-disc]') as Element;

/** All five states render with distinct disc colours; `error` draws from Signal. */
export const States: Story = {
  render: () => (
    <Group>
      {ALL.map((s) => (
        <Plug key={s} status={s} label={s} data-testid={`plug-${s}`} />
      ))}
    </Group>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const colors = ALL.map(
      (s) => getComputedStyle(disc(c.getByTestId(`plug-${s}`))).backgroundColor,
    );
    expect(new Set(colors).size).toBe(ALL.length);
    expect(getComputedStyle(disc(c.getByTestId('plug-error'))).backgroundColor).toBe(
      'rgb(224, 56, 44)',
    );
  },
};

/** An `off` plug requests a launch on activation. */
export const OffLaunches: Story = {
  args: { status: 'off', onActivate: fn(), 'data-testid': 'plug' },
  play: async ({ args, canvasElement }) => {
    const btn = within(canvasElement).getByTestId('plug');
    await expect(btn).toHaveAccessibleName(/start session/i);
    await userEvent.click(btn);
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};

/** A live plug requests a stop on activation. */
export const RunningStops: Story = {
  args: { status: 'running', onActivate: fn(), 'data-testid': 'plug' },
  play: async ({ args, canvasElement }) => {
    const btn = within(canvasElement).getByTestId('plug');
    await expect(btn).toHaveAccessibleName(/stop session/i);
    await userEvent.click(btn);
    await expect(args.onActivate).toHaveBeenCalledTimes(1);
  },
};

/** A `working` plug is guarded — disabled, no activation. */
export const WorkingGuarded: Story = {
  args: { status: 'working', onActivate: fn(), 'data-testid': 'plug' },
  play: async ({ args, canvasElement }) => {
    const btn = within(canvasElement).getByTestId('plug');
    await expect(btn).toBeDisabled();
    await userEvent.click(btn, { pointerEventsCheck: 0 });
    await expect(args.onActivate).not.toHaveBeenCalled();
  },
};

/** Dark — the neutral `idle` disc resolves to the dark `--sb-screw` token. */
export const Dark: Story = {
  args: { status: 'idle', 'data-testid': 'plug' },
  parameters: schemeTest({ colorScheme: 'dark' }),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    const d = disc(within(canvasElement).getByTestId('plug'));
    await waitFor(() =>
      expect(getComputedStyle(d).backgroundColor).toBe('rgba(255, 255, 255, 0.3)'),
    );
  },
};
