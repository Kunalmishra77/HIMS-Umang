// Module 5 (OT): seed 2 procedures + 3 rooms so the OT board has live data.
// Idempotent; ops action via session pooler. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const procedures = [
  { id: 'OT-001', patientId: 'PT-10220', patientName: 'Arvind Gupta', patientAge: 62, procedureName: 'Total Knee Replacement (TKR)', surgeon: 'Dr. Ravi Kumar', anaesthetist: 'Dr. Anisha Sharma', otRoom: 'OT-1', scheduledTime: '08:30', durationMinutes: 120, status: 'In Progress', bloodRequired: true, implants: ['Knee implant system (Size M)'], checklist: [] },
  { id: 'OT-003', patientId: 'PT-10222', patientName: 'Suresh Pillai', patientAge: 48, procedureName: 'TURP (Transurethral Resection)', surgeon: 'Dr. Sanjay Mehta', anaesthetist: 'Dr. Praveen Bose', otRoom: 'OT-3', scheduledTime: '14:00', durationMinutes: 90, status: 'Scheduled', bloodRequired: false, implants: [], checklist: [] },
];
const rooms = [
  { id: 'OT-1', name: 'OT-1 (Main)', status: 'In Use', currentProcedureId: 'OT-001' },
  { id: 'OT-2', name: 'OT-2 (Minor)', status: 'Available' },
  { id: 'OT-3', name: 'OT-3 (Urology)', status: 'Available', nextScheduledTime: '14:00' },
];

for (const p of procedures) {
  await c.query(`insert into ot (id, kind, patient_id, status, ot_room, data) values ($1,'procedure',$2,$3,$4,$5::jsonb) on conflict (id) do nothing`,
    [p.id, p.patientId, p.status, p.otRoom, JSON.stringify(p)]);
}
for (const r of rooms) {
  await c.query(`insert into ot (id, kind, status, data) values ($1,'room',$2,$3::jsonb) on conflict (id) do nothing`,
    [r.id, r.status, JSON.stringify(r)]);
}
console.log('ot rows:', JSON.stringify((await c.query('select kind, count(*)::int n from ot group by kind')).rows));
await c.end();
