import '@mantine/core/styles.css';
import type { Preview } from '@storybook/react-vite';
import { AppProviders } from '../src/providers/AppProviders';
import { SCHEME_TEST_PARAM } from '../src/storybook/scheme-test';

/**
 * Global Storybook preview (design Decision 7). Every story renders through `AppProviders` so
 * the Mantine '50s switchboard theme + TanStack Query context are present — matching the real
 * app entry. The prototype quarantine (`.storybook/main.ts`) keeps `src/prototypes/**` out of
 * this production / snapshot run.
 *
 * Stories that opt into scheme/viewport emulation (`schemeTest(...)`, task 1.2) render under
 * `colorScheme="auto"` so the test-runner's emulated `prefers-color-scheme` flows through Mantine;
 * all other stories keep the default scheme, so visual snapshots are unchanged.
 */
const preview: Preview = {
  decorators: [
    (Story, context) => (
      <AppProviders colorScheme={context.parameters[SCHEME_TEST_PARAM] ? 'auto' : undefined}>
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
