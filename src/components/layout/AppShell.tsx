import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/hooks/useMe";
import { useMyPermissions } from "@/hooks/useMyPermissions";
import { cn } from "@/lib/utils";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { LogOut, Plus, Receipt, UserCog, Wallet } from "lucide-react";
import {
  PERMISSIONS,
  type PermissionName,
} from "../../../convex/lib/authConstants";

interface NavLink {
  to: string;
  label: string;
  permission?: PermissionName;
  /**
   * Path prefixes that should also light this link up. Used so that
   * sub-routes (e.g. `/expense/$id`) keep the parent ("Expenses") active.
   * If omitted, the link is active on exact-match only.
   */
  matchPrefixes?: string[];
  /** Hide this link entirely when this predicate returns false. */
  visibleWhen?: (ctx: { hasManagerId: boolean }) => boolean;
}

const NAV_LINKS: NavLink[] = [
  {
    to: "/",
    label: "My Expenses",
    matchPrefixes: ["/expense/"],
    visibleWhen: ({ hasManagerId }) => hasManagerId,
  },
  {
    to: "/new",
    label: "New",
    permission: PERMISSIONS.expensesCreate,
    visibleWhen: ({ hasManagerId }) => hasManagerId,
  },
  {
    to: "/expenses",
    label: "Approvals",
    permission: PERMISSIONS.expensesApprove,
    matchPrefixes: ["/expenses", "/expense/"],
  },
];

export function AppShell() {
  const me = useMe();
  const { has } = useMyPermissions();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const userInitial =
    me?.user.name?.[0]?.toUpperCase() ??
    me?.user.email?.[0]?.toUpperCase() ??
    "?";

  const hasManagerId = me?.user.managerId != null;

  const visibleLinks = NAV_LINKS.filter((l) => {
    if (l.permission && !has(l.permission)) return false;
    if (l.visibleWhen && !l.visibleWhen({ hasManagerId })) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Wallet className="size-4" aria-hidden="true" />
            </span>
            Expense Tracker
          </Link>

          <nav className="ml-2 hidden items-center gap-1 sm:flex">
            {visibleLinks.map((link) => (
              <NavItem
                key={link.to}
                to={link.to}
                isActive={isLinkActive(pathname, link)}
                icon={iconFor(link)}
              >
                {link.label}
              </NavItem>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="User menu"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-secondary/15 text-xs font-semibold text-secondary">
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-sm font-medium">
                    {me?.user.name ?? "—"}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {me?.user.email ?? "—"}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void navigate({ to: "/account" })}
                >
                  <UserCog className="size-4" aria-hidden="true" />
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    void signOut().then(() => navigate({ to: "/auth/login" }));
                  }}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 animate-in fade-in duration-300">
        <Outlet />
      </main>
    </div>
  );
}

function iconFor(link: NavLink) {
  if (link.to === "/new") return <Plus className="size-3.5" aria-hidden="true" />;
  if (link.to === "/expenses")
    return <Receipt className="size-3.5" aria-hidden="true" />;
  return null;
}

function isLinkActive(pathname: string, link: NavLink): boolean {
  if (pathname === link.to) return true;
  for (const prefix of link.matchPrefixes ?? []) {
    if (pathname.startsWith(prefix)) {
      // Don't let "/expense/123" light up "/" *and* "/expenses".
      // The matchPrefixes opt-in already handles this — "/" doesn't match
      // "/expense/" because we require startsWith("/expense/") not just "/".
      return true;
    }
  }
  return false;
}

function NavItem({
  to,
  isActive,
  icon,
  children,
}: {
  to: string;
  isActive: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </Link>
  );
}
