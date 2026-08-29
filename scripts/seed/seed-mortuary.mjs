import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const records = [
  { id: 'MRT-001', patientId: 'PT-19001', patientName: 'Ramchandra Sharma', age: 72, gender: 'Male', ward: 'General Ward', bodySlot: 1, timeOfDeath: '2026-07-13T02:15:00Z', certifiedBy: 'Dr. Vikram Rathore', causeOfDeath: 'Natural', isMLC: false, legalClearance: 'na', status: 'in_storage' },
];
for (const r of records) await c.query(`insert into mortuary (id,status,patient_id,data) values ($1,$2,$3,$4::jsonb) on conflict (id) do nothing`, [r.id, r.status, r.patientId, JSON.stringify(r)]);
console.log('mortuary rows:', (await c.query('select count(*)::int n from mortuary')).rows[0].n);
await c.end();
