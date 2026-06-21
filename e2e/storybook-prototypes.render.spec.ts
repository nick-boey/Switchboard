import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Prototype Storybook render smoke (tasks 7.3–7.4, port 6007). Drives the real prototype workbench
 * dev server in a browser and proves the dark-mode lever works: the `_sample` story mounts the
 * themed root, and because the prototype preview wraps stories in `AppProviders colorScheme="auto"`,
 * Mantine follows the emulated OS `prefers-color-scheme` — light by default, dark when emulated.
 */
const STORYBOOK_URL = 'http://localhost:6007';

async function resolveSampleStoryId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${STORYBOOK_URL}/index.json`);
  expect(response.ok(), 'prototype Storybook serves its index').toBeTruthy();
  const index = (await response.json()) as {
    entries: Record<string, { id: string; title: string }>;
  };
  const entry = Object.values(index.entries).find((e) => e.title === 'Prototypes/_sample/Sample');
  if (!entry) {
    throw new Error('the _sample prototype is not present in the prototype Storybook index');
  }
  return entry.id;
}

function iframeUrl(storyId: string): string {
  return `${STORYBOOK_URL}/iframe.html?id=${storyId}&viewMode=story`;
}

const resolvedColorScheme = () =>
  document.documentElement.getAttribute('data-mantine-color-scheme');

test('the _sample prototype renders the themed root and follows the emulated color scheme', async ({
  page,
  request,
}) => {
  const storyId = await resolveSampleStoryId(request);

  // Light by default: the themed root mounts and Mantine resolves to light.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(iframeUrl(storyId));
  await expect(page.getByTestId('sample-prototype')).toBeVisible();
  await expect.poll(() => page.evaluate(resolvedColorScheme)).toBe('light');

  // Dark: emulating prefers-color-scheme: dark flips Mantine's resolved scheme (colorScheme="auto").
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(iframeUrl(storyId));
  await expect(page.getByTestId('sample-prototype')).toBeVisible();
  await expect.poll(() => page.evaluate(resolvedColorScheme)).toBe('dark');
});
