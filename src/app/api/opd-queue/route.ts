import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Server-side OPD queue read — returns the live queue (active visits joined with
// their patients) using the service role, so EVERY staff module sees it
// regardless of which portal the user logged into. The per-role RLS SELECT
// policies on visits/patients scope rows by doctor_id and the like, so a direct
// browser read shows a partial board; reading through this route bypasses that,
// which is what makes the queue actually cross-device — a patient checked in on
// one machine appears in Reception/Nurse/Doctor/Pharmacy on every machine.
//
// Because the service role bypasses RLS, this route IS the access control. It
// used to run unauthenticated, publishing every queued patient's name, age,
// symptoms and triage level to anyone who opened the URL. Two rules now apply:
//
//   1. No session at all → 401. Nothing here is public. The anonymous check-in
//      kiosk does not read this route: it writes through /api/opd-register and
//      shows the patient their own token slip from local state, and the family
//      tracker at /p/[uhid] reads the same-device store (StoreHydrator skips
//      hydration entirely when no role is active).
//   2. A patient session → their own row only. The portal's journey tracker
//      needs this route for the patient's live stage and token, because
//      /api/patient/me hardcodes queueStatus 'done' / token 0 for the
//      no-active-visit case. Scoping by auth_user_id gives the tracker exactly
//      what it needs and nothing else — before this, every signed-in patient
//      could read the whole hospital's queue.
//
// Staff therefore keep the full board, including `phone` and `authUserId`, which
// doctor/dashboard, doctor/records (its search filter), journey/[patientId] and
// p/[uhid] all read. Those two fields double as claim factors for
// POST /api/patient/claim, which is why they must never reach a caller who
// isn't already entitled to the row.

export const dynamic = 'force-dynamic'

// The local QueueStatus this feeds (usePatientStore) now has a pharmacy
// stage, so a visit's backend status maps 1:1 onto the local queue — see
// QueueStatus/QUEUE_STATUS_TO_VISIT_STATUS in usePatientStore.ts for the
// (near-)identical set on the write side. Only 'scheduled' has no local
// counterpart, so it surfaces at 'waiting', the earliest local stage.
const VISIT_TO_QUEUE: Record<string, string | undefined> = {
  scheduled: 'waiting', waiting: 'waiting', vitals: 'vitals',
  consulting: 'consulting', pharmacy: 'pharmacy', billing: 'billing',
}

export async function GET() {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }

  const admin = getSupabaseAdminClient()
  try {
    // Read the role from `profiles` rather than trusting the client's active
    // role: useAuthStore is localStorage-persisted, so a caller can set it to
    // anything. This is the only authorization input.
    const { data: profile, error: profErr } = await admin.from('profiles')
      .select('role').eq('id', user.id).maybeSingle()
    if (profErr) throw new Error(`profiles: ${profErr.message}`)
    if (!profile) {
      return NextResponse.json({ error: 'no profile for this account' }, { status: 403 })
    }
    const isPatient = profile.role === 'patient'

    const { data: visits, error: vErr } = await admin.from('visits')
      .select('*').not('status', 'in', '(completed,cancelled)')
    if (vErr) throw new Error(`visits: ${vErr.message}`)

    const active = (visits ?? []).filter(v => VISIT_TO_QUEUE[v.status])
    if (!active.length) return NextResponse.json({ patients: [] })

    let patientIds = [...new Set(active.map(v => v.patient_id))]
    if (isPatient) {
      const { data: own, error: ownErr } = await admin.from('patients')
        .select('id').eq('auth_user_id', user.id).maybeSingle()
      if (ownErr) throw new Error(`own patient: ${ownErr.message}`)
      patientIds = own ? patientIds.filter(id => id === own.id) : []
    }
    if (!patientIds.length) return NextResponse.json({ patients: [] })

    const { data: patients, error: pErr } = await admin.from('patients')
      .select('*').in('id', patientIds)
    if (pErr) throw new Error(`patients: ${pErr.message}`)

    const byId = new Map((patients ?? []).map(p => [p.id, p]))
    const today = new Date().toISOString().slice(0, 10)

    const queue = active.flatMap(v => {
      const p = byId.get(v.patient_id)
      const qs = VISIT_TO_QUEUE[v.status]
      if (!p || !qs) return []
      return [{
        id: p.id, uhid: p.uhid ?? undefined, name: p.full_name,
        age: p.age ?? 30,
        gender: p.sex === 'Female' ? 'Female' : p.sex === 'Other' ? 'Other' : 'Male',
        phone: p.phone ?? '',
        bloodGroup: p.blood_group ?? 'A+', token: v.token ?? 0,
        queueStatus: qs, estimatedWait: v.estimated_wait_min ?? 0,
        doctor: v.doctor_name ?? 'Dr. Priya Nair', department: v.department ?? 'General Medicine',
        vitals: null, symptoms: v.symptoms ?? [], history: [],
        registeredAt: '', registeredDate: today, triageLevel: v.triage_level ?? 'Low',
        source: 'appointment', aadhaarVerified: p.aadhaar_verified ?? false,
        visitId: v.id,
        // Surfaced so usePatientStore.hydrateReal can carry it into the local
        // Patient record — this is what lets usePatientMe resolve a claimed
        // patient's own row instead of falling through to undefined.
        authUserId: p.auth_user_id ?? undefined,
      }]
    })

    return NextResponse.json({ patients: queue })
  } catch (err) {
    console.error('[api/opd-queue]', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
