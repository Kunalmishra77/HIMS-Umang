# Umang Brand Retheme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HIMS look like a continuation of the Umang Hospital website — teal-led palette, Figtree/Playfair type, real hospital photography instead of Unsplash stock.

**Architecture:** The app is Tailwind v4 with a `@theme` block in `src/app/globals.css`. 91 files consume semantic tokens (`bg-primary`, `var(--color-primary)`) and retheme for free when those token *values* change; only 24 files hardcode hexes and need edits. There are **two** palettes to repoint: the root `@theme` block and a scoped `.intake-theme` override for the check-in wizard, which redefines the same tokens and therefore does not inherit a `:root` change.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, TypeScript, Vitest, next/image.

**Spec:** `docs/superpowers/specs/2026-09-04-umang-brand-retheme-design.md`

## Global Constraints

- Colour, type and imagery only. **No behaviour, layout, spacing or component-structure changes.**
- Every text/background pairing must measure **≥ 4.5:1** (WCAG AA, normal text). Ratios are asserted by test, not eyeballed.
- `#1E97B2` on **white text is 3.4:1 and fails AA.** Text-bearing fills use `--color-primary-dark` `#196b7e` (6.1:1 with white). `--color-primary` is paired with navy `#0f172a` (5.2:1).
- `--color-accent` is `#955408`, **not** the website's `accent-700 #B86D02` (4.0:1, fails AA).
- `#FFA600` is a **fill-only** colour (1.96:1 on white). Never body text.
- **Clinical colours are frozen.** `--color-brand-amber #F59E0B`, `--color-brand-green #16A34A`, `--color-warning #F59E0B`, `--color-danger`/`--color-success` keep their present values and meanings. `#FFA600` must never appear on a triage chip, NEWS2 score or critical-value banner.
- Photography appears on landing and patient-facing pages only — **never on clinical worklists**.
- Playfair Display is used **only** on landing/patient-facing hero headings, never in clinical tables, queues or forms.
- Hindi locale keeps Noto Sans Devanagari.
- After every task: `npx tsc --noEmit` clean, `npm run lint` 0 errors, `npm test` 126/126 (plus new tests), `npm run build` exit 0.

---

### Task 1: Contrast guard + root palette

Turns the spec's accessibility claims into an executing test, then repoints the root `@theme` block to satisfy it.

**Files:**
- Create: `src/lib/testing/contrast.ts`
- Create: `src/app/__tests__/theme-contrast.test.ts`
- Modify: `src/app/globals.css` (lines 10–28, 40, 44, 81, 116–118)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `contrast(hexA: string, hexB: string): number` from `@/lib/testing/contrast` — used by Task 2's test. Token names in `globals.css` are unchanged; only their values change.

- [ ] **Step 1: Write the contrast helper**

Create `src/lib/testing/contrast.ts`:

```ts
/* WCAG 2.1 relative luminance and contrast ratio.
 * Used by the theme tests to assert brand colours stay AA-legible, so a
 * palette change can never silently drop text below 4.5:1. */

function srgbToLinear(channel: number): number {
  const s = channel / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '').trim()
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

/** Contrast ratio between two hex colours, 1:1 (identical) to 21:1 (black on white). */
export function contrast(hexA: string, hexB: string): number {
  const a = luminance(hexA)
  const b = luminance(hexB)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}
```

- [ ] **Step 2: Write the failing test**

Create `src/app/__tests__/theme-contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast } from '@/lib/testing/contrast'

const css = readFileSync(join(import.meta.dirname, '../globals.css'), 'utf8')

/** Read a custom property's hex value from a named block of globals.css. */
function token(name: string, block: 'root' | 'intake' = 'root'): string {
  const scope = block === 'root'
    ? css.slice(0, css.indexOf('.intake-theme {'))
    : css.slice(css.indexOf('.intake-theme {'))
  const m = scope.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --${name} not found in ${block} block`)
  return m[1]
}

const WHITE = '#FFFFFF'

describe('brand palette — Umang website teal', () => {
  it('uses the website brand hues', () => {
    expect(token('color-primary').toUpperCase()).toBe('#1E97B2')
    expect(token('color-primary-dark').toUpperCase()).toBe('#196B7E')
    expect(token('color-accent').toUpperCase()).toBe('#955408')
  })

  it('keeps every text pairing at AA (4.5:1)', () => {
    // Brand fill carries navy text, not white — white on #1E97B2 is only 3.4:1.
    expect(contrast(token('color-primary'), token('color-on-primary'))).toBeGreaterThanOrEqual(4.5)
    // The dark teal is the one safe to put white text on.
    expect(contrast(token('color-primary-dark'), WHITE)).toBeGreaterThanOrEqual(4.5)
    // Accent is a text colour on white surfaces.
    expect(contrast(token('color-accent'), WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('proves white-on-primary is NOT safe, so the split stays justified', () => {
    expect(contrast(token('color-primary'), WHITE)).toBeLessThan(4.5)
  })

  it('keeps clinical severity colours frozen', () => {
    expect(token('color-brand-amber').toUpperCase()).toBe('#F59E0B')
    expect(token('color-brand-green').toUpperCase()).toBe('#16A34A')
    expect(token('color-warning').toUpperCase()).toBe('#F59E0B')
  })

  it('never lets brand orange become a text colour', () => {
    // #FFA600 is ~1.96:1 on white. Present as a fill token, but the low ratio
    // is the reason no component may use it for text.
    expect(contrast('#FFA600', WHITE)).toBeLessThan(3)
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: FAIL — `expected '#EE6B26' to be '#1E97B2'`.

- [ ] **Step 4: Repoint the root palette**

In `src/app/globals.css`, replace lines 10–28 (the brand-colour comment block and its tokens) with:

```css
  /* Brand Colors — Umang Hospital website palette: teal `#1E97B2` (primary)
     + orange `#FFA600` (accent), matching D:\Agentix Project\Umang2.0.
     No single teal is AA both as white-on-fill AND as text-on-white, so the
     brand teal is split — the same discipline the retired orange used.
     `--color-primary` is the exact brand teal, used for FILLS, always paired
     with navy `--color-on-primary` text (5.2:1). `--color-primary-dark` is the
     one dark enough for WHITE text (6.1:1) — CTA hover/press and text-bearing
     fills. `--color-accent` is AA-safe on white (5.9:1) for link/emphasis text.
     Ratios asserted in src/app/__tests__/theme-contrast.test.ts. */
  --color-primary: #1E97B2;          /* brand teal — fills / active / focus ring (navy text on it) */
  --color-primary-light: #6acdd9;    /* light teal — tints / accents */
  --color-primary-dark: #196b7e;     /* deep teal — CTA hover / active / press, white text safe */
  --color-primary-soft: rgba(30, 151, 178, 0.07);
  --color-on-primary: #0D2032;       /* navy ink for text/icons on teal fills */
  --color-accent: #955408;           /* AA-safe deep orange — links, emphasis text on white */
  --color-accent-soft: rgba(255, 166, 0, 0.10);
  /* Brand orange — the website's accent. Energy/highlight ONLY: fills, icons,
     underlines. NEVER body text on white (1.96:1, fails AA). NEVER on a triage
     chip, NEWS2 score or critical-value banner — brand colour must not read as
     a clinical severity. */
  --color-brand-orange: #FFA600;
  --color-brand-orange-strong: #e09000;
  --color-brand-orange-soft: rgba(255, 166, 0, 0.12);
  /* Clinical amber — FROZEN. Severity semantics, deliberately distinct from
     the brand orange above. */
  --color-brand-amber: #F59E0B;
  --color-brand-amber-strong: #D97706;
  --color-brand-amber-soft: rgba(245, 158, 11, 0.12);
```

Then append the website's full ramps directly after that block, for new work:

```css
  /* Website ramps (Umang2.0 frontend/tailwind.config.js) — available for new
     work; existing components use the semantic tokens above. */
  --color-primary-50: #f0fbfc;   --color-primary-500: #1E97B2;
  --color-primary-100: #d4f1f5;  --color-primary-600: #1a8299;
  --color-primary-200: #a8e3ec;  --color-primary-700: #196b7e;
  --color-primary-300: #6acdd9;  --color-primary-800: #1a5667;
  --color-primary-400: #35b3c4;  --color-primary-900: #1b4856;
  --color-primary-950: #0d2f3a;
  --color-accent-50: #fffbeb;    --color-accent-500: #FFA600;
  --color-accent-100: #fff3c6;   --color-accent-600: #e09000;
  --color-accent-200: #ffe588;   --color-accent-700: #b86d02;
  --color-accent-300: #ffd24a;   --color-accent-800: #955408;
  --color-accent-400: #ffbf20;   --color-accent-900: #7b440b;
  --color-accent-950: #472300;
```

Then apply these exact replacements elsewhere in the root block:

| Line | From | To |
|---|---|---|
| 40 | `--gradient-primary: linear-gradient(135deg, #C2481A 0%, #EE6B26 100%);` | `--gradient-primary: linear-gradient(135deg, #196b7e 0%, #1E97B2 100%);` |
| 44 | `rgba(238,107,38,0.03)` ×2 | `rgba(30,151,178,0.03)` ×2 |
| 81 | `--color-border-focus: #EE6B26;` | `--color-border-focus: #1E97B2;` |
| 116 | `rgba(238,107,38,0.06)` / `rgba(238,107,38,0.10)` | `rgba(30,151,178,0.06)` / `rgba(30,151,178,0.10)` |
| 117 | `rgba(238, 107, 38, 0.18)` | `rgba(30, 151, 178, 0.18)` |
| 118 | `rgba(238, 107, 38, 0.14)` | `rgba(30, 151, 178, 0.14)` |

Leave `--color-warning`, `--color-brand-green*`, `--color-secondary*` untouched.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify nothing else broke**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc silent, build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/testing/contrast.ts src/app/__tests__/theme-contrast.test.ts src/app/globals.css
git commit -m "feat(theme): repoint the root palette to the Umang website teal

Brand teal #1E97B2 leads, orange #FFA600 accents, matching the website.
The fill-vs-text token split is kept because the same trap applies: white
on #1E97B2 is 3.4:1, so text-bearing fills use #196b7e (6.1:1) and the
brand fill carries navy (5.2:1). The accent is #955408 (5.9:1), not the
website's accent-700 #B86D02, which measures 4.0:1 and fails AA.

Clinical amber/green/warning are frozen and asserted, so brand colour can
never be mistaken for a severity."
```

---

### Task 2: `.intake-theme` scoped palette

The check-in wizard redefines the same tokens, so it does **not** inherit Task 1 and would otherwise stay orange while the rest of the app turns teal.

**Files:**
- Modify: `src/app/globals.css` (the `.intake-theme` block, lines 183–197)
- Modify: `src/app/__tests__/theme-contrast.test.ts`

**Interfaces:**
- Consumes: `contrast()` from `@/lib/testing/contrast`; the `token(name, 'intake')` helper written in Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Append to `src/app/__tests__/theme-contrast.test.ts`:

```ts
describe('.intake-theme scoped palette', () => {
  it('tracks the root brand hues instead of keeping the retired orange', () => {
    expect(token('color-primary', 'intake').toUpperCase()).toBe('#1E97B2')
    expect(token('color-primary-dark', 'intake').toUpperCase()).toBe('#196B7E')
    expect(token('color-accent', 'intake').toUpperCase()).toBe('#955408')
  })

  it('keeps its text pairings at AA', () => {
    expect(contrast(token('color-primary-dark', 'intake'), WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('color-accent', 'intake'), WHITE)).toBeGreaterThanOrEqual(4.5)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: FAIL — `expected '#EE6B26' to be '#1E97B2'` in the `.intake-theme` block.

- [ ] **Step 3: Repoint the scoped block**

Replace the whole `.intake-theme` block in `src/app/globals.css` with:

```css
/* ── Intake (Patient Check-in) scoped theme ──────────────────
   The patient-facing check-in adopts a calm medical teal palette. This block
   REDEFINES the brand tokens, so it does not inherit `:root` — it must be
   repointed alongside the root palette or the wizard drifts out of brand.
   Token-driven: the wizard chrome reads these vars, so overriding them
   re-skins it cleanly. */
.intake-theme {
  --color-primary: #1E97B2;          /* brand teal — primary action */
  --color-primary-light: #6acdd9;
  --color-primary-dark: #196b7e;     /* hover / active, white text safe */
  --color-primary-soft: rgba(30, 151, 178, 0.07);
  --color-accent: #955408;
  --color-accent-soft: rgba(255, 166, 0, 0.10);
  --color-secondary: #0D2032;
  --color-border-focus: #1E97B2;
  --color-background: #F4FAFB;        /* cool, clean medical surface */
  --gradient-primary: linear-gradient(135deg, #196b7e 0%, #1E97B2 100%);
  --shadow-elevated: 0 12px 32px rgba(30, 151, 178, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-glow: 0 0 0 4px rgba(30, 151, 178, 0.18);
  --shadow-glow-sm: 0 0 0 3px rgba(30, 151, 178, 0.14);
}
```

Note `--color-background` moves from the warm `#FBF7F4` to a cool `#F4FAFB`, because a warm cream ground under teal chrome reads as a mismatch.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/__tests__/theme-contrast.test.ts
git commit -m "feat(theme): repoint the check-in wizard's scoped palette

.intake-theme redefines the brand tokens rather than inheriting them, so a
root change alone would have left the check-in wizard orange while every
other surface turned teal. Its ground moves from warm cream to a cool tint
to sit correctly under teal chrome."
```

---

### Task 3: Hardcoded hex sweep + regression guardrail

24 files bypass the tokens. The lint rule that already bans the retired blue is extended to ban the retired orange, so this cannot regress.

**Files:**
- Modify: `eslint.config.mjs` (the `LEGACY_BLUE` rule block, lines 10–23)
- Modify: 23 files listed below

**Interfaces:**
- Consumes: token values from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Extend the guardrail so the sweep has a test**

In `eslint.config.mjs`, replace the `LEGACY_BLUE` / `BLUE_MSG` / `noLegacyBlue` block with:

```js
// ── Design-system guardrail (see /DESIGN.md) ─────────────────────────────────
// Two retired palettes. The blue ramp predates the Umang brand entirely; the
// orange ramp was the brand until the app was aligned to the Umang website's
// teal (2026-09-04). These rules error if any retired literal reappears, so the
// codebase can never drift back. Colour belongs in src/app/globals.css
// `@theme`, not in component literals.
const RETIRED_BLUE = "1976[eE]6|0048[bB]5|338[aA][fF]0|005[fF][dD]1";
const RETIRED_ORANGE = "[eE][eE]6[bB]26|[fF]58[cC]4[eE]|[cC]2481[aA]|[bB]84[aA]16";
const RETIRED = `${RETIRED_BLUE}|${RETIRED_ORANGE}`;
const PALETTE_MSG =
  "Retired palette. Use design tokens instead: `bg-primary` / `text-primary` / `var(--color-primary)` (see /DESIGN.md).";
const noRetiredPalette = {
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=/#(${RETIRED})/]`, message: PALETTE_MSG },
      { selector: `TemplateElement[value.raw=/#(${RETIRED})/]`, message: PALETTE_MSG },
      { selector: "Literal[value=/rgba\\(\\s*25\\s*,\\s*118\\s*,\\s*230/]", message: PALETTE_MSG },
      { selector: "TemplateElement[value.raw=/rgba\\(\\s*25\\s*,\\s*118\\s*,\\s*230/]", message: PALETTE_MSG },
      { selector: "Literal[value=/rgba\\(\\s*238\\s*,\\s*107\\s*,\\s*38/]", message: PALETTE_MSG },
      { selector: "TemplateElement[value.raw=/rgba\\(\\s*238\\s*,\\s*107\\s*,\\s*38/]", message: PALETTE_MSG },
    ],
  },
};
```

Update the single usage below it from `...noLegacyBlue` to `...noRetiredPalette`.

- [ ] **Step 2: Run lint to verify it now fails**

Run: `npm run lint 2>&1 | tail -5`
Expected: FAIL — errors in the 23 `.ts`/`.tsx` files still holding retired hexes. (`globals.css` is not linted; it was handled in Tasks 1–2.)

- [ ] **Step 3: Apply the hex mapping**

Across these 23 files, replace every occurrence:

| From | To | Meaning |
|---|---|---|
| `#EE6B26` | `#1E97B2` | brand fill |
| `#F58C4E` | `#6acdd9` | light tint |
| `#C2481A` | `#196b7e` | dark / hover |
| `#B84A16` | `#955408` | AA text accent |
| `rgba(238, 107, 38, X)` | `rgba(30, 151, 178, X)` | preserve alpha X exactly |
| `rgba(238,107,38,X)` | `rgba(30,151,178,X)` | preserve alpha X exactly |

Match case-insensitively; some files use lowercase hex.

```
app/abha/page.tsx                           components/intake/ConsultSteps.tsx
app/discovery/page.tsx                      components/intake/DepartmentStep.tsx
app/doctor/consultation/page.tsx            components/intake/DurationStep.tsx
app/patient/feedback/page.tsx               components/intake/FieldSteps.tsx
app/reception/billing/page.tsx              components/intake/IntakeFlow.tsx
app/reception/reports/page.tsx              components/intake/IntakeShell.tsx
components/abha/AbhaCard.tsx                components/intake/ReviewSuccess.tsx
components/clinical/PatientJourneyFlow.tsx  components/intake/VoiceAssistantFlow.tsx
components/features/CopilotPane.tsx         components/landing/LandingHero.tsx
components/intake/CaptureSteps.tsx          lib/fileIO.ts
components/intake/ChoiceStep.tsx            lib/journeyAggregator.ts
                                            lib/printDoc.ts
```

`lib/fileIO.ts` and `lib/printDoc.ts` emit colours into generated print/export HTML, which Tailwind never sees — they take the new hex literals directly rather than tokens.

`lib/journeyAggregator.ts` holds `DEPT_COLOR`, a categorical department palette. Its `Reception: '#0EA5E9'` (sky) now sits close to the brand teal; change `Reception` to `#0284C7` (sky-600) so the two stay separable in the journey timeline.

- [ ] **Step 4: Run lint to verify it passes**

Run: `npm run lint 2>&1 | tail -3`
Expected: `0 errors`.

- [ ] **Step 5: Verify no retired literal survives**

Run: `grep -rniE "#(EE6B26|F58C4E|C2481A|B84A16)|rgba\( *238, *107, *38" src/ | wc -l`
Expected: `0`.

- [ ] **Step 6: Full verification**

Run: `npx tsc --noEmit && npm test && npm run build`
Expected: tsc silent, 133/133 tests pass, build exit 0.

- [ ] **Step 7: Commit**

```bash
git add eslint.config.mjs src/
git commit -m "feat(theme): sweep hardcoded orange hexes and guard the retirement

The 91 token-consuming files rethemed for free; these 23 bypassed the
tokens. The lint rule that already bans the retired blue ramp now bans the
retired orange too, so neither can reappear.

DEPT_COLOR's Reception sky moves to #0284C7 so it stays separable from the
new brand teal in the journey timeline."
```

---

### Task 4: Figtree + Playfair Display

**Files:**
- Modify: `src/app/layout.tsx` (the Google Fonts `<link>`, line 31)
- Modify: `src/app/globals.css` (`--font-body`, `--font-heading`; add `--font-display`)

**Interfaces:**
- Consumes: nothing.
- Produces: the `--font-display` token (Playfair Display). Tailwind v4 auto-generates a **`font-display`** utility class from any `--font-*` token — the same mechanism behind the `font-body` class already used in `layout.tsx:33` — so no custom utility is written. Task 6 applies `font-display`.

> **Name collision — do not add a `.t-display` class.** `globals.css:293` already
> defines `.t-display` as a *size* utility in the `.t-*` type scale (36px/700).
> A second `.t-display` meaning "serif" would give one class name two meanings,
> with the later declaration silently winning. Use the generated `font-display`.

- [ ] **Step 1: Load the families**

In `src/app/layout.tsx`, replace the stylesheet `<link href="...">` with:

```tsx
        <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300..900&family=Playfair+Display:wght@400..700&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap" rel="stylesheet" />
```

Inter is dropped from the request — nothing references it after the next step.

- [ ] **Step 2: Repoint the font tokens**

In `src/app/globals.css`, replace the `--font-body` / `--font-heading` declarations with:

```css
  /* Typography — Umang website two-font system (see /DESIGN.md).
     Figtree carries the product: body, headings, every clinical surface.
     Playfair Display is a DISPLAY serif — landing and patient-facing hero
     headings only. It must never be used in worklists, tables, queues or
     forms, where a serif costs scanning speed. */
  --font-body:    "Figtree", "SF Pro Display", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  --font-heading: "Figtree", "SF Pro Display", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  --font-display: "Playfair Display", "Iowan Old Style", Georgia, serif;
```

- [ ] **Step 3: Confirm the utility generates, and that no collision was introduced**

Tailwind v4 emits `font-display` from the `--font-display` token automatically.
No CSS is written for it.

Run: `grep -c "^\.t-display" src/app/globals.css`
Expected: `1` — the pre-existing *size* utility, still the only definition.

- [ ] **Step 4: Verify**

Run: `npm run build && grep -c "Figtree" src/app/layout.tsx src/app/globals.css`
Expected: build exit 0; `1` and `1`.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(theme): adopt the website's Figtree + Playfair type system

Figtree carries the whole product. Playfair is added as the --font-display
token, which Tailwind v4 surfaces as a font-display utility. No .t-display
class is added: that name is already the 36px size utility in the type
scale, and reusing it would give one class two meanings."
```

---

### Task 5: Real Umang photography

Replaces Unsplash stock with the hospital's own photographs, then removes the remote-image allowlist.

**Files:**
- Create: `public/umang/` (8 `.webp` files)
- Modify: `src/lib/photos.ts`
- Modify: `src/app/abha/page.tsx` (lines 227, 279, 679)
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PHOTOS` keeps its existing keys (`doctorPatient`, `consult`, `clinician`, `careTeam`, `ward`) and its `{ src, alt }` shape, so `src/app/checkin/page.tsx` and `src/components/landing/FinalCta.tsx` need no edit.

- [ ] **Step 1: Vendor the images**

```bash
mkdir -p "public/umang"
SRC="D:/Agentix Project/Umang2.0/frontend/public"
cp "$SRC/UmangLatest/Opd-complex.webp"           public/umang/opd-complex.webp
cp "$SRC/UmangLatest/Nursing-station.webp"       public/umang/nursing-station.webp
cp "$SRC/UmangLatest/Modular-ot.webp"            public/umang/modular-ot.webp
cp "$SRC/UmangLatest/Deluxe-patients-room.webp"  public/umang/deluxe-room.webp
cp "$SRC/UmangLatest/Emergency.webp"             public/umang/emergency.webp
cp "$SRC/UmangLatest/reception1.webp"            public/umang/reception.webp
cp "$SRC/Umang-real/consultant.webp"             public/umang/consultant.webp
cp "$SRC/Umang-real/ICU.webp"                    public/umang/icu.webp
ls -la public/umang/
```

Expected: 8 files present.

- [ ] **Step 2: Repoint `src/lib/photos.ts`**

Replace the file with:

```ts
/* Umang Hospital's own photography, vendored from the Umang website
 * (Umang2.0/frontend/public) into /public/umang.
 *
 * Used ONLY on landing + patient-facing pages — never clinical worklists.
 * Served through next/image; local assets need no remotePatterns allowlist.
 *
 * Alt text describes the real photograph, so it must be re-checked if a file
 * is ever swapped. */

export const PHOTOS = {
  // Reception desk — the first thing a patient meets (check-in).
  doctorPatient: {
    src: "/umang/reception.webp",
    alt: "The reception desk at Umang Hospital",
  },
  // Consultant at work — collaborative, calm.
  consult: {
    src: "/umang/consultant.webp",
    alt: "A consultant at Umang Hospital reviewing a patient's case",
  },
  // Approachable clinician portrait.
  clinician: {
    src: "/umang/consultant.webp",
    alt: "A consultant at Umang Hospital",
  },
  // Modular operating theatre — capability/expertise (landing CTA).
  careTeam: {
    src: "/umang/modular-ot.webp",
    alt: "Umang Hospital's modular operating theatre",
  },
  // Calm, modern inpatient room.
  ward: {
    src: "/umang/deluxe-room.webp",
    alt: "A patient room at Umang Hospital",
  },
} as const

export type PhotoKey = keyof typeof PHOTOS
```

- [ ] **Step 3: Replace the ABHA demo avatars**

In `src/app/abha/page.tsx`, replace the Unsplash URL on lines 227 and 279 (`photo: "https://images.unsplash.com/photo-1507003211169-..."`) and the fallback on line 679 with `"/umang/consultant.webp"`.

- [ ] **Step 4: Drop the remote allowlist**

In `next.config.ts`, remove the whole `images` key — no remote host is used any more:

```ts
const nextConfig: NextConfig = {}
```

- [ ] **Step 5: Verify no Unsplash reference survives**

Run: `grep -rn "unsplash" src/ next.config.ts | wc -l`
Expected: `0`.

- [ ] **Step 6: Verify the images actually serve**

Run: `npm run build && (npx next start -p 3000 &) && sleep 6 && for f in reception consultant modular-ot deluxe-room; do curl -s -o /dev/null -w "$f %{http_code}\n" "http://localhost:3000/umang/$f.webp"; done`
Expected: `200` for all four. Stop the server afterwards.

- [ ] **Step 7: Commit**

```bash
git add public/umang src/lib/photos.ts src/app/abha/page.tsx next.config.ts
git commit -m "feat(theme): use Umang's own photography instead of Unsplash stock

Vendors eight photographs from the Umang website into /public/umang and
repoints PHOTOS and the ABHA demo avatars at them. PHOTOS keeps its keys
and shape, so its two consumers are untouched.

With no remote image host left, next.config's remotePatterns allowlist is
removed entirely."
```

---

### Task 6: Display type on hero headings + DESIGN.md

**Files:**
- Modify: `src/components/landing/LandingHero.tsx`
- Modify: `src/components/landing/FinalCta.tsx`
- Modify: `src/app/checkin/page.tsx`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: the generated `font-display` utility from Task 4; `PHOTOS` from Task 5.
- Produces: nothing.

- [ ] **Step 1: Apply `font-display` to the three hero headings**

Add the `font-display` class to exactly three elements — change nothing else, no size, weight or spacing edits:

- `src/components/landing/LandingHero.tsx:41` — the `<h1>`
- `src/components/landing/FinalCta.tsx:33` — the `<h2>`
- `src/app/checkin/page.tsx:72` — the `<h1 className="t-h1 ...">`, which becomes `className="t-h1 font-display ..."` (the size utility and the family utility compose; they are orthogonal)

Verify the blast radius:

Run: `grep -rn "font-display" src/ --include=*.tsx | wc -l`
Expected: `3`.

- [ ] **Step 2: Confirm no clinical surface picked it up**

Run: `grep -rln "font-display" src/app/doctor src/app/nurse src/app/reception src/app/billing 2>/dev/null | wc -l`
Expected: `0`.

- [ ] **Step 3: Update DESIGN.md**

Replace the brand-colour and typography sections to describe the teal system: the `#1E97B2` / `#196b7e` / `#955408` split with its measured ratios, the fill-only status of `#FFA600`, the frozen clinical palette, the `.intake-theme` scoped override, and the Figtree/Playfair split with Playfair's landing-only scope. State that ratios are enforced by `src/app/__tests__/theme-contrast.test.ts` and retired hexes by `eslint.config.mjs`.

- [ ] **Step 4: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: 0 lint errors, tsc silent, 133/133 pass, build exit 0.

- [ ] **Step 5: Manual check**

Start the server and confirm in a browser, in both locales (`locale=en`, `locale=hi`):

| Surface | Expect |
|---|---|
| `/` | teal chrome, Playfair hero, real Umang photography |
| `/checkin` | teal, reception photo |
| `/checkin/intake` | wizard teal — **not** orange (this is the `.intake-theme` regression) |
| `/reception/dashboard`, `/doctor/dashboard`, `/nurse/dashboard`, `/billing/dashboard` | teal chrome, Figtree throughout, **no** serif |
| any triage chip / NEWS2 score | unchanged amber/red/green, never brand orange |

- [ ] **Step 6: Commit**

```bash
git add src/components/landing src/app/checkin/page.tsx DESIGN.md
git commit -m "feat(theme): Playfair on hero headings, document the teal system

Playfair is applied to exactly three landing/patient-facing headings and
nowhere else; the check verifies no clinical route picked it up.

DESIGN.md now describes the teal split with its measured ratios and names
the two mechanisms that enforce it — the contrast test and the lint rule."
```

---

### Task 7: Enforce the AA pairing at the use site

Added during execution. Task 1 asserts the palette's token *values* are AA-capable; nothing asserted that components actually use them in the AA-safe combination. They do not: **83 occurrences across 47 files** place `text-white` on `bg-primary` (`#1E97B2`), which is **3.43:1** and fails AA for normal text — including the landing page's primary "Launch Console" CTA. `text-on-primary`, the token created for this pairing, is used once in the whole codebase.

This is pre-existing (white on the retired orange was also ~3.0:1), but the spec's Global Constraints make ">= 4.5:1 for every text/background pairing" binding, so leaving it makes the retheme's central claim false.

**Files:**
- Modify: 47 files containing `text-white` alongside `bg-primary` / `bg-[var(--color-primary)]`
- Modify: `src/app/__tests__/theme-contrast.test.ts`

**Interfaces:**
- Consumes: the palette tokens from Task 1.
- Produces: nothing new.

- [ ] **Step 1: Write the failing guard**

Append to `src/app/__tests__/theme-contrast.test.ts`. This guards the *pattern*, which the value-based tests cannot:

```ts
import { readdirSync, statSync } from 'node:fs'

/** Every .ts/.tsx file under src/, recursively. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('brand fills are used in their AA-safe pairing', () => {
  it('never puts white text on the brand teal', () => {
    // #1E97B2 with white is 3.43:1 — below the 4.5 floor for normal text.
    // A text-bearing fill must use --color-primary-dark (6.1:1 with white),
    // or keep --color-primary and switch the ink to --color-on-primary
    // (4.8:1). This guards the pairing; the tests above only guard the values.
    const offending = sourceFiles(join(import.meta.dirname, '../..'))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8')
        const hits = text.match(/class(?:Name)?="[^"]*"/g) ?? []
        return hits
          .filter((c) => /text-white/.test(c))
          .filter((c) => /bg-primary|bg-\[var\(--color-primary\)\]/.test(c))
          .map(() => file.replace(/^.*[\/]src[\/]/, 'src/'))
      })
    expect([...new Set(offending)]).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: FAIL, listing ~47 files.

- [ ] **Step 3: Fix the pairings**

In every reported file, change the *fill*, not the ink — the spec's rule is "text-bearing fills use `--color-primary-dark`, never `--color-primary`":

| From | To |
|---|---|
| `bg-primary` (with `text-white` in the same class list) | `bg-primary-dark` |
| `bg-[var(--color-primary)]` (with `text-white`) | `bg-[var(--color-primary-dark)]` |
| an existing `hover:bg-[var(--color-primary-dark)]` on such an element | `hover:bg-[#1a5667]` so hover still reads as a press-down |

Leave `bg-primary` alone wherever the text on it is NOT white — those are already using their own ink and are out of this task's scope.

- [ ] **Step 4: Watch it pass**

Run: `npx vitest run src/app/__tests__/theme-contrast.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`
Expected: 0 lint errors, tsc silent, 134/134 (133 + this guard), build exit 0. The suite needs a dev server on :3000.

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "fix(theme): use the AA-safe brand fill wherever text sits on it

83 places across 47 files put white text on #1E97B2 (3.43:1), including
the landing page's primary CTA, while --color-on-primary — the token the
design system created for that pairing — was used exactly once. The
palette was AA-capable and used unsafely.

Text-bearing fills now use --color-primary-dark (6.1:1 with white), per
the spec's rule. The new test guards the pairing rather than the values,
which is the gap that let this through."
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| Palette (tokens + ramps) | 1 |
| `.intake-theme` second palette | 2 |
| Clinical colour safety | 1 (frozen + asserted), 3 (`DEPT_COLOR` separation), 6 (manual check) |
| Typography | 4, 6 |
| Imagery | 5 |
| Files touched — 24 hardcoded hexes | 3 (23 `.ts`/`.tsx`) + 1–2 (`globals.css`) |
| Guardrail | 3 |
| Testing | every task; full suite in 3 and 6 |

**Type consistency** — `contrast()` and `luminance()` are defined in Task 1 and used with those exact names in Tasks 1–2. `token(name, block)` is defined in Task 1's test file and reused in Task 2. `PHOTOS` keeps its keys and `{ src, alt }` shape, so its two consumers stay untouched. `--font-display` is created in Task 4 and consumed in Task 6.

**Note on test counts:** the suite is 126 today; Tasks 1–2 add 7 theme tests, so 133 is the expected total from Task 3 onward.

**Ordering:** Task 3's lint guardrail is deliberately introduced *before* its own sweep, so the failing lint run is the test that proves the sweep was needed and complete.
