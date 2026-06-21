import { Box, Button, Group, SimpleGrid, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { EmbossedPanel } from '../../components/EmbossedPanel';
import { JackButton } from '../../components/JackButton';
import type { SwitchboardTokens } from '../../theme/theme';
import { definePrototypeMeta } from '../define-prototype-meta';
import { DeviceFrame, EmbossedLabel, IndicatorLamp, Panel } from './kit';

/**
 * The design-language gallery for `ui-prototypes-mvp` — the living definition of the '50s retro
 * switchboard visual treatment (plan Decision 1). It renders the token palette, the embossed
 * surfaces, the geometric type ramp, and the controls/indicator vocabulary the three flow screens
 * are built from. Sketched here so the "how far to push the metaphor" question is answered against
 * something rendered, not imagined.
 */

function GalleryShell({ children }: { children: ReactNode }) {
  return (
    <Box p="xl" style={{ minHeight: '100vh', background: 'var(--mantine-color-body)' }}>
      <Stack gap="xl" maw={960} mx="auto">
        {children}
      </Stack>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="sm">
      <EmbossedLabel>{title}</EmbossedLabel>
      {children}
    </Stack>
  );
}

const meta = {
  ...definePrototypeMeta({
    component: GalleryShell,
    parameters: { layout: 'fullscreen' },
  }),
} satisfies Meta<typeof GalleryShell>;

export default meta;
type Story = StoryObj<typeof meta>;

const PALETTES = ['bakelite', 'patina', 'brass', 'signal'] as const;

export const Palette: Story = {
  render: () => {
    const theme = useMantineTheme();
    return (
      <GalleryShell>
        <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
          Palette
        </Title>
        {PALETTES.map((name) => (
          <Section key={name} title={name}>
            <SimpleGrid cols={{ base: 5, sm: 10 }} spacing={4}>
              {theme.colors[name].map((shade, i) => (
                <Stack key={i} gap={2} align="center">
                  <Box
                    style={{
                      height: 44,
                      width: '100%',
                      borderRadius: theme.radius.sm,
                      background: shade,
                      boxShadow: 'inset 0 0 0 1px rgba(60,45,20,0.2)',
                    }}
                  />
                  <Text fz={9} c="dimmed">
                    {i}
                  </Text>
                </Stack>
              ))}
            </SimpleGrid>
          </Section>
        ))}
      </GalleryShell>
    );
  },
};

export const Surfaces: Story = {
  render: () => {
    return (
      <GalleryShell>
        <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
          Surfaces
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Panel>
            <EmbossedLabel>Raised panel</EmbossedLabel>
            <Text mt="sm" fz="sm">
              The dominant building block — bakelite ground with the emboss shadow stack. Every
              screen region is a panel.
            </Text>
          </Panel>
          <Panel pressed>
            <EmbossedLabel>Pressed / inset</EmbossedLabel>
            <Text mt="sm" fz="sm">
              Recessed wells hold inputs, lists, and read-outs — the seated, machined feel.
            </Text>
          </Panel>
        </SimpleGrid>
        <Panel>
          <EmbossedLabel>Nested wells</EmbossedLabel>
          <Panel pressed mt="sm">
            <Text fz="sm" ff="monospace">
              A pressed well inside a raised panel — the canonical list / log container.
            </Text>
          </Panel>
        </Panel>

        <EmbossedLabel>
          Dark finish · proposed vs. current primitive (toggle dark to compare)
        </EmbossedLabel>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Panel>
            <Text fw={700} fz="sm" mb={4}>
              Panel (proposed)
            </Text>
            <Text fz="sm">
              Adapts: cream in light, charcoal in dark. The dark finish the gate chose — promote
              into{' '}
              <Text span ff="monospace">
                EmbossedPanel
              </Text>{' '}
              + theme tokens.
            </Text>
          </Panel>
          <EmbossedPanel>
            <Text fw={700} fz="sm" mb={4}>
              EmbossedPanel (current)
            </Text>
            <Text fz="sm">
              Today's production primitive — forced cream in every scheme. Identical in light; stays
              cream in dark.
            </Text>
          </EmbossedPanel>
        </SimpleGrid>
      </GalleryShell>
    );
  },
};

export const Typography: Story = {
  render: () => {
    const theme = useMantineTheme();
    const tokens = theme.other as SwitchboardTokens;
    return (
      <GalleryShell>
        <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
          Type
        </Title>
        <Panel>
          <Stack gap="md">
            <Title
              order={1}
              tt="uppercase"
              style={{ letterSpacing: tokens.wordmarkTracking, fontSize: '2.2rem' }}
            >
              Switchboard
            </Title>
            <Title order={2}>Heading two — patch the line</Title>
            <Title order={3}>Heading three — operator console</Title>
            <Text>
              Body copy in the geometric sans. Mid-century equipment lettering: even strokes,
              generous tracking on labels, tight on running text.
            </Text>
            <Text ff="monospace" fz="sm" c="patina.8">
              monospace · branch/main · 0042ab · claude --remote-control
            </Text>
            <Group gap="sm">
              <EmbossedLabel>Field label</EmbossedLabel>
              <EmbossedLabel>Section</EmbossedLabel>
              <EmbossedLabel>Status</EmbossedLabel>
            </Group>
          </Stack>
        </Panel>
      </GalleryShell>
    );
  },
};

export const Controls: Story = {
  render: () => (
    <GalleryShell>
      <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
        Controls &amp; indicators
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Panel>
          <EmbossedLabel>Jacks</EmbossedLabel>
          <Group mt="md" gap="lg">
            <Stack align="center" gap={6}>
              <JackButton label="Idle line" />
              <Text fz="xs" c="dimmed">
                idle
              </Text>
            </Stack>
            <Stack align="center" gap={6}>
              <JackButton label="Patched line" active />
              <Text fz="xs" c="dimmed">
                patched
              </Text>
            </Stack>
          </Group>
        </Panel>

        <Panel>
          <EmbossedLabel>Indicator lamps</EmbossedLabel>
          <Stack mt="md" gap="xs">
            <Group gap="sm">
              <IndicatorLamp color="patina" lit label="connected" />
              <Text fz="sm">connected</Text>
            </Group>
            <Group gap="sm">
              <IndicatorLamp color="brass" lit label="working" />
              <Text fz="sm">working…</Text>
            </Group>
            <Group gap="sm">
              <IndicatorLamp color="signal" lit label="error" />
              <Text fz="sm">line fault</Text>
            </Group>
            <Group gap="sm">
              <IndicatorLamp color="patina" label="idle" />
              <Text fz="sm" c="dimmed">
                idle
              </Text>
            </Group>
          </Stack>
        </Panel>
      </SimpleGrid>

      <Panel>
        <EmbossedLabel>Buttons</EmbossedLabel>
        <Group mt="md" gap="md">
          <Button>Primary action</Button>
          <Button variant="default">Secondary</Button>
          <Button variant="outline" color="signal">
            Destructive
          </Button>
          <Button variant="subtle">Subtle</Button>
        </Group>
      </Panel>

      <Section title="Device framing">
        <Group align="flex-start" gap="lg" wrap="wrap">
          <DeviceFrame width={300} label="Mobile · 390">
            <Box p="md">
              <Panel>
                <Text fz="sm">Screens are framed like this for the mobile variant.</Text>
              </Panel>
            </Box>
          </DeviceFrame>
        </Group>
      </Section>
    </GalleryShell>
  ),
};
