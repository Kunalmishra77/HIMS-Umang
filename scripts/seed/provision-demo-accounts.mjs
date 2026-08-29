// Tier 0 (T0.1b): provision one real Supabase account + profile per app role,
// so every portal can be exercised under a genuine (isRealSession) login.
// Idempotent: creates missing accounts, resets password + role metadata on
// existing ones, and upserts the matching profiles row. Env-var driven, no secrets.
//   Needs: NEW_SUPABASE_URL, NEW_SERVICE_ROLE_KEY  (optional DEMO_PASSWORD)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@HIMS2026!';
const OUT = 'd:/tmp/hims-migration/demo-credentials.csv';

// role -> display identity (mirrors DEMO_USERS in src/store/useAuthStore.ts)
const ROLES = {
  doctor: ['Dr. Priya Nair', 'General Medicine'],
  nurse: ['Anjali Desai', 'General Ward'],
  pharmacy: ['Ritu Sharma', 'Pharmacy'],
  lab: ['Neha Gupta', 'Pathology'],
  radiology: ['Dr. Sameer Khan', 'Radiology'],
  emergency: ['Dr. Vikram Rathore', 'Emergency Room'],
  reception: ['Sunita Joshi', 'Front Office'],
  bed_manager: ['Aditi Verma', 'Admission Desk'],
  discharge: ['Meena Agarwal', 'Discharge Desk'],
  ot: ['Dr. Anisha Sharma', 'Operation Theater'],
  billing: ['Suresh Nair', 'Billing Dept'],
  insurance: ['Karan Patel', 'TPA Desk'],
  admin: ['Rajesh Kulkarni', 'Administration'],
  hr: ['Anita Rao', 'Human Resources'],
  quality: ['Dr. Lalitha Iyer', 'Quality & Compliance'],
  feedback_analyst: ['Preethi Menon', 'Patient Experience'],
  housekeeping: ['Ramesh Kumar', 'Housekeeping'],
  inventory: ['Vikram Singh', 'Procurement'],
  vendor_manager: ['Arun Kapoor', 'Procurement & Vendor Management'],
  blood_bank: ['Dr. Pooja Srivastava', 'Blood Bank'],
  cssd: ['Shalini Mehta', 'CSSD'],
  dietary: ['Nalini Bose', 'Dietary & Nutrition'],
  bmw: ['Ganesh Rao', 'Bio-Medical Waste'],
  mortuary: ['Shyam Tiwari', 'Mortuary'],
  ambulance: ['Deepak Pandey', 'Ambulance Services'],
  audit_officer: ['Preethi Krishnan', 'Audit & Compliance'],
  patient: ['Kiran Patil', 'Patient'],
  cmo: ['Dr. Rajesh Sharma', 'CMHO Bhopal'],
  secretary: ['Smt. Anuradha Verma', 'Principal Secretary Health, MP'],
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
