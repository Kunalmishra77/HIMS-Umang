# Patient Portal Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a patient claim their own hospital record with UHID + phone + full name, so the patient portal shows their real data and a settled bill is visible to the person who paid it.

**Architecture:** One atomic server route verifies the three factors against an unclaimed `patients` row, then mints the auth user, the `profiles` row and the `patients.auth_user_id` link with rollback on failure. Identity resolution moves behind `usePatientMe`, replacing a demo fallback duplicated across seven sites. `/patient/billing` then reads the existing `Bills` API instead of local mock state.

**Tech Stack:** Next.js 16.2.4 App Router, React 19, TypeScript 5 strict, Supabase (`@supabase/supabase-js` service-role for the route, `@supabase/ssr` for sessions), Zod 4, Zustand 5, Vitest 4.

**Spec:** [`docs/superpowers/specs/2026-08-30-patient-portal-identity-design.md`](../specs/2026-08-30-patient-portal-identity-design.md)

## Global Constraints

- **Repo:** `E:\Umang Hospital HIMS` (POSIX `/e/Umang Hospital HIMS`). The path contains a space — quote it in every command. Branch `feat/patient-portal-identity`, off `master`. Do not merge or push; the controller decides.
- **No migration.** `patients.auth_user_id` and the `bills_read_own` policy already exist. `supabase/migrations/` stays at **exactly 61 files**.
- **The Supabase project is shared with Gov-HIMS.** Every auth user this feature creates is visible there. Any row written during testing is prefixed `ZZ-` and its cleanup SQL published, never run.
- **Assurance is demo-grade**, deliberately: UHID + phone + full name. Not identity proofing. Do not add claims to the contrary in UI copy.
- **Match UHID through `resolveUhid(id, uhid)` from `@/lib/uhid`**, never the raw `uhid` column — 25 of 35 rows are NULL and derive their UHID.
- **Rate limits:** 5 claim attempts per IP per 15 minutes; 5 failures against one UHID locks that UHID for 1 hour. In-memory, single-instance only.
- **Uniform failure:** every rejection returns the identical body and status. Never reveal whether a UHID exists.
- TypeScript strict, no `any`. Functional components. Tailwind classes. Comments only where the WHY is non-obvious.
- `tsconfig.json` sets no `noUnusedLocals` — run `npx eslint <files>` on what you touch, because `tsc` will not catch unused imports.

### The binding gate

Run before every commit. Always `rm -rf .next` first — a stale `.next/types/validator.ts` emits hundreds of phantom errors. `tsc` takes ~2 minutes on this network drive.

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
node scripts/reachability.mjs | head -3
npx vitest run src/__tests__/manifest.test.ts src/__tests__/i18n-namespaces.test.ts src/__tests__/order-boundary.test.ts src/__tests__/branding.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts src/lib/__tests__/patientClaim.test.ts src/lib/__tests__/claimRateLimit.test.ts
```

Required: `tsc: 0`, `build: 0`, `DEAD: 0`, all suites green. The last two suites arrive in Tasks 1 and 2 — omit them until then.

**Do NOT use a full `npx vitest run` as a gate.** 17 suites hit the shared live Supabase project and are nondeterministic — three consecutive runs gave three different failure sets. Advisory only.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/patientClaim.ts` | **Create.** Pure matching: phone/name normalisation and the three-factor check. No I/O, no Supabase — so it is fully testable. |
| `src/lib/claimRateLimit.ts` | **Create.** Pure in-memory counters for per-IP and per-UHID limits. Injectable clock so tests don't sleep. |
| `src/app/api/patient/claim/route.ts` | **Create.** The atomic endpoint. Composes the two modules above with the admin client. |
| `src/app/patient/claim/page.tsx` | **Create.** The claim form. Public — a patient reaches it before having an account. |
| `src/lib/usePatientMe.ts` | **Rewrite.** Resolve by `authUserId`; become the single source of patient identity. |
| `src/app/patient/billing/page.tsx` | **Modify.** Read the `Bills` API; remove mock data and the hardcoded `PT-20394` in the printed invoice. |
| `scripts/seed/provision-demo-accounts.mjs` | **Modify.** Link `demo-patient@example.test` to Kiran Patil's record. |
| Six fallback sites | **Modify.** Replace duplicated `currentUser?.id ?? 'PT-20394'` with `usePatientMe`. |

---

### Task 1: Claim matching logic

Pure functions, no I/O. Everything the endpoint's correctness depends on lives here where it can be tested exhaustively.

**Files:**
- Create: `src/lib/patientClaim.ts`
- Test: `src/lib/__tests__/patientClaim.test.ts`

**Interfaces:**
- Consumes: `resolveUhid(patientId: string, canonical?: string | null): string` from `@/lib/uhid`.
- Produces: `normalizePhone(raw: string): string`, `normalizeName(raw: string): string`, and `matchesClaim(patient: ClaimCandidate, claim: ClaimInput): boolean` where
  `type ClaimCandidate = { id: string; uhid?: string | null; phone: string; fullName: string; authUserId?: string | null }`
  and `type ClaimInput = { uhid: string; phone: string; fullName: string }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/patientClaim.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { matchesClaim, normalizeName, normalizePhone } from '@/lib/patientClaim'
import { deriveUhid } from '@/lib/uhid'

const base = {
  id: 'PT-20394',
  uhid: null,
  phone: '+91 98109 44012',
  fullName: 'Kiran Patil',
  authUserId: null,
}

describe('normalizePhone', () => {
  it('strips spaces, hyphens and a +91 country code', () => {
    expect(normalizePhone('+91 98109 44012')).toBe('9810944012')
    expect(normalizePhone('098109-44012')).toBe('9810944012')
    expect(normalizePhone('9810944012')).toBe('9810944012')
  })
})

describe('normalizeName', () => {
  it('casefolds and collapses whitespace', () => {
    expect(normalizeName('  Kiran   PATIL ')).toBe('kiran patil')
  })
})

describe('matchesClaim', () => {
  const uhid = deriveUhid('PT-20394')

  it('matches a derived UHID when the column is null', () => {
    expect(matchesClaim(base, { uhid, phone: '9810944012', fullName: 'kiran patil' })).toBe(true)
  })

  it('matches a canonical UHID when the column is set', () => {
    const p = { ...base, uhid: 'PUH-2026-01464' }
    expect(matchesClaim(p, { uhid: 'PUH-2026-01464', phone: '9810944012', fullName: 'Kiran Patil' })).toBe(true)
  })

  it('is case-insensitive on the UHID', () => {
    expect(matchesClaim(base, { uhid: uhid.toLowerCase(), phone: '9810944012', fullName: 'Kiran Patil' })).toBe(true)
  })

  it('rejects a wrong phone', () => {
    expect(matchesClaim(base, { uhid, phone: '9999999999', fullName: 'Kiran Patil' })).toBe(false)
  })

  it('rejects a wrong name', () => {
    expect(matchesClaim(base, { uhid, phone: '9810944012', fullName: 'Someone Else' })).toBe(false)
  })

  it('rejects an already-claimed record', () => {
    const claimed = { ...base, authUserId: '00000000-0000-0000-0000-000000000001' }
    expect(matchesClaim(claimed, { uhid, phone: '9810944012', fullName: 'Kiran Patil' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/lib/__tests__/patientClaim.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/patientClaim"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/patientClaim.ts`:

```ts
import { resolveUhid } from '@/lib/uhid'

export type ClaimCandidate = {
  id: string
  uhid?: string | null
  phone: string
  fullName: string
  authUserId?: string | null
}

export type ClaimInput = {
  uhid: string
  phone: string
  fullName: string
}

// Indian numbers are stored inconsistently across intake paths ("+91 98109 44012",
// "098109-44012", "9810944012"). Compare on digits alone, dropping a leading 91 or
// 0 so the same subscriber matches however it was typed.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

// All three factors must match, and the record must be unclaimed. The UHID is
// compared through resolveUhid because most rows have a NULL uhid column and
// derive the value the patient is actually shown.
export function matchesClaim(patient: ClaimCandidate, claim: ClaimInput): boolean {
  if (patient.authUserId) return false
  const expected = resolveUhid(patient.id, patient.uhid).toUpperCase()
  if (expected !== claim.uhid.trim().toUpperCase()) return false
  if (normalizePhone(patient.phone) !== normalizePhone(claim.phone)) return false
  return normalizeName(patient.fullName) === normalizeName(claim.fullName)
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/lib/__tests__/patientClaim.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/lib/patientClaim.ts src/lib/__tests__/patientClaim.test.ts
git add src/lib/patientClaim.ts src/lib/__tests__/patientClaim.test.ts
git commit -m "feat(claim): three-factor patient claim matching

Matches UHID through resolveUhid rather than the raw column, because 25
of 35 patient rows have a NULL uhid and derive the value they are shown.
Phone compares on digits alone so the same subscriber matches whether it
was stored as +91 98109 44012, 098109-44012 or 9810944012."
```

---

### Task 2: Claim rate limiting

The endpoint mints credentials, so an unlimited claim endpoint is a UHID-guessing oracle. Pure counters, injectable clock so tests never sleep.

**Files:**
- Create: `src/lib/claimRateLimit.ts`
- Test: `src/lib/__tests__/claimRateLimit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `checkAndRecord(key: { ip: string; uhid: string }, now?: number): { allowed: boolean }`, `recordFailure(key: { ip: string; uhid: string }, now?: number): void`, `resetLimits(): void` (tests only). Limits: `IP_MAX = 5` per `IP_WINDOW_MS = 15 * 60_000`; `UHID_MAX_FAILURES = 5` then locked for `UHID_LOCK_MS = 60 * 60_000`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/claimRateLimit.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { checkAndRecord, recordFailure, resetLimits } from '@/lib/claimRateLimit'

const T0 = 1_700_000_000_000

beforeEach(() => resetLimits())

describe('per-IP rate limit', () => {
  it('allows 5 attempts then blocks the 6th', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAndRecord({ ip: '1.1.1.1', uhid: `PUH-2026-0000${i}` }, T0).allowed).toBe(true)
    }
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00009' }, T0).allowed).toBe(false)
  })

  it('allows again once the window has passed', () => {
    for (let i = 0; i < 5; i++) checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0)
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0 + 15 * 60_000 + 1).allowed).toBe(true)
  })

  it('tracks each IP separately', () => {
    for (let i = 0; i < 5; i++) checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0)
    expect(checkAndRecord({ ip: '2.2.2.2', uhid: 'PUH-2026-00001' }, T0).allowed).toBe(true)
  })
})

describe('per-UHID lockout', () => {
  it('locks a UHID after 5 failures, regardless of IP', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: `9.9.9.${i}`, uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01464' }, T0).allowed).toBe(false)
  })

  it('releases the lock after an hour', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: '9.9.9.9', uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01464' }, T0 + 60 * 60_000 + 1).allowed).toBe(true)
  })

  it('does not lock a different UHID', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: '9.9.9.9', uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01465' }, T0).allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/lib/__tests__/claimRateLimit.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/claimRateLimit"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/claimRateLimit.ts`:

```ts
// In-memory limits for the patient claim endpoint. Single-instance only — these
// counters do not survive a restart and are not shared between instances. That is
// adequate for this build and is recorded in the spec; a multi-instance
// deployment must move them to Postgres or Redis.

const IP_MAX = 5
const IP_WINDOW_MS = 15 * 60_000
const UHID_MAX_FAILURES = 5
const UHID_LOCK_MS = 60 * 60_000

const ipAttempts = new Map<string, number[]>()
const uhidFailures = new Map<string, number[]>()

const withinWindow = (times: number[], now: number, window: number) =>
  times.filter((t) => now - t < window)

export function resetLimits(): void {
  ipAttempts.clear()
  uhidFailures.clear()
}

export function recordFailure(key: { ip: string; uhid: string }, now = Date.now()): void {
  const uhid = key.uhid.trim().toUpperCase()
  const prior = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  uhidFailures.set(uhid, [...prior, now])
}

export function checkAndRecord(key: { ip: string; uhid: string }, now = Date.now()): { allowed: boolean } {
  const uhid = key.uhid.trim().toUpperCase()

  const failures = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  uhidFailures.set(uhid, failures)
  if (failures.length >= UHID_MAX_FAILURES) return { allowed: false }

  const attempts = withinWindow(ipAttempts.get(key.ip) ?? [], now, IP_WINDOW_MS)
  if (attempts.length >= IP_MAX) {
    ipAttempts.set(key.ip, attempts)
    return { allowed: false }
  }

  ipAttempts.set(key.ip, [...attempts, now])
  return { allowed: true }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd "/e/Umang Hospital HIMS"
npx vitest run src/lib/__tests__/claimRateLimit.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Lint and commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/lib/claimRateLimit.ts src/lib/__tests__/claimRateLimit.test.ts
git add src/lib/claimRateLimit.ts src/lib/__tests__/claimRateLimit.test.ts
git commit -m "feat(claim): in-memory rate limiting for the claim endpoint

5 attempts per IP per 15 minutes, and 5 failures against one UHID locks
it for an hour regardless of IP. Without the per-UHID lock the endpoint
is a UHID-guessing oracle, since an attacker can rotate IPs.

Counters are in-memory and single-instance by design; a multi-instance
deployment must move them to Postgres or Redis."
```

---

### Task 3: The claim endpoint

**Files:**
- Create: `src/app/api/patient/claim/route.ts`

**Interfaces:**
- Consumes: `matchesClaim`, `ClaimCandidate` from `@/lib/patientClaim`; `checkAndRecord`, `recordFailure` from `@/lib/claimRateLimit`; `getSupabaseAdminClient()` from `@/lib/supabase/admin`.
- Produces: `POST /api/patient/claim` accepting `{ email, password, uhid, phone, fullName }` and returning `{ ok: true }` on success or `{ ok: false, error: 'CLAIM_FAILED' }` with status 400 on any failure.

- [ ] **Step 1: Write the route**

Create `src/app/api/patient/claim/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { matchesClaim, type ClaimCandidate } from '@/lib/patientClaim'
import { checkAndRecord, recordFailure } from '@/lib/claimRateLimit'

// A patient claims their existing hospital record and gets portal credentials in
// one atomic step. Demo-grade assurance (UHID + phone + full name) — see
// docs/superpowers/specs/2026-08-30-patient-portal-identity-design.md.
//
// This is NOT open signup: an account can only be minted when the three factors
// match an existing unclaimed patient row.

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  uhid: z.string().min(3),
  phone: z.string().min(6),
  fullName: z.string().min(2),
})

// One response for every failure. Distinguishing "no such UHID" from "wrong
// phone" would turn this into a UHID-existence oracle.
const FAILED = NextResponse.json({ ok: false, error: 'CLAIM_FAILED' }, { status: 400 })

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return FAILED
  const { email, password, uhid, phone, fullName } = parsed.data

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkAndRecord({ ip, uhid }).allowed) return FAILED

  const admin = getSupabaseAdminClient()

  const { data: rows, error } = await admin
    .from('patients')
    .select('id, uhid, phone, full_name, auth_user_id')
    .is('deleted_at', null)
  if (error || !rows) return FAILED

  const candidates: ClaimCandidate[] = rows.map((r) => ({
    id: r.id as string,
    uhid: r.uhid as string | null,
    phone: (r.phone as string) ?? '',
    fullName: (r.full_name as string) ?? '',
    authUserId: r.auth_user_id as string | null,
  }))

  const patient = candidates.find((c) => matchesClaim(c, { uhid, phone, fullName }))
  if (!patient) {
    recordFailure({ ip, uhid })
    return FAILED
  }

  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'patient' },
    user_metadata: { full_name: patient.fullName },
  })
  if (userErr || !created?.user) {
    recordFailure({ ip, uhid })
    return FAILED
  }
  const userId = created.user.id

  // From here on, any failure must undo the auth user. Without this the email is
  // registered but unlinked, every retry fails with "already registered", and the
  // patient is permanently locked out with no recovery path in this build.
  const rollback = async () => {
    await admin.auth.admin.deleteUser(userId)
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role: 'patient', full_name: patient.fullName, is_active: true }, { onConflict: 'id' })
  if (profileErr) {
    await rollback()
    return FAILED
  }

  const { error: linkErr } = await admin
    .from('patients')
    .update({ auth_user_id: userId })
    .eq('id', patient.id)
    .is('auth_user_id', null)
  if (linkErr) {
    await rollback()
    return FAILED
  }

  return NextResponse.json({ ok: true })
}
```

Note the `.is('auth_user_id', null)` guard on the update: it closes the race where two concurrent claims for the same record both pass the earlier check.

- [ ] **Step 2: Verify it compiles and the route is registered**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build 2>&1 | grep -E "api/patient/claim|^build" ; echo "build: $?"
```

Expected: `tsc: 0`, and the route manifest lists `/api/patient/claim`.

- [ ] **Step 3: Prove uniform failure by hand**

Start the server, then send three different bad claims and confirm all three return an identical body and status:

```bash
cd "/e/Umang Hospital HIMS"
npm run build && npm start &
sleep 25
for body in \
  '{"email":"a@b.test","password":"password123","uhid":"PUH-2026-99999","phone":"9999999999","fullName":"No Such"}' \
  '{"email":"a@b.test","password":"password123","uhid":"PUH-2026-01464","phone":"9999999999","fullName":"Kiran Patil"}' \
  '{"email":"a@b.test","password":"password123","uhid":"PUH-2026-01464","phone":"9810944012","fullName":"Wrong Name"}'
do
  curl -s -o /dev/null -w '%{http_code} ' -X POST localhost:3000/api/patient/claim \
    -H 'content-type: application/json' -d "$body"
  curl -s -X POST localhost:3000/api/patient/claim -H 'content-type: application/json' -d "$body"
  echo
done
```

Expected: three identical `400 {"ok":false,"error":"CLAIM_FAILED"}` lines. **If any differs, the oracle is open** — fix before continuing. Stop the server afterwards.

- [ ] **Step 4: Commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/app/api/patient/claim/route.ts
git add src/app/api/patient/claim/route.ts
git commit -m "feat(claim): atomic patient record claim endpoint

Verifies UHID + phone + full name against an unclaimed patient row, then
mints the auth user, the profiles row and the auth_user_id link. Any
failure after user creation deletes the user again — otherwise the email
is registered but unlinked and every retry fails as 'already registered',
locking the patient out permanently.

Every rejection returns an identical body and status so the endpoint
cannot be used to discover which UHIDs exist. The link update is guarded
with .is('auth_user_id', null) to close the concurrent-claim race."
```

---

### Task 4: The claim page

**Files:**
- Create: `src/app/patient/claim/page.tsx`
- Modify: `src/app/login/page.tsx` — add a link to the claim page

**Interfaces:**
- Consumes: `POST /api/patient/claim` from Task 3.
- Produces: the route `/patient/claim`, reachable without a session.

- [ ] **Step 1: Build the form**

Create `src/app/patient/claim/page.tsx` as a `"use client"` component with five controlled fields — full name, UHID, phone, email, password — posting to `/api/patient/claim`.

The submit handler — the load-bearing part — is:

```tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setSubmitting(true)
  setError("")
  try {
    const res = await fetch("/api/patient/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, uhid, phone, fullName }),
    })
    const json = (await res.json()) as { ok: boolean }
    if (!json.ok) {
      setError(GENERIC_ERROR)
      return
    }
    const supabase = getSupabaseClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      // The record is claimed but the session failed — send them to sign in
      // rather than leaving them on a form that would now report "already claimed".
      router.push("/login")
      return
    }
    router.push("/patient/dashboard")
  } finally {
    setSubmitting(false)
  }
}
```

with

```tsx
const GENERIC_ERROR =
  "We couldn't match those details. Check your UHID, phone number and name exactly as given at the hospital, or ask reception for help."
```

Requirements:
- Never say which field was wrong — one message for every failure, mirroring the endpoint.
- Note the sign-in failure path above: once the claim succeeds the record is claimed, so re-submitting the form would fail as "already claimed". Route to `/login` instead of leaving them stuck.
- Match the visual language of `src/app/login/page.tsx` — same `Input`/`Button` from `@/components/ui`, same card layout.
- Explain where a UHID is found ("printed on your registration slip and prescription").
- **Do not claim the process is secure or verified.** Assurance here is demo-grade.

**This page must not sit under `RoleGuard`.** `src/app/patient/layout.tsx` applies the guard for the patient portal; a patient reaching `/patient/claim` has no session yet, so the guard would redirect them away. Check how `src/app/patient/layout.tsx` wraps children — if it guards the whole subtree, move the page to `src/app/claim/page.tsx` instead and say so in your report.

- [ ] **Step 2: Link it from login**

In `src/app/login/page.tsx`, below the sign-in button, add:

```tsx
<p className="mt-4 text-center text-sm text-foreground-lighter">
  {"First time here? "}
  <Link href="/patient/claim" className="font-medium text-accent hover:underline">
    Claim your patient record
  </Link>
</p>
```

Import `Link` from `next/link` if it is not already imported.

- [ ] **Step 3: Verify the route resolves and the link test passes**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npx vitest run src/__tests__/manifest.test.ts
```

Expected: `tsc: 0`, manifest test green. That test asserts every route-shaped string resolves to a shipped route, so it will fail if the path you linked does not exist.

- [ ] **Step 4: Commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/app/patient/claim/page.tsx src/app/login/page.tsx
git add src/app/patient/claim/page.tsx src/app/login/page.tsx
git commit -m "feat(claim): patient record claim page

One form takes name, UHID, phone, email and password, and signs the
patient straight in on success. Failure shows a single generic message
regardless of which factor was wrong, matching the endpoint's uniform
response."
```

---

### Task 5: Identity resolution

The actual bug fix. `usePatientMe` currently compares an auth uuid to a patient id like `PT-20394` — a match that can never succeed — so every patient sees Kiran Patil.

**Files:**
- Modify: `src/lib/usePatientMe.ts` (rewrite)
- Modify: `src/app/patient/feedback/page.tsx:266`, `src/app/patient/profile/page.tsx:59`, `src/app/patient/waiting/page.tsx:188`, `src/components/patient/dashboard/FamilyInviteCard.tsx:70`, `src/components/patient/dashboard/FamilyTrackingCard.tsx:19`

**Interfaces:**
- Consumes: `usePatientStore` (`patients: Patient[]`, where `Patient` has `id`, `name`, `phone`, `uhid?`), `useAuthStore` (`currentUser: { id: string; role: Role } | null`).
- Produces: `usePatientMe(): { me: Patient | undefined; profile: PatientProfile | undefined }` — unchanged signature, so existing consumers keep working.

- [ ] **Step 1: Find how `authUserId` reaches the store**

```bash
cd "/e/Umang Hospital HIMS"
grep -n "authUserId\|auth_user_id" src/store/usePatientStore.ts src/lib/api/patients.ts | head
```

`PatientSchema` in `src/lib/api/patients.ts` already declares `authUserId: z.string().uuid().optional()`, and `_core.ts` maps it to `auth_user_id`. Check whether `usePatientStore`'s own `Patient` type carries it through `hydrateReal`. **If it does not, add `authUserId?: string` to the store's `Patient` type and map it in `hydrateReal` — that is part of this task.** Report which you found.

- [ ] **Step 2: Rewrite the hook**

Replace `src/lib/usePatientMe.ts`:

```ts
import { useAuthStore } from "@/store/useAuthStore"
import { usePatientStore, type Patient } from "@/store/usePatientStore"
import { usePatientProfileStore, type PatientProfile } from "@/store/usePatientProfileStore"

// The single source of "who is the signed-in patient".
//
// This used to compare currentUser.id — a Supabase auth uuid — against
// patients.id, which is text like PT-20394. That can never match, so every
// patient silently saw the demo record. Resolution now goes through
// patients.auth_user_id, which the claim flow populates.
export function usePatientMe(): { me: Patient | undefined; profile: PatientProfile | undefined } {
  const currentUser = useAuthStore((s) => s.currentUser)
  const patients = usePatientStore((s) => s.patients)
  const me = currentUser ? patients.find((p) => p.authUserId === currentUser.id) : undefined
  const profile = usePatientProfileStore((s) => (me ? s.profiles[me.id] : undefined))
  return { me, profile }
}
```

Note there is **no demo fallback**. An unlinked patient resolves to `undefined`, and consumers render their empty state. That is the point: the fallback is what hid this bug.

- [ ] **Step 3: Replace the five duplicated fallbacks**

Each of these re-implements the same broken lookup. Replace each with `usePatientMe()`:

| File | Current |
|---|---|
| `src/app/patient/feedback/page.tsx:266` | `const patientId = currentUser?.id ?? 'PT-20394'` |
| `src/app/patient/profile/page.tsx:59` | `const id = currentUser?.role === "patient" ? currentUser.id : "PT-20394"` |
| `src/app/patient/waiting/page.tsx:188` | `patients.find(p => p.id === (currentUser?.id ?? 'PT-20394'))` |
| `src/components/patient/dashboard/FamilyInviteCard.tsx:70` | `me?.id ?? currentUser?.id ?? DEMO_PATIENT_ID` |
| `src/components/patient/dashboard/FamilyTrackingCard.tsx:19` | `me?.id ?? currentUser?.id ?? 'PT-20394'` |

Use `const { me } = usePatientMe()` and take `me?.id`. Where a component needs a value and `me` is undefined, render its empty state rather than substituting a demo id.

**The two family-track cards matter most.** They mint a tracking token keyed on the patient id — with the old fallback, an unlinked patient would mint a token for **Kiran Patil's record** and share a link exposing another patient's live status. Verify each renders an empty state instead when `me` is undefined.

- [ ] **Step 4: Verify the gate and check every consumer**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
grep -rn "PT-20394" src --include=*.ts --include=*.tsx | grep -v "__tests__"
```

Expected: `tsc: 0`, and the only surviving `PT-20394` references are seed or demo data — **not identity resolution**. `src/app/patient/billing/page.tsx:19` will still appear; Task 6 removes it.

- [ ] **Step 5: Commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/lib/usePatientMe.ts src/app/patient/feedback/page.tsx src/app/patient/profile/page.tsx src/app/patient/waiting/page.tsx src/components/patient/dashboard/FamilyInviteCard.tsx src/components/patient/dashboard/FamilyTrackingCard.tsx
git add -A
git commit -m "fix(patient): resolve identity by auth_user_id, drop the demo fallback

usePatientMe compared a Supabase auth uuid against patients.id (text like
PT-20394) — a match that can never succeed — so every signed-in patient
silently saw the demo record. Resolution now goes through
patients.auth_user_id.

Removes the same broken lookup duplicated across five more sites. The two
family-track cards mattered most: they mint a tracking token keyed on the
patient id, so an unlinked patient would have minted a token for the demo
patient's record and shared a link exposing another patient's live status."
```

---

### Task 6: Patient billing reads real bills

**Files:**
- Modify: `src/app/patient/billing/page.tsx`

**Interfaces:**
- Consumes: `usePatientMe()` from Task 5; `Bills` and `patientDueOf` from `@/lib/api/bills`.
- Produces: no new exports.

- [ ] **Step 1: Read what the page renders today**

```bash
cd "/e/Umang Hospital HIMS"
sed -n '1,70p' src/app/patient/billing/page.tsx
grep -n "async list\|async get\|patient_id" src/lib/api/bills.ts | head
```

Note the `Bills` API's read method and its filter argument before writing anything — do not guess the signature.

- [ ] **Step 2: Switch the data source**

Replace `usePatientOrdersStore` with the resolved patient's real bills:
- Load bills for `me.id` via the `Bills` API in an effect, into local state.
- Use `patientDueOf(bill)` for the amount the patient owes.
- **Remove the mock data entirely.** A patient with no bills sees an empty state — "No bills yet" — never fabricated line items. Showing invented charges to a patient is worse than the bug being fixed.
- When `me` is undefined, render the same empty state.

- [ ] **Step 3: Fix the printed invoice**

`src/app/patient/billing/page.tsx:19` hardcodes `PT-20394` into the printed invoice HTML, so a printed bill names the demo patient whoever is signed in. Take the patient id and UHID from the resolved patient — use `resolveUhid(me.id, me.uhid)` from `@/lib/uhid` for the UHID, matching what the rest of the portal displays.

- [ ] **Step 4: Verify**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
grep -n "PT-20394" src/app/patient/billing/page.tsx || echo "  hardcoded demo id gone"
node scripts/reachability.mjs | head -3
```

Expected: `tsc: 0`, `build: 0`, no `PT-20394`, `DEAD: 0`. If dropping `usePatientOrdersStore` orphans files, delete them until `DEAD: 0`.

- [ ] **Step 5: Commit**

```bash
cd "/e/Umang Hospital HIMS"
npx eslint src/app/patient/billing/page.tsx
git add -A
git commit -m "feat(patient): billing reads real bills from Postgres

Replaces local mock state with the Bills API filtered by the resolved
patient, so a bill settled at the billing desk is now visible to the
patient who paid it — the gap recorded in the README's Known-partial
section.

Mock data is removed rather than kept as an empty state: a patient with
no bills sees 'No bills yet', never invented line items. Also takes the
printed invoice's patient id and UHID from the resolved patient instead
of the hardcoded PT-20394, which named the demo patient on every
printed bill."
```

---

### Task 7: Link the demo account

The portal currently "works" in demos because of the fallback that hid the bug. Task 5 removed it, so the demo patient must be linked properly or the demo breaks.

**Files:**
- Modify: `scripts/seed/provision-demo-accounts.mjs`

**Interfaces:**
- Consumes: the existing `admin` client and `ROLES` map in that script.
- Produces: `demo-patient@example.test` linked to Kiran Patil (`PT-20394`) via `patients.auth_user_id`.

- [ ] **Step 1: Add the link step**

After the existing `profiles.upsert` loop, add a step that links the patient demo account. Follow the script's established style — `console.log` progress, `process.exit(1)` on error:

```js
// The patient portal resolves identity through patients.auth_user_id (see
// src/lib/usePatientMe.ts). Without this link the demo patient signs in
// successfully and then sees an empty portal.
const DEMO_PATIENT_ROW = 'PT-20394';
const patientUserId = existing.get('demo-patient@example.test')
  ?? (await allUsers()).get('demo-patient@example.test');

if (patientUserId) {
  const { error: linkErr } = await admin
    .from('patients')
    .update({ auth_user_id: patientUserId })
    .eq('id', DEMO_PATIENT_ROW);
  if (linkErr) { console.error(`link ${DEMO_PATIENT_ROW}: ${linkErr.message}`); process.exit(1); }
  console.log(`ok linked ${DEMO_PATIENT_ROW} -> demo-patient@example.test`);
} else {
  console.error('demo-patient user not found — cannot link patient record');
  process.exit(1);
}
```

- [ ] **Step 2: Run it and verify the link landed**

```bash
cd "/e/Umang Hospital HIMS"
node scripts/seed/provision-demo-accounts.mjs
node -e '
require("dotenv").config({path:".env.local"});const {Client}=require("pg");
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const r=await c.query("select id, full_name, auth_user_id from patients where id=$1",["PT-20394"]);
console.log(r.rows[0]);await c.end()})();'
```

Expected: `auth_user_id` is a uuid, not null.

**This writes to the shared Supabase project.** Record it in your report.

- [ ] **Step 3: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add scripts/seed/provision-demo-accounts.mjs
git commit -m "chore(seed): link the demo patient account to its record

The patient portal resolves identity through patients.auth_user_id. With
the demo fallback removed, demo-patient@example.test would sign in and
see an empty portal without this link.

The demo now works because the mechanism works — if the mechanism
breaks, the demo breaks visibly, which is the point. The old fallback is
what hid this bug through the whole extraction."
```

---

### Task 8: End-to-end verification and documentation

**Files:**
- Modify: `README.md`, `docs/JOURNEY-TEST-DATA.md`

**Interfaces:**
- Consumes: Tasks 1-7.

- [ ] **Step 1: Run the full binding gate**

```bash
cd "/e/Umang Hospital HIMS"
rm -rf .next
npx tsc --noEmit; echo "tsc: $?"
npm run build; echo "build: $?"
node scripts/reachability.mjs | head -3
npx vitest run src/__tests__/manifest.test.ts src/__tests__/i18n-namespaces.test.ts src/__tests__/order-boundary.test.ts src/__tests__/branding.test.ts src/lib/__tests__/opd-doctors.test.ts src/lib/api/__tests__/core-fallback.test.ts src/lib/intake/__tests__/register.test.ts src/lib/supabase/__tests__/client.test.ts src/store/__tests__/useLabOrdersStore.setRealIds.test.ts src/lib/__tests__/patientClaim.test.ts src/lib/__tests__/claimRateLimit.test.ts
npm run lint 2>&1 | tail -3
```

Required: `tsc: 0`, `build: 0`, `DEAD: 0`, all 11 suites green, lint at or below the 602-problem source baseline.

- [ ] **Step 2: Claim a real record end to end**

Seed a throwaway patient, claim it, and verify the link. Prefix everything `ZZ-` per the shared-database convention:

```bash
cd "/e/Umang Hospital HIMS"
npm run build && npm start &
sleep 25
```

Insert a `ZZ-ClaimTest-<timestamp>` patient with a known phone and name via the service-role client, compute its UHID with `deriveUhid`, then POST a correct claim to `/api/patient/claim` and confirm:
- the response is `{ ok: true }`
- `patients.auth_user_id` for that row is now a uuid
- a second identical claim returns `CLAIM_FAILED` (already claimed)
- signing in as the new account and loading `/patient/dashboard` shows that patient, not Kiran Patil

Record the actual output. Stop the server afterwards.

- [ ] **Step 3: Record the test data**

Append the `ZZ-ClaimTest` rows and the auth user's email to `docs/JOURNEY-TEST-DATA.md`, following the existing table and SQL format. **Do not run the deletion** — the owner decides. Note that removing the auth user needs the Supabase dashboard or the admin API, not SQL against `patients`.

- [ ] **Step 4: Update the README**

- Remove the "A settled bill is not patient-visible from Postgres" entry from `## Known-partial` — this work fixes it. Leave the appointments entry, which is unchanged.
- Add a short section describing how a patient claims their record, with the assurance level stated plainly: UHID + phone + full name, demo-grade, not identity proofing.
- Note under the shared-Supabase section that **this feature creates auth users in the pool shared with Gov-HIMS**.

- [ ] **Step 5: Commit**

```bash
cd "/e/Umang Hospital HIMS"
git add -A
git commit -m "docs: record the claim flow and close the patient-billing gap

A settled bill is now visible to the patient who paid it, so that entry
leaves Known-partial. Documents the claim flow's assurance level plainly
as demo-grade, and notes that this is the first feature creating auth
users in the pool shared with Gov-HIMS."
```

---

## Recommended follow-up (deliberately out of scope)

- **Password reset and link recovery.** A patient who forgets their password, or claims with a typo'd email, has no self-service path in this build.
- **Production identity proofing.** OTP to the phone on file, or ABHA verification, replacing the demo-grade triple. Requires an SMS provider or the real WhatsApp Business API — the current sender is a mock that logs to console.
- **Durable rate limiting.** The in-memory counters do not survive a restart and are not shared between instances.
- **Appointments persistence.** Still local-only; unrelated to this work but the other half of the patient-portal data gap.
