import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const patients = [
  { id: 'WB-ICU-1', patientId: 'PT-1783414555843', name: 'alok kumar', bed: 'BED-ICU-1', ward: 'ICU', diagnosis: 'NSTEMI · post-PCI', vitals: { hr: 96, bp: '138/88', spo2: 95, temp: 98.9, rr: 20 }, alert: 'critical', medications: ['Aspirin 75mg', 'Atorvastatin 40mg'], ivDrips: ['NS 0.9% @ 60ml/hr'] },
];
for (const p of patients) await c.query(`insert into ward (id,status,patient_id,data) values ($1,$2,$3,$4::jsonb) on conflict (id) do nothing`, [p.id, p.alert, p.patientId, JSON.stringify(p)]);
console.log('ward rows:', (await c.query('select count(*)::int n from ward')).rows[0].n);
await c.end();
