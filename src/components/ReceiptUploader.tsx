import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Upload, FileCheck2, FileX2, Loader2, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024;

interface ReceiptUploaderProps {
  value: Id<"_storage"> | null;
  onChange: (storageId: Id<"_storage"> | null) => void;
  disabled?: boolean;
}

/**
 * Two-phase upload:
 *   1) ask Convex for a one-shot upload URL,
 *   2) PUT the file directly to that URL.
 *
 * The server validates MIME + size when the storage id is bound to an
 * expense (in `expenses.attachReceipt` / `submit`); the client-side checks
 * here are only for fast feedback.
 */
export function ReceiptUploader({
  value,
  onChange,
  disabled,
}: ReceiptUploaderProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  async function uploadFile(file: File) {
    setError(null);
    if (!ALLOWED_MIME.includes(file.type)) {
      setError("File must be PNG, JPEG, WEBP, or PDF.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`File must be ≤ ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`);
      return;
    }
    setBusy(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }
      const data: unknown = await res.json();
      const storageId =
        typeof data === "object" && data !== null && "storageId" in data
          ? (data as { storageId: string }).storageId
          : null;
      if (!storageId) throw new Error("Upload did not return a storage id");
      onChange(storageId as Id<"_storage">);
    } catch (e) {
      setError(getErrorMessage(e, "Upload failed"));
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,.pdf"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <div
        className={cn(
          "rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center",
          !value && !disabled && !busy && "cursor-pointer hover:bg-muted/50 transition-colors",
          (disabled || busy) && "opacity-60",
        )}
        onClick={() => !value && !disabled && !busy && inputRef.current?.click()}
      >
        {value ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileCheck2 className="size-4 text-success" aria-hidden="true" />
            Receipt attached
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={clear}
              disabled={disabled || busy}
            >
              <X className="size-3" aria-hidden="true" />
              Remove
            </Button>
          </div>
        ) : busy ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Uploading…
          </div>
        ) : (
          <div className="space-y-2">
            <Upload
              className="mx-auto size-6 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              PNG, JPEG, WEBP, or PDF. Max 10 MB.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
          </div>
        )}
      </div>
      {error ? (
        <p className="flex items-center gap-1 text-sm text-destructive">
          <FileX2 className="size-3.5" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
