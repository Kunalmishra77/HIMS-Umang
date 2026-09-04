import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

let receptionUserId: string
let doctorUserId: string
let receptionClient: SupabaseClient
let doctorClient: SupabaseClient
const testPatientId = 'PT-RLSTEST-1'
const testVisitId = 'VIS-RLSTEST-1'

// A run that dies before afterAll leaves its auth users behind, and createUser
// then fails with "already been registered" on every subsequent run — the suite
// can never recover on its own. Clearing the fixture first makes each run
// independent of how the last one ended.
async function deleteUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers()
  const existing = data?.users.find((u) => u.email === email)
  if (!existing) return
  await admin.from('profiles').delete().eq('id', existing.id)
  await admin.auth.admin.deleteUser(existing.id)
}

async function createStaffUser(email: string, role: 'reception' | 'doctor') {
  await deleteUserByEmail(email)
  const { data, error } = await admin.auth.admin.createUser({
    email, password: 'Test-Pass-123!', email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  const { error: profileError } = await admin.from('profiles').insert({
    id: data.user.id, role, full_name: `RLS Test ${role}`,
  })
  if (profileError) throw new Error(`profile insert failed: ${profileError.message}`)
  return data.user.id
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey)
  const { error } = await client.auth.signInWithPassword({ email, password: 'Test-Pass-123!' })
  if (error) throw new Error(`signIn failed: ${error.message}`)
  return client
}

beforeAll(async () => {
  receptionUserId = await createStaffUser('rls-test-reception@example.com', 'reception')
  doctorUserId = await createStaffUser('rls-test-doctor@example.com', 'doctor')
  receptionClient = await signIn('rls-test-reception@example.com')
  doctorClient = await signIn('rls-test-doctor@example.com')

  await admin.from('patients').insert({
    id: testPatientId, hn: 'HN-RLSTEST-1', full_name: 'RLS Test Patient', phone: '9999999999', sex: 'Other',
  })
  await admin.from('visits').insert({
    id: testVisitId, patient_id: testPatientId, kind: 'OPD', department: 'General Medicine',
    status: 'waiting', doctor_id: doctorUserId,
  })
})

afterAll(async () => {
  await admin.from('visits').delete().eq('id', testVisitId)
  await admin.from('patients').delete().eq('id', testPatientId)
  // Guarded: if beforeAll threw partway, these ids are undefined and an
  // unguarded deleteUser masks the real setup failure with a UUID error.
  for (const id of [receptionUserId, doctorUserId]) {
    if (!id) continue
    await admin.from('profiles').delete().eq('id', id)
    await admin.auth.admin.deleteUser(id)
  }
})

describe('RLS: profiles', () => {
  it('lets a user read their own profile', async () => {
    const { data, error } = await receptionClient.from('profiles').select('*').eq('id', receptionUserId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.role).toBe('reception')
  })
})

describe('RLS: patients', () => {
  it('lets staff (reception) see patients', async () => {
    const { data, error } = await receptionClient.from('patients').select('*').eq('id', testPatientId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(testPatientId)
  })

  it('lets staff (doctor) see patients too', async () => {
    const { data, error } = await doctorClient.from('patients').select('*').eq('id', testPatientId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(testPatientId)
  })
})

describe('RLS: visits', () => {
  it('lets the assigned doctor see their own visit', async () => {
    const { data, error } = await doctorClient.from('visits').select('*').eq('id', testVisitId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(testVisitId)
  })

  it('lets reception see all visits', async () => {
    const { data, error } = await receptionClient.from('visits').select('*').eq('id', testVisitId).maybeSingle()
    expect(error).toBeNull()
    expect(data?.id).toBe(testVisitId)
  })

  it('blocks a doctor from updating a visit not assigned to them', async () => {
    // Reassign to a different, real profile id — a nonexistent placeholder UUID
    // would violate visits.doctor_id's FK to profiles(id) and silently no-op,
    // making this assertion pass for the wrong reason.
    const { error: reassignError } = await admin.from('visits').update({ doctor_id: receptionUserId }).eq('id', testVisitId)
    expect(reassignError).toBeNull()
    const { data } = await doctorClient.from('visits').update({ status: 'consulting' }).eq('id', testVisitId).select()
    expect(data).toEqual([])
    await admin.from('visits').update({ doctor_id: doctorUserId }).eq('id', testVisitId)
  })
})
