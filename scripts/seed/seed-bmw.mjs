import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const logs = [
  { id: 'BMW-1', ward: 'General Ward', category: 'Yellow', weightKg: 12.4, bagCount: 6, collectedBy: 'BW-1501', collectedByName: 'Ganesh Rao', collectedAt: '2026-07-13T08:30:00Z', status: 'collected' },
  { id: 'BMW-2', ward: 'ICU', category: 'Red', weightKg: 5.1, bagCount: 3, collectedBy: 'BW-1501', collectedByName: 'Ganesh Rao', collectedAt: '2026-07-13T09:00:00Z', status: 'treated' },
];
for (const l of logs) await c.query(`insert into bmw (id,kind,status,data) values ($1,'log',$2,$3::jsonb) on conflict (id) do nothing`, [l.id, l.status, JSON.stringify(l)]);
console.log('bmw:', JSON.stringify((await c.query('select kind,count(*)::int n from bmw group by kind')).rows));
await c.end();
