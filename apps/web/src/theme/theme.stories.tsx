import type { Meta, StoryObj } from '@storybook/react-vite';
import { ColorSwatch, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import { switchboardTokens } from './theme';

/**
 * Token gallery for the flat '50s switchboard theme (ui-prototypes-mvp Decision 1): the four
 * palette ramps, the flat surface vocabulary, the cobalt/violet indicator status colours, and the
 * geometric wordmark. Surface/indicator swatches read the static light values; the live `--sb-*`
 * variables drive the rendered primitives per scheme.
 */
function ThemeTokens() {
  const theme = useMantineTheme();
  const families = ['bakelite', 'patina', 'brass', 'signal'] as const;
  const { surfaces, indicator } = switchboardTokens;
  const surfaceKeys = ['surface', 'well', 'ground', 'border', 'screw', 'rail'] as const;
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

      <Stack gap={4}>
        <Text fw={700} tt="uppercase" fz="sm">
          flat surfaces (light)
        </Text>
        <Group gap={6}>
          {surfaceKeys.map((key) => (
            <ColorSwatch key={key} color={surfaces.light[key]} radius="sm" size={28} withShadow />
          ))}
        </Group>
      </Stack>

      <Stack gap={4}>
        <Text fw={700} tt="uppercase" fz="sm">
          indicator status (PR open / merged)
        </Text>
        <Group gap={6}>
          <ColorSwatch color={indicator.prOpen.light} radius="sm" size={28} />
          <ColorSwatch color={indicator.prMerged.light} radius="sm" size={28} />
        </Group>
      </Stack>

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
