# `convex/__tests__/` — Backend test suite

## What lives here

All Vitest test files for the Convex backend, plus shared test-only utilities. Tests are **consolidated here**, not co-located next to the modules they cover.

| File                    | Covers                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| `expenses.test.ts`      | Draft/submit/edit lifecycle in `convex/expenses.ts`                   |
| `approvals.test.ts`     | Approve/reject + chain progression in `convex/approvals.ts`           |
| `crossTeam.test.ts`     | Cross-team isolation across the public API                            |
| `files.test.ts`         | Receipt upload + signed-URL access in `convex/files.ts`               |
| `chain.test.ts`         | `convex/lib/chain.ts` eligibility / duplicate / current-approver checks |
| `permissions.test.ts`   | `convex/lib/permissions.ts` `permissionsFor` resolution               |
| `testHelpers.utils.ts`  | Shared `makeT`, `makeUser`, `seedRolesAndTeams`, `storeReceiptForTest` |

## Belongs here

- `*.test.ts` files using `convex-test` + Vitest.
- Shared world-setup helpers used by multiple test files.

## Does NOT belong here

- Functions registered as `query`, `mutation`, or `action` (production code) — those live at `convex/` root.
- Helpers used by production code — those live in `convex/lib/`.

## Path conventions

Because tests live one level deep, imports use `../`:

- `import { api } from "../_generated/api"`
- `import schema from "../schema"`
- `import { ... } from "../lib/chain"`
- Shared helpers within this folder use `./testHelpers.utils`

The `convex-test` module glob spans the whole `convex/` tree:

```ts
const modules = import.meta.glob("../**/*.ts");
```

## Run

```bash
pnpm vitest run                # all
pnpm vitest run --coverage     # with coverage
```

Coverage target: 80% on `convex/lib/*` and the four "load-bearing" modules (`expenses.ts`, `approvals.ts`, `files.ts`, `auth.ts`).
