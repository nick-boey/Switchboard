import { Box, Button, Group, SimpleGrid, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { EmbossedPanel } from '../../components/EmbossedPanel';
import type { SwitchboardTokens } from '../../theme/theme';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  DeviceFrame,
  EmbossedLabel,
  IndicatorLamp,
  Panel,
  Plug,
  SectionTitle,
  type PlugStatus,
} from './kit';

/**
 * The design-language gallery for `ui-prototypes-mvp` — the living definition of the visual
 * treatment (plan Decision 1). This is the FLAT, abstract take: same '50s switchboard influences
 * (palette, plug + screw + nameplate motifs, geometric type) but rendered with flat surfaces and
 * light outlines instead of heavy emboss. Sketched here so the look is judged against something
 * rendered, not imagined.
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
      <SectionTitle>{title}</SectionTitle>
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
            <EmbossedLabel>Raised card</EmbossedLabel>
            <Text mt="sm" fz="sm">
              The building block: a slightly rounded flat surface, a 1px outline, and four corner
              screws. Inset titles live only inside cards like this.
            </Text>
          </Panel>
          <Panel pressed>
            <Text fw={700} fz="sm">
              Pressed well
            </Text>
            <Text mt="sm" fz="sm">
              A subtly recessed container for lists and read-outs. No screws, no inset title — plain
              text differentiates it.
            </Text>
          </Panel>
        </SimpleGrid>
        <Panel>
          <EmbossedLabel>Nested well</EmbossedLabel>
          <Panel pressed mt="sm">
            <Text fz="sm" ff="monospace">
              A pressed well inside a raised card — the canonical list / log container.
            </Text>
          </Panel>
        </Panel>

        <SectionTitle>Flat (this change) vs. emboss (prior pass)</SectionTitle>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
          <Panel>
            <Text fw={700} fz="sm" mb={4}>
              Flat Panel (this change)
            </Text>
            <Text fz="sm">
              Outline + corner screws, no shadow. Adapts: cream in light, charcoal in dark.
            </Text>
          </Panel>
          <EmbossedPanel>
            <Text fw={700} fz="sm" mb={4}>
              EmbossedPanel (prior / current primitive)
            </Text>
            <Text fz="sm">
              The heavy-emboss skeuomorphic surface from the first pass — kept here only for
              comparison.
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

const PLUGS: { status: PlugStatus; label: string }[] = [
  { status: 'running', label: 'running' },
  { status: 'working', label: 'working' },
  { status: 'error', label: 'fault' },
  { status: 'idle', label: 'idle' },
  { status: 'off', label: 'off' },
];

export const Controls: Story = {
  render: () => (
    <GalleryShell>
      <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
        Controls &amp; indicators
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Panel>
          <EmbossedLabel>Plugs</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            Thin outer ring, thick inner disc coloured by status.
          </Text>
          <Group mt="md" gap="lg">
            {PLUGS.map((p) => (
              <Stack key={p.label} align="center" gap={6}>
                <Plug status={p.status} size={28} label={p.label} />
                <Text fz="xs" c="dimmed">
                  {p.label}
                </Text>
              </Stack>
            ))}
          </Group>
        </Panel>

        <Panel>
          <EmbossedLabel>Status dots</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            The lightweight inline marker for list rows.
          </Text>
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
