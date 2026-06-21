import '@mantine/core/styles.css';
import type { Preview } from '@storybook/react-vite';
import { AppProviders } from '../src/providers/AppProviders';

/**
 * Global Storybook preview (design Decision 7). Every story renders through `AppProviders` so
 * the Mantine '50s switchboard theme + TanStack Query context are present — matching the real
 * app entry. The prototype quarantine (`.storybook/main.ts`) keeps `src/prototypes/**` out of
 * this production / snapshot run.
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
