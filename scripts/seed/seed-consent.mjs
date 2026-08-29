import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const records = [
  { id: 'CON-1', patientId: 'PT-1783414555843', patientName: 'alok kumar', procedureName: 'PCI with drug-eluting stent (LAD)', requestedBy: 'Dr. Priya Nair', nok: { name: 'Sunita', relation: 'Spouse', phone: '9800000099' }, status: 'signed', token: 'tok-alok-1', signedByName: 'alok kumar', signedAt: '2026-07-07T09:30:00Z', createdAt: '2026-07-07T09:20:00Z' },
];
for (const r of records) await c.query(`insert into consent (id,status,patient_id,data) values ($1,$2,$3,$4::jsonb) on conflict (id) do nothing`, [r.id, r.status, r.patientId, JSON.stringify(r)]);
console.log('consent rows:', (await c.query('select count(*)::int n from consent')).rows[0].n);
await c.end();
