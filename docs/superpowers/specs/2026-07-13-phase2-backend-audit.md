# Phase 2 — Backend / Database / Frontend-Integration Audit

**Date:** 2026-07-13
**Scope:** Current state of the Gov-HIMS backend after the Supabase Pro migration, to scope checklist items #3–#8.
**Method:** Three parallel read-only code audits (backend+DB, frontend-integration, patient-journey+realtime), cross-checked against the live schema.

---

## The single most important finding (read first)

The data-access helper `src/lib/api/_core.ts` `table()` tries Postgres first and **silently falls back to per-browser localStorage** when a table is missing (`PGRST205`). On top of that, the ~12 "real" stores only mirror writes to Postgres **when a genuine Supabase auth session exists** — they check `await getSupabaseClient().auth.getSession()` and **no-op if it's null**.

**Consequence:** under the **demo role-switcher login** (the app's primary login path today), `getSession()` returns null, so every clinical write silently stays in localStorage. **The app currently runs almost entirely on mock data** unless you sign in with a real Supabase account. This dominates checklist items #4 (verify journey), #5 (workflow), #7 (demo data), and #8 (A–Z test): none can be validated "for real" until the persistence path is exercised by a real session (or the gate is changed).

**Decision required (see end):** how the demo logs in — real Supabase sessions vs. relaxing the persistence gate for demo.

---

## Backend layer — status

**Real, table-backed, working CRUD (the clinical core):**
patients, visits, appointments, encounters, prescriptions, orders, admission_requests, beds, lab_specimens, lab_tests, lab_reflex_suggestions, radiology_studies, pharmacy_dispenses, pharmacy_inventory (stock + POs), ipd_stays, ipd_vitals, nurse_tasks, shift_handovers, narcotics_log, vitals_readings, audit_entries, bills+payments, discharges, drugs, er_cases, staff. All 35 tables have RLS enabled.

**Partial:** `profiles.ts` (only `createStaff`; no typed list/get/update). `narcotics.ts` (create/read; no verify/return reconciliation). `ipd-vitals.ts` / `vitals-readings.ts` (create+read only).

**Dead / dangerous code (cleanup):**
- `radiology.ts` — targets the **same `radiology_studies` table** as `radiology-studies.ts` with an **incompatible schema**; a stray import would corrupt live rows. **Quarantine/delete.**
- `ipd.ts` — writes to `legacy_*` tables that **have no migration** → permanent localStorage. Dead.
- `lab.ts`, `pharmacy.ts` — orphaned, superseded by the `*-tests`/`*-dispenses` modules; leave stranded tables (`lab_results`, `pharmacy_claims`, `pharmacy_dispense`, `pharmacy_narcotics`).

**`opd_orders`** has no `src/lib/api` module — it's driven directly by the service-role route `src/app/api/opd-order/route.ts` + `src/lib/cross-device-orders.ts` (a parallel data path outside the `_core` convention).

**Security (flagged as a TODO in the migration itself):** the "graduated" tables — bills, payments, pharmacy_narcotics, staff, drugs, discharges, er_cases, lab_results, opd_orders — use a blanket `for all to authenticated using(true) with check(true)` policy. **Any authenticated user of any role can read/write billing, payments, and the narcotics register.** Discharge-exit and bill-freeze gates are enforced in client JS only (the "server-side gate" comment is inaccurate) behind that permissive RLS.

---

## Frontend integration — status

Of ~76 Zustand stores: **12 hybrid** (real bridge + localStorage cache, session-gated), **~41 localStorage-only**, **~23 in-memory-only** (reset on refresh).

**Duplicate legacy dummy stores shadowing a real one (top cleanup — causes inconsistent data on the SAME portal):**
- `useLabStore` (dummy) vs `useLabOrdersStore` (real) — both used by reception/doctor/admin
- `useRadiologyStore` (dummy) vs `useRadiologyStudiesStore` (real) — both used by radiology/reception/doctor

**Whole cockpits with zero backend:** CMO district cockpit (7 stores), Secretary state cockpit (12 stores), ABHA/ABDM page (inline mocks).

**Single-domain pure-dummy modules:** Billing, Insurance/TPA, Blood Bank, CSSD, Dietary, BMW, Mortuary, OT, Ambulance, Housekeeping, HR/HRMS (note: `POST /api/admin/staff` is real but called by no UI), Vendor mgmt, general Inventory, Quality/NABH, Statutory, Feedback, ER triage board, WhatsApp, Consent, Ward mgmt, doctor profile/stats, drug master, notifications, patient follow-up/live-tracking, camera capture.

**Durability (CORRECTED 2026-07-13, T0.6):** this earlier "in-memory only" claim was **wrong**. `useAuditStore.log()` writes through to `Audit.put()` → the real `audit_entries` table (`audit.ts`), and `StoreHydrator` hydrates the latest 500 rows on mount + subscribes live via `onAudit`. Empirically verified: `audit_entries` holds 1,495 rows and an anon client can INSERT+SELECT (RLS is `public` INSERT `check(true)` / SELECT `using(true)`), so audit persists across reload with or without a session. No change needed.

---

## Patient journey — handoff status (checklist #4/#5)

| Step | Data | Handoff | Verdict |
|---|---|---|---|
| Reception register | Real (service-role route) | Wired | ✅ |
| ABHA/ABDM linkage | **Mock** (`aadhaar-mock.ts`); UHID/abha value persisted | Partial | demo-ok, not real |
| UHID assignment | Real — **but session-gated** | Wired (real session only) | ⚠️ |
| Vitals capture | Real reading (session-gated); queue advance always | Wired | ⚠️ |
| Doctor → orders | Real dispatch → `opd_orders` board | Wired | ✅ |
| Lab specimen→test→result | Order dispatch real; **status progression not propagated** | **Broken cross-device** | ❌ |
| Radiology study→report | Same as lab | **Broken cross-device** | ❌ |
| Pharmacy prescription→dispense | Same as lab (known FOLLOW-UP in StoreHydrator) | **Broken cross-device** | ❌ |
| OPD queue | Real, live | Wired | ✅ |
| IPD admission/bed | Real | Wired | ✅ |
| IPD stay (MAR/IO/rounds/discharge) | Real | Wired | ✅ |
| Discharge | Real (shared `ipd_stays.discharge` jsonb) | Wired | ✅ |
| Billing | **Dummy** — no Supabase backing | Broken/isolated | ❌ |

**Core workflow-fix worklist (journey order):** (1) lab result release, (2) radiology report finalize, (3) pharmacy dispense — none propagate cross-device; only initial *dispatch* pushes to `opd_orders`. Fix = call `pushOrder()` in `releaseTest`/`microRelease`/radiology-finalize/`dispense`/`markCollected`. (4) Billing has no backend. (5) Patient portal never actively hydrates on load (`StoreHydrator` excludes `role==='patient'`) → stale on a fresh device.

---

## Real-time — status (checklist #6)

| Flow | Realtime today | Fix needed |
|---|---|---|
| OPD queue (patients, visits) | ✅ Supabase live + 4s poll + cross-tab | none |
| Order **dispatch** (opd_orders INSERT) | ✅ Supabase live + poll | none |
| Order **status** (collected/verified/released/dispensed) | ❌ same-tab BroadcastChannel only | add `pushOrder()` to status transitions |
| admission_requests | ❌ listener exists but table **not in `supabase_realtime` publication**, and excluded from poll → dead | `alter publication supabase_realtime add table admission_requests` + poll |
| ipd_stays | ❌ identical dead-listener gap | add to publication + poll |
| Billing | ❌ no backend at all | build backend first |
| Patient portal | ❌ no active hydration on load | hydrate/subscribe for role='patient' |

---

## Recommended priority order for checklist #3–#8

**Tier 0 — unblockers (do first, small, high-leverage):**
1. Resolve the **demo-session persistence gate** (decision below) — without this nothing else is verifiable.
2. Delete/quarantine dangerous dead code (`radiology.ts` table collision, `ipd.ts`).
3. Retire the duplicate legacy dummy stores (`useLabStore`, `useRadiologyStore`) so portals stop showing inconsistent data.

**Tier 1 — make the core clinical journey solid (items #4/#5/#6):**
4. Propagate lab/radiology/pharmacy **status changes** cross-device (`pushOrder` in the finalize/dispense actions).
5. Add `admission_requests` + `ipd_stays` to the realtime publication (+ poll fallback).
6. Patient-portal active hydration on load.
7. Realistic demo data seed spanning the full journey (item #7).
8. Full A–Z local test of the journey (item #8).

**Tier 2 — scoped module backends (item #3, if in scope for the demo):**
9. Billing (already has tables; wire the UI + scope RLS).
10. Scope the blanket `using(true)` RLS on financial/controlled tables (security).
11. Then, by priority: Insurance/TPA, ER triage durability, Blood Bank, OT, Ambulance, Inventory, HR/Payroll, CSSD, Dietary.

**Tier 3 — cockpits (large, likely out of demo scope):** CMO (7 stores) and Secretary (12 stores) cockpits need full schema + store rewrites — a major effort; recommend deferring unless required for the demo.

---

## Open decisions for the user

1. **Demo persistence gate:** should the demo log in with **real Supabase sessions** (so all the session-gated writes actually persist), or should we **relax the gate** so demo-role actions persist via the service-role path (like reception already does)? This determines whether the journey is verifiable on real data.
2. **Item #3 scope:** does "complete backend for all remaining modules" mean the **core clinical journey** (Tier 0–1, achievable and demo-critical) or **literally all ~20 dummy modules incl. the CMO/Secretary cockpits** (Tier 2–3, a large multi-week build)?
