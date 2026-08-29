// Module 4 (Blood Bank): seed real inventory + one cross-match request so the
// board has live data. Idempotent; ops action via session pooler. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const units = [
  { id: 'BU-001', bloodGroup: 'O+', component: 'Packed RBC', bagNumber: 'BAG-4521', collectedOn: '2026-07-01', expiresOn: '2026-08-12', donorId: 'DN-001', status: 'available' },
  { id: 'BU-002', bloodGroup: 'O-', component: 'Packed RBC', bagNumber: 'BAG-4526', collectedOn: '2026-07-05', expiresOn: '2026-08-16', donorId: 'DN-006', status: 'available' },
  { id: 'BU-003', bloodGroup: 'A+', component: 'Packed RBC', bagNumber: 'BAG-4523', collectedOn: '2026-06-28', expiresOn: '2026-08-09', donorId: 'DN-003', status: 'available' },
  { id: 'BU-004', bloodGroup: 'B+', component: 'Platelets', bagNumber: 'BAG-4524', collectedOn: '2026-07-06', expiresOn: '2026-07-16', donorId: 'DN-004', status: 'available' },
];
const requests = [
  { id: 'CMR-001', patientId: 'PT-1783414555843', patientName: 'alok kumar', bloodGroup: 'O+', component: 'Packed RBC', units: 2, requestedBy: 'Dr. Priya Nair', requestedAt: '2026-07-07T11:00:00Z', status: 'pending' },
];

for (const u of units) {
  await c.query(`insert into blood_bank (id, kind, blood_group, status, data) values ($1,'unit',$2,$3,$4::jsonb) on conflict (id) do nothing`,
    [u.id, u.bloodGroup, u.status, JSON.stringify(u)]);
}
for (const r of requests) {
  await c.query(`insert into blood_bank (id, kind, blood_group, status, patient_id, data) values ($1,'request',$2,$3,$4,$5::jsonb) on conflict (id) do nothing`,
    [r.id, r.bloodGroup, r.status, r.patientId, JSON.stringify(r)]);
}
const n = (await c.query(`select kind, count(*)::int n from blood_bank group by kind`)).rows;
console.log('blood_bank:', JSON.stringify(n));
await c.end();
