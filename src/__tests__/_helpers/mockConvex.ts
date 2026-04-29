import { vi } from "vitest";
import { getFunctionName } from "convex/server";

/**
 * Centralized Convex hook mocks for the frontend test suite.
 *
 * State is stored on `globalThis` so the mock factory (loaded inside
 * `vi.mock("convex/react", ...)`) and the test file share a single instance,
 * even when Vitest's module loader produces separate copies.
 */

type AnyFn = (...args: never[]) => unknown;

// Accepts any Convex FunctionReference. We never inspect the value beyond
// passing it to `getFunctionName`, so a permissive type is correct here.
type FunctionRef = unknown;

interface ConvexMockState {
  queryResults: Map<string, unknown>;
  mutationImpls: Map<string, AnyFn>;
  mutationCalls: Map<string, unknown[][]>;
  actionImpls: Map<string, AnyFn>;
}

/**
 * Convex's `api.foo.bar` accessor returns a *new* Proxy on every read, so we
 * can't key the mock state by reference identity. `getFunctionName` returns a
 * stable string ("foo:bar") suitable as a Map key.
 */
function keyOf(ref: FunctionRef): string {
  return getFunctionName(ref as never);
}

const STATE_KEY = Symbol.for("__expense_tracker_convex_mock_state__");

function getState(): ConvexMockState {
  const g = globalThis as unknown as Record<symbol, ConvexMockState>;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      queryResults: new Map(),
      mutationImpls: new Map(),
      mutationCalls: new Map(),
      actionImpls: new Map(),
    };
  }
  return g[STATE_KEY];
}

export function resetConvexMocks() {
  const s = getState();
  s.queryResults.clear();
  s.mutationImpls.clear();
  s.mutationCalls.clear();
  s.actionImpls.clear();
}

export function setQueryResult<T>(ref: FunctionRef, value: T) {
  getState().queryResults.set(keyOf(ref), value);
}

export function setMutationImpl<TArgs extends unknown[], TResult>(
  ref: FunctionRef,
  impl: (...args: TArgs) => TResult | Promise<TResult>,
) {
  getState().mutationImpls.set(keyOf(ref), impl);
}

export function setActionImpl<TArgs extends unknown[], TResult>(
  ref: FunctionRef,
  impl: (...args: TArgs) => TResult | Promise<TResult>,
) {
  getState().actionImpls.set(keyOf(ref), impl);
}

export function getMutationCalls(ref: FunctionRef): unknown[][] {
  return getState().mutationCalls.get(keyOf(ref)) ?? [];
}

/**
 * Returns the object that `vi.mock("convex/react", ...)` should yield.
 */
export function convexMock() {
  return {
    useQuery: (ref: FunctionRef) => {
      const s = getState();
      const k = keyOf(ref);
      return s.queryResults.has(k) ? s.queryResults.get(k) : undefined;
    },
    useMutation: (ref: FunctionRef) => {
      return async (...args: unknown[]) => {
        const s = getState();
        const k = keyOf(ref);
        const calls = s.mutationCalls.get(k) ?? [];
        calls.push(args);
        s.mutationCalls.set(k, calls);
        const impl = s.mutationImpls.get(k);
        return impl ? await impl(...(args as never[])) : undefined;
      };
    },
    useAction: (ref: FunctionRef) => {
      return async (...args: unknown[]) => {
        const impl = getState().actionImpls.get(keyOf(ref));
        return impl ? await impl(...(args as never[])) : undefined;
      };
    },
    Authenticated: ({ children }: { children: React.ReactNode }) => children,
    Unauthenticated: (_: { children: React.ReactNode }) => null,
    AuthLoading: (_: { children: React.ReactNode }) => null,
    ConvexProvider: ({ children }: { children: React.ReactNode }) => children,
    ConvexReactClient: vi.fn(),
    /**
     * `useConvexAuth` is consumed by the login route. Defaults to
     * `isLoading: false, isAuthenticated: false`; tests can override by
     * setting a query result keyed under "convex/auth:isAuthenticated"
     * (we just expose two helpers below).
     */
    useConvexAuth: () => {
      const s = getState();
      const v = s.queryResults.get("__convex_auth__");
      return (
        (v as { isLoading: boolean; isAuthenticated: boolean }) ?? {
          isLoading: false,
          isAuthenticated: false,
        }
      );
    },
  };
}

/** Sets the `useConvexAuth()` return value for the next render. */
export function setConvexAuth(value: {
  isLoading: boolean;
  isAuthenticated: boolean;
}) {
  getState().queryResults.set("__convex_auth__", value);
}
