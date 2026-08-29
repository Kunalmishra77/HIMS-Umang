# Tier 3 Cockpit Aggregation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the CMO (district) and Secretary (state) cockpits architecturally real — a tenant hierarchy where the demo hospital's live bed data rolls up into district and state views — backing 7 core cockpit stores + representative governance seed.

**Architecture:** Extends the proven pattern: SQL migration applied via `node` over the session pooler → live RLS verification under real logins → jsonb-backed API modules → session-gated hybrid store bridges → seed → `next build`. Adds a district/state hierarchy and SQL rollup views on top of the existing tenant foundation.

**Tech Stack:** Supabase Postgres 17 (pooler), `pg` 8.22, `@supabase/supabase-js`, Next.js 16, Zustand.

## Global Constraints

- All DB ops via the pooler host `aws-1-ap-south-1.pooler.supabase.com` (env `NEW_DB_SESSION`); credentials only from `d:/tmp/hims-migration/env.sh` (git-ignored). Bash shell needs `export PATH="/c/Program Files/nodejs:/c/Program Files/Git/usr/bin:/c/Program Files/Git/bin:$PATH"`.
- Every new table: `hospital_id` not needed at district/state level, but each carries the relevant tenant key (`district_id` and/or `state_id`) with a `NOT NULL DEFAULT` + FK, matching the tenant-foundation safety pattern.
- RLS on by default; new helpers `same_district(did)` / `same_state(sid)` mirror `same_hospital` (admin/secretary bypass as specified). Verify RLS **live** (write ALLOWED/DENIED via 42501; no test rows persisted for the empty-insert check).
- Store bridges follow the exact hybrid pattern of Tier 2 (`hydrateReal` session-gated + module-level `persist*()` write-through; `getSupabaseClient` from `@/lib/supabase/client`; StoreHydrator staff array).
- Clean orphaned `node` processes before each `npm run build`; never run `tsc` and `build` concurrently (CPU contention).
- Migrations recorded in `supabase_migrations.schema_migrations`; PostgREST `notify pgrst,'reload schema'` after new tables.

---

## File Structure

- Create: `supabase/migrations/20260715100000_district_state_hierarchy.sql` — states/districts/hospitals.district_id/profiles.district_id + helpers + seed.
- Create: `supabase/migrations/20260715110000_facilities.sql` — facilities table + bed-rollup views + RLS.
- Create: `supabase/migrations/20260715120000_cockpit_governance.sql` — cmo_governance, secretary_governance, district_metrics + RLS.
- Create: `src/lib/api/facilities.ts`, `src/lib/api/cockpit.ts` (governance + district metrics).
- Modify: `src/lib/api/index.ts` (exports).
- Modify: 7 cockpit stores + `src/components/StoreHydrator.tsx`.
- Create: `scripts/seed/seed-cockpit.mjs` — facilities, district metrics, governance, representative data.

---

## Task 1: Tenant hierarchy + helpers + seed

**Files:** Create `supabase/migrations/20260715100000_district_state_hierarchy.sql`.

**Interfaces:**
- Produces: `states`, `districts` tables; `hospitals.district_id`, `profiles.district_id`; `current_district()`, `same_district(text)`, `same_state(text)` SQL functions.

- [ ] **Step 1: Write the migration**

```sql
create table if not exists states (
  id text primary key, code text not null, name text not null, created_at timestamptz not null default now());
create table if not exists districts (
  id text primary key, state_id text not null references states(id), code text not null, name text not null,
  created_at timestamptz not null default now());
alter table states enable row level security;
alter table districts enable row level security;
drop policy if exists states_read on states; create policy states_read on states for select to authenticated using (true);
drop policy if exists districts_read on districts; create policy districts_read on districts for select to authenticated using (true);

insert into states (id, code, name) values ('UP','UP','Uttar Pradesh') on conflict do nothing;
insert into districts (id, state_id, code, name) values
  ('DIST-LKO','UP','LKO','Lucknow'), ('DIST-KNP','UP','KNP','Kanpur Nagar'),
  ('DIST-VNS','UP','VNS','Varanasi'), ('DIST-GKP','UP','GKP','Gorakhpur') on conflict do nothing;

alter table hospitals add column if not exists district_id text not null default 'DIST-LKO' references districts(id);
alter table profiles  add column if not exists district_id text;
update profiles set district_id = 'DIST-LKO'
  where id in (select id from auth.users where email in ('demo-cmo@example.test','demo-secretary@example.test'));

create or replace function public.current_district()
returns text language sql stable security definer set search_path=public as $$
  select district_id from profiles where id = auth.uid(); $$;

create or replace function public.same_district(did text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from profiles p where p.id=auth.uid()
    and (p.district_id = did or p.role in ('secretary','admin'))); $$;

create or replace function public.same_state(sid text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from profiles p
    left join districts d on d.id = p.district_id
    where p.id=auth.uid() and (d.state_id = sid or p.role in ('admin')
      or (p.role='secretary'))); $$;
```

- [ ] **Step 2: Apply + verify** — run via node (apply pattern), then:

Run: `node -e "...select current_district()... under a demo-cmo session"`
Expected: `demo-cmo` resolves `current_district() = DIST-LKO`; `states`=1, `districts`=4; `hospitals` where id='UP-DEMO-01' has `district_id='DIST-LKO'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260715100000_district_state_hierarchy.sql
git commit -m "feat(cockpit): district/state tenant hierarchy + helpers (Tier 3 Task 1)"
```

## Task 2: Facilities registry + live bed rollup

**Files:** Create `supabase/migrations/20260715110000_facilities.sql`, `src/lib/api/facilities.ts`; Modify `src/lib/api/index.ts`.

**Interfaces:**
- Consumes: `districts`, `hospitals`, `same_district`, `same_state` (Task 1); `beds` table (`status='Occupied'`).
- Produces: `facilities` table; `facility_bed_status`, `district_bed_rollup` views; `Facilities` API (`list()`, `saveMany(rows)`).

- [ ] **Step 1: Migration**

```sql
create table if not exists facilities (
  id text primary key,
  hospital_id text references hospitals(id),
  district_id text not null default 'DIST-LKO' references districts(id),
  state_id text not null default 'UP' references states(id),
  code text, name text not null, type text not null default 'DH', beds_total int not null default 0,
  data jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists facilities_district_idx on facilities (district_id, type);
alter table facilities enable row level security;
drop policy if exists facilities_read on facilities;
create policy facilities_read on facilities for select to authenticated
  using (has_role(array['cmo']::role_t[]) and same_district(district_id)
      or has_role(array['secretary']::role_t[]) and same_state(state_id));
drop policy if exists facilities_write on facilities;
create policy facilities_write on facilities for all to authenticated
  using (has_role(array['cmo']::role_t[]) and same_district(district_id))
  with check (has_role(array['cmo']::role_t[]) and same_district(district_id));

-- Live per-facility bed status: the real hospital reads live from beds; others use snapshot in data.
create or replace view facility_bed_status as
  select f.id, f.district_id, f.state_id, f.name, f.type, f.beds_total,
    case when f.hospital_id is not null
      then (select count(*) from beds b where b.status='Occupied')
      else coalesce((f.data->>'occupied')::int, 0) end as occupied
  from facilities f;
create or replace view district_bed_rollup as
  select district_id, sum(beds_total)::int beds_total, sum(occupied)::int occupied,
    count(*)::int facilities from facility_bed_status group by district_id;
alter publication supabase_realtime add table facilities;
```
(Wrap the `alter publication` in the idempotent `do $$ ... if not exists ... $$` guard used by every Tier-2 migration.)

- [ ] **Step 2: API** — `src/lib/api/facilities.ts`:

```ts
import { z } from 'zod'
import { table } from './_core'
export const FacilityRowSchema = z.object({ id: z.string(), districtId: z.string().optional(), stateId: z.string().optional(),
  name: z.string(), type: z.string().optional(), bedsTotal: z.number().optional(), hospitalId: z.string().optional(), data: z.unknown() })
export type FacilityRow = z.infer<typeof FacilityRowSchema>
type Rec = { id: string; [k: string]: unknown }
const rows = table<FacilityRow>('facilities', FacilityRowSchema)
export const Facilities = {
  async list(): Promise<Rec[]> { return (await rows.list()).map(r => ({ ...(r.data as object), id: r.id, name: (r as any).name, bedsTotal: (r as any).bedsTotal })) as Rec[] },
  async saveMany(facilities: Rec[]) { await Promise.all(facilities.map(f => rows.put(f as FacilityRow))) },
  _table: rows,
}
```
(Adjust field mapping to the store's actual facility shape when wiring — Task 4.)

- [ ] **Step 3: Export + apply + live RLS verify** — add to `index.ts`; apply migration; verify `cmo` write ALLOWED, `doctor` write DENIED; `select occupied from district_bed_rollup where district_id='DIST-LKO'` reflects the real `beds` occupied count (seed facilities in Task 5, so rollup may be just the real hospital until then).

- [ ] **Step 4: Commit** — `git commit -m "feat(cockpit): facilities registry + live bed rollup (Tier 3 Task 2)"`

## Task 3: District metrics + cockpit governance tables

**Files:** Create `supabase/migrations/20260715120000_cockpit_governance.sql`, `src/lib/api/cockpit.ts`; Modify `index.ts`.

**Interfaces:**
- Produces: `district_metrics`, `cmo_governance`, `secretary_governance` tables; `Cockpit` API (`cmoList()`, `cmoSave()`, `secList()`, `secSave()`, `districtMetrics()`).

- [ ] **Step 1: Migration** — three jsonb tables (kind discriminator on governance), district/state RLS, realtime:

```sql
create table if not exists district_metrics (
  id text primary key, district_id text not null default 'DIST-LKO' references districts(id),
  state_id text not null default 'UP' references states(id), status text,
  data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists cmo_governance (
  id text primary key, kind text not null, district_id text not null default 'DIST-LKO' references districts(id),
  status text, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists secretary_governance (
  id text primary key, kind text not null, state_id text not null default 'UP' references states(id),
  status text, data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
-- RLS: district_metrics + cmo_governance → cmo same_district; secretary sees all (same_state via secretary bypass);
--      secretary_governance → secretary same_state. admin implicit. (Full policies mirror facilities.)
-- realtime publish all three (idempotent guard).
```

- [ ] **Step 2: API `src/lib/api/cockpit.ts`** — `Cockpit.districtMetrics()/saveDistrictMetrics()`, `.cmoList()/cmoSave({alerts,approvals})`, `.secList()/secSave({alerts,approvals})` following the two-kind jsonb template (cf. `bloodbank.ts`).

- [ ] **Step 3: Export + apply + live RLS verify** — `cmo` writes cmo_governance ALLOWED; `secretary` writes secretary_governance ALLOWED; `cmo` write secretary_governance DENIED; cross-district `cmo` read DENIED.

- [ ] **Step 4: Commit** — `git commit -m "feat(cockpit): district metrics + governance tables + RLS (Tier 3 Task 3)"`

## Task 4: Bridge the 7 core cockpit stores

**Files:** Modify `useCmoFacilitiesStore`, `useCmoBedsStore`, `useCmoAlertsStore`, `useCmoApprovalsStore`, `useSecretaryDistrictsStore`, `useSecretaryAlertsStore`, `useSecretaryApprovalsStore`; `StoreHydrator.tsx`.

**Interfaces:** Consumes `Facilities`, `Cockpit` APIs (Tasks 2-3). Each store gets `hydrateReal()` + `persist*()` per the Tier-2 hybrid pattern.

- [ ] **Step 1:** For each store, read its state shape; add `hydrateReal` (session-gated `getSupabaseClient().auth.getSession()`; pull the matching API list; `set` only when non-empty; seed as offline fallback) + a module-level session-gated `persist*()` write-through after each mutating action; add `() => useXStore.getState().hydrateReal()` to the StoreHydrator staff array. (CMO stores hydrate for cmo/admin; Secretary for secretary/admin — they fall in the non-patient branch.)
- [ ] **Step 2:** `npx tsc --noEmit` → exit 0 (allow up to ~5 min; clean node procs first; do not run build concurrently).
- [ ] **Step 3: Commit** — `git commit -m "feat(cockpit): wire 7 core cockpit stores to real backend (Tier 3 Task 4)"`

## Task 5: Representative governance seed

**Files:** Create `scripts/seed/seed-cockpit.mjs`.

- [ ] **Step 1:** Seed `facilities` — UP-DEMO-01 (real, hospital_id set, beds_total from real beds count) + ~12 representative facilities (DH/CHC/PHC) across the 4 districts with snapshot `data.occupied`. Seed `district_metrics` — one row per district (bed occupancy from rollup for Lucknow; seeded for others; + ranking score, disease-programme counts, scheme budget, MCH indicators, workforce vacancies in `data`). Seed `cmo_governance` (2-3 alerts + 2 approvals for DIST-LKO) and `secretary_governance` (2-3 state alerts + approvals). Idempotent (`on conflict do nothing`).
- [ ] **Step 2: Run + verify counts** — `facilities` ≥ 13, `district_metrics` = 4, governance rows present.
- [ ] **Step 3: Commit** — `git commit -m "chore(cockpit): representative facilities + district-metrics + governance seed (Tier 3 Task 5)"`

## Task 6: Verification + build

- [ ] **Step 1: Rollup correctness** — under a real `demo-cmo` login (DIST-LKO): `district_bed_rollup` occupied for DIST-LKO equals the live `beds` Occupied count + seeded facilities; the Lucknow `district_metrics` row reflects it.
- [ ] **Step 2: Isolation** — set a cmo user's `district_id` to DIST-KNP temporarily → they read 0 DIST-LKO facilities/governance; restore. `secretary` reads all 4 districts' metrics but a second (fake) state's rows would be 0.
- [ ] **Step 3: Build** — clean node procs; `npm run build` → exit 0.
- [ ] **Step 4: Report + commit** — write `docs/superpowers/plans/2026-07-15-cockpit-verification.md` (rollup + isolation + build evidence); commit.

---

## Self-Review

**Spec coverage:** §1 hierarchy→Task 1; §2 facilities+rollup→Task 2; §3 core stores→Tasks 3-4; §4 representative seed→Task 5; §5 RLS helpers→Task 1 (+policies Tasks 2-3); §6 roles/validation→FKs+policies; §7 realtime→publish steps; §8 verification→Task 6. Covered.

**Placeholder scan:** SQL/API/verification are concrete. The one deferred detail — exact per-store field mapping in Task 4 — is intentional (read each store's shape at wire-time), matching how all 22 Tier-2 bridges were specced; the pattern and API surface are fully given.

**Type consistency:** `same_district`/`same_state`/`current_district` names consistent across Tasks 1-3. `facilities`/`district_metrics`/`cmo_governance`/`secretary_governance` table names consistent. API module names (`Facilities`, `Cockpit`) consistent Tasks 2-4.

**Note vs codebase:** This codebase verifies DB modules via **live RLS checks + build**, not pytest TDD (all 22 Tier-2 modules + tenant foundation followed this) — the plan matches that established, proven verification approach rather than inventing a unit-test harness.
