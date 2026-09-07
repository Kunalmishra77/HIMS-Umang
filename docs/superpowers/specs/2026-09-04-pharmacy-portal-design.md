# Pharmacy portal — design

**Date:** 2026-09-04
**Status:** approved, not yet implemented
**Depends on:** `2026-09-04-umang-brand-retheme-design.md` (theme lands first, so
ported pages arrive in the final palette)

## Goal

Give Umang HIMS a sixth portal — pharmacy — by porting the working module from
Gov-HIMS (`D:\Agentix Project\Gov-HIMS`), and make pharmacy a real stage in the
OPD patient journey rather than a status that collapses into billing.

## Why this is a port, not a build

Verified against the live shared database and both codebases:

- **Every pharmacy table already exists** in the shared Supabase project:
  `drug_master`, `drugs`, `inventory`, `narcotics_log`, `pharmacy_claims`,
  `pharmacy_dispense`, `pharmacy_dispenses`, `pharmacy_narcotics`,
  `pharmacy_purchase_orders`, `pharmacy_stock_items`. No migration.
- **`pharmacy` is already in the `role_t` enum**, alongside the roles this build
  uses. No enum change; `profiles.role` accepts it today.
- **The two codebases share a design system** — `globals.css` `@theme` tokens
  are byte-identical. Ported pages need no restyling.
- **i18n structure is identical** (`messages/<locale>/*.json` + a generated
  barrel). `messages/{en,hi}/pharmacy.json` already exist, 176 lines each, fully
  translated.
- **No multi-tenant scoping to strip** — the pharmacy stores and API modules
  contain zero `hospital_id` / `branch_id` references.
- **7 of 9 internal dependencies already exist here.** Only `useNarcoticsStore`
  (91 lines) and `useDrugMasterStore` (71 lines) are missing.

## What ports

| Area | Files | ~Lines |
|---|---|---|
| Staff pages | `app/pharmacy/{layout,dashboard,queue,inventory,master,narcotics,messages}` | 997 |
| Patient view | `app/patient/pharmacy/page.tsx` | 227 |
| Component | `components/pharmacy/DoctorStockAlerts.tsx` | 56 |
| Stores | `usePharmacyStore`, `usePharmacyInventoryStore`, `useNarcoticsStore`, `useDrugMasterStore` | 1,039 |
| API | `lib/api/pharmacy-dispenses.ts`, `lib/api/pharmacy-inventory.ts` | 343 |
| i18n | `messages/{en,hi}/pharmacy.json` + 9 nav keys per locale | 352 |
| Tests | `pharmacy-dispenses`, `pharmacy-inventory`, `pharmacy-schema` | — |

`app/pharmacy/layout.tsx` is a five-line `RoleGuard allowedRole="pharmacy"` and
transfers unchanged.

`queue/page.tsx` (529 lines) is the substantial one — it is the dispensing
worklist and the heart of the portal.

## Wiring into this app

| Target | Change |
|---|---|
| `src/types/roles.ts` | add `pharmacy` to `ALL_ROLES` |
| `src/app/login/page.tsx`, `components/landing/HeroSignIn.tsx` | add `pharmacy: "/pharmacy/dashboard"` to both `ROLE_DASHBOARD` maps |
| `components/layout/AppShell.tsx` | add `PHARMACY_SECTIONS`, then register it in **both** `navByRole` (flat list, `Record<Role, NavItem[]>` — exhaustive, so it will not compile without the new role) and `sectionsByRole` (grouped sidebar, `Partial<Record<...>>` — optional, so omitting it fails silently with an ungrouped sidebar) |
| `components/landing/PortalLauncher.tsx` | a sixth role card |
| `messages/{en,hi}/nav.json` | 9 pharmacy nav keys |
| `scripts/i18n-barrel.mjs` | re-run to regenerate `messages/*/index.ts` |

## The journey change

This is the consequential part and carries the real risk: it touches the shared
OPD queue that **every** portal reads. 31 files reference `queueStatus`.

Today the pharmacy stage is deliberately erased. `src/app/api/opd-queue/route.ts`:

```ts
const VISIT_TO_QUEUE: Record<string, string | undefined> = {
  scheduled: 'waiting', waiting: 'waiting', vitals: 'vitals',
  consulting: 'consulting', pharmacy: 'billing', billing: 'billing',
}
```

`pharmacy: 'billing'` exists because no pharmacy portal shipped — a visit
written as `pharmacy` (plausibly by Gov-HIMS, which shares the table) had to
surface somewhere rather than vanish from every board.

Required changes:

1. `usePatientStore.QueueStatus` — add `'pharmacy'`, giving
   `'waiting' | 'vitals' | 'consulting' | 'pharmacy' | 'billing' | 'done'`.
2. `QUEUE_STATUS_TO_VISIT_STATUS` — add `pharmacy: 'pharmacy'`.
3. `VISIT_TO_QUEUE` — `pharmacy: 'pharmacy'`.
4. Doctor consultation gains a **Send to pharmacy** action, advancing the visit
   to `pharmacy` instead of straight to billing.
5. The patient tracker (`/patient/queue`, `/p/[uhid]`, `journeyAggregator`)
   gains a **Collect medicines** stage.
6. Every queue filter of the form `['waiting','vitals','consulting']` is audited
   for whether `pharmacy` belongs in it. This is the ordering-sensitive part:
   an omission silently drops patients off a board.

New flow: `waiting → vitals → consulting → pharmacy → billing → done`.

### Migration consideration

Existing visits already sitting at status `pharmacy` currently display as
*Billing*. After this change they display as *Pharmacy* — correct, but a visible
shift for anyone mid-journey at deploy time. No data migration is needed;
the change is presentational plus a new legal transition.

## Testing

The port brings three tests. The journey change needs its own, because it is
where a regression would be both likely and expensive:

1. Port `pharmacy-dispenses`, `pharmacy-inventory`, `pharmacy-schema` tests.
2. **New:** extend the `usePatientStore.updateStatus` integration suite with a
   full real-backend chain — reception creates (`waiting`) → vitals
   (`vitals`) → consultation (`consulting`) → **pharmacy** (`pharmacy`) →
   billing (`billing`) — asserting the Postgres `visits.status` at each hop, in
   the style of the existing chain test.
3. **New:** assert `/api/opd-queue` reports a `pharmacy` visit as `pharmacy`,
   not `billing`.
4. `RoleGuard` denies a non-pharmacy role at `/pharmacy/*`.
5. Full suite green: currently 126/126.

Note the integration tests need a server on `localhost:3000` (or `TEST_BASE_URL`)
and bridge their session through `lib/testing/serverSession.ts`.

## Build order

1. Stores and API modules (no UI dependency).
2. i18n bundles, then regenerate the barrel.
3. Pages and the `RoleGuard` layout.
4. Role, nav and portal-launcher wiring — portal reachable end to end.
5. Journey change, last and on its own, so a regression is bisectable to a
   single commit.

## Out of scope

- Pharmacy billing integration beyond the existing `pharmacy_claims` table.
- Purchase-order workflow (`pharmacy_purchase_orders` stays unused, as in Gov-HIMS).
- Rewriting ported pages beyond what compiling and theming require.
- Gating `/api/opd-register` (tracked separately).
