# Supabase Pro Migration — Design Spec

**Date:** 2026-07-13
**Phase:** 1 of the Government HIMS backend program (migration first, audit/architecture docs after)
**Status:** Draft for approval

---

## 1. Goal

Move the existing, mature HIMS backend from the old Supabase Free project to the new
Supabase Pro project **completely and verifiably**, preserving all real data and
referential integrity, with a clean rollback path. After cutover, nothing in the app
touches the old project.

- **OLD (source):** project ref `rojzpogpykqfccbssrsv`, region `ap-south-1`
- **NEW (target, Pro):** project ref `uidhrfybgptqllzztgyb`, region `ap-south-1`

## 2. Verified starting state (facts, not assumptions)

Established by live queries on 2026-07-13:

- **Schema is fully reproducible** from 33 versioned migrations in `supabase/migrations/`.
- **OLD data:** 35 public tables, ~1,708 live rows. Notable: `audit_entries` 1,495,
  `patients` 32, `opd_orders` 28, `staff` 24, `orders` 22, `drugs` 16, `lab_tests` 14,
  `lab_specimens` 14, `visits` 11, `profiles` 11, `pharmacy_dispenses` 9, `prescriptions` 9,
  `radiology_studies` 7, `vitals_readings` 7, `beds` 3, `admission_requests` 2, others ≤1.
- **auth.users:** 12 users in OLD.
- **Storage:** **no buckets** in OLD; app code has **zero** `storage.from(...)` usage.
  Storage migration is a **no-op** for Phase 1.
- **Connectivity (decisive finding):**
  - NEW is reachable via the **pooler** host `aws-1-ap-south-1.pooler.supabase.com`
    with user `postgres.uidhrfybgptqllzztgyb`.
  - NEW's **direct** host `db.uidhrfybgptqllzztgyb.supabase.co` **does not resolve**
    from the working environment (Supabase direct host is IPv6-only). The pasted
    "transaction pooler string" using that host is discarded.
  - No local `psql`/`pg_dump`; `npx supabase` (2.109.1), Node 22, and `pg` 8.22 are available.

## 3. Decisions (locked by the user)

| Decision | Choice |
|---|---|
| Data handling | **Copy all real data** from OLD to NEW |
| Sequencing | **Migration first**, audit/architecture docs after |
| Auth users | **Recreate via Admin API**, then **remap old→new UUIDs** across all referencing columns |

## 4. Connection strategy

All DB operations target the **pooler** host:

- **Session mode `:5432`** (`aws-1-ap-south-1.pooler.supabase.com:5432`, user
  `postgres.<ref>`) for DDL, migrations, data load — supports multi-statement/DDL.
- **Transaction mode `:6543`** for the app runtime `DATABASE_URL`.
- Credentials are passed via environment variables at run time only. **Never** written to
  any committed file. `.env.local` is git-ignored (verified).

## 5. User-UUID remap set (exhaustive, verified)

`profiles.id` **is** `auth.users.id` (1:1 FK, `on delete cascade`). Recreating users via the
Admin API yields **new** UUIDs, so the following **14 columns** must be translated
old→new during load. This list is derived from the OLD DB's foreign keys plus a
uuid-column sanity check that confirmed **no un-FKed user-uuid columns exist**:

1. `profiles.id`  *(anchor; = auth.users.id)*
2. `patients.auth_user_id` → auth.users
3. `admission_requests.doctor_id`
4. `appointments.doctor_id`
5. `encounters.doctor_id`
6. `ipd_vitals.recorded_by`
7. `nurse_shift_assignments.nurse_id`
8. `orders.doctor_id`
9. `prescriptions.doctor_id`
10. `shift_handovers.from_nurse_id`
11. `shift_handovers.received_by_id`
12. `shift_handovers.to_nurse_id`
13. `visits.doctor_id`
14. `vitals_readings.recorded_by`

The mapping key is **email** (old `auth.users.email` → new user's email → new id).
`profiles`/`staff` rows carry role + name to reconstruct user metadata.

**Password caveat (accepted):** Admin-API-created users get fresh passwords. Each user is
created with `email_confirm: true` and a generated temporary password; the full
email→temp-password list is handed to the user out-of-band for distribution / forced reset.

## 6. Migration sequence

### Step 0 — Backup / rollback safety
Dump OLD to local files under `d:/tmp/hims-migration/` (git-ignored location):
- Per-table JSON row exports for all 35 public tables.
- `auth.users` export (id, email, role/app_metadata, created_at) for user recreation + mapping.
- The OLD project is **not modified** at any point — it is the rollback.

### Step 1 — Schema into NEW
`npx supabase db push` (or apply the 33 migration SQL files in order) against NEW via the
**session pooler**. Produces tables, relationships, indexes, constraints, views, functions,
triggers, and RLS policies identical to OLD. Verify object counts match OLD.

### Step 2 — Recreate auth users
For each of the 12 OLD users: `supabase.auth.admin.createUser({ email, email_confirm: true,
password: <generated>, user_metadata, app_metadata })` against NEW using the **service-role
key**. Build `emailToNewId` map. Emit the temp-password list for the user.

### Step 3 — Load data with UUID remap
Load all 35 tables into NEW. To avoid FK/trigger ordering fragility, wrap the load in
`set session_replication_role = replica;` (disables FK checks + triggers during load), then
restore to `origin`. During insert, translate the 14 columns via `emailToNewId` (joined
through the OLD `profiles`/`auth.users` email). Preserve all other PKs/values verbatim.
After load, reset any sequences. Re-validate all FKs (`set constraints all immediate`) —
must pass with zero violations.

### Step 4 — Storage
No-op. Document radiology/DICOM bucket design in the later architecture doc.

### Step 5 — App cutover
Rewrite `.env.local` to NEW: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and pooled `DATABASE_URL` (transaction `:6543`). Update
`supabase/config.toml` `project_id` and re-link the CLI to the NEW ref. A backup copy of the
old `.env.local` is kept locally for instant rollback.

### Step 6 — Verify (evidence required)
- **Row reconciliation:** per-table counts OLD vs NEW must match exactly (target ~1,708).
- **Referential integrity:** zero FK violations after re-enabling constraints.
- **Auth:** list users on NEW = 12; a sample login works with a temp password.
- **Test suite:** run existing Jest/RLS/API tests against NEW; report pass/fail with output.
- **App smoke:** boot the Next.js app against NEW, exercise a few key API modules
  (patients, visits, opd-queue), confirm reads/writes succeed.

## 7. Rollback plan

Nothing on OLD is deleted or altered. If any verification step fails:
1. Restore the backed-up `.env.local` (app back on OLD instantly).
2. Optionally truncate NEW public tables and re-run from Step 1.
Local dumps under `d:/tmp/hims-migration/` are the belt-and-suspenders backup.

## 8. Out of scope for Phase 1

Enterprise scaling, load balancing, read replicas, Redis, background queues, CDN,
partitioning/sharding, PACS/RIS/DICOM integration, HL7/FHIR — all delivered as reviewed
**architecture documents** (Phases 2–3 audit/roadmap, 5–10 enterprise/scale/radiology)
after migration is verified.

## 9. Post-migration action (mandatory)

**Rotate** the service-role key and DB password in the Supabase dashboard — both were shared
in plaintext chat and must be considered compromised. Update `.env.local` with the rotated
values afterward.

## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| UUID remap misses a column | Remap set is FK-derived + uuid-column sanity-checked (Section 5) — provably complete for current schema |
| Direct host unreachable | All ops via pooler (verified working) |
| FK ordering errors on load | `session_replication_role = replica` during load; full FK re-validation after |
| Password reset friction | Accepted; temp-password list delivered to user for forced reset |
| Leaked credentials | Rotate post-migration (Section 9) |
| Partial/failed cutover | OLD untouched + `.env.local` backup = instant rollback |
