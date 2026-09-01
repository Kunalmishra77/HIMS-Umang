# Journey-walk test data

`scripts/journey-walk.mjs` was run once against the **live** Supabase project on
2026-08-29 to verify the OPD journey end to end. It wrote real rows.

**This Supabase project is shared with Gov-HIMS** (see the README's shared-project
section), so these rows are visible in that system too.

Nothing here has been deleted. Keeping them as demo data is a legitimate choice —
they represent one complete, correctly-formed OPD journey. Removing them is
equally fine. It is your call.

## Rows written

Every id carries a `ZZ-…JourneyTest…` prefix so it is obvious and greppable.

| Table | Id |
|---|---|
| `patients` | `ZZ-JourneyTest-2026-08-29T17-17-26-312Z` |
| `visits` | `VIS-ZZ-JourneyTest-2026-08-29T17-17-26-312Z-mten8e43` |
| `vitals_readings` | `ZZ-VR-JourneyTest-2026-08-29T17-17-26-312Z` |
| `opd_orders` | `ZZ-RX-JourneyTest-2026-08-29T17-17-26-312Z` (prescription) |
| `opd_orders` | `ZZ-LO-JourneyTest-2026-08-29T17-17-26-312Z` (lab order) |
| `bills` | `ZZ-BIL-JourneyTest-2026-08-29T17-17-26-312Z` |
| `payments` | `ZZ-PAY-JourneyTest-2026-08-29T17-17-26-312Z` |

An earlier partial run left a second `patients` + `visits` pair under a
`…T17-15-03-191Z` timestamp. Adjust the ids below if you want those too.

## One side effect worth knowing about

`patients.auth_user_id` on the test row was set, via the service-role key, to
`demo-patient@example.test`'s real `auth.users.id`. That was done deliberately, to
exercise the patient-owned RLS ownership check.

It matters because **no application code ever sets `auth_user_id`** (see the
README's Known-partial section) — so this row is the only patient in the database
with that link. If you keep the row as demo data, consider clearing the link so it
does not read as normal application behaviour:

```sql
update patients set auth_user_id = null
  where id = 'ZZ-JourneyTest-2026-08-29T17-17-26-312Z';
```

Deleting the row removes the link anyway.

## Cleanup

Child rows first — foreign keys point back to `patients`.

```sql
delete from payments        where id = 'ZZ-PAY-JourneyTest-2026-08-29T17-17-26-312Z';
delete from bills           where id = 'ZZ-BIL-JourneyTest-2026-08-29T17-17-26-312Z';
delete from opd_orders      where id in (
  'ZZ-RX-JourneyTest-2026-08-29T17-17-26-312Z',
  'ZZ-LO-JourneyTest-2026-08-29T17-17-26-312Z'
);
delete from vitals_readings where id = 'ZZ-VR-JourneyTest-2026-08-29T17-17-26-312Z';
delete from visits          where id = 'VIS-ZZ-JourneyTest-2026-08-29T17-17-26-312Z-mten8e43';
delete from patients        where id = 'ZZ-JourneyTest-2026-08-29T17-17-26-312Z';
```

To find anything left behind:

```sql
select 'patients' t, id from patients where id ilike '%JourneyTest%'
union all select 'visits', id from visits where id ilike '%JourneyTest%'
union all select 'vitals_readings', id from vitals_readings where id ilike '%JourneyTest%'
union all select 'opd_orders', id from opd_orders where id ilike '%JourneyTest%'
union all select 'bills', id from bills where id ilike '%JourneyTest%'
union all select 'payments', id from payments where id ilike '%JourneyTest%';
```

## Task 8 — live claim-flow verification (2026-09-01)

Task 8 of the patient-portal-identity plan (`feat/patient-portal-identity`) ran
the claim flow end to end against this **live** Supabase project, via a local
`next dev` server hitting the real `/api/patient/claim` route. Two throwaway
patients were seeded directly through the service-role client (no visit, no
bill — the claim endpoint only reads `patients`). Everything is prefixed
`ZZ-ClaimTest…` so it is obvious and greppable, per this file's existing
convention.

### 1. Successful claim (`ZZ-ClaimTest-2026-09-01T07-34-33-563Z`)

Seeded, then claimed with a matching UHID/phone/full name computed from
`deriveUhid`. Verified: response `{"ok":true}`; `patients.auth_user_id` set to
a real `auth.users` uuid; an identical second claim returned `400
{"ok":false,"error":"CLAIM_FAILED"}`; signing in with the new credentials
succeeded and `auth.users.id` matches `patients.auth_user_id`; a direct query
replicating `/api/patient/me`'s resolution (`select * from patients where
auth_user_id = <that uuid>`) returns this row, not the demo patient
`PT-20394`/Kiran Patil.

| What | Value |
|---|---|
| `patients.id` | `ZZ-ClaimTest-2026-09-01T07-34-33-563Z` |
| `patients.full_name` | `ZZ ClaimTest 2026-09-01T07:34:33.563Z` |
| `patients.phone` | `9248073564` |
| UHID claimed with (derived, `patients.uhid` is NULL) | `PUH-2026-33563` |
| `auth.users.email` | `zz-claimtest-2026-09-01t07-34-33-563z@example.test` |
| `auth.users.id` / `patients.auth_user_id` | `30af16e5-8576-486b-a479-1e6e9feb0802` |

Bills: none created — the claim flow itself never touches `bills`.

### 2. Rollback fault-injection (`ZZ-ClaimTest-Rollback-2026-09-01T07-36-40-278Z`)

To prove the rollback actually fires (every prior task in this plan verified
it by reading code only), `src/app/api/patient/claim/route.ts`'s `profiles`
upsert was temporarily repointed at a nonexistent table
(`zz_fault_injection_nonexistent_table`), forcing `profileErr` to be truthy
after `createUser` had already succeeded. A second throwaway patient was
seeded and claimed against the faulted server:

- Claim response: `400 {"ok":false,"error":"CLAIM_FAILED"}`.
- The auth user created for this attempt (`zz-claimtest-rollback-2026-09-01t07-36-40-278z@example.test`)
  was **not** left dangling — `auth.admin.listUsers` confirmed no user with
  that email exists after the request, i.e. `deleteUser` in the route's
  `rollback()` ran.
- `patients.auth_user_id` for this row stayed `null`.

The code change was reverted immediately after (`git diff` on the route file
is empty; `git status` was clean before continuing). No auth user exists for
this row — there is nothing to delete via the dashboard for it, only the
`patients` row below.

| What | Value |
|---|---|
| `patients.id` | `ZZ-ClaimTest-Rollback-2026-09-01T07-36-40-278Z` |
| `patients.full_name` | `ZZ ClaimTest Rollback 2026-09-01T07:36:40.278Z` |
| `patients.phone` | `8248200279` |
| UHID it was claimed with | `PUH-2026-40278` |
| `auth.users` | none — rollback deleted the one that was briefly created |

### Cleanup (not run — owner's call)

The `patients` row can be removed with SQL. **The linked `auth.users` row for
the successful claim cannot be removed with SQL** — deleting an auth user
needs the Supabase dashboard (Authentication → Users) or the Admin API
(`auth.admin.deleteUser`), not a `delete` against `patients`. Deleting the
`patients` row first (or setting `auth_user_id = null`) does not delete the
auth user; do that separately if you want the login gone too.

```sql
-- patients rows (no visits/bills/payments were created for either — safe to
-- delete without deleting any children first)
delete from patients where id in (
  'ZZ-ClaimTest-2026-09-01T07-34-33-563Z',
  'ZZ-ClaimTest-Rollback-2026-09-01T07-36-40-278Z'
);
```

```
-- auth user for the successful claim — Supabase dashboard or Admin API only:
--   auth.users.id = '30af16e5-8576-486b-a479-1e6e9feb0802'
--   email          = 'zz-claimtest-2026-09-01t07-34-33-563z@example.test'
```

To find anything left behind from this task:

```sql
select 'patients' t, id from patients where id ilike '%ClaimTest%';
```
