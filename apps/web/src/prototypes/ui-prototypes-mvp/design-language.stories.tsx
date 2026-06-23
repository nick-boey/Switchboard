import {
  Autocomplete,
  Box,
  Button,
  Group,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type ReactNode } from 'react';
import type { SwitchboardTokens } from '../../theme/theme';
import { definePrototypeMeta } from '../define-prototype-meta';
import {
  DeviceFrame,
  EmbossedLabel,
  IconButton,
  IndicatorLight,
  Panel,
  Plug,
  SectionTitle,
  SegmentedToggle,
  type PlugStatus,
} from './kit';

/** Inline glyphs for the icon-button showcase (no icon library; matches the hub's glyph style). */
const glyph = (d: ReactNode, size = 15) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
);
const TrashIcon = () =>
  glyph(
    <>
      <path d="M4 6 H16" />
      <path d="M8 6 V4.5 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V6" />
      <path d="M6 6 V15.5 a1 1 0 0 0 1 1 h6 a1 1 0 0 0 1-1 V6" />
    </>,
  );
const PlusIcon = () => glyph(<path d="M10 4.5 V15.5 M4.5 10 H15.5" />);
const RefreshIcon = () =>
  glyph(
    <>
      <path d="M15.5 6.5 a6 6 0 1 0 1 4" />
      <path d="M15.5 3.5 V6.5 H12.5" />
    </>,
  );

/**
 * The design-language gallery for `ui-prototypes-mvp` — the living definition of the visual
 * treatment (plan Decision 1). This is the FLAT, abstract take: same '50s switchboard influences
 * (palette, plug + screw + nameplate motifs, geometric type) but rendered with flat surfaces and
 * light outlines instead of heavy emboss. Sketched here so the look is judged against something
 * rendered, not imagined.
 */

function GalleryShell({ children }: { children?: ReactNode }) {
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

/** A stacked indicator light (symbol above the lamp) with a caption beneath, for the catalogue. */
function LightSwatch({
  kind,
  tone,
  caption,
}: {
  kind: 'git' | 'pr' | 'plug';
  tone: 'neutral' | 'yellow' | 'green' | 'red' | 'blue' | 'purple';
  caption: string;
}) {
  return (
    <Stack align="center" gap={4}>
      <IndicatorLight kind={kind} tone={tone} size={12} symbolSize={14} />
      <Text fz="xs" c="dimmed">
        {caption}
      </Text>
    </Stack>
  );
}

function ControlsGallery() {
  const [branch, setBranch] = useState<'new' | 'existing'>('new');
  const [source, setSource] = useState<'github' | 'local'>('github');
  return (
    <GalleryShell>
      <Title order={2} tt="uppercase" style={{ letterSpacing: '0.1em' }}>
        Controls &amp; indicators
      </Title>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Panel>
          <EmbossedLabel>Plugs</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            Thin outer ring, thick inner disc coloured by status — the line/session indicator.
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
          <EmbossedLabel>Indicator lights</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            A bezel-ringed lamp capped by a small symbol naming its column (git / PR / plug).
          </Text>
          <Group mt="md" gap="lg">
            <LightSwatch kind="git" tone="neutral" caption="up to date" />
            <LightSwatch kind="git" tone="yellow" caption="behind" />
            <LightSwatch kind="git" tone="green" caption="ahead" />
            <LightSwatch kind="git" tone="red" caption="diverged" />
          </Group>
          <Group mt="md" gap="lg">
            <LightSwatch kind="pr" tone="blue" caption="open" />
            <LightSwatch kind="pr" tone="green" caption="ready" />
            <LightSwatch kind="pr" tone="red" caption="failing" />
            <LightSwatch kind="pr" tone="purple" caption="merged" />
          </Group>
        </Panel>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Panel>
          <EmbossedLabel>Icon buttons</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            Any glyph in a soft, rounded square of its accent colour; <code>lit</code> fills it
            solid.
          </Text>
          <Group mt="md" gap="md" align="center">
            <IconButton icon={<TrashIcon />} label="delete" color="signal" />
            <IconButton icon={<RefreshIcon />} label="refresh" color="patina" />
            <IconButton icon={<PlusIcon />} label="add" color="brass" />
            <IconButton icon={<RefreshIcon />} label="neutral" color="neutral" />
            <Text fz="xs" c="dimmed">
              lit →
            </Text>
            <IconButton icon={<TrashIcon />} label="delete (lit)" color="signal" lit />
          </Group>
        </Panel>

        <Panel>
          <EmbossedLabel>Toggle buttons</EmbossedLabel>
          <Text fz="xs" c="dimmed" mt={6}>
            Sunken track, active segment raised. Small text matching inputs; supports disabled
            options.
          </Text>
          <Stack mt="md" gap="sm" align="flex-start">
            <SegmentedToggle
              value={branch}
              onChange={setBranch}
              options={[
                { value: 'new', label: 'New branch' },
                { value: 'existing', label: 'Existing branch' },
              ]}
            />
            <SegmentedToggle
              value={source}
              onChange={setSource}
              options={[
                { value: 'github', label: 'GitHub' },
                { value: 'local', label: 'Local', disabled: true },
              ]}
            />
          </Stack>
        </Panel>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Panel>
          <EmbossedLabel>Dropdown selectors</EmbossedLabel>
          <Stack mt="md" gap="sm">
            <Select
              size="sm"
              label="Select (fixed list)"
              defaultValue="main"
              data={['main', 'develop', 'release/1.0']}
              comboboxProps={{ withinPortal: false }}
            />
            <Autocomplete
              size="sm"
              label="Autocomplete (editable)"
              placeholder="Type or pick an organisation"
              data={['nick-boey', 'acme', 'octocat']}
              comboboxProps={{ withinPortal: false }}
            />
          </Stack>
        </Panel>

        <Panel>
          <EmbossedLabel>Inputs</EmbossedLabel>
          <Stack mt="md" gap="sm">
            <TextInput size="sm" label="Text field" placeholder="Search repositories…" />
            <TextInput size="sm" label="With value" defaultValue="feature/remote-control" />
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
  );
}

export const Controls: Story = {
  render: () => <ControlsGallery />,
};
