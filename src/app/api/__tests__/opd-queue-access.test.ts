import '../auth/session/__tests__/async-local-storage-polyfill'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { GET } from '@/app/api/opd-queue/route'
import { POST as SESSION_POST } from '@/app/api/auth/session/route'
import { callRouteHandler } from '../auth/session/__tests__/with-route-handler-context'

// The OPD queue is a staff board: it joins every active visit to its patient
// and returns names, ages, phones and symptoms. It ran unauthenticated, so
// anyone who knew the URL could read the live patient list. These tests pin
// the access rule, because a regression here is silent — the route keeps
// returning 200 with a perfectly well-formed body.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

const STAFF_EMAIL = 'opd-queue-access-staff@example.com'
const PATIENT_EMAIL = 'opd-queue-access-patient@example.com'
const PASSWORD = 'Test-Pass-123!'

const MINE = 'PT-OQACCESS-MINE'
const OTHER = 'PT-OQACCESS-OTHER'
const VIS_MINE = 'VIS-OQACCESS-MINE'
const VIS_OTHER = 'VIS-OQACCESS-OTHER'

let staffUserId = ''
let patientUserId = ''
let staffCookie = ''
let patientCookie = ''

/** Bridge a real session into cookies the way the browser does, and return the header. */
async function cookieFor(email: string): Promise<string> {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PASSWORD })
  if (error || !data.session) throw new Error(`signIn failed for ${email}: ${error?.message}`)

  const req = new Request('http://localhost/api/auth/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
  })
  const res = await callRouteHandler(req, () => SESSION_POST(req))
  const pairs = res.headers.getSetCookie().map(c => c.split(';')[0]).filter(Boolean)
  if (!pairs.length) throw new Error(`session bridge returned no cookies for ${email}`)
  return pairs.join('; ')
}

async function getQueue(cookie?: string): Promise<Response> {
  const req = new Request('http://localhost/api/opd-queue', {
    headers: cookie ? { cookie } : {},
  })
  return callRouteHandler(req, () => GET())
}

async function makeUser(email: string, role: string, fullName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`)
  const { error: pErr } = await admin.from('profiles').insert({ id: data.user.id, role, full_name: fullName })
  if (pErr) throw new Error(`profile insert failed for ${email}: ${pErr.message}`)
  return data.user.id
}

beforeAll(async () => {
  staffUserId = await makeUser(STAFF_EMAIL, 'reception', 'OPD Queue Access Staff')
  patientUserId = await makeUser(PATIENT_EMAIL, 'patient', 'OPD Queue Access Patient')

  const { error: patErr } = await admin.from('patients').insert([
    { id: MINE, hn: 'HN-OQACCESS-MINE', full_name: 'Own Row Patient', phone: '9111111111', sex: 'Male', auth_user_id: patientUserId },
    { id: OTHER, hn: 'HN-OQACCESS-OTHER', full_name: 'Someone Else', phone: '9222222222', sex: 'Female' },
  ])
  if (patErr) throw new Error(`patients insert failed: ${patErr.message}`)

  const { error: visErr } = await admin.from('visits').insert([
    { id: VIS_MINE, patient_id: MINE, kind: 'OPD', department: 'General Medicine', status: 'waiting', token: 901 },
    { id: VIS_OTHER, patient_id: OTHER, kind: 'OPD', department: 'General Medicine', status: 'consulting', token: 902 },
  ])
  if (visErr) throw new Error(`visits insert failed: ${visErr.message}`)

  staffCookie = await cookieFor(STAFF_EMAIL)
  patientCookie = await cookieFor(PATIENT_EMAIL)
}, 60000)

afterAll(async () => {
  await admin.from('visits').delete().in('id', [VIS_MINE, VIS_OTHER])
  await admin.from('patients').delete().in('id', [MINE, OTHER])
  for (const id of [staffUserId, patientUserId]) {
    if (!id) continue
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
})

describe('GET /api/opd-queue access', () => {
  it('refuses an anonymous caller instead of publishing the patient list', async () => {
    const res = await getQueue()
    expect(res.status).toBe(401)
    // The body must not carry the queue under any key.
    expect(JSON.stringify(await res.json())).not.toContain('Own Row Patient')
  })

  it('serves the full queue to a staff session', async () => {
    const res = await getQueue(staffCookie)
    expect(res.status).toBe(200)
    const { patients } = await res.json() as { patients: { id: string; phone: string }[] }
    const ids = patients.map(p => p.id)
    expect(ids).toContain(MINE)
    expect(ids).toContain(OTHER)
    // Staff keep the fields the worklists read.
    expect(patients.find(p => p.id === MINE)?.phone).toBe('9111111111')
  })

  it('gives a patient session only its own row, never the rest of the queue', async () => {
    const res = await getQueue(patientCookie)
    expect(res.status).toBe(200)
    const { patients } = await res.json() as { patients: { id: string; queueStatus: string; token: number }[] }
    expect(patients.map(p => p.id)).toEqual([MINE])
    // Their own live stage is what the portal tracker needs from this route —
    // /api/patient/me hardcodes queueStatus 'done' and token 0.
    expect(patients[0].queueStatus).toBe('waiting')
    expect(patients[0].token).toBe(901)
  })
})
