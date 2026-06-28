import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, spyOn, userEvent, waitFor, within } from 'storybook/test';
import type { RepoTarget } from '@switchboard/shared';
import { resolvedScheme, schemeTest, VIEWPORTS } from '../storybook/scheme-test';
import type { SwitchboardClient } from '../api/client';
import { repoAnchorId } from '../repos/group-repos';
import { AppShell } from './AppShell';

/**
 * A minimal fake `SwitchboardClient` for the interaction stories: it resolves the cloned-repositories
 * list to a fixture and leaves every other endpoint pending — so the inline `Worktrees` containers
 * stay in their loading state while the repository sections (the deep-link targets) still mount. A
 * deep Proxy: any property access nests deeper, and only `repos.cloned.$get` resolves.
 */
function fakeClient(repos: RepoTarget[]): SwitchboardClient {
  const pending = new Promise<never>(() => {});
  const node = (path: string[]): unknown =>
    new Proxy(() => undefined, {
      get: (_t, prop) => (prop === 'then' ? undefined : node([...path, String(prop)])),
      apply: () =>
        path.join('.') === 'repos.cloned.$get'
          ? Promise.resolve({ ok: true, status: 200, json: async () => ({ repos }) } as Response)
          : pending,
    });
  return node([]) as SwitchboardClient;
}

/** Two organisations, one repo each — enough to exercise a sidebar deep-link to a section. */
const TWO_ORGS: RepoTarget[] = [
  { owner: 'acme-corp', repo: 'web-client' },
  { owner: 'nick-boey', repo: 'switchboard' },
];

/**
 * The flat app shell (repos-home-and-sidebar). Rendered through the global `AppProviders` decorator
 * (Mantine theme + TanStack Query); without an injected server config the cloned-repositories query
 * stays loading, so the home shows its loading affordance and the sidebar shows only "New
 * repository". The play functions assert dark-scheme resolution and the responsive drawer↔rail
 * switch with no horizontal overflow.
 */
const meta = {
  title: 'Foundations/AppShell',
  component: AppShell,
  args: { liveSessions: 2 },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Dark — under emulated `prefers-color-scheme: dark` the shell resolves the dark scheme. */
export const Dark: Story = {
  parameters: schemeTest({ colorScheme: 'dark', viewport: VIEWPORTS.desktop }),
  play: async () => {
    await waitFor(() => expect(resolvedScheme()).toBe('dark'));
  },
};

/** Mobile — the nav is a drawer behind the burger; no horizontal overflow. */
export const Mobile: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.phone }),
  play: async ({ canvasElement }) => {
    const burger = within(canvasElement).getByTestId('nav-burger');
    await waitFor(() => expect(getComputedStyle(burger).display).not.toBe('none'));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

/** Desktop — a persistent nav rail; the burger is hidden; no horizontal overflow. */
export const Desktop: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  play: async ({ canvasElement }) => {
    const burger = within(canvasElement).getByTestId('nav-burger');
    await waitFor(() => expect(getComputedStyle(burger).display).toBe('none'));
    expect(within(canvasElement).getByTestId('nav-rail').offsetWidth).toBeGreaterThan(0);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

/**
 * Deep-link mount-then-scroll (task 5.1a): activating a sidebar repo link from the new-repository
 * view makes the home active and scrolls that repository's section into view. The play function
 * installs an in-browser `scrollIntoView` spy (task 1.1) and asserts it fired for the target
 * section's element — proving the scroll happens after the section mounts on the switched-to view.
 */
export const DeepLinkScroll: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  args: { client: fakeClient(TWO_ORGS) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The sidebar deep-links appear once the cloned-repositories list resolves.
    await waitFor(() => canvas.getByTestId('nav-repo:nick-boey/switchboard'));
    const scrollSpy = spyOn(Element.prototype, 'scrollIntoView');
    try {
      // Activate from a NON-home view (mount-then-scroll): open New repository first…
      await userEvent.click(canvas.getByTestId('nav-new-repository'));
      // …then activate the repo deep-link; the home must mount and the section scroll into view.
      await userEvent.click(canvas.getByTestId('nav-repo:nick-boey/switchboard'));
      const anchor = repoAnchorId({ owner: 'nick-boey', repo: 'switchboard' });
      await waitFor(() => {
        const el = canvasElement.ownerDocument.getElementById(anchor);
        expect(el).not.toBeNull();
        expect(scrollSpy).toHaveBeenCalled();
        expect(scrollSpy.mock.contexts).toContain(el);
      });
    } finally {
      scrollSpy.mockRestore();
    }
  },
};

/**
 * Empty-home clone CTA (task 5.1b): with no repositories cloned, activating the home's
 * "Clone a repository" CTA moves the app to the new-repository view (the empty home is left behind).
 */
export const EmptyHomeCloneCta: Story = {
  parameters: schemeTest({ viewport: VIEWPORTS.desktop }),
  args: { client: fakeClient([]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cta = await waitFor(() => canvas.getByTestId('repos-home-clone'));
    await userEvent.click(cta);
    await waitFor(() => expect(canvas.queryByTestId('repos-home-empty')).toBeNull());
  },
};
