import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { switchboardTheme } from '../theme/theme';

export interface AppProvidersProps {
  children: ReactNode;
  /** Inject a pre-built QueryClient (Storybook / tests); one is created per app otherwise. */
  queryClient?: QueryClient;
}

/**
 * Application providers (design Decision 7): the Mantine theme provider wrapping the '50s
 * switchboard tokens, plus the TanStack Query client for server state. Both the app entry and
 * Storybook mount through here so the shell renders identically everywhere.
 */
export function AppProviders({ children, queryClient }: AppProvidersProps) {
  const [client] = useState(
    () =>
      queryClient ??
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <MantineProvider theme={switchboardTheme} defaultColorScheme="light">
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  );
}
