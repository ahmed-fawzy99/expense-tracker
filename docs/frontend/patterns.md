# Frontend — Patterns Cookbook

Mandatory recipes. The goal: every page looks like every other page, every form like every other form. If you find yourself writing a one-off, talk to the codebase first.

## 1. Page shell

Every page renders a `<PageHeader>` + a `<Card>`-driven body. Heading is always `h1`, sub-text is `text-muted-foreground`.

```tsx
export default function MyPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="My Expenses" description="All your submissions." />
      <Card>...</Card>
    </div>
  );
}
```

## 2. Forms — react-hook-form + zod v4

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  description: z.string().min(1).max(280),
  amount: z.number().int().positive(),
  currency: z.string().length(3).toUpperCase(),
  category: z.enum(EXPENSE_CATEGORIES),
});
type FormValues = z.infer<typeof schema>;

const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues });
```

- Always use `<Form>`, `<FormField>`, `<FormItem>`, `<FormControl>`, `<FormMessage>` from shadcn — never raw `<input>` once a form exists.
- Errors come from zod, not from manual checks.
- Submit handlers call the matching Convex mutation and use `toast` for feedback.

## 3. Tables — TanStack Table

```tsx
const columns: ColumnDef<ExpenseRow>[] = useMemo(() => [
  { accessorKey: "submittedAt", header: "Submitted", cell: ({ row }) => formatDate(row.original.submittedAt) },
  { accessorKey: "description", header: "Description" },
  { id: "amount", header: "Amount", cell: ({ row }) => formatMoney(row.original.amount, row.original.currency) },
  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  { id: "actions", cell: ({ row }) => <Link to="..." params={{ expenseId: row.original._id }}>View</Link> },
], []);
```

Filters live **above** the table and pass into the Convex query, not into the table. The client-side table only handles sort + pagination of what it received.

## 4. Convex hooks

```ts
const me = useMe();                              // { user, permissions } | null | undefined
const can = useMyPermissions();                  // (perm: string) => boolean
const expenses = useQuery(api.expenses.listMine, { status: "pending" });
const submit = useMutation(api.expenses.submit);
```

- `undefined` from `useQuery` means *loading*. Render a `<Skeleton>`.
- `null` means *empty result* in our codebase convention; render the empty state.
- Never call a mutation from a component that hasn't already verified the permission via `useMyPermissions`.

## 5. Permission gating — never redirect on 403

```tsx
<RequirePermission permission="expenses.approve">
  <ManagerQueue />
</RequirePermission>

// RequirePermission renders <ForbiddenPanel /> in place when the user lacks it.
```

The server is the authority — gating in the client is **for UX only**. The mutation/query will still throw if a savvy user crafts a request the UI didn't expose.

## 6. Status badge palette

Use `<StatusBadge status={...} />`. The component owns the mapping:

| Status      | Color (shadcn variant)        |
| ----------- | ----------------------------- |
| `draft`     | secondary (neutral)           |
| `pending`   | warning (amber)               |
| `approved`  | success (green)               |
| `rejected`  | destructive (red)             |

## 7. Money formatting

`formatMoney(minor: number, currency: string)` from `lib/format.ts`. Always pass minor units. Never compute display from the major unit on the client.

## 8. Loading and empty states

- Loading: `<Skeleton>` rows that match the eventual layout — never a centered spinner.
- Empty: `<EmptyState icon={...} title="No expenses yet" description="..." action={...} />`.

## 9. Error toasts

```ts
try {
  await submit({ ... });
  toast.success("Submitted");
} catch (e) {
  toast.error(e instanceof Error ? e.message : "Something went wrong");
}
```

Server messages from `requirePermission` / `requireSameTeam` are designed to be user-friendly — surface them.

## 10. File uploads (receipts)

`<ReceiptUploader>` does the upload in 2 steps:

1. `await convex.mutation(api.files.generateUploadUrl)` → URL
2. `fetch(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file })` → `{ storageId }`
3. Pass `storageId` to `expenses.attachReceipt` — the **server** does the real validation and orphan-cleanup. Client-side checks (size, type) are only for fast feedback.

## 11. Routing

- `Link` from `@tanstack/react-router` — never `<a>` for in-app nav.
- Loaders: prefer `useQuery` over TanStack Router's loader API for now (Convex live queries do not interop natively with TanStack loaders in v1; keep it simple).

## 12. Naming

- Components: `PascalCase.tsx`.
- Hooks: `useFooBar.ts`, `camelCase`, exported as named.
- Utilities: `camelCase.ts`, named exports.
- One component per file, default-export the component, named-export sub-types/props.

## 13. Refactor signal

If a file passes ~250 lines, you've grown a side project inside it. Extract:
- Repeated hook usage → custom hook in `hooks/`.
- Repeated layout → component in `components/`.
- Repeated logic → helper in `lib/`.

## 14. Testing — Vitest + RTL with Convex hooks mocked

Frontend tests live in `src/__tests__/` (mirrors `convex/__tests__/`). Co-located `*.test.tsx` next to source files is **not** allowed — keep tests in the dedicated folder so the source tree stays scannable.

Key helpers under `src/__tests__/_helpers/`:

- `mockConvex.ts` — replaces `convex/react` so `useQuery` / `useMutation` / `useAction` read from a per-test state map. Use `setQueryResult(api.x.y, value)` and `getMutationCalls(api.x.y)` to drive and assert.
- `mockRouter.tsx` — replaces `@tanstack/react-router`. `<Link>` becomes `<a href>`, `<Navigate>` becomes a `data-testid="navigate-stub"` marker, and `createFileRoute(...)({...})` returns a Route object whose `.options.component` is the page body. Render via `<Route.options.component />`.
- `fixtures.ts` — `fakeMe()`, `fakeExpense()` typed against the generated dataModel.

```tsx
vi.mock("convex/react", async () => (await import("../_helpers/mockConvex")).convexMock());
vi.mock("@tanstack/react-router", async () => (await import("../_helpers/mockRouter")).routerMock());

import { Route } from "@/routes/index";
import { setQueryResult } from "../_helpers/mockConvex";
import { fakeMe } from "../_helpers/fixtures";
import { api } from "../../../convex/_generated/api";

const Component = (Route as { options: { component: () => React.ReactNode } }).options.component;

it("renders the page when authed", () => {
  setQueryResult(api.auth.getMe, fakeMe({ permissions: ["expenses.read.own"] }));
  setQueryResult(api.expenses.listMine, { page: [], isDone: true, continueCursor: "" });
  render(<Component />);
  expect(screen.getByRole("heading", { name: /my expenses/i })).toBeInTheDocument();
});
```

For permission gating, **never** assert on URL or redirect — assert that `<ForbiddenPanel>` rendered (heading "Access denied"). Redirecting on 403 is forbidden by `src/CLAUDE.md`.

Run with `pnpm test:frontend` (or `pnpm test` for both projects).
