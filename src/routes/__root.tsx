import { AppShell } from "@/components/layout/AppShell";
import { Outlet, createRootRoute, useMatches } from "@tanstack/react-router";
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react";
import { Loader2 } from "lucide-react";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const matches = useMatches();
  // Routes that should NOT render the AppShell (e.g. login).
  const isPublic = matches.some((m) => m.routeId === "/auth/login");

  if (isPublic) {
    return <Outlet />;
  }

  return (
    <>
      <AuthLoading>
        <FullPageSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <div className="min-h-screen bg-background">
          <main className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </main>
        </div>
      </Unauthenticated>
      <Authenticated>
        <AppShell />
      </Authenticated>
    </>
  );
}

function FullPageSkeleton() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-label="Loading"
      />
    </div>
  );
}
