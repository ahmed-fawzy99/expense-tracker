import { CurrencySelect } from "@/components/CurrencySelect";
import { NumberInput } from "@/components/NumberInput";
import { ReceiptUploader } from "@/components/ReceiptUploader";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
} from "../../convex/categoryList";

const schema = z.object({
  description: z
    .string()
    .min(1, "Required")
    .max(280, "Keep under 280 characters"),
  currency: z.string().length(3, "Pick a currency").toUpperCase(),
  amountMajor: z
    .string()
    .min(1, "Required")
    .regex(/^\d+(\.\d{1,2})?$/, "Use a number like 12.34"),
  category: z.enum([...EXPENSE_CATEGORIES] as [string, ...string[]]),
});

type FormValues = z.infer<typeof schema>;

type ExpenseFormMode = "draft" | "resubmit";

interface ExpenseFormProps {
  /** When provided, the form runs in edit mode (draft or resubmit). */
  initial?: Doc<"expenses"> | null;
  /**
   * "draft" (default) — the original create / save-draft / submit flow.
   * "resubmit" — for owners editing a rejected expense; only one action
   * button is shown ("Save & resubmit") and it calls `editAndResubmit`.
   */
  mode?: ExpenseFormMode;
}

export function ExpenseForm({ initial, mode = "draft" }: ExpenseFormProps) {
  const navigate = useNavigate();
  const createDraft = useMutation(api.expenses.createDraft);
  const updateDraft = useMutation(api.expenses.updateDraft);
  const submit = useMutation(api.expenses.submit);
  const createAndSubmit = useMutation(api.expenses.createAndSubmit);
  const editAndResubmit = useMutation(api.expenses.editAndResubmit);

  const [receiptId, setReceiptId] = useState<Id<"_storage"> | null>(
    initial?.receiptStorageId ?? null,
  );
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const form = useForm<FormValues>({
    resolver: standardSchemaResolver(schema),
    defaultValues: {
      description: initial?.description ?? "",
      currency: initial?.currency ?? "USD",
      amountMajor: initial ? (initial.amount / 100).toFixed(2) : "",
      category: initial?.category ?? "other",
    },
  });

  // ---- helpers -----------------------------------------------------

  function toMinor(amountMajor: string): number {
    return Math.round(parseFloat(amountMajor) * 100);
  }

  async function onSaveDraft(values: FormValues) {
    setBusy(true);
    setReceiptError(null);
    try {
      const amount = toMinor(values.amountMajor);
      const id = initial
        ? (await updateDraft({
            expenseId: initial._id,
            description: values.description,
            amount,
            currency: values.currency,
            category: values.category as (typeof EXPENSE_CATEGORIES)[number],
            receiptStorageId: receiptId,
          })) && initial._id
        : await createDraft({
            description: values.description,
            amount,
            currency: values.currency,
            category: values.category as (typeof EXPENSE_CATEGORIES)[number],
            receiptStorageId: receiptId,
          });
      toast.success("Draft saved");
      void navigate({
        to: "/expense/$expenseId",
        params: { expenseId: id as Id<"expenses"> },
      });
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to save"));
    } finally {
      setBusy(false);
    }
  }

  async function onResubmit(values: FormValues) {
    if (!initial) return; // resubmit mode requires an existing expense
    if (!receiptId) {
      setReceiptError("Attach a receipt before resubmitting.");
      return;
    }
    setBusy(true);
    setReceiptError(null);
    try {
      const amount = toMinor(values.amountMajor);
      await editAndResubmit({
        expenseId: initial._id,
        description: values.description,
        amount,
        currency: values.currency,
        category: values.category as (typeof EXPENSE_CATEGORIES)[number],
        receiptStorageId: receiptId,
      });
      toast.success("Resubmitted for approval");
      void navigate({
        to: "/expense/$expenseId",
        params: { expenseId: initial._id },
      });
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to resubmit"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitForApproval(values: FormValues) {
    if (!receiptId) {
      // Inline error under the receipt field — never a toast for a
      // missing-required-field scenario.
      setReceiptError("Attach a receipt before submitting.");
      return;
    }
    setBusy(true);
    setReceiptError(null);
    try {
      const amount = toMinor(values.amountMajor);
      let id: Id<"expenses">;
      if (initial) {
        // Editing an existing draft: persist edits, then submit. Both
        // mutations check status === "draft" so a concurrent submission
        // can't double-submit.
        await updateDraft({
          expenseId: initial._id,
          description: values.description,
          amount,
          currency: values.currency,
          category: values.category as (typeof EXPENSE_CATEGORIES)[number],
          receiptStorageId: receiptId,
        });
        await submit({ expenseId: initial._id });
        id = initial._id;
      } else {
        // Fresh expense — atomic create + submit so a guard failure
        // (e.g. no managerId) never leaves an orphan draft behind.
        id = await createAndSubmit({
          description: values.description,
          amount,
          currency: values.currency,
          category: values.category as (typeof EXPENSE_CATEGORIES)[number],
          receiptStorageId: receiptId,
        });
      }
      toast.success("Submitted for approval");
      void navigate({
        to: "/expense/$expenseId",
        params: { expenseId: id },
      });
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed to submit"));
    } finally {
      setBusy(false);
    }
  }

  // ---- render ------------------------------------------------------

  return (
    <Form {...form}>
      <form className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <CurrencySelect
                  value={field.value}
                  onChange={field.onChange}
                  disabled={busy}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="md:col-span-3">
            <FormField
              control={form.control}
              name="amountMajor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <NumberInput
                      placeholder="0.00"
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="What was this for?"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="min-w-48">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Receipt</FormLabel>
          <ReceiptUploader
            value={receiptId}
            onChange={(id) => {
              setReceiptId(id);
              if (id) setReceiptError(null);
            }}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            {mode === "resubmit"
              ? "Required to resubmit for approval."
              : "Required to submit for approval. Drafts can be saved without one."}
          </p>
          {receiptError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {receiptError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {mode === "resubmit" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={(e) => void form.handleSubmit(onResubmit)(e)}
            >
              Save & resubmit
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={(e) => void form.handleSubmit(onSaveDraft)(e)}
              >
                Save draft
              </Button>
              <Button
                type="button"
                disabled={busy}
                onClick={(e) => void form.handleSubmit(onSubmitForApproval)(e)}
              >
                Submit for approval
              </Button>
            </>
          )}
        </div>
      </form>
    </Form>
  );
}
