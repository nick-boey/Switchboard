import type { TestRunnerConfig } from '@storybook/test-runner';
import { getStoryContext } from '@storybook/test-runner';
import { SCHEME_TEST_PARAM, type SchemeTestParams } from '../src/storybook/scheme-test';

/**
 * Storybook test-runner config (tasks 1.1/1.2). Before a story renders, apply its opt-in
 * `schemeTest` parameter — emulate `prefers-color-scheme` and set the viewport — so the story's
 * `play` function can assert computed-style, dark-mode, and responsive behaviour in a real
 * browser. Stories without the parameter run at the runner's defaults.
 */
const config: TestRunnerConfig = {
  async preVisit(page, context) {
    const storyContext = await getStoryContext(page, context);
    const params = storyContext.parameters[SCHEME_TEST_PARAM] as SchemeTestParams | undefined;
    if (!params) return;
    if (params.colorScheme) {
      await page.emulateMedia({ colorScheme: params.colorScheme });
    }
    if (params.viewport) {
      await page.setViewportSize({ width: params.viewport, height: 900 });
    }
  },
};

export default config;
