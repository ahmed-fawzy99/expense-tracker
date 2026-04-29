import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, ExternalLink, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PERMISSIONS } from "../../../convex/lib/authConstants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExpenseForm } from "@/components/ExpenseForm";
import { ActivityLog } from "@/components/ActivityLog";
import { StatusBadge } from "@/components/StatusBadge";
import { ApprovalDialog } from "@/components/ApprovalDialog";
import { ForbiddenPanel } from "@/components/ForbiddenPanel";
import { BackLink } from "@/components/BackLink";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RequireAuth } from "@/lib/route-guards";
import { useMe } from "@/hooks/useMe";
import { useMyPermissions } from "@/hooks/useMyPermissions";
import { formatMoney, formatDateTime } from "@/lib/format";
import { getErrorMessage } from "@/lib/errors";
import { EXPENSE_CATEGORY_LABELS } from "../../../convex/categoryList";

export const Route = createFileRoute("/expense/$expenseId")({
  component: () => (
    <RequireAuth>
      <ExpenseDetail />
    </RequireAuth>
  ),
});

function ExpenseDetail() {
  const { expenseId } = Route.useParams();
  const eid = expenseId as Id<"expenses">;
  const me = useMe();
  const { has } = useMyPermissions();
  const expense = useQuery(api.expenses.get, { expenseId: eid });
  const submitter = useQuery(
    api.users.get,
    expense ? { userId: expense.submitterId } : "skip",
  );
  const receiptUrl = useQuery(
    api.files.getReceiptUrl,
    expense ? { expenseId: expense._id } : "skip",
  );

  if (expense === undefined || me === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (expense === null || me === null) {
    return <ForbiddenPanel message="Expense not found." />;
  }

  const isOwner = expense.submitterId === me.user._id;
  const isOwnerDraft = expense.status === "draft" && isOwner;
  const isOwnerRejected = expense.status === "rejected" && isOwner;
  const canApprove = has(PERMISSIONS.expensesApprove);
  const isPendingDecision = expense.status === "pending" && canApprove && !isOwner;

  // Manager-style activity log if the viewer can approve OR has read.team.
  const view = isOwner && !canApprove ? "owner" : "full";

  const backTo = isOwner ? "/" : "/expenses";

  return (
    <div className="space-y-4">
      <BackLink
        to={backTo}
        label={isOwner ? "Back to my expenses" : "Back to expenses"}
      />

      <PageHeader
        title={
          isOwnerDraft
            ? "Edit draft"
            : isOwnerRejected
              ? "Edit & resubmit"
              : "Expense detail"
        }
        description={
          isOwnerDraft
            ? "Keep editing until you submit. Submitted expenses become immutable."
            : isOwnerRejected
              ? "This expense was rejected. Update the details and resubmit for approval."
              : !isOwner && submitter
                ? `Submitted by ${submitter.name ?? submitter.email ?? "an employee"}`
                : undefined
        }
        actions={<StatusBadge status={expense.status} />}
      />

      {isOwnerDraft ? (
        <Card>
          <CardContent className="pt-6">
            <ExpenseForm initial={expense} />
          </CardContent>
        </Card>
      ) : isOwnerRejected ? (
        <Card>
          <CardContent className="pt-6">
            <ExpenseForm initial={expense} mode="resubmit" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">
              {expense.description}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <DescItem label="Amount">
              {formatMoney(expense.amount, expense.currency)}
            </DescItem>
            <DescItem label="Category">
              {EXPENSE_CATEGORY_LABELS[
                expense.category as keyof typeof EXPENSE_CATEGORY_LABELS
              ] ?? expense.category}
            </DescItem>
            <DescItem label="Submitted">
              {formatDateTime(expense.submittedAt)}
            </DescItem>
            <DescItem label="Decided">
              {formatDateTime(expense.decidedAt)}
            </DescItem>
            <DescItem label="Receipt">
              {receiptUrl ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open receipt
                    <ExternalLink
                      className="size-3.5"
                      aria-hidden="true"
                    />
                  </a>
                </Button>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DescItem>
          </CardContent>
        </Card>
      )}

      {isPendingDecision ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Decision</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <ApprovalDialog
              expenseId={expense._id}
              mode="reject"
              trigger={
                <Button variant="destructive">
                  <XCircle className="size-4" aria-hidden="true" />
                  Reject
                </Button>
              }
            />
            <ApprovalDialog
              expenseId={expense._id}
              mode="approve"
              trigger={
                <Button>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Approve
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {isOwnerDraft ? <DeleteDraftCard expenseId={expense._id} /> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityLog expenseId={expense._id} view={view} />
        </CardContent>
      </Card>
    </div>
  );
}

function DeleteDraftCard({ expenseId }: { expenseId: Id<"expenses"> }) {
  const deleteDraft = useMutation(api.expenses.deleteDraft);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await deleteDraft({ expenseId });
      toast.success("Draft deleted");
      void navigate({ to: "/" });
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not delete"));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-destructive">
          Delete draft
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          This permanently removes the draft and its receipt. You can't undo it.
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this draft?</DialogTitle>
              <DialogDescription>
                The expense and its receipt will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void go()}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function DescItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  );
}
