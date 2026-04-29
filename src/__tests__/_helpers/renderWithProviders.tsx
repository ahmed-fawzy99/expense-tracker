import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

interface ProviderRenderOptions extends Omit<RenderOptions, "wrapper"> {
  /** Initial URL to seed the in-memory router. Defaults to "/". */
  initialPath?: string;
  /** Set of routes the router will know about (besides the catch-all). */
  extraPaths?: string[];
}

/**
 * Renders `ui` inside a TanStack Router instance backed by an in-memory
 * history. The supplied `ui` is rendered at "/" and at any `extraPaths`.
 *
 * Components using `<Link to=...>`, `useNavigate()`, and `<Navigate />` work
 * without pulling in the real route tree (which would require a Convex client).
 */
export function renderWithRouter(
  ui: ReactElement,
  { initialPath = "/", extraPaths = [], ...options }: ProviderRenderOptions = {},
) {
  const rootRoute = createRootRoute({
    component: Outlet,
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => ui,
  });

  const extras = extraPaths.map((p) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: p,
      component: () => ui,
    }),
  );

  // Auth-login fallback so <Navigate to="/auth/login" /> doesn't blow up.
  const authLogin = createRoute({
    getParentRoute: () => rootRoute,
    path: "/auth/login",
    component: () => <div data-testid="login-stub">login</div>,
  });

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, authLogin, ...extras]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    defaultPreload: false,
  });

  return {
    ...render(<RouterProvider router={router} />, options),
    router,
  };
}
