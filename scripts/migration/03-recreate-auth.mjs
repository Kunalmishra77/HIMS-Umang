import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { MIG_DIR, logStep } from './lib.mjs';

const admin = createClient(process.env.NEW_SUPABASE_URL, process.env.NEW_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const oldUsers = JSON.parse(fs.readFileSync(`${MIG_DIR}/auth-users.json`, 'utf8'));

// Deterministic temp password per user (no Math.random — reproducible on resume).
const tempPw = (email) => 'Hims#' + Buffer.from(email).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 10) + '9';

const map = {}, pwLines = ['email,password'];
for (const u of oldUsers) {
  const password = tempPw(u.email);
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: u.raw_user_meta_data || {},
    app_metadata: u.raw_app_meta_data || {},
  });
  if (error) {
    // If the user already exists (resume), look them up instead of failing.
    if (String(error.message).toLowerCase().includes('already')) {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list.users.find(x => x.email === u.email);
      if (!found) { console.error(`FAILED ${u.email}: ${error.message}`); process.exit(1); }
      map[u.id] = found.id; logStep(`exists ${u.email} -> ${found.id}`); continue;
    }
    console.error(`FAILED ${u.email}: ${error.message}`); process.exit(1);
  }
  map[u.id] = data.user.id;
  pwLines.push(`${u.email},${password}`);
  logStep(`created ${u.email} -> ${data.user.id}`);
}
fs.writeFileSync(`${MIG_DIR}/usermap.json`, JSON.stringify(map, null, 2));
fs.writeFileSync(`${MIG_DIR}/temp-passwords.csv`, pwLines.join('\n'));
logStep(`mapped ${Object.keys(map).length} users`);
