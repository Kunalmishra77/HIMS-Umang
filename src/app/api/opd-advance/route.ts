import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Advance a visit's status in the shared DB (service role). Used by every module
// so a status change (Send to Vitals, vitals recorded, sent to pharmacy, …) on
// one device propagates — via Supabase Realtime + hydrateReal — to every other
// device, regardless of the acting staff role. Avoids the per-role visits UPDATE
// RLS (doctor_id scoping etc.) that would otherwise block cross-device advances.
//
// The service role is what makes that bypass possible, so the caller must be
// authenticated before it is used: GET /api/opd-queue publishes every live
// `visitId` to anonymous callers (the check-in kiosk needs the queue), which
// without this gate let anyone cancel or re-stage any patient's visit with one
// unauthenticated POST. A shared secret cannot stand in for the session here —
// this route is called from the browser, so any credential it could send would
// ship in the client bundle.

const STATUSES = ['scheduled', 'waiting', 'vitals', 'consulting', 'pharmacy', 'billing', 'completed', 'cancelled'] as const
type Status = typeof STATUSES[number]

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'authentication required' }, { status: 401 })
  }

  let body: { visitId?: string; status?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const { visitId, status } = body
  if (!visitId || !status || !STATUSES.includes(status as Status)) {
    return NextResponse.json({ error: 'visitId and valid status required' }, { status: 400 })
  }

  const admin = getSupabaseAdminClient()
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'completed') patch.completed_at = new Date().toISOString()

  const { error } = await admin.from('visits').update(patch).eq('id', visitId)
  if (error) {
    console.error('[api/opd-advance]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, visitId, status })
}
