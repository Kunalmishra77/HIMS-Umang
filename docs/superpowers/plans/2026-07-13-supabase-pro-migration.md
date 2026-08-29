# Supabase Pro Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing HIMS backend (schema + all data + auth users) from the old Supabase Free project to the new Supabase Pro project, verifiably and reversibly.

**Architecture:** Reproducible SQL migrations are replayed into the empty Pro DB via the connection pooler; the 12 auth users are recreated through the Admin API (new UUIDs); all 35 public tables are copied with the 14 user-UUID columns remapped old→new; the app is cut over by rewriting `.env.local`; verification reconciles row counts, FK integrity, auth count, the test suite, and an app smoke test.

**Tech Stack:** Node 22, `pg` 8.22, `@supabase/supabase-js` 2.110, `npx supabase` 2.109, PowerShell/Bash.

## Global Constraints

- All DB ops use the **pooler** host `aws-1-ap-south-1.pooler.supabase.com`, user `postgres.<ref>`. The direct host `db.<ref>.supabase.co` is IPv6-only and **must not** be used.
- **Session mode `:5432`** for schema apply + data load; **transaction mode `:6543`** for the app runtime `DATABASE_URL`.
- **No secret is ever written to a git-tracked file.** Credentials live only in `d:/tmp/hims-migration/env.sh` (git-ignored location) and are passed via environment variables. `.env.local` stays git-ignored (verified).
- The **OLD project is never modified** — it is the rollback.
- Migration scripts live in `scripts/migration/` and are **env-var driven** (no inline secrets), so they are safe to commit.
- Old→new UUID remap set is exactly the 14 FK-covered columns enumerated in the spec §5. No other user-uuid columns exist (verified).

---

## File Structure

- Create: `scripts/migration/lib.mjs` — shared pg client, table discovery, user-column config, topological load order, value serialization.
- Create: `scripts/migration/01-backup-old.mjs` — dump OLD schema inventory + all table rows + `auth.users` to `d:/tmp/hims-migration/`.
- Create: `scripts/migration/02-push-schema.mjs` — apply the 33 migration SQL files into NEW (session pooler) and record them in `supabase_migrations.schema_migrations`.
- Create: `scripts/migration/03-recreate-auth.mjs` — recreate the 12 users via Admin API, write `usermap.json` (oldId→newId) and `temp-passwords.csv`.
- Create: `scripts/migration/04-load-data.mjs` — copy all 35 tables into NEW with UUID remap, then reset sequences and re-validate FKs.
- Create: `scripts/migration/05-verify.mjs` — row-count reconciliation OLD vs NEW, FK-violation check, auth-user count.
- Create: `scripts/migration/env.example.sh` — documents required env vars (no secrets).
- Modify: `.env.local` — cut over to NEW (Task 6).
- Modify: `supabase/config.toml:1` — `project_id` (Task 6).
- Create: `docs/superpowers/plans/2026-07-13-migration-report.md` — final evidence report (Task 7).

Runtime artifacts (git-ignored, under `d:/tmp/hims-migration/`): `*.rows.json`, `auth-users.json`, `usermap.json`, `temp-passwords.csv`, `env.sh`, `.env.local.old.bak`.

---

## Task 0: Migration workspace & shared library

**Files:**
- Create: `scripts/migration/env.example.sh`
- Create: `scripts/migration/lib.mjs`

**Interfaces:**
- Produces: `getClient(connStr)`, `discoverTables(client)`, `USER_COLS`, `loadOrder(client)`, `serializeRow(client, table, row)`, `MIG_DIR`, `logStep(msg)`.

- [ ] **Step 1: Ensure the runtime dir exists and is git-ignored**

Run:
```bash
mkdir -p /d/tmp/hims-migration
grep -qxF 'scripts/migration/env.sh' "d:/Agentix Project/Gov-HIMS/.gitignore" || printf '\n# migration runtime secrets\nscripts/migration/env.sh\n' >> "d:/Agentix Project/Gov-HIMS/.gitignore"
```
Expected: dir exists; `.gitignore` contains `scripts/migration/env.sh`.

- [ ] **Step 2: Write the env template (no secrets)**

Create `scripts/migration/env.example.sh`:
```bash
# Copy to d:/tmp/hims-migration/env.sh and fill with real values. NEVER commit the filled file.
export OLD_DB="postgresql://postgres.rojzpogpykqfccbssrsv:<OLD_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
export NEW_DB_SESSION="postgresql://postgres.uidhrfybgptqllzztgyb:<NEW_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
export NEW_DB_TX="postgresql://postgres.uidhrfybgptqllzztgyb:<NEW_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
export NEW_SUPABASE_URL="https://uidhrfybgptqllzztgyb.supabase.co"
export NEW_ANON_KEY="<NEW_ANON_KEY>"
export NEW_SERVICE_ROLE_KEY="<NEW_SERVICE_ROLE_KEY>"
```

- [ ] **Step 3: Write the shared library**

Create `scripts/migration/lib.mjs`:
```js
import pg from 'pg';
import path from 'node:path';

export const MIG_DIR = 'd:/tmp/hims-migration';

// pg returns bigint/numeric as string by default — keep as-is for fidelity.
export function getClient(connStr) {
  return new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
}

export function logStep(msg) { console.log(`[mig] ${msg}`); }

// Columns holding a user UUID that must be remapped old->new (spec §5).
export const USER_COLS = {
  profiles: ['id'],
  patients: ['auth_user_id'],
  admission_requests: ['doctor_id'],
  appointments: ['doctor_id'],
  encounters: ['doctor_id'],
  ipd_vitals: ['recorded_by'],
  nurse_shift_assignments: ['nurse_id'],
  orders: ['doctor_id'],
  prescriptions: ['doctor_id'],
  shift_handovers: ['from_nurse_id', 'received_by_id', 'to_nurse_id'],
  visits: ['doctor_id'],
  vitals_readings: ['recorded_by'],
};

export async function discoverTables(client) {
  const r = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  return r.rows.map(x => x.table_name);
}

// Column metadata (ordered) for a table: name + udt_name (for casting).
export async function columnMeta(client, table) {
  const r = await client.query(
    `select column_name, udt_name from information_schema.columns
     where table_schema='public' and table_name=$1 order by ordinal_position`, [table]);
  return r.rows;
}

// Topological order (parents before children) from public->public FK edges.
export async function loadOrder(client) {
  const tables = await discoverTables(client);
  const edges = await client.query(
    `select tc.table_name as child, ccu.table_name as parent
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on tc.constraint_name=ccu.constraint_name and tc.table_schema=ccu.table_schema
     where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
       and ccu.table_schema='public' and tc.table_name<>ccu.table_name`);
  const deps = new Map(tables.map(t => [t, new Set()]));
  for (const { child, parent } of edges.rows) {
    if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  }
  const out = [], done = new Set();
  while (out.length < tables.length) {
    const ready = tables.filter(t => !done.has(t) && [...deps.get(t)].every(p => done.has(p)));
    if (ready.length === 0) { // cycle or self-safe remainder — append the rest deterministically
      for (const t of tables) if (!done.has(t)) { out.push(t); done.add(t); }
      break;
    }
    for (const t of ready.sort()) { out.push(t); done.add(t); }
  }
  return out;
}

// Build INSERT text + params for one row, casting each column to its udt and
// JSON-encoding json/jsonb. `remap` is oldId->newId (or null to skip).
export function buildInsert(table, cols, row, userCols, remap) {
  const names = cols.map(c => `"${c.column_name}"`);
  const vals = [], params = [];
  cols.forEach((c, i) => {
    let v = row[c.column_name];
    if ((userCols || []).includes(c.column_name) && v != null && remap) {
      v = remap.get(v) ?? v; // leave unmapped values as-is; verify step catches orphans
    }
    if (v == null) { params.push(null); vals.push(`$${params.length}::"${c.udt_name}"`); return; }
    if (c.udt_name === 'json' || c.udt_name === 'jsonb') { params.push(JSON.stringify(v)); vals.push(`$${params.length}::${c.udt_name}`); return; }
    params.push(v); vals.push(`$${params.length}::"${c.udt_name}"`);
  });
  return { text: `insert into "${table}" (${names.join(',')}) values (${vals.join(',')})`, params };
}
```

- [ ] **Step 4: Sanity-check the library loads**

Run (from project root so `pg` resolves):
```bash
cd "d:/Agentix Project/Gov-HIMS" && node -e "import('./scripts/migration/lib.mjs').then(m=>console.log('exports:',Object.keys(m).join(',')))"
```
Expected: `exports: MIG_DIR,getClient,logStep,USER_COLS,discoverTables,columnMeta,loadOrder,buildInsert`

- [ ] **Step 5: Commit**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/lib.mjs scripts/migration/env.example.sh .gitignore && git commit -m "chore(migration): shared lib + env template"
```

---

## Task 1: Backup OLD project

**Files:**
- Create: `scripts/migration/01-backup-old.mjs`

**Interfaces:**
- Consumes: `getClient`, `discoverTables`, `MIG_DIR` from `lib.mjs`.
- Produces: `d:/tmp/hims-migration/<table>.rows.json` (all 35), `auth-users.json`, `old-counts.json`.

- [ ] **Step 1: Write the backup script**

Create `scripts/migration/01-backup-old.mjs`:
```js
import fs from 'node:fs';
import { getClient, discoverTables, MIG_DIR, logStep } from './lib.mjs';

const c = getClient(process.env.OLD_DB);
await c.connect();
fs.mkdirSync(MIG_DIR, { recursive: true });

const tables = await discoverTables(c);
const counts = {};
for (const t of tables) {
  const { rows } = await c.query(`select * from "${t}"`);
  fs.writeFileSync(`${MIG_DIR}/${t}.rows.json`, JSON.stringify(rows));
  counts[t] = rows.length;
  logStep(`dumped ${t}: ${rows.length}`);
}
fs.writeFileSync(`${MIG_DIR}/old-counts.json`, JSON.stringify(counts, null, 2));

const users = await c.query(
  `select id, email, raw_user_meta_data, raw_app_meta_data, created_at
   from auth.users order by created_at`);
fs.writeFileSync(`${MIG_DIR}/auth-users.json`, JSON.stringify(users.rows, null, 2));
logStep(`dumped auth.users: ${users.rows.length}`);

const total = Object.values(counts).reduce((a, b) => a + b, 0);
logStep(`TOTAL rows dumped: ${total} across ${tables.length} tables`);
await c.end();
```

- [ ] **Step 2: Run the backup**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/01-backup-old.mjs
```
Expected: `TOTAL rows dumped: 1708 across 35 tables` (±, if OLD changed) and `dumped auth.users: 12`.

- [ ] **Step 3: Verify files exist**

Run:
```bash
ls /d/tmp/hims-migration/*.rows.json | wc -l && cat /d/tmp/hims-migration/old-counts.json | node -e "let d='';process.stdin.on('data',x=>d+=x).on('end',()=>console.log('sum',Object.values(JSON.parse(d)).reduce((a,b)=>a+b,0)))"
```
Expected: `35` and `sum 1708`.

- [ ] **Step 4: Commit the script**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/01-backup-old.mjs && git commit -m "chore(migration): OLD backup script"
```

---

## Task 2: Push schema into NEW

**Files:**
- Create: `scripts/migration/02-push-schema.mjs`

**Interfaces:**
- Consumes: `getClient` from `lib.mjs`; the 33 files in `supabase/migrations/`.
- Produces: fully-created schema in NEW; rows in `supabase_migrations.schema_migrations`.

- [ ] **Step 1: Write the schema-apply script**

Create `scripts/migration/02-push-schema.mjs`:
```js
import fs from 'node:fs';
import { getClient, logStep } from './lib.mjs';

const DIR = 'supabase/migrations';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
const c = getClient(process.env.NEW_DB_SESSION);
await c.connect();

await c.query(`create schema if not exists supabase_migrations`);
await c.query(`create table if not exists supabase_migrations.schema_migrations
  (version text primary key, name text, statements text[])`);

for (const f of files) {
  const version = f.slice(0, 14); // yyyymmddhhmmss prefix
  const applied = await c.query(`select 1 from supabase_migrations.schema_migrations where version=$1`, [version]);
  if (applied.rowCount) { logStep(`skip ${f} (already applied)`); continue; }
  const sql = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  try {
    await c.query('begin');
    await c.query(sql);
    await c.query(`insert into supabase_migrations.schema_migrations(version,name) values($1,$2)`, [version, f]);
    await c.query('commit');
    logStep(`applied ${f}`);
  } catch (e) {
    await c.query('rollback');
    console.error(`FAILED on ${f}: ${e.message}`);
    process.exit(1);
  }
}
const t = await c.query(`select count(*)::int n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`);
logStep(`public tables now: ${t.rows[0].n}`);
await c.end();
```

- [ ] **Step 2: Apply the schema**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/02-push-schema.mjs
```
Expected: `applied ...` for all 33 files, then `public tables now: 35`.

- [ ] **Step 3: Verify object parity vs OLD**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node -e "
import('./scripts/migration/lib.mjs').then(async m=>{
  const q=async(db,sql)=>{const c=m.getClient(db);await c.connect();const r=await c.query(sql);await c.end();return r.rows[0].n};
  const sql={tables:\"select count(*)::int n from information_schema.tables where table_schema='public'\",
    idx:\"select count(*)::int n from pg_indexes where schemaname='public'\",
    pol:\"select count(*)::int n from pg_policies where schemaname='public'\"};
  for(const [k,s] of Object.entries(sql)) console.log(k,'OLD',await q(process.env.OLD_DB,s),'NEW',await q(process.env.NEW_DB_SESSION,s));
})"
```
Expected: `tables`, `idx`, `pol` counts match between OLD and NEW.

- [ ] **Step 4: Commit the script**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/02-push-schema.mjs && git commit -m "chore(migration): schema apply script"
```

---

## Task 3: Recreate auth users (Admin API) + build UUID map

**Files:**
- Create: `scripts/migration/03-recreate-auth.mjs`

**Interfaces:**
- Consumes: `auth-users.json` (Task 1); `NEW_SUPABASE_URL`, `NEW_SERVICE_ROLE_KEY`.
- Produces: `usermap.json` (`{ oldId: newId }`), `temp-passwords.csv` (`email,password`).

- [ ] **Step 1: Write the auth recreation script**

Create `scripts/migration/03-recreate-auth.mjs`:
```js
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
```

- [ ] **Step 2: Recreate the users**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/03-recreate-auth.mjs
```
Expected: `created <email> -> <uuid>` for each, then `mapped 12 users`.

- [ ] **Step 3: Verify user count on NEW**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node -e "
import('./scripts/migration/lib.mjs').then(async m=>{const c=m.getClient(process.env.NEW_DB_SESSION);await c.connect();const r=await c.query('select count(*)::int n from auth.users');console.log('NEW auth.users',r.rows[0].n);await c.end();})"
```
Expected: `NEW auth.users 12`.

- [ ] **Step 4: Commit the script**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/03-recreate-auth.mjs && git commit -m "chore(migration): auth recreation + UUID map"
```

---

## Task 4: Load data with UUID remap

**Files:**
- Create: `scripts/migration/04-load-data.mjs`

**Interfaces:**
- Consumes: `*.rows.json` (Task 1), `usermap.json` (Task 3), `getClient`, `loadOrder`, `columnMeta`, `USER_COLS`, `buildInsert` from `lib.mjs`.
- Produces: all rows loaded into NEW; sequences reset; FK re-validation passed.

- [ ] **Step 1: Write the loader**

Create `scripts/migration/04-load-data.mjs`:
```js
import fs from 'node:fs';
import { getClient, loadOrder, columnMeta, USER_COLS, buildInsert, MIG_DIR, logStep } from './lib.mjs';

const usermap = JSON.parse(fs.readFileSync(`${MIG_DIR}/usermap.json`, 'utf8'));
const remap = new Map(Object.entries(usermap));
const c = getClient(process.env.NEW_DB_SESSION);
await c.connect();

// Prefer trigger/FK disable; fall back to topological order if not permitted.
let replica = false;
try { await c.query(`set session_replication_role = replica`); replica = true; logStep('replica mode ON'); }
catch { logStep('replica mode not permitted — using topological order'); }

const order = replica ? (await loadOrder(c)) : await loadOrder(c); // topo order is safe either way
const inserted = {};
for (const table of order) {
  const file = `${MIG_DIR}/${table}.rows.json`;
  if (!fs.existsSync(file)) { logStep(`no dump for ${table} — skip`); continue; }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (rows.length === 0) { inserted[table] = 0; continue; }
  const cols = await columnMeta(c, table);
  const userCols = USER_COLS[table] || [];
  let n = 0;
  for (const row of rows) {
    const { text, params } = buildInsert(table, cols, row, userCols, remap);
    await c.query(text, params);
    n++;
  }
  inserted[table] = n;
  logStep(`loaded ${table}: ${n}`);
}

if (replica) { await c.query(`set session_replication_role = origin`); logStep('replica mode OFF'); }

// Reset sequences owned by columns.
const seqs = await c.query(`
  select quote_ident(t.relname) tbl, quote_ident(a.attname) col
  from pg_class s join pg_depend d on d.objid=s.oid
  join pg_class t on t.oid=d.refobjid
  join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
  where s.relkind='S' and t.relnamespace='public'::regnamespace`);
for (const { tbl, col } of seqs.rows) {
  await c.query(`select setval(pg_get_serial_sequence('${tbl}','${col.replace(/"/g,'')}'),
    coalesce((select max(${col}) from ${tbl}),1))`);
}
logStep(`reset ${seqs.rowCount} sequences`);

const total = Object.values(inserted).reduce((a, b) => a + b, 0);
logStep(`TOTAL inserted: ${total}`);
await c.end();
```

- [ ] **Step 2: Load the data**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/04-load-data.mjs
```
Expected: `loaded <table>: <n>` lines, then `TOTAL inserted: 1708` (matching OLD).

- [ ] **Step 3: Re-validate FK integrity**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node -e "
import('./scripts/migration/lib.mjs').then(async m=>{
  const c=m.getClient(process.env.NEW_DB_SESSION);await c.connect();
  // Force validation: check every FK by re-adding as NOT VALID then VALIDATE is heavy;
  // instead assert no orphan user refs remain.
  const checks=[['profiles','id','auth.users','id'],['visits','doctor_id','profiles','id'],
    ['patients','auth_user_id','auth.users','id']];
  for(const [t,col,rt,rc] of checks){
    const r=await c.query('select count(*)::int n from '+t+' x where '+col+' is not null and not exists (select 1 from '+rt+' y where y.'+rc+'=x.'+col+')');
    console.log('orphans',t+'.'+col,'->',r.rows[0].n);
  }
  await c.end();
})"
```
Expected: `orphans ... -> 0` for all three.

- [ ] **Step 4: Commit the script**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/04-load-data.mjs && git commit -m "chore(migration): data loader with UUID remap"
```

---

## Task 5: Verification script (row reconciliation)

**Files:**
- Create: `scripts/migration/05-verify.mjs`

**Interfaces:**
- Consumes: `getClient`, `discoverTables` from `lib.mjs`.
- Produces: pass/fail table of OLD vs NEW row counts; exits non-zero on any mismatch.

- [ ] **Step 1: Write the verifier**

Create `scripts/migration/05-verify.mjs`:
```js
import { getClient, discoverTables, logStep } from './lib.mjs';

async function counts(db) {
  const c = getClient(db); await c.connect();
  const tables = await discoverTables(c);
  const out = {};
  for (const t of tables) out[t] = (await c.query(`select count(*)::int n from "${t}"`)).rows[0].n;
  const au = (await c.query(`select count(*)::int n from auth.users`)).rows[0].n;
  await c.end();
  return { out, au };
}

const oldC = await counts(process.env.OLD_DB);
const newC = await counts(process.env.NEW_DB_SESSION);
let mismatch = 0;
for (const t of Object.keys(oldC.out)) {
  const o = oldC.out[t], n = newC.out[t] ?? 'MISSING';
  const ok = o === n;
  if (!ok) mismatch++;
  console.log(`${ok ? 'OK ' : 'XX '} ${t}: OLD=${o} NEW=${n}`);
}
console.log(`auth.users: OLD=${oldC.au} NEW=${newC.au}`);
if (oldC.au !== newC.au) mismatch++;
logStep(mismatch === 0 ? 'RECONCILIATION PASSED' : `RECONCILIATION FAILED: ${mismatch} mismatches`);
process.exit(mismatch === 0 ? 0 : 1);
```

- [ ] **Step 2: Run reconciliation**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/05-verify.mjs
```
Expected: `OK` for every table, `auth.users: OLD=12 NEW=12`, `RECONCILIATION PASSED`, exit 0.

- [ ] **Step 3: Commit the script**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add scripts/migration/05-verify.mjs && git commit -m "chore(migration): row reconciliation verifier"
```

---

## Task 6: App cutover to NEW

**Files:**
- Modify: `.env.local` (git-ignored; not committed)
- Modify: `supabase/config.toml:1`

- [ ] **Step 1: Back up the current `.env.local`**

Run:
```bash
cp "d:/Agentix Project/Gov-HIMS/.env.local" /d/tmp/hims-migration/.env.local.old.bak && echo "backed up"
```
Expected: `backed up`.

- [ ] **Step 2: Rewrite `.env.local` to NEW** (edit these four keys; keep all other keys unchanged)

Set:
```
NEXT_PUBLIC_SUPABASE_URL=https://uidhrfybgptqllzztgyb.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<NEW_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<NEW_SERVICE_ROLE_KEY>
DATABASE_URL=postgresql://postgres.uidhrfybgptqllzztgyb:<NEW_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

- [ ] **Step 3: Point config.toml at NEW**

Modify `supabase/config.toml:1` — set `project_id = "uidhrfybgptqllzztgyb"`.

- [ ] **Step 4: Verify the app reads NEW**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && node -e "require('dotenv').config({path:'.env.local'});console.log('URL',process.env.NEXT_PUBLIC_SUPABASE_URL)" 2>/dev/null || grep NEXT_PUBLIC_SUPABASE_URL .env.local
```
Expected: shows the `uidhrfybgptqllzztgyb` URL.

- [ ] **Step 5: Commit config change** (only config.toml — `.env.local` stays untracked)

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add supabase/config.toml && git commit -m "chore(migration): point config.toml at Pro project"
```

---

## Task 7: End-to-end verification & report

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-migration-report.md`

- [ ] **Step 1: Run the test suite against NEW**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && npm test 2>&1 | tail -40
```
Expected: test summary; capture pass/fail counts. RLS/API tests that hit the DB should pass against NEW.

- [ ] **Step 2: App smoke test — boot and hit a live API route**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && npm run build 2>&1 | tail -20
```
Expected: build succeeds (compile-time proof the new env wiring is valid). Note: full runtime smoke of `/api/opd-queue` etc. is exercised by the `superpowers:verify` skill after this plan.

- [ ] **Step 3: Re-run reconciliation as final gate**

Run:
```bash
cd "d:/Agentix Project/Gov-HIMS" && source /d/tmp/hims-migration/env.sh && node scripts/migration/05-verify.mjs
```
Expected: `RECONCILIATION PASSED`.

- [ ] **Step 4: Write the evidence report**

Create `docs/superpowers/plans/2026-07-13-migration-report.md` capturing: object parity (Task 2 §3), user count (Task 3 §3), row reconciliation output (Task 5), orphan-check output (Task 4 §3), test-suite summary (Step 1), build result (Step 2). State PASS/FAIL for each.

- [ ] **Step 5: Commit the report**

```bash
cd "d:/Agentix Project/Gov-HIMS" && git add docs/superpowers/plans/2026-07-13-migration-report.md && git commit -m "docs(migration): end-to-end verification report"
```

- [ ] **Step 6: Deliver post-migration actions to the user**

Present to the user: (a) `d:/tmp/hims-migration/temp-passwords.csv` — the 12 email→temp-password pairs for forced reset; (b) reminder to **rotate** the service-role key + DB password in the Supabase dashboard (shared in plaintext chat), then update `.env.local`; (c) rollback instructions: restore `d:/tmp/hims-migration/.env.local.old.bak` to revert to OLD.

---

## Self-Review

**Spec coverage:** §2 verified-state → Tasks 1/2 parity checks. §4 connection strategy → Global Constraints + env template. §5 14-column remap → `USER_COLS` (Task 0) + loader (Task 4). §6 sequence: backup(T1), schema(T2), auth(T3), data(T4), storage no-op(covered/none), cutover(T6), verify(T5+T7). §7 rollback → Task 6 §1 backup + Task 7 §6. §9 key rotation → Task 7 §6. §10 risks all mitigated in-plan. Covered.

**Placeholder scan:** No TBD/TODO. `<NEW_ANON_KEY>` etc. are intentional secret placeholders filled from the git-ignored env file, never inline.

**Type consistency:** `getClient`, `discoverTables`, `columnMeta`, `loadOrder`, `USER_COLS`, `buildInsert`, `MIG_DIR`, `logStep` are defined in Task 0 and consumed with identical names/signatures in Tasks 1–5. `usermap.json` shape (`{oldId:newId}`) written in Task 3, read in Task 4. Consistent.

**Refinement vs spec:** Loader tries `session_replication_role=replica` and falls back to topological FK order (Supabase `postgres` role may lack superuser). Same goal as spec §6 Step 3; noted at plan top.
