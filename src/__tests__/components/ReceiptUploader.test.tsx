import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("convex/react", async () => {
  const m = await import("../_helpers/mockConvex");
  return m.convexMock();
});

import { api } from "../../../convex/_generated/api";
import { resetConvexMocks, setMutationImpl } from "../_helpers/mockConvex";
import { ReceiptUploader } from "@/components/ReceiptUploader";
import type { Id } from "../../../convex/_generated/dataModel";

beforeEach(() => {
  resetConvexMocks();
  vi.restoreAllMocks();
});

describe("<ReceiptUploader />", () => {
  it("renders the empty-state CTA when no value is attached", () => {
    render(<ReceiptUploader value={null} onChange={() => {}} />);
    expect(screen.getByText(/png, jpeg, webp, or pdf/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose file/i }),
    ).toBeInTheDocument();
  });

  it("renders the 'attached' confirmation when a value is set", () => {
    render(
      <ReceiptUploader
        value={"sk_storage_1" as Id<"_storage">}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/receipt attached/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove/i }),
    ).toBeInTheDocument();
  });

  it("calls onChange(null) when the user clicks Remove", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReceiptUploader
        value={"sk_storage_1" as Id<"_storage">}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /remove/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("rejects an oversized file with a client-side error", async () => {
    setMutationImpl(api.files.generateUploadUrl, async () => "https://upload");
    const onChange = vi.fn();
    render(<ReceiptUploader value={null} onChange={onChange} />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const big = new File(["x".repeat(11 * 1024 * 1024)], "huge.pdf", {
      type: "application/pdf",
    });
    await userEvent.upload(input, big);

    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText(/≤\s*10\s*MB/i)).toBeInTheDocument();
  });

  it("rejects a disallowed mime type with a client-side error", async () => {
    const onChange = vi.fn();
    render(<ReceiptUploader value={null} onChange={onChange} />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const txt = new File(["hello"], "hello.txt", { type: "text/plain" });
    await userEvent.upload(input, txt);

    expect(onChange).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/png, jpeg, webp, or pdf/i),
    ).toBeInTheDocument();
  });

  it("posts the file to the generated upload URL and surfaces the storage id", async () => {
    setMutationImpl(api.files.generateUploadUrl, async () => "https://upload");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ storageId: "sk_storage_42" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();
    render(<ReceiptUploader value={null} onChange={onChange} />);

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const png = new File(["x"], "r.png", { type: "image/png" });
    await userEvent.upload(input, png);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://upload",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onChange).toHaveBeenCalledWith("sk_storage_42");
  });
});
