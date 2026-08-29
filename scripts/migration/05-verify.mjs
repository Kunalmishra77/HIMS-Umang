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
