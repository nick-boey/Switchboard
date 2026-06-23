import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * AppProviders forwards its colour scheme and a non-persistent scheme manager to Mantine, so the OS
 * `prefers-color-scheme` is the sole driver (ui-design-language: "no in-app toggle"). Mantine
 * resolves the scheme client-side, so it is absent from SSR markup; this unit test pins the
 * forwarded `defaultColorScheme` + `colorSchemeManager` by mocking `MantineProvider`, and checks the
 * manager ignores any persisted value. Live light/dark resolution is covered by the play functions.
 */
const captured = vi.hoisted(() => ({
  defaultColorScheme: undefined as string | undefined,
  colorSchemeManager: undefined as unknown,
}));

vi.mock('@mantine/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mantine/core')>();
  return {
    ...actual,
    MantineProvider: (props: {
      defaultColorScheme?: string;
      colorSchemeManager?: unknown;
      children?: ReactNode;
    }) => {
      captured.defaultColorScheme = props.defaultColorScheme;
      captured.colorSchemeManager = props.colorSchemeManager;
      return props.children;
    },
  };
});

const { AppProviders, osColorSchemeManager } = await import('./AppProviders');

describe('AppProviders color scheme', () => {
  it('defaults to auto — the OS prefers-color-scheme drives light/dark, no in-app toggle (task 8.2)', () => {
    renderToStaticMarkup(
      <AppProviders>
        <div />
      </AppProviders>,
    );
    expect(captured.defaultColorScheme).toBe('auto');
  });

  it('forwards an explicit colorScheme override to Mantine', () => {
    renderToStaticMarkup(
      <AppProviders colorScheme="light">
        <div />
      </AppProviders>,
    );
    expect(captured.defaultColorScheme).toBe('light');
  });

  it('forwards the non-persistent OS scheme manager so localStorage cannot override the OS', () => {
    renderToStaticMarkup(
      <AppProviders>
        <div />
      </AppProviders>,
    );
    expect(captured.colorSchemeManager).toBe(osColorSchemeManager);
  });
});

describe('osColorSchemeManager', () => {
  it('ignores any stored value — get returns the provided default', () => {
    // Mantine's default manager would read a stored 'mantine-color-scheme-value'; this one never
    // does, so the OS preference (passed as the default) always wins.
    expect(osColorSchemeManager.get('auto')).toBe('auto');
    expect(osColorSchemeManager.get('dark')).toBe('dark');
    expect(osColorSchemeManager.get('light')).toBe('light');
  });

  it('no-ops set/clear so no scheme is ever persisted', () => {
    expect(() => {
      osColorSchemeManager.set('dark');
      osColorSchemeManager.subscribe(() => {});
      osColorSchemeManager.unsubscribe();
      osColorSchemeManager.clear();
    }).not.toThrow();
  });
});
