import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorSwatch, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { switchboardTokens } from './theme';

/**
 * Token gallery for the '50s retro switchboard theme (design Decision 7): palette swatches and
 * the geometric wordmark type. Tokens only — the full visual treatment lands in
 * `ui-prototypes-mvp`.
 */
function ThemeTokens() {
  const theme = useMantineTheme();
  const families = ['bakelite', 'patina', 'brass', 'signal'] as const;
  return (
    <Stack gap="lg" p="md" maw={640}>
      <Title order={2} style={{ letterSpacing: switchboardTokens.wordmarkTracking }}>
        SWITCHBOARD
      </Title>
      {families.map((name) => (
        <Stack key={name} gap={4}>
          <Text fw={700} tt="uppercase" fz="sm">
            {name}
          </Text>
          <Group gap={6}>
            {theme.colors[name].map((shade, i) => (
              <ColorSwatch key={i} color={shade} radius="sm" size={28} />
            ))}
          </Group>
        </Stack>
      ))}
      <Text>The quick brown fox jumps over the lazy dog — geometric sans.</Text>
    </Stack>
  );
}

const meta = {
  title: 'Foundations/Theme',
  component: ThemeTokens,
} satisfies Meta<typeof ThemeTokens>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Tokens: Story = {};
