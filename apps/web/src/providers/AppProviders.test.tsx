import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * AppProviders forwards its color scheme to Mantine (design Decision: "Prototype preview drives the
 * color scheme"). Mantine resolves the scheme client-side, so it is absent from SSR markup; this
 * unit test pins the forwarded `defaultColorScheme` by mocking `MantineProvider`. The actual
 * light/dark resolution under emulated `prefers-color-scheme` is the Playwright render smoke's job.
 */
const captured = vi.hoisted(() => ({ defaultColorScheme: undefined as string | undefined }));

vi.mock('@mantine/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/core')>();
  return {
    ...actual,
    MantineProvider: (props: { defaultColorScheme?: string; children?: ReactNode }) => {
      captured.defaultColorScheme = props.defaultColorScheme;
      return props.children;
    },
  };
});

const { AppProviders } = await import('./AppProviders');

describe('AppProviders color scheme', () => {
  it('defaults to light (production rendering unchanged)', () => {
    renderToStaticMarkup(
      <AppProviders>
        <div />
      </AppProviders>,
    );
    expect(captured.defaultColorScheme).toBe('light');
  });

  it('forwards an explicit colorScheme="auto" to Mantine', () => {
    renderToStaticMarkup(
      <AppProviders colorScheme="auto">
        <div />
      </AppProviders>,
    );
    expect(captured.defaultColorScheme).toBe('auto');
  });
});
