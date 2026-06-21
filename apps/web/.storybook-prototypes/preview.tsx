import '@mantine/core/styles.css';
import type { Preview } from '@storybook/react-vite';
import { AppProviders } from '../src/providers/AppProviders';
import productionPreview from '../.storybook/preview';

/**
 * Prototype workbench preview (design Decision: "Prototype preview drives the color scheme"). This
 * is a SEPARATE preview from production: it wraps each story in its OWN AppProviders decorator with
 * colorScheme="auto" so the OS prefers-color-scheme drives light/dark (the switch-ui-prototype
 * dark-mode lever). It does NOT load the production light decorator (which would double-wrap
 * AppProviders) — it reuses ONLY the production parameters (e.g. the controls matchers).
 */
const preview: Preview = {
  decorators: [
    (Story) => (
      <AppProviders colorScheme="auto">
        <Story />
      </AppProviders>
    ),
  ],
  parameters: productionPreview.parameters,
};

export default preview;
