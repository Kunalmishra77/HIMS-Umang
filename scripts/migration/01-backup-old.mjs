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
