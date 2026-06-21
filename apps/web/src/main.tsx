import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './providers/AppProviders';
import { AppShell } from './components/AppShell';

// App entry (design Decision 7): the Mantine '50s switchboard theme + TanStack Query providers
// wrap the mobile-first app shell, which talks to the server's placeholder route through the
// typed `hc` client over the bearer path. Real screens arrive in later changes.
const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <AppShell />
    </AppProviders>
  </StrictMode>,
);
