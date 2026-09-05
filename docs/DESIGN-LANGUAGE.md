# Umang Hospital — Design Language

The north star for the project-wide rework. Written from a healthtech product
lens: we optimise for **clinical safety, cognitive load, and trust** — not
decoration. Every page should be reducible to these rules.

## 1. Two modes, one system

The product has two audiences with opposite needs. Same tokens, different density.

| | **Clinical surfaces** (staff) | **Patient surfaces** |
|---|---|---|
| Goal | Glanceability, throughput, zero error | Reassurance, clarity, one next step |
| Density | High — rationed whitespace, dense worklists | Low — generous space, calm |
| Type floor | 13–14px body, tabular numbers for data | 15–16px body |
| Color | Ink + status; almost no decorative fills | Ink + one warm accent + photography |
| Motion | Minimal, functional | Gentle, welcoming |

## 2. The only two questions that matter

- **Clinician:** *"What needs my attention, and what do I do about it?"* → Critical/abnormal state is never more than one glance away; the primary action is obvious.
- **Patient:** *"What's happening to me, and what do I do next?"* → Surface current journey stage + the next action above the fold.

## 3. Color contract (white-first, single accent)

Surfaces are **white**; separation is by **hairline border first, soft shadow second**. Color is meaning, not decoration.

- **Brand/accent:** brand teal `#1E97B2` (primary) with orange `#FFA600` as the accent, matching the Umang Hospital website. `#1E97B2` on white text is **3.43:1** and fails AA, so it never carries *body text* — it's fill-only, always paired with navy `--color-on-primary` `#0D2032` (**4.82:1** on teal). It can still colour a small icon (WCAG 1.4.11 asks 3:1 of a graphical object, not 4.5:1, and `#1E97B2` clears that on its own). Fills that need a text-safe teal (CTA hover/press, dark hero surfaces, gradient stops) use `--color-primary-dark` `#196b7e` or darker instead (**6.09:1** with white) — never `#1E97B2`, and never `--color-primary-light` `#6acdd9` (1.85:1, the palest tint, worse than the brand teal itself). The text/link accent is `--color-accent` `#955408` (**5.92:1** on white) — deliberately *not* the website's `accent-700` `#B86D02`, which measures 4.02:1 and fails AA. `--color-brand-orange` `#FFA600` is fill-only, **1.96:1** on white, never text. `globals.css` carries a **second**, scoped palette — `.intake-theme`, wrapping the check-in wizard — that redefines these same tokens and does not inherit `:root`, so a palette change must be applied in both places. Used for primary actions, links, active state, focus, selection. Nothing else competes; no purple/indigo, and blue/orange from the retired palette are blocked by lint (`eslint.config.mjs`); `src/app/__tests__/theme-contrast.test.ts` asserts these ratio thresholds plus a source-wide scan for white text landing on an unsafe teal fill.
- **Status is semantic and fixed everywhere** — use `StatusPill` / status tokens, never raw hex:
  - 🔴 `critical` danger — life-threatening / immediate
  - 🟠 `urgent` — high priority, act soon
  - 🟡 `caution` warning — abnormal / needs attention
  - 🟢 `stable`/`done` success — normal / on-track / resolved
  - 🔵 `info` — informational
  - ⚪ `pending`/`neutral` — waiting / default
- **Banned:** gradient-filled text/numbers, rainbow stat tiles, decorative blue/green fills, color-only status. Demote brand-green to *success only*.

## 4. Status is triple-encoded (patient-safety rule)

**Color alone is a defect.** Every status = colour + icon + text (`StatusPill`),
so it survives greyscale, glare, and screen readers. One vocabulary across
doctor, nurse, lab, pharmacy and the patient app → learnability → fewer errors.

## 5. Spacing — 8pt rhythm (Apple-level)

Space steps: 4 · 8 · 12 · 16 · 24 · 32. Use the `Stack`/`Grid` helpers and
`PageContainer` for page width + gutters. Card padding is a token, not ad-hoc.

## 6. Typography — semantic, not pixel-poked

Use the type scale classes (`t-display`/`t-h1`/`t-h2`/`t-h3`/`t-title`/`t-body`/
`t-label`/`t-caption`/`t-overline`), never `text-[Npx]`. Readable floor: 14px
body, 12px caption. Data uses `tabular-nums`. One `<h1>` per page (the shell
owns it); in-content titles are `<h2>`+.

- **Stat values:** use `.t-kpi` (28px tabular) for KPI tile numbers; **dense data
  cells:** `.t-mono-num`. Both are tabular so columns never reflow.
- **Heading weight — clinical = 700.** Clinical surfaces render headings at weight
  **700** for ward-tablet glanceability under glare. This intentionally **overrides**
  DESIGN.md's "display weight 300" rule, which is a *marketing/brand* signature.
  The thin tier survives as `.t-display-thin` (weight 300, negative tracking) —
  **opt-in for patient-facing / landing heroes only**, never clinical worklists.
- **Family — Figtree everywhere, Playfair by exception.** `--font-body` and
  `--font-heading` are Figtree across every surface, clinical and patient-facing
  alike. `--font-display` is Playfair Display, a display serif, exposed as the
  Tailwind-generated `font-display` utility class — never a bespoke
  `font-family` declaration. It is applied to exactly three headings: the
  landing hero `<h1>`, the closing-CTA `<h2>`, and the check-in `<h1>`. It is
  orthogonal to the `.t-*` size scale (both classes compose, e.g.
  `t-h1 font-display`) and must never reach a clinical worklist, table, queue,
  or form, where a serif costs scanning speed.

## 6b. Elevation & micro-interaction (the "premium" layer)

Depth and motion come from **tokens, not effects** — no decorative glow/gradients.

- **Elevation:** layered, ink-tinted shadows (`shadow-xs…2xl`, `shadow-card`).
  Hairline border first, shadow second. `.surface-raised` for secondary panels.
- **Micro-interaction:** `.u-lift` (card hover lift), `.u-press` (tap scale),
  `.u-row` (worklist row hover). Framer lists use `motionPresets.listItem(i)` /
  `cardIn` from [`src/lib/design-tokens.ts`](../src/lib/design-tokens.ts) for a
  uniform 28ms-stagger spring entrance.
- **Focus:** the global two-tone focus ring (`--shadow-focus`) reads on any
  surface. Don't remove focus styling on interactive elements.

## 7. Accessibility = safety (AA floor, Google-level)

- Contrast AA minimum; never rely on colour alone.
- Touch targets ≥44px on touch (`.tap`); inputs always labelled.
- Modals trap focus + restore it (`useFocusTrap`), `aria-modal`, ESC + backdrop close.
- Every image has `alt`; icon-only buttons have `aria-label`.
- Honour `prefers-reduced-motion`.

## 8. Mobile-first (ward tablets & patient phones)

Author the phone layout first (`grid-cols-1`), enhance up (`sm:`/`md:`/`lg:`).
Wide tables become stacked cards via `ResponsiveTable` — never horizontal scroll
on a phone.

## 9. Imagery

Human-centred photography (`Photo`, the hospital's own photography via
`next/image`, lazy + blur) on **landing + patient-facing only**. Never in
clinical worklists (focus + perf). Always a tinted overlay behind text for AA
contrast.

## Building blocks (reuse, don't reinvent)

`PageContainer` · `PageHeader` · `Stack`/`Grid` · `Card` · `StatusPill` ·
`StatCard` · `Badge` · `Button` · `Input`/`Textarea`/`Select` · `ResponsiveTable` ·
`DataTable` · `EmptyState` · `Photo` · `ConfirmDialog` · `useFocusTrap`.
Tokens live in [`src/app/globals.css`](../src/app/globals.css).
