import { ShieldAlert } from "lucide-react";

interface ForbiddenPanelProps {
  message?: string;
}

export function ForbiddenPanel({ message }: ForbiddenPanelProps) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-8 py-12 text-center">
      <ShieldAlert
        aria-hidden="true"
        className="mx-auto size-10 text-destructive"
      />
      <h2 className="mt-4 text-lg font-semibold">Access denied</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {message ?? "You don't have permission to view this page. If you think this is a mistake, contact your administrator."}
      </p>
    </div>
  );
}
