import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const tasks = [
  { id: 'HK-1', area: 'BED-ICU-1', type: 'Terminal cleaning', priority: 'high', status: 'pending', requestedAt: '2026-07-13T11:00:00Z', requestedBy: 'Bed Manager' },
  { id: 'HK-2', area: 'General Ward - Room 12', type: 'Bed turnover', priority: 'medium', status: 'in_progress', assignedTo: 'Ramesh Kumar', requestedAt: '2026-07-13T10:30:00Z' },
];
const staff = [
  { id: 'HK-S1', name: 'Ramesh Kumar', currentTaskId: 'HK-2' },
  { id: 'HK-S2', name: 'Sita Devi' },
];
for (const t of tasks) await c.query(`insert into housekeeping (id,kind,status,data) values ($1,'task',$2,$3::jsonb) on conflict (id) do nothing`, [t.id, t.status, JSON.stringify(t)]);
for (const s of staff) await c.query(`insert into housekeeping (id,kind,data) values ($1,'staff',$2::jsonb) on conflict (id) do nothing`, [s.id, JSON.stringify(s)]);
console.log('housekeeping:', JSON.stringify((await c.query('select kind,count(*)::int n from housekeeping group by kind')).rows));
await c.end();
