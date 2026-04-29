import { ForbiddenPanel } from "@/components/ForbiddenPanel";
import { useMe } from "@/hooks/useMe";
import { Navigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type ReactNode } from "react";
import type { PermissionName } from "../../convex/lib/authConstants";

/**
 * Renders children only if the caller is authenticated. Unauthed callers
 * are redirected to /login (the ONE place we redirect on auth state).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me === undefined) {
    return <PageLoadingSkeleton />;
  }
  if (me === null) {
    return <Navigate to="/auth/login" />;
  }
  return <>{children}</>;
}

/**
 * Renders children only if the caller has the named permission. If not,
 * renders <ForbiddenPanel> in place — the URL stays the same. Never redirects.
 */
export function RequirePermission({
  permission,
  children,
  message,
}: {
  permission: PermissionName;
  children: ReactNode;
  message?: string;
}) {
  const me = useMe();
  if (me === undefined) return <PageLoadingSkeleton />;
  if (me === null) return <Navigate to="/auth/login" />;
  if (!me.permissions.includes(permission)) {
    return <ForbiddenPanel message={message} />;
  }
  return <>{children}</>;
}

function PageLoadingSkeleton() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Loader2
        className="size-6 animate-spin text-muted-foreground"
        aria-label="Loading"
      />
    </div>
  );
}
