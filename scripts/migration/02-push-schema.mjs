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
