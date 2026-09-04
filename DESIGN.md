---
version: alpha
name: Stripi-Inspired-design-analysis
description: An inspired interpretation of Stripi's design language — a financial-infrastructure brand built on a deep navy ink, an electric indigo primary, and a recurring atmospheric gradient mesh that occupies the upper third of nearly every marketing page. The system pairs the proprietary Sohne family at thin (300) weights with negative letter-spacing for editorial-density display headlines, and uses tabular-figure body type where money and numerics matter. Buttons are tight-radius pills, cards live on near-white surfaces, and the dashboard track flips polarity to a familiar dark-app shell.

colors:
  primary: "#1E97B2"
  primary-dark: "#196b7e"
  primary-light: "#6acdd9"
  on-primary: "#0D2032"
  accent: "#955408"
  brand-orange: "#FFA600"
  brand-amber: "#F59E0B"
  brand-green: "#16A34A"
  warning: "#F59E0B"
  danger: "#DC2626"
  success: "#16A34A"
  urgent: "#C2410C"
  urgent-bg: "#FFF4ED"

typography:
  font-body:
    fontFamily: "Figtree, 'SF Pro Display', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif"
    use: body copy and UI, all surfaces
  font-heading:
    fontFamily: "Figtree, 'SF Pro Display', 'Segoe UI', system-ui, -apple-system, Arial, sans-serif"
    use: in-content headings, all surfaces
  font-display:
    fontFamily: "'Playfair Display', 'Iowan Old Style', Georgia, serif"
    weight: 300 (thin)
    use: landing hero `<h1>`/`<h2>` and the check-in `<h1>` only — never clinical worklists

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  huge: 64px

components:
  button-primary-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-primary-pill-pressed:
    backgroundColor: "{colors.primary-press}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-on-dark:
    backgroundColor: "{colors.brand-dark-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  card-feature-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing-featured:
    backgroundColor: "{colors.brand-dark-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-cream-band:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-dashboard-mockup:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-tabular}"
    rounded: "{rounded.lg}"
    padding: 24px
  pill-tag-soft:
    backgroundColor: "{colors.primary-bg-subdued-hover}"
    textColor: "{colors.primary-deep}"
    typography: "{typography.micro-cap}"
    rounded: "{rounded.pill}"
    padding: 4px 8px
  nav-bar-on-mesh:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 16px 24px
  link-on-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 0px
  footer-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-mute}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 24px
---

## Overview

Stripi's design language opens with the gradient mesh. A wide horizontal band of pastel cream, sherbet orange, lavender, electric indigo, and ruby pink occupies the upper third of nearly every marketing page — the brand's instantly-recognizable atmospheric backdrop. Type and product UI mockups float above it on `{colors.canvas}` (white), with the gradient acting as both decoration and visual anchor. The lower portion of the page returns to white, with feature explanations on `{colors.canvas-soft}` (a barely-tinted cool off-white) and dashboard product mockups composited as faux IDE/console panels in deep navy.

The color system has two primary roles. **Indigo** (`{colors.primary}` — `#533afd`) is the brand's signature CTA color, used sparingly: one filled pill per band. **Deep navy** (`{colors.ink}` — `#0d253d`) is the universal body text color and the fill of dashboard mockups, the featured pricing tier, and the dark-app surfaces on the dashboard track. Ruby (`{colors.ruby}`) and magenta (`{colors.magenta}`) appear inside the gradient mesh and as accent dots in product UI mockups; they are not used as button colors.

Typography is built around **Sohne** at weight 300 with negative letter-spacing — the brand's editorial-density display signature. Display sizes (32–56px) use -1.4px to -0.64px tracking; body sizes use 0; tabular caption sizes (where money and numerics matter) use the OpenType `tnum` feature plus a tightening -0.36 to -0.42px tracking. The `ss01` stylistic set is enabled across all roles.

**Key Characteristics:**
- Gradient-mesh backdrop on every marketing hero — cream/orange/lavender/indigo/ruby horizontally washed across the upper third of the page.
- Single-indigo CTA hierarchy: filled `{colors.primary}` pill is the only filled button on marketing surfaces.
- Sohne thin (weight 300) display tier with negative tracking from -1.4px to -0.2px depending on size.
- Tabular-figure body type (`tnum`) for any cell containing money or numerics — the brand's quiet financial-data signal.
- Dark-app dashboard track: deep navy product UI mockups sit composited above the white canvas, frequently with rendered code or dashboard tables inside.
- Pill-shaped buttons (`{rounded.pill}` 9999px) with tight `8px 16px` padding — short, decisive, transactional.
- Cream-band feature cards (`{colors.canvas-cream}`) introduce a warm interlude between blue/white sections without breaking the brand's chromatic logic.

## Colors

> **Scope note:** this section and the `colors:`/`typography:` blocks in the frontmatter above describe Umang HIMS's actual, shipped brand system. Everything from **Overview** through **Responsive Behavior** below retains this document's original Stripi-pattern-language token names (`{colors.primary-press}`, `{colors.brand-dark-900}`, the gradient-mesh, Sohne, etc.) as generic component-pattern reference material inherited at project seed — it does not describe Umang's implementation and its token names do not resolve against the list above. The single source of truth for implemented tokens is `src/app/globals.css`; the narrative equivalent is `docs/DESIGN-LANGUAGE.md`.

> **Source:** the Umang Hospital website, matched in `src/app/globals.css` (`:root` and the scoped `.intake-theme` override used by the check-in wizard).

### Brand & Accent
- **Teal** (`--color-primary` — `#1E97B2`): The brand's signature colour, matching the Umang website. **Fill-only.** `#1E97B2` on white text measures **3.43:1** and fails AA, so it is never used as text — it fills buttons, active states, and focus rings, always paired with navy `--color-on-primary` (`#0D2032`, **4.82:1** on teal).
- **Teal Dark** (`--color-primary-dark` — `#196b7e`): The text-safe teal. **6.09:1** with white text, so any teal fill that *carries white text* (CTA hover/press, dark hero surfaces, gradient stops) uses this shade, not `#1E97B2`.
- **Teal Light** (`--color-primary-light` — `#6acdd9`): Light-teal tint for soft backgrounds and decorative accents; not a text colour.
- **Accent — deep orange** (`--color-accent` — `#955408`): The AA-safe text/link shade, **5.92:1** on white. Deliberately *not* the website's `accent-700` (`#B86D02`, 4.02:1 — fails AA); `#955408` was chosen instead so the accent is safe wherever it appears as text.
- **Brand Orange** (`--color-brand-orange` — `#FFA600`): The website's raw accent orange. **Fill-only** — **1.96:1** on white, never used as text.

### Semantic / clinical (frozen — never brand)
These are visually adjacent to the teal/orange brand pair but carry a different meaning (clinical severity, not identity) and must never be substituted for brand tokens or vice versa:
- `--color-brand-amber` `#F59E0B`, `--color-warning` `#F59E0B` — caution / abnormal.
- `--color-danger` `#DC2626` — critical / life-threatening.
- `--color-brand-green` `#16A34A`, `--color-success` `#16A34A` — normal / resolved.
- Triage "High" tiers use `bg-urgent-bg text-urgent` (`--color-urgent` `#C2410C` / `--color-urgent-bg` `#FFF4ED`), not brand orange.

### The `.intake-theme` scoped override
`globals.css` carries a **second** palette, `.intake-theme`, wrapping the check-in wizard (`/checkin/intake`). It redefines `--color-primary`, `--color-primary-dark`, `--color-accent`, and related tokens with the *same* teal/orange values as `:root` — it does not inherit `:root`, so any future palette change must be applied in both places or the wizard silently drifts back to its old colours.

### Enforcement
Every ratio above is asserted by `src/app/__tests__/theme-contrast.test.ts`. The retired blue and orange palettes (`#EE6B26`, `#B84A16`, and the old blue brand hexes) are blocked outright by a `no-restricted-syntax` ESLint rule in `eslint.config.mjs`, so they cannot silently reappear in a future edit.

## Typography

### Font Family

Two families, one split by role:
- **Figtree** — `--font-body` and `--font-heading`. Used for all body copy, UI chrome, and in-content headings, on every surface (clinical and patient-facing alike).
- **Playfair Display** — `--font-display`. A display serif, generated by Tailwind v4 as the `font-display` utility. Applied to exactly three headings: the landing hero `<h1>` (`LandingHero.tsx`), the closing-CTA `<h2>` (`FinalCta.tsx`), and the check-in `<h1>` (`checkin/page.tsx`) — landing and patient-facing surfaces only. It must never reach a clinical worklist, table, queue, or form, where a serif costs scanning speed.

### Hierarchy

The product's actual type scale is the `.t-*` classes in `globals.css` (`t-display`, `t-h1`, `t-h2`, `t-h3`, `t-title`, `t-body`, `t-label`, `t-caption`, `t-overline` — a font-**size** scale, unrelated to the `font-display` family utility above; `t-display` and `font-display` are two different axes and compose, e.g. `t-h1 font-display`). See `docs/DESIGN-LANGUAGE.md §6` for the full scale and the clinical weight-700 override.

### Principles
- **Family is scoped by audience, not by size.** Figtree carries every clinical surface end-to-end; Playfair is opt-in, landing/patient-only, and applied only via the `font-display` utility class — never a bespoke `font-family` declaration.
- **Size and family compose independently.** A heading's `.t-*` size class and its `font-display` family class are added together, never in place of one another.

## Layout

### Spacing System
- **Base unit**: 8px (with 2 / 4 / 12 sub-tokens for fine work).
- **Tokens**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.huge}` 64px.
- **Section padding**: 64–96px on marketing surfaces; 32–48px on dashboard / product surfaces.
- **Card internal padding**: 32px on feature cards; 24px on dashboard mockups.

### Grid & Container
- Marketing pages center in a ~1200px container with the gradient mesh extending edge-to-edge above.
- Pricing collapses 4-up → 2-up → 1-up at 1024 / 768 breakpoints.
- Dashboard product mockups use their own internal grids (12-col tables, 3-col card grids) rendered as static composites.

### Whitespace Philosophy
The gradient mesh occupies the upper third of the page; the white canvas below is generously padded. Section gaps tend toward 96px, with content tightening to 32px on dashboard / pricing pages where users compare and act.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 | Flat | Default surface |
| 1 | `box-shadow: rgba(0,55,112,0.08) 0 1px 3px` | Card lift on white |
| 2 | `box-shadow: rgba(0,55,112,0.08) 0 8px 24px, rgba(0,55,112,0.04) 0 2px 6px` | Floating panels, dashboard mockup chrome |
| 3 | Gradient mesh backdrop | The brand's primary depth medium — atmospheric color rather than literal shadow |

### Decorative Depth
The gradient mesh IS the depth system. Implemented as a layered SVG or large background image rather than CSS gradients (the actual mesh has organic blob shapes that aren't CSS-renderable). The mesh provides the brand's signature lift; literal shadows are reserved for product-UI mockups and stay subtle.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Hairline tags, table chrome |
| `{rounded.sm}` | 6px | Form inputs |
| `{rounded.md}` | 8px | Compact cards, alerts |
| `{rounded.lg}` | 12px | Pricing cards, feature cards |
| `{rounded.xl}` | 16px | Dashboard product mockup chrome |
| `{rounded.pill}` | 9999px | All buttons, tag pills |

### Photography Geometry
The brand uses **product UI mockups** more than photography. Dashboard composites render as faux IDE/terminal/dashboard chrome inside `{rounded.lg}` 12px containers with a subtle `box-shadow`. Real photography appears in customer logo strips and the rare case-study card; treated as inset 4:3 with no shadow.

## Components

### Buttons

**`button-primary-pill`** — the dominant CTA system-wide.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button-md}`, padding `{spacing.sm} {spacing.lg}` (8px 16px), rounded `{rounded.pill}` 9999px.
- Pressed state `button-primary-pill-pressed` shifts background to `{colors.primary-press}`.

**`button-secondary`** — outline-style alternative.
- Background `{colors.canvas}`, text `{colors.primary}`, 1px solid `{colors.primary}` border, same pill geometry.

**`button-on-dark`** — used on dashboard / dark surfaces.
- Background `{colors.brand-dark-900}`, text `{colors.on-primary}`, same pill geometry.

### Cards & Containers

**`card-feature-light`** — feature explanation card on white.
- Background `{colors.canvas}`, padding `{spacing.xxl}`, rounded `{rounded.lg}` 12px, 1px `{colors.hairline}` border, optional Level 1 shadow.

**`card-pricing`** — standard pricing tier.
- Background `{colors.canvas}`, padding `{spacing.xxl}`, rounded `{rounded.lg}`, 1px `{colors.hairline}` border. Title `{typography.heading-lg}`, price `{typography.display-md}`, body `{typography.body-md}`, CTA pinned bottom as `button-primary-pill`.

**`card-pricing-featured`** — the inverted dark featured tier.
- Background `{colors.brand-dark-900}`, text `{colors.on-primary}`, otherwise identical structure to `card-pricing`. The deep-navy fill is the brand's distinctive featured-tier choice.

**`card-cream-band`** — warm interlude card.
- Background `{colors.canvas-cream}`, text `{colors.ink}`, padding `{spacing.xxl}`, rounded `{rounded.lg}`. Used to break up the indigo / white rhythm with warmth.

**`card-dashboard-mockup`** — composited dashboard / product UI screenshot.
- Background `{colors.canvas}`, type `{typography.body-tabular}` (with `tnum`), padding `{spacing.xl}` 24px, rounded `{rounded.lg}` 12px, Level 2 shadow. Often contains nested mini-mockups: code preview + dashboard table + chart card.

### Inputs & Forms

**`text-input`** — standard form field.
- Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-md}`, padding `{spacing.sm} {spacing.md}` (8px 12px), rounded `{rounded.sm}` 6px, 1px `{colors.hairline-input}` border.
- Focus state `text-input-focused`: border swaps to `{colors.primary}`.

### Navigation

**`nav-bar-on-mesh`** — top nav floating over the gradient hero.
- Background `{colors.canvas}` (or transparent depending on scroll), text `{colors.ink}`, padding `{spacing.lg} {spacing.xl}`. Logo wordmark on the left, primary nav center, sign-in + filled `button-primary-pill` on the right.

### Pills, Tags, and Chips

**`pill-tag-soft`** — subdued indigo tag.
- Background `{colors.primary-bg-subdued-hover}`, text `{colors.primary-deep}`, type `{typography.micro-cap}`, padding `4px 8px`, rounded `{rounded.pill}`.

### Signature Components

**Gradient Mesh Backdrop** — pastel cream → sherbet orange → lavender → indigo → ruby pink stops blurred horizontally across the upper third of the page. Implemented as SVG or a large background image — not a flat CSS gradient (the real mesh has organic blob shapes).

**Composited Dashboard Mockup** — multi-layer faux-product-UI compositions: an IDE panel on the left, a dashboard table center, a chart card on the right, all rendered at small scale inside `{rounded.lg}` containers with subtle Level 2 shadows. The composite is the brand's most-photographed feature.

**Tabular-Figure Money Type** — every number rendering money, count, or transaction value uses `font-feature-settings: "tnum"`. The brand's quiet signal that it's a financial-infrastructure platform.

**`link-on-light`** — inline links on light surfaces.
- Text `{colors.primary}` rendered in `{typography.body-md}`, no underline by default.

**`footer-light`** — site-wide footer.
- Background `{colors.canvas}`, text `{colors.ink-mute}`, type `{typography.caption}`, padding `{spacing.huge} {spacing.xl}` (64px 24px). Holds 4–6 columns of link groups, social icons, and a small legal row.

## Do's and Don'ts

### Do
- Reserve `{colors.primary}` for filled CTAs and inline link emphasis — it should appear sparingly, one filled button per band.
- Apply the gradient mesh to every marketing hero; bare-canvas heroes feel off-brand.
- Render display tiers at weight 300 with negative letter-spacing — the thin tracking is the typographic signature.
- Use `font-feature-settings: "tnum"` on every money / numeric cell.
- Apply `font-feature-settings: "ss01"` globally on the body element.
- Pair every feature explanation with a composited product UI mockup; the brand's argument is "look at the actual product."

### Don't
- Don't bump display weight above 300 — at 400 the brand's editorial air collapses. **(Clinical override:** this is the *marketing/brand* rule. Agentix HIMS clinical surfaces render headings at weight 700 for ward-tablet glanceability; the thin tier survives as `.t-display-thin` for patient-facing/landing heroes only. See `docs/DESIGN-LANGUAGE.md §6`.)
- Don't add new accent colors outside the documented gradient stops (cream / orange / lavender / indigo / ruby / magenta).
- Don't use the indigo `{colors.primary}` as a body-text color — it's a CTA and link color, not a type color at body size.
- Don't shrink button padding below `8px 16px` — the tight pill is part of the brand's transactional feel.
- Don't render money cells without `tnum` — it breaks the quiet financial-data signature.
- Don't replace the pill shape with rounded-rectangles for buttons.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Wide | ≥ 1440px | Full gradient mesh edge-to-edge; dashboard composite at full scale |
| Desktop | 1024–1440px | Default content max-width; pricing 4-up |
| Tablet | 768–1023px | Pricing 2-up; dashboard composite simplifies to 2 panels |
| Mobile | < 768px | Pricing 1-up; hamburger nav; display drops 56 → 36px |

### Touch Targets
- Pill buttons hit ≥ 40×40px on mobile via padding scaling. On smaller screens, buttons size up to 44×44px to maintain WCAG AAA.
- Form fields stay at 40px minimum height.

### Collapsing Strategy
- Display tiers stair-step 56 → 48 → 32 → 26 → 22px through the breakpoints.
- Gradient mesh re-tiles on mobile to preserve the wash without disappearing.
- Dashboard composites simplify to single-panel mockups on mobile; the multi-layer composition only renders at desktop+.
- Pricing tiers stair-step 4-up → 2-up → 1-up.

### Image Behavior
Product UI composites use `srcset` with art-direction crops at major breakpoints. Mobile crops focus on the most actionable inner panel; desktop crops show the full multi-layer composition.

## Iteration Guide

1. Focus on ONE component at a time.
2. Reference component names and tokens directly (`{colors.primary}`, `{button-primary-pill}-pressed`, `{rounded.pill}`).
3. Run `npx @google/design.md lint DESIGN.md` after edits.
4. Add new variants as separate entries.
5. Default body to `{typography.body-md}` (15px); use `{typography.body-tabular}` for any money / numeric cell.
6. Apply `ss01` globally on the body; apply `tnum` per-element on numeric content.
7. The gradient mesh is non-negotiable on marketing heroes — bare-canvas heroes break the brand.
