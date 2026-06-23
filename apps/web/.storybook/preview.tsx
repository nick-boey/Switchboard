import '@mantine/core/styles.css';
import type { Preview } from '@storybook/react-vite';
import { AppProviders } from '../src/providers/AppProviders';

/**
 * Global Storybook preview (design Decision 7). Every story renders through `AppProviders` so
 * the Mantine '50s switchboard theme + TanStack Query context are present — matching the real
 * app entry. `AppProviders` defaults to `colorScheme="auto"` (task 8.2), so a story's emulated
 * `prefers-color-scheme` (via `schemeTest(...)` under the test-runner) flows through Mantine. The
 * prototype quarantine (`.storybook/main.ts`) keeps `src/prototypes/**` out of this production run.
 */
const preview: Preview = {
  decorators: [
    (Story) => (
      <AppProviders>
        <Story />
      </AppProviders>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
