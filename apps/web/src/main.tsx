import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { AppProviders } from './providers/AppProviders';
import { createSwitchboardClient } from './api/client';
import { createAppRouter } from './router/routes';

// App entry (design D2/D3): `AppProviders` supplies the Mantine '50s switchboard theme + the
// TanStack Query client (server state), and the router maps URL → page with `AppShell` as the
// root-route layout. The router context carries the typed client for the shell (no QueryClient — no
// route runs a `beforeLoad` guard); `liveSessions` is omitted so the header derives the live-session
// count from real per-repo liveness (fix-live-session-indicator) rather than a hardcoded 0. Clean
// browser-history paths (the default history) require the production host to serve index.html as a
// history fallback for unknown paths (see dependencies.md / the `runtime-cli-docker` constraint).
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

const router = createAppRouter({
  context: { client: createSwitchboardClient() },
});

createRoot(rootEl).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
