# Tier 3 Cockpits — Aggregation Design (CMO district + Secretary state)

**Date:** 2026-07-15
**Status:** Approved design — proceed to implementation plan.
**Basis:** [architecture doc](../architecture/2026-07-13-hims-architecture-and-scale.md); all 22 Tier-2 modules + tenant foundation complete and verified.

## Goal

Make the CMO (district) and Secretary (state) cockpits **architecturally real** — backed by a proper tenant hierarchy where our demo hospital appears inside the district and state rollups — without mechanically backing all 19 cockpit governance stores. Scope (user-approved): **core backbone + representative seed**.

## Scope

**In scope:**
1. Tenant hierarchy: `states`, `districts`, `hospitals.district_id`.
2. `facilities` registry with a live bed/occupancy rollup for the real hospital.
3. Back 7 core cockpit stores (CMO: facilities, beds, alerts, approvals; Secretary: districts, alerts, approvals).
4. Representative seed for the broader governance dashboards.
5. District/state RLS helpers + policies; `profiles.district_id` for cmo/secretary demo accounts.
6. Verification of the real-hospital rollup + district/state isolation.

**Out of scope:** backing all 19 cockpit stores; deep governance sub-pages (cabinet/assembly/CAG/NITI minutiae) stay as client demo displays; external HMIS/IHIP/ABDM integration (future production track).

## 1. Tenant hierarchy

- `states (id text pk, code, name)` — seed `UP` / Uttar Pradesh.
- `districts (id text pk, state_id fk, code, name)` — seed Lucknow (`DIST-LKO`) + ~3 others (Kanpur, Varanasi, Gorakhpur).
- `hospitals` gains `district_id text references districts(id)` (default `DIST-LKO`); backfill `UP-DEMO-01 → DIST-LKO`.
- `profiles` gains `district_id text` — set for cmo (their district) and secretary (state-level, district optional). Backfill demo `cmo`/`secretary` accounts.
- RLS on states/districts: read-all authenticated (reference data).

## 2. Facilities registry + live district rollup

- `facilities (id text pk, hospital_id?, district_id fk, state_id fk, code, name, type ['DH'|'CHC'|'PHC'|'SC'|'MedicalCollege'], beds_total int, ...data jsonb)`.
- `UP-DEMO-01` is a real facility linked to the hospital; ~12 seeded representative facilities across the 4 districts.
- **Live rollup:** a SQL view `facility_bed_status` returns per-facility bed totals/occupied. For the row linked to `UP-DEMO-01`, occupied is computed **live** from the real `beds` table (`status='Occupied'`) + `ipd_stays`; seeded facilities use their snapshot numbers in `data`. A `district_bed_rollup` view sums by district.
- RLS: read by cmo (same_district), secretary (same_state), admin; write by cmo/admin.

## 3. Core cockpit stores backed (7)

Each via the proven `data jsonb` template (kind discriminator where a store holds multiple entity types), scoped to district or state:

| Cockpit | Store | Table | Scope |
|---|---|---|---|
| CMO | useCmoFacilitiesStore | facilities (§2) | district |
| CMO | useCmoBedsStore | district_bed_rollup view + facilities | district |
| CMO | useCmoAlertsStore | `cmo_governance` (kind='alert') | district |
| CMO | useCmoApprovalsStore | `cmo_governance` (kind='approval') | district |
| Secretary | useSecretaryDistrictsStore | `district_metrics` (per-district rollup + ranking) | state |
| Secretary | useSecretaryAlertsStore | `secretary_governance` (kind='alert') | state |
| Secretary | useSecretaryApprovalsStore | `secretary_governance` (kind='approval') | state |

- `cmo_governance` / `secretary_governance`: one jsonb table each (kind discriminator) for the district/state-level alerts + approvals.
- `district_metrics`: per-district aggregate rows (bed occupancy, facility count, key programme indicators, ranking score) — Lucknow's numbers reflect the real facility rollup; others seeded.
- Bridges follow the hybrid pattern (session-gated hydrateReal + persist-all), identical to Tier 2.

## 4. Representative governance seed

Seed populated demo data for the broader dashboards so they aren't empty: district disease-programme counts, scheme enrolment/budget summaries, MCH indicators, surveillance case counts, workforce vacancies — as rows in `district_metrics.data` (jsonb) and/or a lightweight `governance_seed` table read by those pages. The deepest specialized pages (cabinet/assembly/CAG/NITI) remain client demo.

## 5. RLS helpers (extend the tenant model)

- `current_district()` — caller's `profiles.district_id`.
- `same_district(did)` — caller's district = did, OR caller is secretary/admin (state/global bypass).
- `same_state(sid)` — caller's state (via district→state) = sid, OR admin.
- Policies: CMO tables → `has_role(['cmo']) AND same_district(district_id)`; Secretary tables → `has_role(['secretary']) AND same_state(state_id)`; admin implicit via has_role.

## 6. Status flow / roles / validation

- **Roles:** cmo (district-bound), secretary (state-bound), admin (all). Facilities/metrics are read-mostly at cockpit level; approvals have a status flow (pending → approved/rejected).
- **Validation:** district_id/state_id must reference existing rows (FKs); a facility's beds_total ≥ occupied.
- **Edge cases:** a facility with no linked hospital (CHC/PHC) uses snapshot data only; a district with no facilities shows zeros, not errors.

## 7. Real-time & performance

- Realtime-publish `facilities`, `cmo_governance`, `secretary_governance`, `district_metrics` so cockpit boards update live.
- Rollup views are small (dozens of facilities/districts) — fine as live views for the demo; production would materialize + refresh on a schedule (noted in the architecture doc).

## 8. Testing / verification

- **Rollup:** `UP-DEMO-01`'s real occupied-bed count (from `beds`) appears in `district_bed_rollup` for DIST-LKO and in the Lucknow row of `district_metrics`.
- **Isolation:** a cmo user in another district reads 0 Lucknow facilities; a cmo cannot read another district's governance rows; secretary reads all districts in UP but not another state.
- **Build + bridge:** tsc + `next build` green; cockpit stores hydrate the real rows under a real cmo/secretary login.

## 9. Risks

- **Scope creep** into the 19 governance stores — mitigated by the explicit "core 7 + representative seed" boundary.
- **Rollup correctness** — verified by the real-hospital bed check.
- **Thin demo data** for a "district of 142 facilities" — mitigated by seeding ~12 representative facilities + district metrics so the visuals are believable; documented as representative, not exhaustive.
