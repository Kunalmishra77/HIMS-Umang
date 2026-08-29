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

// Topological order (parents before children) is FK-safe whether or not replica
// mode engaged; the schema is acyclic with no self-referencing FKs (verified).
const order = await loadOrder(c);
const inserted = {};
for (const table of order) {
  const file = `${MIG_DIR}/${table}.rows.json`;
  if (!fs.existsSync(file)) { logStep(`no dump for ${table} — skip`); continue; }
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (rows.length === 0) { inserted[table] = 0; logStep(`loaded ${table}: 0 (empty dump)`); continue; }
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
