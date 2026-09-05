import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Server-side OPD queue read — returns the live queue (active visits joined with
// their patients) using the service role, so EVERY staff module sees it
// regardless of how they logged in. The demo role-switcher login does not create
// a Supabase auth session, and the per-role RLS SELECT policies on visits/
// patients require a real authenticated staff session — so a direct browser read
// returns nothing for demo staff. Reading through this route (service role)
// bypasses that, which is what makes the queue actually cross-device: a patient
// checked in on one machine appears in Reception/Nurse/Doctor on every machine.
//
// FOLLOW-UP for production: the queue (patient names, tokens) is still
// world-readable by design — the anonymous check-in kiosk needs that. The
// two fields that double as claim factors (`phone`, `authUserId`) are now
// withheld from unauthenticated callers (see the GET handler below); a
// further production hardening would be a staff session / API key on the
// whole route, but that is out of scope here — see C1 in the final-fix
// report for why a route-wide gate was rejected.

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
  const admin = getSupabaseAdminClient()
  try {
    // Vary the payload by caller session — not by gating the route (the
    // anonymous check-in kiosk depends on this route staying session-free,
    // see StoreHydrator.tsx) and not by dropping the field outright (doctor/
    // dashboard, doctor/records — including its search filter — journey/
    // [patientId] and p/[uhid] all read `phone` from this response). `phone`
    // is the one factor POST /api/patient/claim matches on that isn't
    // otherwise derivable: `uhid` is deterministic from `patients.id` via
    // deriveUhid(), and `name` is already public on this same response — so
    // publishing `phone` here to an anonymous caller alongside them hands an
    // attacker a complete claim on any queued patient in one request. Same
    // reasoning applies to `authUserId`, which identifies whether/which
    // account already claimed a row.
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const isAuthed = Boolean(user)

    const { data: visits, error: vErr } = await admin.from('visits')
      .select('*').not('status', 'in', '(completed,cancelled)')
    if (vErr) throw new Error(`visits: ${vErr.message}`)

    const active = (visits ?? []).filter(v => VISIT_TO_QUEUE[v.status])
    if (!active.length) return NextResponse.json({ patients: [] })

    const patientIds = [...new Set(active.map(v => v.patient_id))]
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
        phone: isAuthed ? (p.phone ?? '') : '',
        bloodGroup: p.blood_group ?? 'A+', token: v.token ?? 0,
        queueStatus: qs, estimatedWait: v.estimated_wait_min ?? 0,
        doctor: v.doctor_name ?? 'Dr. Priya Nair', department: v.department ?? 'General Medicine',
        vitals: null, symptoms: v.symptoms ?? [], history: [],
        registeredAt: '', registeredDate: today, triageLevel: v.triage_level ?? 'Low',
        source: 'appointment', aadhaarVerified: p.aadhaar_verified ?? false,
        abhaId: p.abha_id ?? undefined, visitId: v.id,
        // Surfaced so usePatientStore.hydrateReal can carry it into the local
        // Patient record — this is what lets usePatientMe resolve a claimed
        // patient's own row instead of falling through to undefined. Withheld
        // for anonymous callers for the same reason as `phone` above.
        authUserId: isAuthed ? (p.auth_user_id ?? undefined) : undefined,
      }]
    })

    return NextResponse.json({ patients: queue })
  } catch (err) {
    console.error('[api/opd-queue]', (err as Error).message)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
