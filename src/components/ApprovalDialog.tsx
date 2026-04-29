import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";

interface ApprovalDialogProps {
  expenseId: Id<"expenses">;
  mode: "approve" | "reject";
  trigger: React.ReactNode;
  onDone?: () => void;
}

export function ApprovalDialog({
  expenseId,
  mode,
  trigger,
  onDone,
}: ApprovalDialogProps) {
  const approve = useMutation(api.approvals.approve);
  const reject = useMutation(api.approvals.reject);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go() {
    if (mode === "reject" && note.trim().length === 0) {
      setNoteError("A reason is required to reject.");
      return;
    }
    setBusy(true);
    setNoteError(null);
    try {
      if (mode === "approve") {
        await approve({ expenseId });
        toast.success("Approved");
      } else {
        await reject({ expenseId, note });
        toast.success("Rejected");
      }
      setOpen(false);
      setNote("");
      onDone?.();
    } catch (e) {
      toast.error(getErrorMessage(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  }

  const isReject = mode === "reject";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isReject ? "Reject expense" : "Approve expense"}
          </DialogTitle>
          <DialogDescription>
            {isReject
              ? "Tell the submitter why so they can fix it."
              : "This will mark the expense as approved and notify the submitter."}
          </DialogDescription>
        </DialogHeader>
        {isReject ? (
          <div className="space-y-2">
            <Label htmlFor="reject-note">Reason</Label>
            <Textarea
              id="reject-note"
              rows={4}
              placeholder="Missing itemized total, etc."
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (noteError && e.target.value.trim().length > 0) {
                  setNoteError(null);
                }
              }}
              autoFocus
              aria-invalid={noteError ? "true" : undefined}
            />
            {noteError ? (
              <p
                role="alert"
                className="text-sm font-medium text-destructive"
              >
                {noteError}
              </p>
            ) : null}
          </div>
        ) : null}
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
            variant={isReject ? "destructive" : "default"}
            onClick={() => void go()}
            disabled={busy}
          >
            {isReject ? "Reject" : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
