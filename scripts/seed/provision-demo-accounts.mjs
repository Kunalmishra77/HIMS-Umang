// Tier 0 (T0.1b): provision one real Supabase account + profile per app role,
// so every portal can be exercised under a genuine (isRealSession) login.
// Idempotent: creates missing accounts, resets password + role metadata on
// existing ones, and upserts the matching profiles row. Env-var driven, no secrets.
//   Needs: NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY  (optional DEMO_PASSWORD)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@HIMS2026!';
const OUT = 'd:/tmp/hims-migration/demo-credentials.csv';

// role -> display identity (mirrors DEMO_USERS in src/store/useAuthStore.ts).
// This build ships exactly the six roles in src/types/roles.ts. The Supabase
// project is shared with Gov-HIMS, so provisioning roles beyond that set
// creates and repeatedly updates accounts belonging to a different product.
const ROLES = {
  doctor: ['Dr. Priya Nair', 'General Medicine'],
  nurse: ['Anjali Desai', 'General Ward'],
  reception: ['Sunita Joshi', 'Front Office'],
  billing: ['Suresh Nair', 'Billing Dept'],
  admin: ['Rajesh Kulkarni', 'Administration'],
  patient: ['Kiran Patil', 'Patient'],
};

const admin = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Build an email -> id index once (paginated) for the "already exists" path.
async function allUsers() {
  const map = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) map.set(u.email, u.id);
    if (data.users.length < 1000) break;
  }
  return map;
}

const existing = await allUsers();
const rows = ['role,email,password'];
let created = 0, updated = 0;

for (const [role, [full_name, department]] of Object.entries(ROLES)) {
  const email = `demo-${role}@example.test`;
  let id = existing.get(email);
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      password: PASSWORD, email_confirm: true,
      app_metadata: { role }, user_metadata: { full_name, department },
    });
    if (error) { console.error(`update ${email}: ${error.message}`); process.exit(1); }
    updated++;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email, password: PASSWORD, email_confirm: true,
      app_metadata: { role }, user_metadata: { full_name, department },
    });
    if (error) { console.error(`create ${email}: ${error.message}`); process.exit(1); }
    id = data.user.id; created++;
  }
  const { error: pErr } = await admin.from('profiles').upsert(
    { id, role, full_name, department, is_active: true }, { onConflict: 'id' });
  if (pErr) { console.error(`profile ${email}: ${pErr.message}`); process.exit(1); }
  rows.push(`${role},${email},${PASSWORD}`);
  console.log(`ok ${role} -> ${email}`);
}

fs.writeFileSync(OUT, rows.join('\n'));
console.log(`\nprovisioned ${Object.keys(ROLES).length} roles (created ${created}, updated ${updated})`);
console.log(`credentials written to ${OUT}`);

// The patient portal resolves identity through patients.auth_user_id (see
// src/lib/usePatientMe.ts). Without this link the demo patient signs in
// successfully and then sees an empty portal.
const DEMO_PATIENT_ROW = 'PT-20394';
const patientUserId = existing.get('demo-patient@example.test')
  ?? (await allUsers()).get('demo-patient@example.test');

if (patientUserId) {
  // The previous project's journey walk linked this account to a throwaway test
  // row (see docs/JOURNEY-TEST-DATA.md). auth_user_id has no uniqueness
  // constraint, so leaving it would give two rows the same owner and make
  // usePatientMe's lookup nondeterministic.
  const { error: clearErr } = await admin
    .from('patients')
    .update({ auth_user_id: null })
    .eq('auth_user_id', patientUserId)
    .neq('id', DEMO_PATIENT_ROW);
  if (clearErr) { console.error(`clear stray links: ${clearErr.message}`); process.exit(1); }

  const { error: linkErr } = await admin
    .from('patients')
    .update({ auth_user_id: patientUserId })
    .eq('id', DEMO_PATIENT_ROW);
  if (linkErr) { console.error(`link ${DEMO_PATIENT_ROW}: ${linkErr.message}`); process.exit(1); }
  console.log(`ok linked ${DEMO_PATIENT_ROW} -> demo-patient@example.test`);

  const { data: owned, error: ownErr } = await admin
    .from('patients').select('id').eq('auth_user_id', patientUserId);
  if (ownErr) { console.error(`verify link: ${ownErr.message}`); process.exit(1); }
  if (owned.length !== 1) {
    console.error(`expected exactly 1 patient linked to demo-patient, found ${owned.length}: ${owned.map(r => r.id).join(', ')}`);
    process.exit(1);
  }
  console.log(`ok verified exactly one patient row linked to demo-patient@example.test`);
} else {
  console.error('demo-patient user not found — cannot link patient record');
  process.exit(1);
}
