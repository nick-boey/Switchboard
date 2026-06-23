import {
  MantineProvider,
  type MantineColorScheme,
  type MantineColorSchemeManager,
} from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { switchboardCssVariablesResolver, switchboardTheme } from '../theme/theme';

/**
 * A non-persistent colour-scheme manager so the OS `prefers-color-scheme` is the **sole** driver
 * (ui-design-language: "no in-app light/dark toggle"). Mantine's default manager is localStorage-
 * backed and reads `mantine-color-scheme-value` ahead of `defaultColorScheme`, so a stale stored
 * value could override the OS preference. This manager never reads or writes that key — `get`
 * always returns the provided default, and `set`/`clear` are no-ops — keeping the OS authoritative.
 */
export const osColorSchemeManager: MantineColorSchemeManager = {
  get: (defaultValue) => defaultValue,
  set: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  clear: () => {},
};

export interface AppProvidersProps {
  children: ReactNode;
  /** Inject a pre-built QueryClient (Storybook / tests); one is created per app otherwise. */
  queryClient?: QueryClient;
  /**
   * Color scheme forwarded to Mantine's `defaultColorScheme`. Defaults to `'auto'` (task 8.2), so
   * the production app and Storybook follow the OS `prefers-color-scheme` with no in-app toggle.
   */
  colorScheme?: MantineColorScheme;
}

/**
 * Application providers (design Decision 7): the Mantine theme provider wrapping the '50s
 * switchboard tokens, plus the TanStack Query client for server state. Both the app entry and
 * Storybook mount through here so the shell renders identically everywhere.
 */
export function AppProviders({ children, queryClient, colorScheme = 'auto' }: AppProvidersProps) {
  const [client] = useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <MantineProvider
      theme={switchboardTheme}
      defaultColorScheme={colorScheme}
      colorSchemeManager={osColorSchemeManager}
      cssVariablesResolver={switchboardCssVariablesResolver}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
