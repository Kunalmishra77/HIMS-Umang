# Umang brand retheme — design

**Date:** 2026-09-04
**Status:** approved, not yet implemented
**Scope:** colour, type and imagery only. No behaviour changes.

## Goal

Make the HIMS look like a continuation of the Umang Hospital website
(`D:\Agentix Project\Umang2.0`) rather than a separate product: the website's
teal-led palette, its two-font system, and its real hospital photography in
place of stock imagery.

## Background

Both codebases run Tailwind v4 with a `@theme` block, so the palette transfers
as token values rather than as a rewrite.

The website leads with **teal `#1E97B2`** and accents with **orange `#FFA600`**
(full 50–950 ramps, `frontend/tailwind.config.js`). The HIMS currently leads
with the logo orange `#EE6B26`.

This is a deliberate reversal, not a drift correction. `globals.css` records why
the HIMS moved *off* teal:

> "Unlike the old teal, no single orange is AA both as white-on-fill AND as
> text-on-white, so brand orange is split"

That split — one token for fills, a darker one for text on white — is sound and
is **kept**. Only the hues change.

## Palette

Measured contrast ratios (sRGB, WCAG 2.1). Every pairing below is verified, not
assumed.

| Token | Value | Use | Contrast |
|---|---|---|---|
| `--color-primary` | `#1E97B2` | brand fills, active, focus ring | 5.2:1 with navy text — **AA** |
| `--color-on-primary` | `#0f172a` | text/icons on primary fills | (as above) |
| `--color-primary-dark` | `#196b7e` | white-text fills, CTA hover/press | 6.1:1 with white — **AA** |
| `--color-primary-light` | `#6acdd9` | tints, soft accents | decorative only |
| `--color-primary-soft` | `rgba(30,151,178,0.07)` | hover washes | decorative only |
| `--color-accent` | `#955408` | links, emphasis text on white | 5.9:1 — **AA** |
| `--color-brand-orange` | `#FFA600` | fills, icons, underlines only | 2.0:1 on white — **never text** |

Two traps this table exists to avoid:

- `#1E97B2` with **white** text is 3.4:1. That fails AA for body text (passes
  only for large text and UI components). Text-bearing fills therefore use
  `--color-primary-dark`, never `--color-primary`.
- The website's `accent-700 #B86D02` is 4.0:1 on white — also below AA. The
  accent token uses `accent-800 #955408` instead.

The website's 50–950 ramps are additionally imported as
`--color-primary-{50..950}` and `--color-accent-{50..950}` for new work. Existing
components keep using the semantic tokens.

### The second palette: `.intake-theme`

`globals.css` carries a **scoped override** for the patient check-in wizard
(`.intake-theme`, used by `app/checkin/intake/page.tsx` and
`components/intake/IntakeAppShell.tsx`). It redefines the same primary/accent
tokens and currently duplicates the orange values, so it does **not** inherit a
change to `:root` and must be repointed in the same pass — otherwise the check-in
wizard stays orange while the rest of the app turns teal.

Its own comment describes the intent as "a calm medical teal + health-green
palette", which the new brand palette finally makes literally true. It takes the
same values as the root tokens.

### Clinical colour safety

The website's accent `#FFA600` sits close to `--color-brand-amber #F59E0B`,
which currently signals **Medium triage** and warnings.

Rule: clinical red / amber / green keep their present values and meanings, and
`#FFA600` is forbidden on any triage chip, NEWS2 score, or critical-value
banner. Brand colour must never be readable as a severity. This is enforced by
review, and by keeping the brand orange under a `--color-brand-orange` name that
no clinical component references.

## Typography

- `--font-body` and `--font-heading` → **Figtree**
- `--font-display` (new) → **Playfair Display**

Playfair is a display serif: excellent for a hero line, poor for dense
worklists. It is used **only** on landing and patient-facing hero headings, and
never in clinical tables, queues or forms.

Noto Sans Devanagari stays for the Hindi locale. Both new families load through
the existing Google Fonts `<link>` in `src/app/layout.tsx`.

## Imagery

Real photography replaces stock. Source files come from
`Umang2.0/frontend/public/`, copied into `public/umang/`:

| File | Source | Suggested placement |
|---|---|---|
| `opd-complex.webp` | `UmangLatest/Opd-complex.webp` | landing hero, checkin |
| `nursing-station.webp` | `UmangLatest/Nursing-station.webp` | landing modules |
| `cath-lab.webp` | `UmangLatest/Cath-lab.webp` | landing modules |
| `modular-ot.webp` | `UmangLatest/Modular-ot.webp` | landing modules |
| `emergency.webp` | `UmangLatest/Emergency.webp` | landing modules |
| `icu.webp` | `Umang-real/ICU.webp` | landing modules |
| `deluxe-room.webp` | `UmangLatest/Deluxe-patients-room.webp` | patient-facing |

Constraint already recorded in `next.config.ts` and kept: photography appears on
landing and patient-facing pages only, **never on clinical worklists**.

Both current Unsplash usages (`src/app/abha/page.tsx`, `src/lib/photos.ts`) move
to local assets, after which the `images.unsplash.com` `remotePattern` is removed
from `next.config.ts`. Assets are served through `next/image`; being local, they
need no allowlist.

## Files touched

| File | Change |
|---|---|
| `src/app/globals.css` | the bulk — token values, ramps, gradients, **and the `.intake-theme` block** |
| `src/app/layout.tsx` | font links |
| `next.config.ts` | drop the Unsplash remotePattern |
| `eslint.config.mjs` | ban retired orange hexes |
| `DESIGN.md` | document the teal system |
| 24 files with hardcoded orange hexes | see list below |

Files hardcoding `#EE6B26` / `#F58C4E` / `#C2481A` / `#B84A16`:

```
app/abha/page.tsx                      components/intake/ConsultSteps.tsx
app/discovery/page.tsx                 components/intake/DepartmentStep.tsx
app/doctor/consultation/page.tsx       components/intake/DurationStep.tsx
app/globals.css                        components/intake/FieldSteps.tsx
app/patient/feedback/page.tsx          components/intake/IntakeFlow.tsx
app/reception/billing/page.tsx         components/intake/IntakeShell.tsx
app/reception/reports/page.tsx         components/intake/ReviewSuccess.tsx
components/abha/AbhaCard.tsx           components/intake/VoiceAssistantFlow.tsx
components/clinical/PatientJourneyFlow.tsx  components/landing/LandingHero.tsx
components/features/CopilotPane.tsx    lib/fileIO.ts
components/intake/CaptureSteps.tsx     lib/journeyAggregator.ts
components/intake/ChoiceStep.tsx       lib/printDoc.ts
```

The other 91 files reference tokens (`bg-primary`, `var(--color-primary)`) and
retheme with no edit.

## Guardrail

`eslint.config.mjs` already fails the build on the retired blue palette. The
same `no-restricted-syntax` rule gains the retired orange hexes
(`EE6B26|F58C4E|C2481A|B84A16`), so the codebase cannot drift back.

`lib/fileIO.ts` and `lib/printDoc.ts` embed colours in generated
print/export HTML, which is not Tailwind-themed; those literals are replaced
with the new hexes directly rather than tokens.

## Testing

No behavioural change, so the existing suite is the regression net:

1. `npm run lint` — 0 errors, and the extended guardrail rejects retired hexes.
2. `npx tsc --noEmit` — clean.
3. `npm test` — 126/126 still passing.
4. `npm run build` — clean.
5. Manual: landing, checkin (including the `.intake-theme` wizard) and one page
   per portal, in both locales, confirming no orange-on-white text survives, the
   wizard is no longer the odd one out, and no triage chip reads as brand colour.

## Out of scope

- Any layout, spacing or component-structure change.
- Restyling the Umang website itself.
- Introducing a dark mode. This app has none today (`globals.css` carries two
  incidental `dark:` utilities and no `prefers-color-scheme` block), and this
  work does not add one.
