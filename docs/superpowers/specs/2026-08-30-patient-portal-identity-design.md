# Patient Portal Identity — Design

**Date:** 2026-08-30
**Status:** Approved (design), pending implementation plan
**Repo:** `E:\Umang Hospital HIMS` (github.com/Kunalmishra77/HIMS-Umang)

## Problem

The patient portal shows demo data to every signed-in patient, and a settled bill
is never visible to the person who paid it.

Three defects compound:

1. **Identity can never resolve.** `src/lib/usePatientMe.ts` does
   `patients.find(p => p.id === currentUser.id)`. `currentUser.id` is the Supabase
   auth **uuid**; `patients.id` is text like `PT-20394`. These cannot match, so
   every lookup falls through to the demo patient, Kiran Patil.
2. **Nothing populates `patients.auth_user_id`.** The column exists in the shared
   schema and no application code has ever written it — confirmed in both this
   repo and Gov-HIMS. So `bills_read_own`, the RLS policy that lets a patient read
   their own bill, has never once fired.
3. **`/patient/billing` reads local mock state** (`usePatientOrdersStore`), not the
   `bills` table — so it could not show a real bill even if identity worked.

The visible symptom: a patient pays at the billing desk, the payment settles
correctly in Postgres, and the patient's own billing page never shows it.

## Decisions

Settled with the owner before design; not open questions.

| # | Decision | Consequence |
|---|---|---|
| 1 | Link a patient record to a login **on first patient login**, not at reception | Reception's flow is untouched; no accounts for people who never use the portal |
| 2 | Assurance is **demo-grade**: UHID + phone + full name | No SMS/email provider needed; works offline; explicitly not production identity proofing |
| 3 | **One atomic claim endpoint** that mints the account (Approach B) | Immune to the hosted email-confirmation setting; no half-created state |
| 4 | Proceed with the shared `bills_read_own` policy activating | Verified safe — see below |

### Why the third factor is name, not date of birth

The obvious triple is UHID + phone + DOB. It cannot work here, measured against
the live database:

| Field | Coverage |
|---|---|
| `phone` | 35 / 35 |
| `full_name` | 35 / 35 |
| `uhid` (column) | 10 / 35 |
| `age` | 33 / 35 |
| `dob` | **1 / 35** |
| all of uhid + phone + dob | **0 / 35** |

The intake form captures `age` as a string (`src/lib/intake/register.ts` does
`parseInt(form.age, 10)`); no DOB is ever collected. Requiring DOB would leave
every existing patient unclaimable.

**UHID is still usable for all 35** because `src/lib/uhid.ts`'s `deriveUhid()` is
deterministic — the UHID a patient is *shown* is computed from their id wherever
the column is NULL. The claim must therefore match against
`resolveUhid(id, uhid)`, **never the raw column.**

Name is the weakest of the three factors. That is accepted at demo-grade and
recorded here so it is not mistaken for an identity-proofing design.

### Why activating the shared RLS policy is safe

`bills_read_own` is `create policy … for select`, and **not one of the 147 policies
in this schema is `as restrictive`** — verified by grep across
`supabase/migrations/`. Postgres OR-combines permissive policies for the same
command, so populating `auth_user_id` can only ever **grant** a linked patient
additional read access. It cannot revoke anything from Gov-HIMS staff. No
regression is structurally possible.

## Architecture

Four links; three already exist.

```
auth.users  →  profiles (role='patient')  →  patients.auth_user_id  →  bills_read_own fires
  create           create                        set                     already present
```

**No migration.** `auth_user_id` and `bills_read_own` are already in the shared
schema. `supabase/migrations/` stays at exactly 61 files.

Note there is **no trigger creating `profiles` on signup** — `hydrateFromSession`
returns null without a profiles row, so the endpoint must create it explicitly.

## The claim endpoint

`POST /api/patient/claim` — one server route, service-role, atomic.

1. Validate with Zod: `email`, `password`, `uhid`, `phone`, `fullName`.
2. Find the patient whose `resolveUhid(id, uhid)` matches the submitted UHID.
3. Require `phone` and `full_name` on that same row to match, normalised —
   strip spaces, hyphens and a leading `+91` from phone; casefold and collapse
   whitespace for name.
4. Reject if `auth_user_id` is already set. A record is claimed once.
5. `admin.auth.admin.createUser({ email, password, email_confirm: true })` —
   bypasses the hosted confirmation setting entirely.
6. `profiles.upsert({ id: user.id, role: 'patient', full_name })`.
7. `patients.update({ auth_user_id: user.id })` for that row.

**Rollback is mandatory.** If step 6 or 7 fails, delete the auth user created in
step 5 before returning. Otherwise the email is registered but unlinked, and every
retry fails with "already registered" — the patient is permanently locked out with
no recovery path in this build.

Reuse `getSupabaseAdminClient()` (`src/lib/supabase/admin.ts`), which already
throws if called from the browser, and follow the `createUser` + `profiles.upsert`
pattern in `scripts/seed/provision-demo-accounts.mjs`.

### Security

The endpoint mints credentials, so it needs teeth:

- **Uniform failure.** One generic message for every failure — wrong UHID, wrong
  phone, wrong name, already claimed. Distinguishing them turns the endpoint into
  a UHID-existence oracle.
- **Per-IP rate limit:** 5 claim attempts per IP per 15 minutes.
- **Per-UHID lockout:** 5 failed attempts against the same UHID locks that UHID
  for 1 hour, independent of IP.

Both counters live in memory in this build — adequate for a single-instance demo,
and explicitly not durable across restarts or instances. If this ever runs
multi-instance, they must move to Postgres or Redis; recorded here so the
limitation is not mistaken for a working defence at scale.

It is **not** open signup: an account can only be minted when the triple matches
an existing unclaimed patient. Abuse requires knowing a real patient's UHID, phone
and name.

## Identity resolution

`src/lib/usePatientMe.ts` resolves by `auth_user_id` for the signed-in user
instead of comparing a uuid to a patient id.

**The fallback is not centralised, and that is the larger part of this work.** The
`currentUser?.id ?? 'PT-20394'` pattern is duplicated across at least seven sites,
each of which silently resolves to Kiran Patil:

| File | Note |
|---|---|
| `src/app/patient/feedback/page.tsx:266` | |
| `src/app/patient/profile/page.tsx:59` | |
| `src/app/patient/waiting/page.tsx:188` | |
| `src/components/patient/dashboard/FamilyInviteCard.tsx:70` | feeds the family-track token |
| `src/components/patient/dashboard/FamilyTrackingCard.tsx:19` | feeds the family-track token |
| `src/app/patient/billing/page.tsx:19` | **hardcodes `PT-20394` into the printed invoice** |
| `usePatientMe` consumers | `DiagnosticsCard`, `PatientProfileCard`, `PrescriptionsCard` |

All identity resolution moves behind `usePatientMe`. The printed-invoice case is a
live defect independent of this feature: a printed bill currently names the demo
patient whoever is signed in.

## Keeping the demo working

Today the portal "works" because of the fallback that hides the bug. Removing the
fallback without replacing it breaks the demo.

Extend `scripts/seed/provision-demo-accounts.mjs` to link
`demo-patient@example.test` to Kiran Patil's record by setting `auth_user_id`. The
demo then works **because the mechanism works**, and if the mechanism breaks the
demo breaks visibly — which is the point.

## Patient billing

`/patient/billing` reads the existing `Bills` API filtered by the resolved
patient's id (`bills.patient_id`), replacing `usePatientOrdersStore`.

**The mock data is removed, not repurposed.** A patient with no bills sees a real
empty state ("No bills yet"), never fabricated line items. Showing invented
charges to a patient would be worse than the bug this fixes.

The printed invoice takes its patient id and UHID from the resolved patient, not
the hardcoded `PT-20394` at `src/app/patient/billing/page.tsx:19`.

`Bills` and `patientDueOf` already exist in `src/lib/api/bills.ts`; the `bills`
table already carries `patient_id`. No new data layer.

## Testing

**Hermetic (join the binding suite):**
- UHID matching goes through `resolveUhid`, so a patient with a NULL `uhid` column
  is still claimable.
- Phone normalisation: `+91 98109 44012`, `9810944012`, `098109-44012` all match.
- Name normalisation: case and whitespace insensitive.
- An already-claimed record is rejected.
- Every failure mode returns the identical message and status.
- Rollback: a failure after `createUser` leaves no orphaned auth user.

**Live-DB (advisory, not a gate):** one end-to-end claim against a seeded
throwaway patient. Per the shared-database convention, prefix all rows `ZZ-` and
publish cleanup SQL in `docs/JOURNEY-TEST-DATA.md` without running it.

## Risks

**This is the first feature that writes to the shared auth pool from app code.**
Every account it creates is visible to Gov-HIMS. Bounded by requiring a matching
patient record, but real, and worth stating plainly in the README.

**Making identity strict is a behaviour change to a shipped build.** Any
patient-portal page that assumed the Kiran Patil fallback will render empty for an
unlinked user. The seven sites above are audited as part of the work, not
discovered afterwards.

## Out of scope

Password reset; changing or revoking a claimed link; self-registration for someone
with no patient record; production identity proofing (OTP, ABHA); any change to
Gov-HIMS; any schema migration.
