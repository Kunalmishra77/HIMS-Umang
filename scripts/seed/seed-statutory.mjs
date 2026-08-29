import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const entries = [
  { id: 'ST-BMW-Q2', title: 'Bio-Medical Waste Annual Return (Form IV)', authority: 'UPPCB', period: '2025-26', dueDate: '2026-06-30', status: 'filed', ackNumber: 'UPPCB-2026-4471', amount: 0, filedAt: '2026-06-28T00:00:00Z' },
  { id: 'ST-PCPNDT', title: 'PCPNDT Quarterly Report (Form F)', authority: 'District Health', period: 'Q1-2026', dueDate: '2026-07-15', status: 'pending' },
  { id: 'ST-FIRE', title: 'Fire Safety NOC Renewal', authority: 'Fire Dept', period: '2026', dueDate: '2026-08-01', status: 'pending' },
];
for (const e of entries) await c.query(`insert into statutory (id,status,data) values ($1,$2,$3::jsonb) on conflict (id) do nothing`, [e.id, e.status, JSON.stringify(e)]);
console.log('statutory rows:', (await c.query('select count(*)::int n from statutory')).rows[0].n);
await c.end();
