import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-types/**',
      '**/node_modules/**',
      '**/storybook-static/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.astro/**',
      '**/*.tsbuildinfo',
      // site/ is an Astro project (section 8); linted there with its own toolchain.
      'site/**',
      // Throwaway runtime spike harness (not part of the workspace).
      'spikes/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Default runtime globals for tooling/config/server/cli code.
    files: ['**/*.{ts,tsx,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Web app code also runs in the browser.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Prototype quarantine (design Decision 7): app code must not import prototypes/**.
    // The prototypes themselves are exempt so they may import within their own tree.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/prototypes/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/prototypes/**', '**/prototypes', '*/prototypes/*'],
              message:
                'App code must not import from prototypes/** — they are quarantined (design Decision 7).',
            },
          ],
        },
      ],
    },
  },
  {
    // Playwright fixtures conventionally destructure an empty fixture object.
    files: ['e2e/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off',
    },
  },
  prettier,
);
