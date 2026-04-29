import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

interface BackLinkProps {
  to: string;
  label?: string;
}

/**
 * Back-navigation link rendered above sub-pages. Anchored to a known
 * destination — never to `history.back()` — so the user always lands somewhere
 * predictable regardless of how they arrived (deep link, refresh, etc.).
 */
export function BackLink({ to, label = "Back" }: BackLinkProps) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      {label}
    </Link>
  );
}
