# Design — Patterns Cookbook

Companion to [`DESIGN.md`](DESIGN.md). DESIGN.md defines tokens (colors, scales, fonts); this file defines how to **use** them consistently.

## Color usage

| Role        | Token              | When to use                                       |
| ----------- | ------------------ | ------------------------------------------------- |
| Primary     | `bg-primary`       | Submit buttons, primary CTAs, brand surfaces      |
| Secondary   | `bg-secondary`     | Inline buttons, neutral surfaces                  |
| Accent      | `bg-accent`        | Hover/active states, faint primary tinted panels  |
| Muted       | `bg-muted`         | Section dividers, placeholder fields              |
| Destructive | `bg-destructive`   | Reject buttons, destructive confirmations         |
| Success     | `bg-success`       | Approved badges                                   |
| Warning     | `bg-warning`       | Pending badges, draft warnings                    |

Avoid raw hex in components — always reach for the token via `bg-*`/`text-*`/`border-*`.

## Typography hierarchy

| Element              | Class chain                                               |
| -------------------- | --------------------------------------------------------- |
| Page title (h1)      | `text-2xl font-semibold tracking-tight`                   |
| Section heading (h2) | `text-lg font-semibold`                                   |
| Card heading         | `text-base font-semibold`                                 |
| Body                 | `text-sm` (default) / `text-base` (long-form)             |
| Hint / supporting    | `text-sm text-muted-foreground`                           |
| Label / caps         | `text-xs uppercase tracking-wide font-mono text-muted-foreground` |

Font scale comes from DESIGN.md: 12 / 14 / 16 / 20 / 24 / 32. Never go off-scale.

## Spacing rhythm

Spacing is on a **4-px grid** (DESIGN.md: 4 / 8 / 12 / 16 / 24 / 32). Page-level gaps use `space-y-6`; card-internal gaps `space-y-4`; tight inline groups `gap-2`. Avoid arbitrary `p-3.5` etc.

## Layout primitives

- **Page shell:** `max-w-6xl mx-auto px-6 py-8` plus `space-y-6` for the children block.
- **Card:** shadcn `<Card>` — never roll your own border/shadow box. If you find yourself writing `border rounded-lg`, you want `<Card>`.
- **Form layout:** vertical, max width `max-w-xl`, `space-y-4` between fields, action row pinned bottom-right with `flex justify-end gap-2`.
- **Table layout:** filters bar (sticky top), then table inside `<Card className="p-0">`. Pagination row inside the same card footer.

## Status badge palette

The `<StatusBadge>` component owns the role↔color mapping. Don't render colored pills inline.

## Iconography

Lucide only. Standard sizes:
- Inline with text: `size-4`
- Button leading icon: `size-4`
- Empty-state icon: `size-12 text-muted-foreground`

## Radii

Use the named radii from `index.css` (`--radius`, derived `--radius-sm` etc.). Cards: `rounded-lg`. Buttons: `rounded-md`. Pills/badges: `rounded-full`.

## Motion

Hover: `transition-colors`. Focus: `focus-visible:ring-2 ring-ring`. Avoid bespoke transitions — shadcn handles 99% via `cva` variants.

## Dark mode

Every token has a dark counterpart in `:root.dark`. Don't hardcode dark-mode-only colors. If a thing looks wrong in dark mode, fix the token, not the component.

## Don'ts

- No raw `<button>` styling — use shadcn `<Button>`.
- No emoji in labels (unless a user explicitly requests).
- No marketing-style gradients or shadows. Surfaces are flat with subtle shadow tokens.
- No off-grid spacing.
- No `text-purple-600` etc. — go through `--primary` and friends.
