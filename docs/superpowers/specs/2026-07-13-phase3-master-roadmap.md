# Phase 3 — Master Implementation Roadmap (full HIMS backend completion)

**Date:** 2026-07-13
**Basis:** [Phase 2 audit](2026-07-13-phase2-backend-audit.md)
**Locked decisions:** persistence via **real Supabase logins**; scope = **all modules** incl. CMO + Secretary cockpits.
**Status:** Draft for approval. No implementation begins until this is approved.

---

## 0. Scope & shape

~25 modules across 4 tiers. We execute **one module at a time** (Phase 4 process below); a module isn't "done" until its data is real, RLS-scoped per role, real-time where needed, integrated into its UI, seeded, and tested end-to-end under a **real login**.

To avoid a stale 200-page document, this roadmap fully specifies **Tier 0** and **Module 1 (Billing)** now; every later module gets its own detailed spec **just-in-time** when its turn comes, using the template in §2.

---

## 1. Tier 0 — cross-cutting foundations (prerequisites for everything)

These are not optional and block real-login testing of every module. Done first, as one focused sequence.

**T0.1 — Real accounts for every role + login wiring.**
The 12 migrated users don't cover all portals. Provision real Supabase accounts (Admin API, like migration Task 3) for every demo role: reception, doctor, nurse, lab, radiology, pharmacy, admin, billing, insurance, blood-bank, ot, ambulance, hr, inventory, cssd, dietary, cmo, secretary, patient (sample). Seed a matching `profiles`/`staff` row per account. Replace/augment the demo role-switcher so each portal establishes a **real session** (the existing `hydrateFromSession` path). Deliverable: a credentials sheet + every portal reachable by real login.

**T0.2 — RLS hardening (security + correctness under real logins).**
Replace the blanket `for all to authenticated using(true)` policies on bills, payments, pharmacy_narcotics, staff, drugs, discharges, er_cases, lab_results, opd_orders with **per-role** policies (read/write scoped to the roles that own each table). Move the discharge-exit and bill-freeze gates from client JS into Postgres (trigger/function or narrow RLS). This is what makes real-login portals actually work and keeps financial/controlled records safe.

**T0.3 — Dead/dangerous code removal.**
Delete/quarantine `radiology.ts` (table-name collision with `radiology-studies.ts` — corruption risk), `ipd.ts` (writes non-existent `legacy_*` tables), and retire the duplicate legacy dummy stores `useLabStore`/`useRadiologyStore` in favour of the real `useLabOrdersStore`/`useRadiologyStudiesStore` across reception/doctor/radiology/admin. Decide the fate of orphan tables (`lab_results`, `pharmacy_claims`, `pharmacy_dispense`, `pharmacy_narcotics`).

**T0.4 — Cross-device propagation of clinical status (item #5 core).**
Add `pushOrder()` to the lab/radiology/pharmacy **status transitions** (`releaseTest`, `microRelease`, radiology finalize, `dispense`/`markCollected`), not just order creation — resolving the `StoreHydrator` `FOLLOW-UP`. Guard against the push→realtime→hydrate→push loop the code comments warned about.

**T0.5 — Real-time publication + hydration gaps (item #6).**
`alter publication supabase_realtime add table admission_requests, ipd_stays;` and add both to the poll fallback; the dead listeners then fire. Add active hydration/subscription for `role==='patient'` so the patient portal isn't stale on a fresh device.

**T0.6 — Durable audit + notifications.**
Unify the in-memory `useAuditStore` with the durable `audit_entries`/`audit.ts` path so audit survives reload. Decide whether notifications need a table (for cross-device).

**T0.7 — Realistic demo seed spanning the journey (item #7).**
A seed that creates, under real accounts, a coherent set of patients moving through every journey stage (registered → vitals → consult → lab/radiology/pharmacy in various states → admitted → discharged → billed), so every portal has believable live data.

**Exit criteria for Tier 0:** every portal reachable by a real login; RLS correct per role; core journey (incl. lab/radiology/pharmacy status) propagates cross-device in real time; demo data present. This alone satisfies items #4, #5, #6, #7, #8 for the **core journey**.

---

## 2. Per-module execution template (Phase 4)

Each module (Tier 1–3) is delivered through this exact process; its spec is written just-in-time and covers these fields:

**Spec fields (Phase 3 requirements):** Scope · Data model (tables/columns/relationships/indexes) · APIs (`src/lib/api/<module>.ts` surface) · Business logic · Status flow · User roles & permissions · Validation rules · Edge cases · Security/RLS (per role) · Real-time needs · Performance · Testing strategy.

**Process (Phase 4 steps):** 1 Plan → 2 DB migration → 3 API design → 4 Backend build → 5 Frontend integration (retire the dummy store) → 6 Tests → 7 Bug-fix → 8 Optimize → 9 Docs → 10 Approval. One module fully finished before the next.

**Definition of done (per module):** real table + scoped RLS; typed api module following the `_core` convention; the dummy store replaced by real reads/writes; real-time if the module needs live cross-user updates; seed data; tests green; verified end-to-end under a real login.

---

## 3. Module sequence

**Tier 1 — core clinical journey hardening** (largely Tier 0; validated as one flow): Reception/UHID · Vitals · Doctor/Orders · **Lab** · **Radiology** · **Pharmacy** · OPD queue · IPD/Beds · Discharge. Verdict from audit: backends real; the work is T0.4/T0.5 propagation + real-login verification.

**Tier 2 — single-domain module backends** (build real table + api + RLS + integrate, one at a time, in this recommended order by journey value):
1. **Billing** (tables exist — start here) → 2. Insurance/TPA → 3. ER triage board → 4. Blood Bank → 5. Operation Theatre (OT) → 6. Ambulance → 7. General Inventory → 8. HR/HRMS → 9. Payroll/Finance → 10. CSSD → 11. Dietary → 12. Housekeeping → 13. BMW (bio-medical waste) → 14. Mortuary → 15. Vendor management → 16. Quality/NABH → 17. Statutory compliance → 18. Feedback → 19. Consent management → 20. Ward management → 21. Drug master → 22. WhatsApp/notifications persistence.

**Tier 3 — cockpits (largest; schema + full store rewrites):**
23. **CMO district cockpit** — 7 stores (alerts, ambulances, approvals, audit, beds, facilities, session) → needs district-level schema aggregating hospital data.
24. **Secretary state cockpit** — 12 stores (abdm, alerts, approvals, assembly, audit, cabinet, centre, districts, medical-colleges, mobilization, niti, session) → state-level schema aggregating district data.

**ABHA/ABDM:** the mock (`aadhaar-mock.ts`, `abha/page.tsx`) is fine for demo; real UIDAI/ABDM integration is a separate production track (sandbox creds, FHIR) — planned but not built for the demo unless required.

---

## 4. Module 1 — Billing (fully specified exemplar)

**Why first:** journey-terminal (OPD `billing` status + discharge `billing` clearance already point at it), and the `bills`/`payments` tables already exist from the migration — so it's integrate + RLS + realtime, not greenfield.

- **Scope:** per-visit and per-IPD-stay bills: line items (services, drugs, labs, radiology, bed charges), payer handling (cash/corporate/insurance/govt), payments/receipts, freeze-on-discharge, and feeding the discharge billing-clearance pillar.
- **Data model:** existing `bills` (id, patient_id, visit_id/ipd_stay_id, payer_type, status[open|frozen|paid], totals) + `payments` (id, bill_id, amount, mode, ref, captured_at). Add: `bill_lines` if line items aren't already columns (audit shows `addLine`/`removeLine` in `bills.ts`, so verify current shape first). Indexes on `bill_id`, `patient_id`, `status`.
- **APIs (`src/lib/api/bills.ts`, already exists):** addLine, removeLine, capturePayment, freeze, unfreeze — extend with list-by-patient/visit and a total/balance computation. Keep the `_core` convention.
- **Business logic:** total = Σ lines − Σ payments; balance drives the discharge billing pillar; freeze blocks edits post-discharge.
- **Status flow:** open → (charges accrue) → frozen (at discharge) → paid (balance 0).
- **Roles:** billing/reception/admin read-write; doctor/nurse read-only; patient reads own bill. **RLS:** replace the current `using(true)` with these per-role rules.
- **Validation:** no negative line amounts; payment ≤ balance; can't unfreeze a paid bill.
- **Edge cases:** partial payments; refunds; corporate/insurance split; discharge attempted with non-zero balance (gate).
- **Real-time:** add `bills`/`payments` to the realtime publication so the billing desk and discharge pillar update live.
- **Testing:** unit (totals/balance/gates), RLS (each role), integration (create visit → accrue → pay → freeze → discharge pillar clears), end-to-end under a real billing login.
- **Frontend:** replace `useBillingStore` (pure dummy) with real `bills.ts`-backed reads/writes on `src/app/billing/*`.

---

## 5. Sequencing & cadence

- **Now:** Tier 0 (T0.1–T0.7) as one focused block — it unblocks real-login testing of the whole core journey (items #4–#8 for the core).
- **Then:** Tier 2 modules one at a time (Billing first), each via the §2 process, each approved before the next.
- **Then:** Tier 3 cockpits (CMO, Secretary) — the largest builds, scheduled last.
- Each module gets its own just-in-time detailed spec + plan when it starts, so specs never go stale.

**Estimate (rough):** Tier 0 ≈ several focused sessions; Tier 2 ≈ 1 module per short session × 22; Tier 3 ≈ multi-session each. This is a multi-week program executed incrementally on `feat/backend-supabase-integration`, no merge to main until the whole checklist passes locally.

---

## 6. Open items for approval

1. Approve the **tier order** and **module sequence** in §3 (esp. Billing first, cockpits last).
2. Confirm **Tier 0 is the immediate next block** (it's the prerequisite for real-login verification and satisfies items #4–#8 for the core journey).
3. Confirm the **just-in-time per-module spec** approach (vs. specifying all 25 up front).
