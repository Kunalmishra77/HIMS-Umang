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

// One response shape for every failure. Distinguishing "no such UHID" from
// "wrong phone" would turn this into a UHID-existence oracle.
//
// Built per call, never shared: a Response body is a single-use stream, so a
// module-scope instance would serve the first request and fail every one after.
const failed = () => NextResponse.json({ ok: false, error: 'CLAIM_FAILED' }, { status: 400 })

// A non-matching guess returns after one `select` plus an in-process scan; a
// matching guess makes an extra Auth Admin API round trip before it can fail.
// Holding every response to this floor narrows that timing gap so a byte-identical
// body isn't paired with a measurably different latency.
//
// This narrows the signal, it does not eliminate it: a createUser round trip
// slower than the floor still shows through, and an attacker averaging many
// samples can recover a difference this small. The real defense against that is
// the existing per-UHID lockout in claimRateLimit.ts (5 failures/hour), which
// makes collecting enough samples impractical.
const MIN_RESPONSE_MS = 500

async function withFloor<T>(startedAt: number, response: T): Promise<T> {
  const remaining = MIN_RESPONSE_MS - (Date.now() - startedAt)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  return response
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now()

  // No floor here: the floor exists only to mask whether the three factors
  // matched, and a body that fails validation never reaches that comparison —
  // it touches no patient data, so its latency reveals nothing. Flooring it
  // would instead let unlimited malformed-body POSTs (never rate-limited,
  // since checkAndRecord hasn't run yet) pin a request slot for 500ms each.
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return failed()
  const { email, password, uhid, phone, fullName } = parsed.data

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkAndRecord({ ip, uhid }).allowed) return withFloor(startedAt, failed())

  const admin = getSupabaseAdminClient()

  const { data: rows, error } = await admin
    .from('patients')
    .select('id, uhid, phone, full_name, auth_user_id')
    .is('deleted_at', null)
  if (error || !rows) return withFloor(startedAt, failed())

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
    return withFloor(startedAt, failed())
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
    return withFloor(startedAt, failed())
  }
  const userId = created.user.id

  // From here on, any failure must undo the auth user. Without this the email is
  // registered but unlinked, every retry fails with "already registered", and the
  // patient is permanently locked out with no recovery path in this build.
  //
  // deleteUser funnels ordinary failures into `error` rather than throwing, so a
  // failed rollback would otherwise leave a dangling auth user with no signal at
  // all. The response still stays `failed()` either way — this is only an
  // operator trail, not a different outcome for the caller.
  const rollback = async (reason: string) => {
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) {
      console.error(`[patient/claim] rollback failed for auth user ${userId} (${reason}):`, deleteErr)
    }
  }

  const { error: profileErr } = await admin
    .from('profiles')
    .upsert({ id: userId, role: 'patient', full_name: patient.fullName, is_active: true }, { onConflict: 'id' })
  if (profileErr) {
    await rollback('profiles upsert failed')
    return withFloor(startedAt, failed())
  }

  // Without `.select('id')`, a matching update returns no rows by default (Prefer:
  // return=minimal), so an update that matches zero rows is indistinguishable from
  // one that matched one — `error` is null either way. Requiring exactly one row
  // back is what actually closes the concurrent-claim race: if another request won
  // it first, `.is('auth_user_id', null)` matches nothing and this must be treated
  // as a failure, not a silent success.
  const { data: linked, error: linkErr } = await admin
    .from('patients')
    .update({ auth_user_id: userId })
    .eq('id', patient.id)
    .is('auth_user_id', null)
    .select('id')
  if (linkErr || !linked || linked.length !== 1) {
    await rollback(linkErr ? 'patients link update failed' : 'patients link update matched zero rows (lost claim race)')
    return withFloor(startedAt, failed())
  }

  return withFloor(startedAt, NextResponse.json({ ok: true }))
}
