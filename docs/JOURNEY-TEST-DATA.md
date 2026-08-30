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
