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

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return failed()
  const { email, password, uhid, phone, fullName } = parsed.data

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (!checkAndRecord({ ip, uhid }).allowed) return failed()

  const admin = getSupabaseAdminClient()

  const { data: rows, error } = await admin
    .from('patients')
    .select('id, uhid, phone, full_name, auth_user_id')
    .is('deleted_at', null)
  if (error || !rows) return failed()

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
    return failed()
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
    return failed()
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
    return failed()
  }

  const { error: linkErr } = await admin
    .from('patients')
    .update({ auth_user_id: userId })
    .eq('id', patient.id)
    .is('auth_user_id', null)
  if (linkErr) {
    await rollback()
    return failed()
  }

  return NextResponse.json({ ok: true })
}
