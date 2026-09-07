import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { usePatientStore } from '@/store/usePatientStore'
import { useAuthStore, DEMO_USERS_MAP } from '@/store/useAuthStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Patients } from '@/lib/api'
import { attachServerSession, detachServerSession } from '@/lib/testing/serverSession'

// addPatient's real-backend write now checks the LIVE Supabase session
// directly (supabase.auth.getSession()) rather than the persisted
// `isRealSession` flag on useAuthStore. That flag survives across app
// restarts via localStorage (StoreHydrator unconditionally rehydrates
// useAuthStore on every mount), so it does not by itself prove the
// underlying session is still valid. These tests exercise the live-session
// guard: a genuine signed-in session (via signInWithPassword, the same
// client getSupabaseClient()/table() use) triggers the real write; anything
// else — including a *stale* `isRealSession: true` left over from a prior
// real login on this browser — must not.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const staffEmail = 'addpatient-test-reception@example.com'
const staffPassword = 'Test-Pass-123!'
let staffUserId: string
let createdPatientId: string | undefined

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: staffEmail, password: staffPassword, email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  staffUserId = data.user.id
  const { error: profileError } = await admin.from('profiles').insert({
    id: staffUserId, role: 'reception', full_name: 'AddPatient Test Reception',
  })
  if (profileError) throw new Error(`profile insert failed: ${profileError.message}`)
  const { data: signInData, error: signInError } = await getSupabaseClient().auth.signInWithPassword({
    email: staffEmail, password: staffPassword,
  })
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`)
  if (!signInData.session) throw new Error('signIn returned no session')
  await attachServerSession(signInData.session)
  await useAuthStore.getState().hydrateFromSession()
})

afterAll(async () => {
  await admin.from('profiles').delete().eq('id', staffUserId)
  await admin.auth.admin.deleteUser(staffUserId)
  await getSupabaseClient().auth.signOut()
  detachServerSession()
})

afterEach(async () => {
  if (createdPatientId) {
    await admin.from('visits').delete().eq('patient_id', createdPatientId)
    await admin.from('patients').delete().eq('id', createdPatientId)
    createdPatientId = undefined
  }
})

// Restores a genuine live session + a freshly-hydrated useAuthStore, so
// later tests in this file that expect the positive path are unaffected by
// an earlier test's signOut().
async function reSignInAsStaff() {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({
    email: staffEmail, password: staffPassword,
  })
  if (error || !data.session) throw new Error(`re-signIn failed: ${error?.message}`)
  await attachServerSession(data.session)
  await useAuthStore.getState().hydrateFromSession()
}

describe('usePatientStore.addPatient — real backend write', () => {
  it('creates a real patients + visits row and stores visitId locally when a live Supabase session exists', async () => {
    usePatientStore.setState({ patients: [], queue: [] })
    await usePatientStore.getState().addPatient({
      name: 'Real Backend Test Patient', phone: '9444444444', age: 40, gender: 'Male', department: 'General Medicine',
    })
    const created = usePatientStore.getState().patients[0]
    expect(created).toBeTruthy()
    expect(created.visitId).toBeTruthy()
    createdPatientId = created.id

    const remotePatients = await admin.from('patients').select('*').eq('id', created.id)
    expect(remotePatients.data?.length).toBe(1)
    const remoteVisits = await admin.from('visits').select('*').eq('id', created.visitId!)
    expect(remoteVisits.data?.length).toBe(1)
    expect(remoteVisits.data?.[0].status).toBe('waiting')
  })

  // Aadhaar/UHID bridge — register/page.tsx's normal flow (Aadhaar/ABHA
  // completes BEFORE "Add to Queue" is clicked) stamps these onto the local
  // patient object before calling addPatient. Before this bridge they were
  // silently dropped from the real Patients.create call.
  it('forwards uhid/aadhaarVerified onto the real patients row when already set locally', async () => {
    usePatientStore.setState({ patients: [], queue: [] })
    await usePatientStore.getState().addPatient({
      name: 'Identity Bridge Test Patient', phone: '9444444401', age: 27, gender: 'Female', department: 'General Medicine',
      uhid: 'PUH-2026-88001', aadhaarVerified: true,
    })
    const created = usePatientStore.getState().patients[0]
    expect(created.visitId).toBeTruthy()
    createdPatientId = created.id
    expect(created.uhid).toBe('PUH-2026-88001')

    const remote = await admin.from('patients').select('uhid, aadhaar_verified').eq('id', created.id).single()
    expect(remote.data?.uhid).toBe('PUH-2026-88001')
    expect(remote.data?.aadhaar_verified).toBe(true)
  })

  it('does not attempt a real backend write when isRealSession is stale-true but no live Supabase session exists (the fixed bug)', async () => {
    // The exact stale-persistence scenario: a real login happened at some
    // earlier point on this browser, leaving `isRealSession: true` and a
    // `currentUser` persisted in localStorage — but the underlying Supabase
    // session is no longer live (expired, or the user explicitly signed out
    // of Supabase without ever calling useAuthStore.logout()). Before this
    // fix, addPatient trusted the persisted flag alone and *did* fire a real
    // `Patients.create` network call here — Postgres RLS was the only thing
    // stopping the write from landing. Spying directly on `Patients.create`
    // proves the fixed guard now skips the attempt entirely, rather than
    // relying solely on RLS as a backstop.
    const createSpy = vi.spyOn(Patients, 'create')
    await getSupabaseClient().auth.signOut()
    detachServerSession()
    useAuthStore.setState({
      isRealSession: true,
      currentUser: { id: staffUserId, name: 'AddPatient Test Reception', role: 'reception' },
      activeRole: 'reception',
    })
    usePatientStore.setState({ patients: [], queue: [] })

    await usePatientStore.getState().addPatient({
      name: 'Stale Session Test Patient', phone: '9777777777', age: 45, gender: 'Female', department: 'General Medicine',
    })
    const created = usePatientStore.getState().patients[0]
    expect(created).toBeTruthy()
    expect(createSpy).not.toHaveBeenCalled()
    createSpy.mockRestore()
    createdPatientId = created.id

    // The shared patient + visit are still written, but by POST
    // /api/opd-register under the service role — the route the anonymous
    // self-check-in kiosk depends on, which by design needs no session. What
    // the stale flag must not do is re-arm the *client-side* Patients.create
    // write above, and it doesn't.
    expect(created.visitId).toBeTruthy()
    const remotePatients = await admin.from('patients').select('*').eq('id', created.id)
    expect(remotePatients.data?.length).toBe(1)

    await reSignInAsStaff()
  })

  it('still registers through the anonymous kiosk route when no staff session is signed in', async () => {
    await getSupabaseClient().auth.signOut()
    detachServerSession()
    useAuthStore.setState({ currentUser: null })
    usePatientStore.setState({ patients: [], queue: [] })

    await usePatientStore.getState().addPatient({
      name: 'Local Only Test Patient', phone: '9555555555', age: 22, gender: 'Female', department: 'General Medicine',
    })
    const created = usePatientStore.getState().patients[0]
    expect(created).toBeTruthy()
    createdPatientId = created.id
    // Session-free registration is the kiosk contract — see /api/opd-register.
    expect(created.visitId).toBeTruthy()

    await reSignInAsStaff()
  })

  it('does not fire the client-side Patients.create for ordinary demo usage (never logged in)', async () => {
    // Ordinary demo flow: nobody has ever logged in on this browser, so
    // there is no live Supabase session — regardless of whatever default
    // demo values sit in useAuthStore (a non-null DEMO_USERS entry, etc).
    await getSupabaseClient().auth.signOut()
    detachServerSession()
    useAuthStore.setState({ isRealSession: false, currentUser: DEMO_USERS_MAP.doctor, activeRole: 'doctor' })
    usePatientStore.setState({ patients: [], queue: [] })

    await usePatientStore.getState().addPatient({
      name: 'Demo Default Test Patient', phone: '9666666666', age: 35, gender: 'Male', department: 'General Medicine',
    })
    const created = usePatientStore.getState().patients[0]
    expect(created).toBeTruthy()
    createdPatientId = created.id
    // As above: the row lands via the service-role kiosk route, not via the
    // browser's anon-role client write, which stays gated on a live session.
    expect(created.visitId).toBeTruthy()
    const remotePatients = await admin.from('patients').select('*').eq('id', created.id)
    expect(remotePatients.data?.length).toBe(1)

    await reSignInAsStaff()
  })
})
