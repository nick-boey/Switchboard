import { describe, it, expect } from 'vitest';
import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import { memoryRouter, renderWithRouter } from './test-router';

/**
 * Proves the router test harness (design Testing strategy, task 1.2): `renderWithRouter` must
 * `await router.load()` before `renderToStaticMarkup`, otherwise TanStack Router's asynchronous
 * match resolution captures the *pending* state instead of the matched component. We assert with a
 * throwaway trivial route tree — the harness renders the matched leaf, not a pending fallback.
 */
describe('router test harness', () => {
  it('renders the matched component after load, not the pending state', async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => <div data-testid="harness-proof">loaded</div>,
    });
    const router = memoryRouter(rootRoute.addChildren([indexRoute]), { path: '/' });

    const html = await renderWithRouter(router);

    expect(html).toContain('data-testid="harness-proof"');
    expect(html).toContain('loaded');
  });
});
