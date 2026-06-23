import { Stack, Title } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FieldLabel, Mono, SectionTitle } from './Type';

/**
 * The type ramp (task 7.1): machine identifiers render monospace, field/section labels use the
 * uppercase tracked micro-label, and headings/body follow the geometric ramp. The play function
 * asserts the computed families and the tracked-uppercase rendering in a real browser.
 */
const meta = { title: 'UI/Typography' } satisfies Meta;
export default meta;
type Story = StoryObj;

export const Ramp: Story = {
  render: () => (
    <Stack>
      <Title order={2} data-testid="heading">
        Switchboard
      </Title>
      <SectionTitle data-testid="section">Repositories</SectionTitle>
      <FieldLabel data-testid="label">Personal access token</FieldLabel>
      <Mono data-testid="mono">feature/login · a1b2c3d · ~/.switchboard</Mono>
    </Stack>
  ),
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    expect(getComputedStyle(c.getByTestId('mono')).fontFamily.toLowerCase()).toMatch(/mono/);
    expect(getComputedStyle(c.getByTestId('heading')).fontFamily.toLowerCase()).not.toMatch(/mono/);
    const label = getComputedStyle(c.getByTestId('label'));
    expect(label.textTransform).toBe('uppercase');
    expect(label.letterSpacing).not.toBe('normal');
  },
};
