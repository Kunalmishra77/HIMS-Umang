import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'

// Server-side read of "the calling patient's own record", independent of
// /api/opd-queue — that route only surfaces patients with an active
// (non-completed, non-cancelled) visit, so a patient who claimed their
// record but has no visit in progress right now would never enter the
// local patients array and usePatientMe would resolve undefined forever.
// This resolves identity from the caller's own Supabase session (never
// trusts a client-supplied id) and looks up the single patients row that
// claim linked via auth_user_id.

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    // No session — return null rather than an error, so this endpoint never
    // leaks whether a session exists to an unauthenticated caller.
    if (!user) return NextResponse.json({ patient: null })

    const admin = getSupabaseAdminClient()
    const { data: p, error } = await admin.from('patients')
      .select('*').eq('auth_user_id', user.id).maybeSingle()
    if (error || !p) return NextResponse.json({ patient: null })

    const today = new Date().toISOString().slice(0, 10)
    return NextResponse.json({
      patient: {
        id: p.id, uhid: p.uhid ?? undefined, name: p.full_name,
        age: p.age ?? 30,
        gender: p.sex === 'Female' ? 'Female' : p.sex === 'Other' ? 'Other' : 'Male',
        phone: p.phone ?? '', bloodGroup: p.blood_group ?? 'A+', token: 0,
        // No active visit backs this row (that's what /api/opd-queue is for) —
        // 'done' is the local QueueStatus with no implied "in queue" position.
        queueStatus: 'done', estimatedWait: 0,
        doctor: '', department: '',
        vitals: null, symptoms: [], history: [],
        registeredAt: '', registeredDate: today, triageLevel: 'Low',
        source: 'appointment', aadhaarVerified: p.aadhaar_verified ?? false,
        authUserId: p.auth_user_id ?? undefined,
      },
    })
  } catch (err) {
    console.error('[api/patient/me]', (err as Error).message)
    return NextResponse.json({ patient: null })
  }
}
