import { Group, Stack } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { resolvedScheme, schemeTest } from '../../storybook/scheme-test';
import {
  AutocompleteSelector,
  Button,
  type ButtonIntent,
  IconButton,
  SegmentedToggle,
  TextField,
} from './controls';

/**
 * Action + form controls (task 6.1). The play functions assert the four button intents are
 * distinct (destructive reddish, from Signal), a segmented toggle's disabled option is
 * unselectable, the text input shows its invalid state, and the controls resolve in dark.
 */
const meta = { title: 'UI/Controls' } satisfies Meta;
export default meta;
type Story = StoryObj;

const INTENTS: ButtonIntent[] = ['primary', 'secondary', 'destructive', 'subtle'];
const rgbParts = (c: string) => (c.match(/\d+/g) ?? []).map(Number);

/** The four button intents render distinctly; destructive draws from the (red) Signal ramp. */
export const Buttons: Story = {
  render: () => (
    <Group>
      {INTENTS.map((intent) => (
        <Button key={intent} intent={intent} data-testid={`btn-${intent}`}>
          {intent}
        </Button>
      ))}
    </Group>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const bg = (i: ButtonIntent) => getComputedStyle(c.getByTestId(`btn-${i}`)).backgroundColor;
    const colors = INTENTS.map(bg);
    expect(new Set(colors).size).toBe(INTENTS.length);
    const [r, g, b] = rgbParts(bg('destructive'));
    expect(r).toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  },
};

/** A segmented toggle's disabled option cannot be selected. */
export const Toggle: Story = {
  render: () => {
    const onChange = fn();
    return (
      <SegmentedToggle
        value="github"
        onChange={onChange}
        data-testid="toggle"
        options={[
          { value: 'github', label: 'GitHub' },
          { value: 'local', label: 'Local', disabled: true },
        ]}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const local = within(canvasElement).getByRole('button', { name: 'Local' });
    await expect(local).toBeDisabled();
    await userEvent.click(local, { pointerEventsCheck: 0 });
    await expect(local).toHaveAttribute('aria-pressed', 'false');
  },
};

/** The text input presents an invalid (error) state with its message. */
export const InvalidInput: Story = {
  render: () => (
    <Stack>
      <TextField label="Repository URL" defaultValue="nope" error="Use <org>/<repo>" />
      <AutocompleteSelector label="Organisation" data={[]} error="No access to this organisation" />
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByText('Use <org>/<repo>')).toBeInTheDocument();
    await expect(c.getByText('No access to this organisation')).toBeInTheDocument();
  },
};

/** Icon button — resting and disabled. */
export const IconButtons: Story = {
  render: () => (
    <Group>
      <IconButton label="Delete" color="signal" icon={<span>×</span>} data-testid="icon-resting" />
      <IconButton
        label="Delete"
        color="signal"
        icon={<span>×</span>}
        disabled
        data-testid="icon-disabled"
      />
    </Group>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await expect(c.getByTestId('icon-resting')).toBeEnabled();
    await expect(c.getByTestId('icon-disabled')).toBeDisabled();
  },
};

/** Dark — a filled button resolves its scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark' }),
  render: () => (
    <Button intent="primary" data-testid="btn">
      Clone
    </Button>
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
    const bg = getComputedStyle(within(canvasElement).getByTestId('btn')).backgroundColor;
    expect(rgbParts(bg).length).toBeGreaterThanOrEqual(3);
  },
};
