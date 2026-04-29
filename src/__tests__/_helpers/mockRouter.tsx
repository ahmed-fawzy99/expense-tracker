import { vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Minimal stand-in for `@tanstack/react-router` for component tests.
 *
 * Real TanStack Router needs an async route tree; spinning one up per test
 * is overkill for smoke tests. This shim renders `<Link>` as a plain `<a>`,
 * `<Navigate>` as an inert marker we can assert on, and exposes a
 * vi.fn-backed `useNavigate`.
 *
 * Usage in a test file:
 *
 *   vi.mock("@tanstack/react-router", async () => {
 *     const m = await import("../_helpers/mockRouter");
 *     return m.routerMock();
 *   });
 *
 *   import { lastNavigateCall } from "../_helpers/mockRouter";
 */

type NavigateOpts = { to?: string; params?: Record<string, unknown> } | string;

interface RouterMockState {
  navigateMock: ReturnType<typeof vi.fn>;
  lastNavigateRender: NavigateOpts | null;
}

const STATE_KEY = Symbol.for("__expense_tracker_router_mock_state__");

function getState(): RouterMockState {
  const g = globalThis as unknown as Record<symbol, RouterMockState>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      navigateMock: vi.fn(),
      lastNavigateRender: null,
    };
  }
  return g[STATE_KEY];
}

export function resetRouterMock() {
  const s = getState();
  s.navigateMock.mockReset();
  s.lastNavigateRender = null;
}

export function getNavigateMock() {
  return getState().navigateMock;
}

export function lastNavigateCall(): NavigateOpts | null {
  return getState().lastNavigateRender;
}

export function routerMock() {
  return {
    Link: ({
      to,
      children,
      ...rest
    }: {
      to: string;
      children?: ReactNode;
      [key: string]: unknown;
    }) => {
      // Strip TanStack-specific props that `<a>` doesn't understand.
      const {
        params: _p,
        search: _s,
        hash: _h,
        activeProps: _ap,
        inactiveProps: _ip,
        activeOptions: _ao,
        preload: _pl,
        ...domRest
      } = rest as Record<string, unknown>;
      return (
        <a href={to} {...(domRest)}>
          {children}
        </a>
      );
    },
    Navigate: ({ to, params }: { to?: string; params?: Record<string, unknown> }) => {
      getState().lastNavigateRender = { to, params };
      return <span data-testid="navigate-stub" data-to={to ?? ""} />;
    },
    useNavigate: () => getState().navigateMock,
    Outlet: () => null,
    /**
     * Captures the route options object on the returned `Route` so tests can
     * render the page body directly via `<Route.options.component />`. We
     * also stub `Route.useSearch()` and `Route.fullPath` because routes call
     * those at the module-render boundary.
     */
    createFileRoute: (path: string) => {
      return <T extends Record<string, unknown>>(opts: T) => {
        const validateSearch = opts.validateSearch as
          | ((v: unknown) => unknown)
          | { parse: (v: unknown) => unknown }
          | undefined;
        const useSearch = () => {
          if (!validateSearch) return {};
          if (typeof validateSearch === "function") {
            try {
              return validateSearch({}) as Record<string, unknown>;
            } catch {
              return {};
            }
          }
          if (typeof validateSearch.parse === "function") {
            try {
              return validateSearch.parse({}) as Record<string, unknown>;
            } catch {
              return {};
            }
          }
          return {};
        };
        return {
          ...opts,
          options: opts,
          fullPath: path,
          path,
          useSearch,
          useParams: () => ({}),
          useNavigate: () => getState().navigateMock,
        };
      };
    },
    createRootRoute: <T extends Record<string, unknown>>(opts: T) => opts,
    useMatches: () => [],
    useRouter: () => ({ navigate: getState().navigateMock }),
    useLocation: () => ({ pathname: "/", search: "", hash: "" }),
    useRouterState: () => ({ location: { pathname: "/", search: "", hash: "" } }),
    redirect: (opts: NavigateOpts) => opts,
  };
}
