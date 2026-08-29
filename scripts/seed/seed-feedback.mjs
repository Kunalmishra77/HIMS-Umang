import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const requests = [
  { id: 'FBR-1', patientId: 'PT-1783414555843', patientName: 'alok kumar', visitType: 'ipd', visitId: 'IPD-alok-icu-1', attendingDoctor: 'Dr. Priya Nair', department: 'Cardiology', diagnosis: 'NSTEMI', visitDate: '2026-07-07', status: 'pending', createdAt: '2026-07-13T10:00:00Z' },
];
const records = [
  { id: 'FBK-1', requestId: 'FBR-0', patientId: 'PT-1783500191570', patientName: 'pneumonia patient', overallRating: 4, categories: { doctorProfessionalism: 5, clinicalExpertise: 4, communication: 4, nursingCare: 5, facilityCleanliness: 4, waitTime: 3, billingClarity: 4 }, comment: 'Good care, slightly long wait.', submittedAt: '2026-07-12T16:00:00Z', department: 'General Medicine', attendingDoctor: 'Dr. Priya Nair' },
];
for (const r of requests) await c.query(`insert into feedback (id,kind,status,patient_id,data) values ($1,'request',$2,$3,$4::jsonb) on conflict (id) do nothing`, [r.id, r.status, r.patientId, JSON.stringify(r)]);
for (const r of records) await c.query(`insert into feedback (id,kind,patient_id,data) values ($1,'record',$2,$3::jsonb) on conflict (id) do nothing`, [r.id, r.patientId, JSON.stringify(r)]);
console.log('feedback:', JSON.stringify((await c.query('select kind,count(*)::int n from feedback group by kind')).rows));
await c.end();
