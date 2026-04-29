import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useQuery } from "convex/react";
import {
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  RefreshCw,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

interface ActivityLogProps {
  expenseId: Id<"expenses">;
  /** "owner" → owner-filtered (status changes + reject note only).
   *  "full"  → full chain history (manager / admin view). */
  view: "owner" | "full";
}

const EVENT_LABEL: Record<string, string> = {
  submitted: "Submitted for approval",
  approved: "Approved",
  rejected: "Rejected",
  chain_extended: "Handed off to next approver",
  resubmitted: "Edited and resubmitted",
  status_changed: "Status changed",
};

const EVENT_ICON: Record<string, LucideIcon> = {
  submitted: FileText,
  approved: CheckCircle2,
  rejected: XCircle,
  chain_extended: GitBranch,
  resubmitted: RefreshCw,
  status_changed: Clock,
};

export function ActivityLog({ expenseId, view }: ActivityLogProps) {
  const ownerQ = useQuery(
    api.activity.listForOwner,
    view === "owner"
      ? { subjectType: "expenses", subjectId: expenseId }
      : "skip",
  );
  const fullQ = useQuery(
    api.activity.listForSubject,
    view === "full"
      ? { subjectType: "expenses", subjectId: expenseId }
      : "skip",
  );
  const items = view === "owner" ? ownerQ : fullQ;

  if (items === undefined) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {items.map((entry) => {
        const Icon = EVENT_ICON[entry.event] ?? FileText;
        return (
          <li key={entry._id} className="flex items-start gap-3">
            <span className="mt-0.5 grid size-7 place-items-center rounded-full bg-muted">
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium">
                {EVENT_LABEL[entry.event] ?? entry.event}
              </p>
              <p className="text-sm text-muted-foreground">
                {entry.description}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(entry._creationTime)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
