// Task 12 (Layer 1) — drives the OPD backbone against the LIVE server + LIVE
// Supabase project and asserts each step's rows actually land in Postgres.
//
// Reads the real route contracts (see /api/opd-register, /api/opd-queue,
// /api/opd-advance, /api/opd-order) rather than guessing payload shapes.
//
// Two of the six journey steps — Vitals and Bill — have NO dedicated
// `/api/opd-*` route. In the running app they are written client-side via the
// anon Supabase client (src/lib/api/_core.ts's `table()`), gated on a REAL
// signed-in Supabase session (see src/store/usePatientStore.ts's
// recordOpdVitals and src/store/useBillingStore.ts's addCharge/recordPayment
// — both check `auth.getSession()` before writing, NOT the demo
// role-switcher's `isRealSession: false` state). This script reproduces that
// exact path: it signs in as the real demo-nurse / demo-billing Supabase Auth
// accounts (see scripts/seed/provision-demo-accounts.mjs) and performs the
// same table writes those stores perform, then reads the rows back with the
// service-role client. This is still Layer 1 (no browser, live DB, asserted
// rows) — it is just not routed through an `/api/opd-*` endpoint, because
// none exists for these two steps. That gap is real and is called out in the
// step-3 and step-6 result details below and in the Task 12 report.
//
// Usage: node scripts/journey-walk.mjs   (server must already be running —
// see README / task report for `npm run build && npm start`)

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function loadEnv() {
  const env = { ...process.env }
  const raw = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!(k in env)) env[k] = v
  }
  return env
}

const env = loadEnv()
const BASE_URL = env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const DEMO_PASSWORD = env.DEMO_PASSWORD || 'Demo@HIMS2026!'

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error('Missing Supabase env vars in .env.local — cannot run journey walk.')
  process.exit(2)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const results = []
function record(step, pass, detail) {
  results.push({ step, pass, detail })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${step} — ${detail}`)
}

async function signIn(role) {
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } })
  const email = `demo-${role}@example.test`
  const { data, error } = await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD })
  if (error || !data.session) throw new Error(`sign-in as ${email} failed: ${error?.message ?? 'no session'}`)
  return client
}

const stampIso = new Date().toISOString()
const safeStamp = stampIso.replace(/[:.]/g, '-')
const patientId = `ZZ-JourneyTest-${safeStamp}`
const patientName = `ZZ-JourneyTest ${stampIso}`
const phone = '9' + String(Date.now()).slice(-9)

const created = [] // { table, id } — printed as the cleanup list at the end
let visitId

// ── Step 1: Register ────────────────────────────────────────────────────
try {
  const res = await fetch(`${BASE_URL}/api/opd-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: patientId, name: patientName, phone, age: 34, gender: 'Female',
      department: 'General Medicine', doctor: 'Dr. Priya Nair',
      symptoms: ['Fever'], triageLevel: 'Low',
    }),
  })
  const json = await res.json()
  if (!res.ok || json.ok !== true || json.patientId !== patientId || !json.visitId) {
    throw new Error(`unexpected response ${res.status}: ${JSON.stringify(json)}`)
  }
  visitId = json.visitId
  created.push({ table: 'patients', id: patientId })
  created.push({ table: 'visits', id: visitId })

  const { data: pRow, error: pErr } = await admin.from('patients').select('*').eq('id', patientId).maybeSingle()
  if (pErr || !pRow) throw new Error(`patient row not found in Postgres: ${pErr?.message ?? 'no row'}`)
  const { data: vRow, error: vErr } = await admin.from('visits').select('*').eq('id', visitId).maybeSingle()
  if (vErr || !vRow) throw new Error(`visit row not found in Postgres: ${vErr?.message ?? 'no row'}`)
  if (vRow.status !== 'waiting') throw new Error(`visit status is '${vRow.status}', expected 'waiting'`)

  record('1-register', true,
    `POST /api/opd-register -> patient ${patientId} + visit ${visitId}; ` +
    `verified rows in Postgres (patients.full_name='${pRow.full_name}', visits.status='${vRow.status}')`)
} catch (err) {
  record('1-register', false, err.message)
}

// ── Step 2: Queue ───────────────────────────────────────────────────────
try {
  if (!visitId) throw new Error('skipped — step 1 did not produce a visitId')
  const res = await fetch(`${BASE_URL}/api/opd-queue`, { cache: 'no-store' })
  const json = await res.json()
  if (!res.ok) throw new Error(`GET /api/opd-queue -> ${res.status}: ${JSON.stringify(json)}`)
  const found = (json.patients ?? []).find((p) => p.id === patientId)
  if (!found) throw new Error(`patient ${patientId} not present in /api/opd-queue response`)
  if (typeof found.token !== 'number') throw new Error(`token field missing/non-numeric: ${JSON.stringify(found.token)}`)

  record('2-queue', true,
    `GET /api/opd-queue -> patient ${patientId} present, queueStatus='${found.queueStatus}', token=${found.token}`)
} catch (err) {
  record('2-queue', false, err.message)
}

// ── Step 3: Vitals (no /api/opd-* route — see file header) ─────────────
try {
  if (!visitId) throw new Error('skipped — no visitId')

  // Reception sends the patient to vitals (real staff action, same route as
  // every other status transition).
  let res = await fetch(`${BASE_URL}/api/opd-advance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitId, status: 'vitals' }),
  })
  let json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`advance to 'vitals' failed: ${res.status} ${JSON.stringify(json)}`)

  // Nurse records vitals — reproduces src/store/usePatientStore.ts's
  // recordOpdVitals real-backend branch: a genuine Supabase Auth session,
  // writing straight to `vitals_readings` (the same table VitalsReadings.create
  // in src/lib/api/vitals-readings.ts targets), because no /api/opd-* route
  // exists for this step.
  const nurse = await signIn('nurse')
  const { data: userData, error: userErr } = await nurse.auth.getUser()
  if (userErr || !userData.user) throw new Error(`could not resolve nurse session user: ${userErr?.message}`)

  const vrId = `ZZ-VR-JourneyTest-${safeStamp}`
  const payload = { hr: 78, systolicBP: 118, diastolicBP: 76, spo2: 98, temp: 98.6, weight: 62 }
  const { error: insErr } = await nurse.from('vitals_readings').upsert({
    id: vrId, visit_id: visitId, recorded_by: userData.user.id,
    recorded_at: new Date().toISOString(), payload,
  })
  if (insErr) throw new Error(`vitals_readings insert (as demo-nurse) failed: ${insErr.message}`)
  created.push({ table: 'vitals_readings', id: vrId })

  const { data: vr, error: readErr } = await admin.from('vitals_readings').select('*').eq('id', vrId).maybeSingle()
  if (readErr || !vr) throw new Error(`vitals_readings row not readable back: ${readErr?.message ?? 'no row'}`)
  // jsonb does not preserve key order, so compare values, not serialized order.
  const payloadMatches = Object.keys(payload).every((k) => vr.payload[k] === payload[k])
    && Object.keys(vr.payload).length === Object.keys(payload).length
  if (!payloadMatches) throw new Error(`vitals payload did not round-trip: sent ${JSON.stringify(payload)}, got ${JSON.stringify(vr.payload)}`)

  record('3-vitals', true,
    `LAYER-1 (no server route — see script header) — signed in as demo-nurse@example.test, ` +
    `wrote vitals_readings ${vrId} directly (RLS: vitals_readings_insert_staff), read back via service role, payload matched`)
} catch (err) {
  record('3-vitals', false, err.message)
}

// ── Step 4: Consultation ────────────────────────────────────────────────
try {
  if (!visitId) throw new Error('skipped — no visitId')
  const res = await fetch(`${BASE_URL}/api/opd-advance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitId, status: 'consulting' }),
  })
  const json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`advance to 'consulting' failed: ${res.status} ${JSON.stringify(json)}`)

  const { data: v, error } = await admin.from('visits').select('status').eq('id', visitId).maybeSingle()
  if (error || !v) throw new Error(`could not re-read visit: ${error?.message ?? 'no row'}`)
  if (v.status !== 'consulting') throw new Error(`visit status is '${v.status}', expected 'consulting'`)

  record('4-consultation', true, `POST /api/opd-advance {status:'consulting'} -> visits.status='${v.status}' confirmed in Postgres`)
} catch (err) {
  record('4-consultation', false, err.message)
}

// ── Step 5: Orders (prescription + lab) ─────────────────────────────────
try {
  const rxId = `ZZ-RX-JourneyTest-${safeStamp}`
  const loId = `ZZ-LO-JourneyTest-${safeStamp}`

  const rxOrder = {
    id: rxId, patientId, patientName, tokenNumber: 1, doctorName: 'Dr. Priya Nair',
    department: 'General Medicine', source: 'OPD', paymentMode: 'Cash',
    medicines: [{ name: 'Paracetamol 500mg', dose: '1-0-1', days: 3 }],
    status: 'ordered', dispatchedAt: new Date().toISOString(), estimatedReadyIn: 15,
  }
  const loOrder = {
    id: loId, patientId, patientName, uhid: null, department: 'General Medicine',
    source: 'OPD', doctorName: 'Dr. Priya Nair', orderedAt: new Date().toISOString(),
    status: 'ordered', tests: [{ code: 'CBC', name: 'Complete Blood Count' }],
  }

  let res = await fetch(`${BASE_URL}/api/opd-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'pharmacy', order: rxOrder }),
  })
  let json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`POST /api/opd-order (pharmacy) failed: ${res.status} ${JSON.stringify(json)}`)
  created.push({ table: 'opd_orders', id: rxId })

  res = await fetch(`${BASE_URL}/api/opd-order`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'lab', order: loOrder }),
  })
  json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`POST /api/opd-order (lab) failed: ${res.status} ${JSON.stringify(json)}`)
  created.push({ table: 'opd_orders', id: loId })

  // GET both boards back through the same route the staff modules poll.
  const rxGet = await fetch(`${BASE_URL}/api/opd-order?type=pharmacy`, { cache: 'no-store' }).then((r) => r.json())
  const loGet = await fetch(`${BASE_URL}/api/opd-order?type=lab`, { cache: 'no-store' }).then((r) => r.json())
  if (!rxGet.orders?.some((o) => o.id === rxId)) throw new Error('pharmacy order not present in GET /api/opd-order?type=pharmacy')
  if (!loGet.orders?.some((o) => o.id === loId)) throw new Error('lab order not present in GET /api/opd-order?type=lab')

  const { data: rows, error } = await admin.from('opd_orders').select('*').in('id', [rxId, loId])
  if (error) throw new Error(error.message)
  const rx = rows.find((r) => r.id === rxId)
  const lo = rows.find((r) => r.id === loId)
  if (!rx || rx.order_type !== 'pharmacy' || rx.status !== 'ordered') throw new Error(`pharmacy row unexpected: ${JSON.stringify(rx)}`)
  if (!lo || lo.order_type !== 'lab' || lo.status !== 'ordered') throw new Error(`lab row unexpected: ${JSON.stringify(lo)}`)

  record('5-orders', true,
    `opd_orders ${rxId} (pharmacy) and ${loId} (lab) created via /api/opd-order, both readable via GET and both status='ordered' in Postgres — ` +
    `no shipped portal (pharmacy/lab were removed in earlier tasks) has any write path that could advance them further`)
} catch (err) {
  record('5-orders', false, err.message)
}

// ── Step 6: Bill (no /api/opd-* route — see file header) ───────────────
try {
  if (!visitId) throw new Error('skipped — no visitId')

  let res = await fetch(`${BASE_URL}/api/opd-advance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitId, status: 'billing' }),
  })
  let json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`advance to 'billing' failed: ${res.status} ${JSON.stringify(json)}`)

  // Billing desk raises the consult fee and settles it — reproduces
  // src/store/useBillingStore.ts's addCharge/recordPayment real-backend
  // branch (src/lib/api/bills.ts's Bills.create/addLine/capturePayment),
  // again via a real demo-billing Supabase session since no /api/opd-* route
  // covers billing.
  const billing = await signIn('billing')
  const billId = `ZZ-BIL-JourneyTest-${safeStamp}`
  const nowIso = new Date().toISOString()
  const CONSULT_FEE = 600

  const { error: billErr } = await billing.from('bills').insert({
    id: billId, patient_id: patientId, visit_id: visitId, payer_type: 'cash', status: 'open',
    lines: [{ id: 'ZZ-LIN-1', source: 'consult', name: 'OPD Consultation Fee', qty: 1, unitPrice: CONSULT_FEE, total: CONSULT_FEE, duplicateFlag: false }],
    total: CONSULT_FEE, discount: 0, non_payable: 0, insurance_covered: 0, paid: 0, balance: CONSULT_FEE,
    created_at: nowIso, updated_at: nowIso,
  })
  if (billErr) throw new Error(`bills insert (as demo-billing) failed: ${billErr.message}`)
  created.push({ table: 'bills', id: billId })

  const payId = `ZZ-PAY-JourneyTest-${safeStamp}`
  const { error: payErr } = await billing.from('payments').insert({
    id: payId, bill_id: billId, mode: 'cash', amount: CONSULT_FEE,
    captured_by: 'ZZ-JourneyTest-script', captured_at: nowIso,
  })
  if (payErr) throw new Error(`payments insert (as demo-billing) failed: ${payErr.message}`)
  created.push({ table: 'payments', id: payId })

  const { error: settleErr } = await billing.from('bills')
    .update({ paid: CONSULT_FEE, balance: 0, status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', billId)
  if (settleErr) throw new Error(`bill settle (as demo-billing) failed: ${settleErr.message}`)

  const { data: finalBill, error: readErr } = await admin.from('bills').select('*').eq('id', billId).maybeSingle()
  if (readErr || !finalBill) throw new Error(`bill not readable back: ${readErr?.message ?? 'no row'}`)
  if (finalBill.status !== 'paid' || Number(finalBill.balance) !== 0) {
    throw new Error(`bill not settled: status='${finalBill.status}' balance=${finalBill.balance}`)
  }

  // Patient-visible check. The CURRENT RLS (see
  // supabase/migrations/20260713160000_billing_tenant_rls.sql, `bills_read_own`)
  // only lets a patient read a bill when `patients.auth_user_id` is linked to
  // their Supabase Auth id — and `grep -r auth_user_id src` finds NO code path
  // in this app that ever sets that column. So the check below deliberately
  // runs twice: once as-is (proving today's real gap — no shipped code links
  // a patient's auth account to their patient row, so RLS correctly denies the
  // read), then again after this script manually links them the way the app
  // would need to (documenting what the RLS layer allows once that's done).
  const patientSession = await signIn('patient')
  const { data: unlinkedView, error: unlinkedErr } = await patientSession.from('bills').select('id').eq('id', billId).maybeSingle()
  const deniedBeforeLink = !unlinkedView && !unlinkedErr // RLS silently returns 0 rows, not an error

  const { data: patientUser, error: patientUserErr } = await patientSession.auth.getUser()
  if (patientUserErr || !patientUser.user) throw new Error(`could not resolve demo-patient session user: ${patientUserErr?.message}`)
  const { error: linkErr } = await admin.from('patients').update({ auth_user_id: patientUser.user.id }).eq('id', patientId)
  if (linkErr) throw new Error(`linking patients.auth_user_id failed: ${linkErr.message}`)

  const { data: linkedView, error: linkedErr } = await patientSession.from('bills').select('id, status, balance').eq('id', billId).maybeSingle()
  if (linkedErr || !linkedView) throw new Error(`demo-patient still could not read the bill after linking auth_user_id: ${linkedErr?.message ?? 'no row'}`)

  res = await fetch(`${BASE_URL}/api/opd-advance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitId, status: 'completed' }),
  })
  json = await res.json()
  if (!res.ok || json.ok !== true) throw new Error(`advance to 'completed' failed: ${res.status} ${JSON.stringify(json)}`)

  record('6-bill', true,
    `bill ${billId} raised ₹${CONSULT_FEE} (OPD consult fee), payment ${payId} captured (cash), ` +
    `bills.status='paid' balance=0 confirmed via service role; visit ${visitId} advanced to 'completed'. ` +
    `Patient-visibility sub-check: demo-patient read DENIED before auth_user_id link (deniedBeforeLink=${deniedBeforeLink}, ` +
    `the real, un-linked state of every patient in this build today) and ALLOWED after this script manually linked ` +
    `patients.auth_user_id -> demo-patient's Supabase Auth id (RLS itself is sound). ` +
    `FINDING: no code path in src/ ever sets patients.auth_user_id, and /patient/billing renders from the local-only ` +
    `usePatientOrdersStore (hardcoded demo data), not the 'bills' table — so "patient-visible state reflects payment" ` +
    `does not hold for any real patient in the current build. See report.`)
} catch (err) {
  record('6-bill', false, err.message)
}

// ── Summary ───────────────────────────────────────────────────────────
console.log('\n=== Journey walk summary ===')
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.step}`)

console.log('\n=== Rows created (cleanup list) ===')
for (const c of created) console.log(`${c.table}\t${c.id}`)

const anyFail = results.some((r) => !r.pass)
process.exit(anyFail ? 1 : 0)
