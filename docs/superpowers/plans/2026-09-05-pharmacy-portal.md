# Pharmacy Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Umang HIMS a sixth portal — pharmacy — by porting the working module from Gov-HIMS, and make pharmacy a real stage in the OPD patient journey instead of a status that collapses into billing.

**Architecture:** This is a port, not a build. The two codebases share a Supabase project, a design-token system and an i18n layout. Every pharmacy table already exists, `pharmacy` is already in the DB's `role_t` enum, and — verified during planning — `lib/api/pharmacy-dispenses.ts` and `lib/api/pharmacy-inventory.ts` are **already present here and byte-identical** to Gov-HIMS's. The work is two small API modules, four stores, ten UI files, i18n, wiring, and one carefully-isolated change to the shared OPD queue.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4, TypeScript, Zustand, Zod, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-pharmacy-portal-design.md`

**Source:** `D:\Agentix Project\Gov-HIMS` (referred to below as `$GOV`)

## Global Constraints

- **The incoming files predate this repo's guardrails and will not pass them unmodified.** Verified counts in the files to be ported: **37 retired-orange literals** (`#EE6B26`, `#F58C4E`, `#C2481A`, `#B84A16`, `rgba(238,107,38,…)`) which `eslint.config.mjs` now errors on, and **2 `text-white` on `bg-primary` pairings** which `src/app/__tests__/theme-contrast.test.ts` now fails on. Every ported file must be rethemed as it lands.
- Retired-hex mapping, applied exactly: `#EE6B26`→`#1E97B2`, `#F58C4E`→`#6acdd9`, `#C2481A`→`#196b7e`, `#B84A16`→`#955408`, `rgba(238,107,38,X)`→`rgba(30,151,178,X)` preserving alpha X.
- **White text never sits on `bg-primary`** (`#1E97B2` = 3.43:1, fails AA). Text-bearing fills use `bg-primary-dark` (`#196b7e`, 6.09:1).
- **Brand colour must never read as a clinical severity.** Clinical red/amber/green are frozen. A triage or priority "High"/"urgent" tier uses `bg-urgent-bg text-urgent`, never a brand token. The pharmacy queue carries `PharmTriageLevel` and priority tiers — these are the highest-risk lines in the port.
- No schema migrations. Every table exists; `supabase/migrations/` is Gov-HIMS's applied history and is retained verbatim (see README) — do not add to it.
- TypeScript throughout, no `any`. Functional components only.
- The integration tests need a dev server on `localhost:3000` (or `TEST_BASE_URL`) and bridge their session via `src/lib/testing/serverSession.ts`.
- After every task: `npm run lint` 0 errors, `npx tsc --noEmit` clean, `npm test` green, `npm run build` exit 0. The suite is **134** tests before this plan starts.

## What already exists — do not re-port

Verified during planning. Re-creating any of these is a defect:

| Already here | Evidence |
|---|---|
| `src/lib/api/pharmacy-dispenses.ts` | byte-identical to `$GOV`'s |
| `src/lib/api/pharmacy-inventory.ts` | byte-identical to `$GOV`'s |
| Both exported from `src/lib/api/index.ts` | `PharmacyDispenses`, `PharmacyStock`, `PharmacyPurchaseOrders`, schemas and enums |
| All 10 pharmacy tables | `drug_master`, `drugs`, `inventory`, `narcotics_log`, `pharmacy_claims`, `pharmacy_dispense(s)`, `pharmacy_narcotics`, `pharmacy_purchase_orders`, `pharmacy_stock_items` |
| `pharmacy` in the `role_t` enum | `profiles.role` accepts it today |
| Every shared dependency the module imports | `useAuthStore`, `usePatientProfileStore`, `useNotificationStore`, `useDischargeStore`, `useAuditStore`, `usePatientOrdersStore`, `lib/utils`, `lib/uhid`, `lib/notifyAndAudit`, `lib/drugSafety`, `lib/cross-device-orders`, `lib/supabase/client`, `components/ui/Select`, `components/messaging/StaffMessages`, `components/layout/RoleGuard` |

---

### Task 1: API layer — `NarcoticsLog` and `DrugMaster`

The four stores dynamically `await import('@/lib/api')` and destructure seven symbols. Five are already exported; **`NarcoticsLog` and `DrugMaster` are not**, so the stores would fail at runtime with `undefined`.

**Files:**
- Create: `src/lib/api/narcotics.ts` (copy of `$GOV/src/lib/api/narcotics.ts`, 48 lines)
- Create: `src/lib/api/drug-master.ts` (copy of `$GOV/src/lib/api/drug-master.ts`, 13 lines)
- Modify: `src/lib/api/index.ts`
- Create: `src/lib/supabase/__tests__/pharmacy-schema.test.ts` (copy of `$GOV`'s, 75 lines)
- Test: `src/lib/api/__tests__/pharmacy-api-surface.test.ts`

**Interfaces:**
- Consumes: `table()` and `id()` from `src/lib/api/_core.ts` (already present).
- Produces: `NarcoticsLog` with `list(filter?)`, `get(id)`, `create(input: Omit<NarcoticEntry,'id'>)`, `_table`; `NarcoticEntrySchema`; `DrugMaster` with `list(): Promise<Rec[]>`, `saveMany(drugs)`, `_table`; `DrugMasterRowSchema`. Both re-exported from `@/lib/api`. Tasks 2 and 4 depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/lib/api/__tests__/pharmacy-api-surface.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as Api from '@/lib/api'

// The pharmacy stores reach these through `await import('@/lib/api')` and
// destructure them. A missing export fails at runtime as `undefined` rather
// than at compile time, so assert the surface directly.
describe('pharmacy API surface', () => {
  it('exports every symbol the pharmacy stores destructure', () => {
    for (const name of [
      'PharmacyDispenses', 'PharmacyStock', 'PharmacyPurchaseOrders',
      'Prescriptions', 'NarcoticsLog', 'DrugMaster',
    ]) {
      expect(Api, `@/lib/api must export ${name}`).toHaveProperty(name)
    }
  })

  it('NarcoticsLog and DrugMaster expose the methods the stores call', () => {
    expect(typeof Api.NarcoticsLog.list).toBe('function')
    expect(typeof Api.NarcoticsLog.create).toBe('function')
    expect(typeof Api.DrugMaster.list).toBe('function')
    expect(typeof Api.DrugMaster.saveMany).toBe('function')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/api/__tests__/pharmacy-api-surface.test.ts`
Expected: FAIL — `@/lib/api must export NarcoticsLog`.

- [ ] **Step 3: Copy the two modules**

```bash
cp "D:/Agentix Project/Gov-HIMS/src/lib/api/narcotics.ts"   src/lib/api/narcotics.ts
cp "D:/Agentix Project/Gov-HIMS/src/lib/api/drug-master.ts" src/lib/api/drug-master.ts
```

Both import only from `zod` and `./_core`, so they need no adaptation. `narcotics.ts` carries a module comment referencing `supabase/migrations/20260705050000_pharmacy_schema.sql` — that migration file is present in this repo (Gov-HIMS's history is retained verbatim), so the reference stays accurate. Leave both comments intact.

- [ ] **Step 4: Export them**

In `src/lib/api/index.ts`, add beside the other exports:

```ts
export { NarcoticsLog, NarcoticEntrySchema } from './narcotics'
export { DrugMaster, DrugMasterRowSchema } from './drug-master'
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run src/lib/api/__tests__/pharmacy-api-surface.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Port the schema test**

```bash
cp "D:/Agentix Project/Gov-HIMS/src/lib/supabase/__tests__/pharmacy-schema.test.ts" src/lib/supabase/__tests__/pharmacy-schema.test.ts
```

Run: `npx vitest run src/lib/supabase/__tests__/pharmacy-schema.test.ts`

This asserts the pharmacy tables and columns against the live database. **If it fails on an exact-column-set assertion, do not add a migration.** This repo shares its database with Gov-HIMS, which has added `hospital_id`/`branch_id` to shared tables; the two existing schema tests here were already relaxed to superset checks for exactly that reason. Follow that precedent: change `toEqual([...cols].sort())` to `toEqual(expect.arrayContaining([...cols]))` and add the same explanatory comment those files carry. Report what you changed.

- [ ] **Step 7: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: 0 lint errors, tsc silent, 134 + 2 + (schema test count) passing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/api src/lib/supabase/__tests__/pharmacy-schema.test.ts
git commit -m "feat(pharmacy): add the NarcoticsLog and DrugMaster API modules

The pharmacy stores destructure seven symbols from @/lib/api. Five were
already exported here — pharmacy-dispenses.ts and pharmacy-inventory.ts came
across with the original OPD extraction and are byte-identical to Gov-HIMS's.
NarcoticsLog and DrugMaster were the two missing, and a missing dynamic-import
export fails as undefined at runtime rather than at compile time, so the new
surface test asserts all seven by name."
```

---

### Task 2: The four pharmacy stores

**Files:**
- Create: `src/store/useNarcoticsStore.ts` (91 lines), `src/store/useDrugMasterStore.ts` (71), `src/store/usePharmacyStore.ts` (649), `src/store/usePharmacyInventoryStore.ts` (228)
- Create: `src/lib/api/__tests__/pharmacy-dispenses.test.ts` (225), `src/lib/api/__tests__/pharmacy-inventory.test.ts` (98)

**Interfaces:**
- Consumes: `NarcoticsLog`, `DrugMaster` from Task 1; `PharmacyDispenses`, `PharmacyStock`, `PharmacyPurchaseOrders`, `Prescriptions` already in `@/lib/api`.
- Produces: `usePharmacyStore`, `usePharmacyInventoryStore`, `useNarcoticsStore`, `useDrugMasterStore`, plus the types `DrugEntry`, `DrugSchedule`, `DrugForm`, `NarcoticEntry`. Task 4's pages import all four stores by these names.

- [ ] **Step 1: Copy the four stores**

```bash
G="D:/Agentix Project/Gov-HIMS"
cp "$G/src/store/useNarcoticsStore.ts"          src/store/
cp "$G/src/store/useDrugMasterStore.ts"         src/store/
cp "$G/src/store/usePharmacyStore.ts"           src/store/
cp "$G/src/store/usePharmacyInventoryStore.ts"  src/store/
```

They import only `zustand`, `zustand/middleware`, `@/lib/supabase/client` and `@/lib/api` — all present — so they need no import rewriting.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: silent. If a type is missing, it will name it — report rather than inventing a shim.

- [ ] **Step 3: Port the two API tests**

```bash
G="D:/Agentix Project/Gov-HIMS"
cp "$G/src/lib/api/__tests__/pharmacy-dispenses.test.ts"  src/lib/api/__tests__/
cp "$G/src/lib/api/__tests__/pharmacy-inventory.test.ts"  src/lib/api/__tests__/
```

- [ ] **Step 4: Run them**

Run: `npx vitest run src/lib/api/__tests__/pharmacy-dispenses.test.ts src/lib/api/__tests__/pharmacy-inventory.test.ts`
Expected: PASS. These hit the live database, so a dev server is not required but `.env.local` must be loaded (vitest.setup.ts does this).

If either fails on a fixture the test creates and deletes, check its cleanup runs — this repo has already been bitten by a leaked test fixture (`rls.test.ts` left auth users behind and then failed forever). If the test creates rows, confirm its teardown is guarded and idempotent, and make it so if not. Report any change.

- [ ] **Step 5: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: 0 lint errors, tsc silent, all green.

- [ ] **Step 6: Commit**

```bash
git add src/store src/lib/api/__tests__
git commit -m "feat(pharmacy): port the four pharmacy stores

usePharmacyStore (dispensing queue), usePharmacyInventoryStore (stock and
purchase orders), useNarcoticsStore (Schedule H1/X dual-signature register)
and useDrugMasterStore (formulary). No import rewriting was needed — every
dependency already exists here."
```

---

### Task 3: Bilingual message bundles

**Files:**
- Create: `messages/en/pharmacy.json`, `messages/hi/pharmacy.json` (176 lines each, already translated)
- Modify: `messages/en/nav.json`, `messages/hi/nav.json`
- Regenerate: `messages/en/index.ts`, `messages/hi/index.ts`

**Interfaces:**
- Produces: the `pharmacy` namespace for both locales, plus `nav.item.pharmacy_*`, `nav.role.pharmacy` and any missing `nav.section.*` keys. Task 4's pages call `useTranslations('pharmacy')`; Task 5's nav reads the `nav.item.*` keys.

- [ ] **Step 1: Copy the bundles**

```bash
G="D:/Agentix Project/Gov-HIMS"
cp "$G/messages/en/pharmacy.json" messages/en/pharmacy.json
cp "$G/messages/hi/pharmacy.json" messages/hi/pharmacy.json
```

- [ ] **Step 2: Add the nav keys to both locales**

Into `messages/en/nav.json`, inside the existing `item` object:

```json
    "pharmacy_dashboard": "Overview",
    "pharmacy_queue": "Prescription Queue",
    "pharmacy_inventory": "Inventory",
    "pharmacy_master": "Drug Master",
    "pharmacy_narcotics": "Narcotics Log",
    "pharmacy_messages": "Messaging",
    "patient_pharmacy": "My Medicines",
```

and inside the existing `role` object: `"pharmacy": "Pharmacy"`.

Task 5 uses the section headers `section.fulfilment`, `section.stock_compliance` and `section.utilities`. Verified during planning: `utilities` already exists in this repo's `nav.json`; **`fulfilment` and `stock_compliance` are missing** and must be added to the `section` object:

```json
    "fulfilment": "Fulfilment",
    "stock_compliance": "Stock & Compliance",
```

Do not re-add `utilities` — it is already there.

Take the Hindi values verbatim from `$GOV/messages/hi/nav.json` for every key above. Verified during planning: **all of them are present there** — the seven `item.pharmacy_*`/`item.patient_pharmacy` keys, `section.fulfilment`, `section.stock_compliance` and `role.pharmacy`. Do not machine-translate any of them.

- [ ] **Step 3: Regenerate the barrel**

Run: `node scripts/i18n-barrel.mjs`
Then confirm `messages/en/index.ts` and `messages/hi/index.ts` both now import and register `pharmacy`. The file header says AUTO-GENERATED — do not hand-edit it.

- [ ] **Step 4: Verify both locales parse and match**

Run: `npx tsc --noEmit && node -e "const en=require('./messages/en/pharmacy.json'),hi=require('./messages/hi/pharmacy.json');const ke=Object.keys(en).sort(),kh=Object.keys(hi).sort();console.log('en top-level keys',ke.length,'hi',kh.length);console.log('match:',JSON.stringify(ke)===JSON.stringify(kh))"`
Expected: tsc silent; `match: true`.

- [ ] **Step 5: Commit**

```bash
git add messages
git commit -m "feat(pharmacy): add the bilingual pharmacy message bundles

Both locales' pharmacy.json came across already translated. Nav item, role and
section keys added to en and hi, with the Hindi strings taken verbatim from
Gov-HIMS rather than machine-translated. Barrel regenerated by the script."
```

---

### Task 4: Components and pages, rethemed as they land

The largest task, and the one where this repo's guardrails bite. The incoming files carry **37 retired-orange literals** and **2 `text-white` on `bg-primary` pairings**; both are now build-failing here.

**Files:**
- Create: `src/components/patient/OrdersServiceBanner.tsx` (59 lines), `src/components/pharmacy/DoctorStockAlerts.tsx` (56)
- Create: `src/app/pharmacy/layout.tsx` (5), `dashboard/page.tsx` (140), `queue/page.tsx` (529), `inventory/page.tsx` (146), `master/page.tsx` (100), `narcotics/page.tsx` (58), `messages/page.tsx` (19)
- Create: `src/app/patient/pharmacy/page.tsx` (227)

**Interfaces:**
- Consumes: all four stores from Task 2; the `pharmacy` i18n namespace from Task 3; `RoleGuard`, `Select`, `StaffMessages`, `usePatientOrdersStore` already present.
- Produces: the routes `/pharmacy/{dashboard,queue,inventory,master,narcotics,messages}` and `/patient/pharmacy`. Task 5 links to them.

- [ ] **Step 1: Copy the files**

```bash
G="D:/Agentix Project/Gov-HIMS"
mkdir -p src/app/pharmacy src/components/pharmacy src/app/patient/pharmacy
cp -r "$G/src/app/pharmacy/." src/app/pharmacy/
cp "$G/src/app/patient/pharmacy/page.tsx" src/app/patient/pharmacy/page.tsx
cp "$G/src/components/pharmacy/DoctorStockAlerts.tsx" src/components/pharmacy/
cp "$G/src/components/patient/OrdersServiceBanner.tsx" src/components/patient/
```

`OrdersServiceBanner` is a dependency of `patient/pharmacy/page.tsx` that this repo does not have; it imports only `@/lib/utils` and `@/store/usePatientOrdersStore`, both present.

- [ ] **Step 2: Apply the retired-hex mapping**

Across every file copied in Step 1:

| From | To |
|---|---|
| `#EE6B26` | `#1E97B2` |
| `#F58C4E` | `#6acdd9` |
| `#C2481A` | `#196b7e` |
| `#B84A16` | `#955408` |
| `rgba(238, 107, 38, X)` / `rgba(238,107,38,X)` | `rgba(30, 151, 178, X)` / `rgba(30,151,178,X)` — preserve alpha X and spacing style exactly |

Match case-insensitively.

- [ ] **Step 3: Fix the white-on-brand-teal pairings**

Two lines put `text-white` on `bg-primary` / `bg-[var(--color-primary)]`. `#1E97B2` with white is 3.43:1 and fails AA. Change the **fill**, not the ink: `bg-primary` → `bg-primary-dark`, `bg-[var(--color-primary)]` → `bg-[var(--color-primary-dark)]`. If such an element already has `hover:bg-[var(--color-primary-dark)]`, move the hover to `hover:bg-[#1a5667]` so it still differs from rest.

Leave `bg-primary-soft`, `bg-primary-light` and any `/opacity` variant alone — they are tints, not text-bearing fills.

- [ ] **Step 4: Audit for severity colours — the patient-safety step**

The dispensing queue carries `PharmTriageLevel` and priority tiers. Read every place a colour is chosen from a triage, priority, severity, urgency or status value in the copied files, and check the mapping still reads as an ordered ramp.

The rule: **brand colour must never signal a clinical severity.** Any "High"/"urgent" tier that a mechanical swap has turned teal must become `bg-urgent-bg text-urgent` (the frozen `--color-urgent` `#C2410C`), matching the seven High tiers already converted elsewhere in this codebase. A tier that is teal while its siblings in the same expression are red/amber/green is the signature to look for.

List every such site you found and what you changed it to, in your report — including "none found" if the mapping is clean.

- [ ] **Step 5: Verify the guardrails accept the result**

Run:

```bash
npm run lint
grep -rniE "#(EE6B26|F58C4E|C2481A|B84A16)|rgba\( *238, *107, *38" src/app/pharmacy src/app/patient/pharmacy src/components/pharmacy src/components/patient/OrdersServiceBanner.tsx | wc -l
npx vitest run src/app/__tests__/theme-contrast.test.ts
```

Expected: lint 0 errors; grep prints `0`; contrast suite passes (its line-based guard will fail with a `file:line` list if any white-on-teal pairing survives).

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc silent; build exit 0 and the route table now lists `/pharmacy/*` and `/patient/pharmacy`.

`npm run build` takes several minutes — run it in the background and wait rather than letting a foreground call time out.

- [ ] **Step 7: Commit**

```bash
git add src/app/pharmacy src/app/patient/pharmacy src/components/pharmacy src/components/patient/OrdersServiceBanner.tsx
git commit -m "feat(pharmacy): port the portal's pages and components

Seven staff pages, the patient-facing medicines view, DoctorStockAlerts and
OrdersServiceBanner. Rethemed on the way in: the incoming files carried 37
retired-orange literals that this repo's lint rule rejects and 2 white-on-teal
pairings its contrast guard rejects, both of which post-date Gov-HIMS."
```

---

### Task 5: Wire the portal in

Until this task the routes exist but nothing reaches them and no account can hold the role.

**Files:**
- Modify: `src/types/roles.ts`, `src/app/login/page.tsx`, `src/components/landing/HeroSignIn.tsx`, `src/components/layout/AppShell.tsx`, `src/components/landing/PortalLauncher.tsx`
- Test: `src/types/__tests__/roles.test.ts`

**Interfaces:**
- Consumes: the routes from Task 4, the nav keys from Task 3.
- Produces: `'pharmacy'` as a member of `Role`, reachable at `/pharmacy/dashboard` after sign-in.

- [ ] **Step 1: Write the failing test**

Create `src/types/__tests__/roles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ALL_ROLES } from '@/types/roles'

describe('roles', () => {
  it('includes pharmacy, which ships a portal', () => {
    expect(ALL_ROLES).toContain('pharmacy')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/types/__tests__/roles.test.ts`
Expected: FAIL — the array does not contain `'pharmacy'`.

- [ ] **Step 3: Add the role**

In `src/types/roles.ts`, add `'pharmacy',` to `ALL_ROLES`. Update the comment above it — it currently says the app "ships five portals"; it now ships six.

- [ ] **Step 4: Route sign-in to the portal**

`ROLE_DASHBOARD` exists in **two** files and both must gain the entry, or a pharmacist signing in from one of the two forms lands on the landing page:

- `src/app/login/page.tsx`
- `src/components/landing/HeroSignIn.tsx`

Add to each: `pharmacy: "/pharmacy/dashboard",`

- [ ] **Step 5: Add the sidebar navigation**

In `src/components/layout/AppShell.tsx`, add beside the other section constants:

```tsx
const PHARMACY_SECTIONS: { header: string; items: NavItem[] }[] = [
  { header: 'section.fulfilment', items: [
    { href: '/pharmacy/dashboard', label: 'item.pharmacy_dashboard', icon: LayoutDashboard },
    { href: '/pharmacy/queue',     label: 'item.pharmacy_queue',     icon: ClipboardList },
  ] },
  { header: 'section.stock_compliance', items: [
    { href: '/pharmacy/inventory', label: 'item.pharmacy_inventory', icon: Package },
    { href: '/pharmacy/master',    label: 'item.pharmacy_master',    icon: BookOpen },
    { href: '/pharmacy/narcotics', label: 'item.pharmacy_narcotics', icon: AlertTriangle },
  ] },
  { header: 'section.utilities', items: [
    { href: '/pharmacy/messages',  label: 'item.pharmacy_messages',  icon: MessageSquare },
  ] },
]
```

Import any of `LayoutDashboard`, `ClipboardList`, `Package`, `BookOpen`, `AlertTriangle`, `MessageSquare` not already imported from `lucide-react`.

**Register it in BOTH maps — this is the trap in this task:**

- `navByRole` is `Record<Role, NavItem[]>` — **exhaustive**, so omitting `pharmacy` is a compile error and you cannot miss it. Add `pharmacy: PHARMACY_SECTIONS.flatMap(s => s.items),`
- `sectionsByRole` is `Partial<Record<Role, …>>` — **optional**, so omitting `pharmacy` compiles cleanly and silently renders an ungrouped sidebar. Add `pharmacy: PHARMACY_SECTIONS,`

Also add the patient's own medicines link to `PATIENT_SECTIONS`, in the section where the other care items sit: `{ href: '/patient/pharmacy', label: 'item.patient_pharmacy', icon: Pill },`

- [ ] **Step 6: Add the sixth portal card**

In `src/components/landing/PortalLauncher.tsx`, add to the role card list, following the shape of the existing entries exactly:

```tsx
{ role: "pharmacy", label: "Pharmacy", desc: "Prescription queue, dispensing, stock", icon: Pill, href: "/pharmacy/dashboard" },
```

Import `Pill` from `lucide-react` if it is not already imported.

- [ ] **Step 7: Run the test and the suite**

Run: `npx vitest run src/types/__tests__/roles.test.ts && npm run lint && npx tsc --noEmit && npm test`
Expected: the roles test passes, 0 lint errors, tsc silent, suite green.

- [ ] **Step 8: Verify the portal is actually reachable**

Run `npm run build`, then start the server and check the routes answer:

```bash
npx next start -p 3000 &
for p in /pharmacy/dashboard /pharmacy/queue /pharmacy/inventory /pharmacy/master /pharmacy/narcotics /pharmacy/messages /patient/pharmacy; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://localhost:3000$p")  $p"
done
```

Expected: `200` for all seven. Note `/pharmacy/*` sits behind `RoleGuard allowedRole="pharmacy"`, which redirects client-side — the server still returns 200 for the shell, so this checks routing, not authorization.

- [ ] **Step 9: Commit**

```bash
git add src/types src/app/login src/components/landing src/components/layout
git commit -m "feat(pharmacy): wire the sixth portal into roles, nav and launcher

ROLE_DASHBOARD lives in two files (login and the landing hero sign-in) and both
needed the entry. AppShell has two role->nav maps: navByRole is exhaustive so it
cannot be missed, sectionsByRole is Partial so omitting it would have silently
rendered an ungrouped sidebar."
```

---

### Task 6: Make pharmacy a real journey stage

The consequential task. It changes the shared OPD queue that **every** portal reads; 31 files reference `queueStatus`. It is deliberately last and alone so a regression bisects to one commit.

Today the stage is erased on purpose. `src/app/api/opd-queue/route.ts`:

```ts
const VISIT_TO_QUEUE: Record<string, string | undefined> = {
  scheduled: 'waiting', waiting: 'waiting', vitals: 'vitals',
  consulting: 'consulting', pharmacy: 'billing', billing: 'billing',
}
```

`pharmacy: 'billing'` exists because no pharmacy portal shipped — a visit written as `pharmacy` (plausibly by Gov-HIMS, which shares the table) had to surface somewhere rather than vanish from every board. That reason is now gone.

**Files:**
- Modify: `src/store/usePatientStore.ts`, `src/app/api/opd-queue/route.ts`, `src/app/doctor/consultation/page.tsx`, `src/lib/journeyAggregator.ts`, `src/app/patient/queue/page.tsx`, `src/app/p/[uhid]/page.tsx`
- Test: `src/store/__tests__/usePatientStore.updateStatus.test.ts`, `src/app/api/__tests__/opd-queue-pharmacy.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1–5 — this task is independent of the portal itself and could ship alone.
- Produces: `QueueStatus` gains `'pharmacy'`; the journey becomes `waiting → vitals → consulting → pharmacy → billing → done`.

- [ ] **Step 1: Write the failing API test**

Create `src/app/api/__tests__/opd-queue-pharmacy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The mapping is a module-private const in a route handler, so assert it at
// the source. A visit written as 'pharmacy' must surface as 'pharmacy' — it
// was collapsed into 'billing' only because no pharmacy portal shipped.
describe('opd-queue visit-status mapping', () => {
  it('no longer collapses pharmacy into billing', () => {
    const src = readFileSync(
      join(import.meta.dirname, '../opd-queue/route.ts'), 'utf8',
    )
    const map = src.slice(src.indexOf('VISIT_TO_QUEUE'), src.indexOf('}', src.indexOf('VISIT_TO_QUEUE')))
    expect(map).toMatch(/pharmacy:\s*'pharmacy'/)
    expect(map).not.toMatch(/pharmacy:\s*'billing'/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/__tests__/opd-queue-pharmacy.test.ts`
Expected: FAIL — the map still reads `pharmacy: 'billing'`.

- [ ] **Step 3: Widen the status type and both mappings**

In `src/store/usePatientStore.ts`:

```ts
export type QueueStatus = 'waiting' | 'vitals' | 'consulting' | 'pharmacy' | 'billing' | 'done'
```

and in `QUEUE_STATUS_TO_VISIT_STATUS`, whose value type must gain `'pharmacy'` too:

```ts
const QUEUE_STATUS_TO_VISIT_STATUS: Record<QueueStatus, 'waiting' | 'vitals' | 'consulting' | 'pharmacy' | 'billing' | 'completed'> = {
  waiting: 'waiting',
  vitals: 'vitals',
  consulting: 'consulting',
  pharmacy: 'pharmacy',
  billing: 'billing',
  done: 'completed',
}
```

In `src/app/api/opd-queue/route.ts`, change `pharmacy: 'billing'` to `pharmacy: 'pharmacy'`.

- [ ] **Step 4: Run the test and let the compiler find the rest**

Run: `npx vitest run src/app/api/__tests__/opd-queue-pharmacy.test.ts && npx tsc --noEmit`

The test passes. `tsc` will now list every exhaustive `Record<QueueStatus, …>` and switch that does not handle the new member — **that list is your worklist**. Handle each so `pharmacy` sits between `consulting` and `billing` in any ordered sequence (step order, progress bars, stage labels).

- [ ] **Step 5: Audit the filters the compiler cannot see**

Type-widening does not catch array membership. Find every queue filter:

```bash
grep -rn "'waiting', 'vitals', 'consulting'\|\"waiting\", \"vitals\", \"consulting\"" src/ --include=*.ts --include=*.tsx
```

For each hit, decide whether a patient at `pharmacy` belongs in that list. This is the step where an omission silently drops patients off a board rather than failing a build, so state your decision for each site in your report.

Add the patient-facing stage to the journey surfaces: `src/lib/journeyAggregator.ts`, `src/app/patient/queue/page.tsx` and `src/app/p/[uhid]/page.tsx` should show a **Collect medicines** stage between consultation and billing. Use the existing stage vocabulary in each file; add the i18n keys the surrounding code style requires, in both `messages/en` and `messages/hi`.

- [ ] **Step 6: Add the doctor's action**

In `src/app/doctor/consultation/page.tsx`, add a **Send to pharmacy** action that calls `updateStatus(patientId, 'pharmacy')`, alongside the existing status actions and following their exact pattern. It replaces going straight to billing for a patient who has a prescription.

- [ ] **Step 7: Extend the real-backend chain test**

In `src/store/__tests__/usePatientStore.updateStatus.test.ts`, extend the existing full-chain test so the chain runs reception (`waiting`) → vitals (`vitals`) → consultation (`consulting`) → **pharmacy (`pharmacy`)** → billing (`billing`), asserting the Postgres `visits.status` at each hop with the service-role `admin` client, exactly as the existing hops do.

This file already signs in, bridges its session through `attachServerSession` and cleans up its rows in `afterEach` — follow those patterns and do not add a second sign-in path.

- [ ] **Step 8: Full verification**

Run: `npm run lint && npx tsc --noEmit && npm test && npm run build`

Expected: 0 lint errors, tsc silent, suite green, build exit 0. **The suite needs a dev server on :3000** — start one before `npm test` or the integration tests fail with `ECONNREFUSED`.

- [ ] **Step 9: Commit**

```bash
git add src messages
git commit -m "feat(journey): make pharmacy a real OPD stage

The queue collapsed visit status 'pharmacy' into 'billing' because no pharmacy
portal shipped; a visit written as pharmacy by the other tenant of this shared
database had to surface somewhere rather than vanish. That reason is gone.

The journey is now waiting -> vitals -> consulting -> pharmacy -> billing ->
done, with a doctor 'Send to pharmacy' action and a 'Collect medicines' stage
on the patient tracker. Widening QueueStatus makes the compiler find every
exhaustive map; the array filters it cannot see were audited by hand, and the
real-backend chain test now covers the pharmacy hop."
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| Why this is a port, not a build | Verified during planning; the "What already exists" table records it |
| What ports — API modules | 1 (only the two the spec did not know were missing) |
| What ports — stores | 2 |
| What ports — i18n | 3 |
| What ports — pages, components | 4 |
| Wiring into this app | 5 |
| The journey change | 6 |
| Testing | 1, 2 (ported tests), 5 (roles), 6 (chain + mapping) |
| Migration consideration | 6 — visits already at `pharmacy` display as Pharmacy rather than Billing after this lands; no data migration |
| Build order | Matches the spec's stated order |

**Corrections the spec needs, made here:** the spec listed `pharmacy-dispenses.ts` and `pharmacy-inventory.ts` (343 lines) as work; they are already present and byte-identical, so Task 1 ports only `narcotics.ts` and `drug-master.ts`, which the spec did not mention. The spec also missed `OrdersServiceBanner.tsx`, a dependency of the patient page, and did not anticipate that the incoming files fail this repo's now-stricter lint and contrast guards.

**Type consistency:** `NarcoticsLog` / `DrugMaster` are created in Task 1 and destructured under those exact names by Task 2's stores. The four store hook names in Task 2 match Task 4's page imports. `QueueStatus` gains `'pharmacy'` in Task 6 and every consumer is reached through the compiler.

**Ordering:** Task 6 is independent of Tasks 1–5 and last on purpose — it is the only task that changes behaviour visible to the other five portals.
