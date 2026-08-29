// Module 3 (ER): seed 2 live ER-board cases (scalar mirror + full data jsonb) so
// the /emergency board has real cross-device data. Idempotent; ops action via the
// session pooler. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const cases = [
  {
    id: 'ER-seed-1', patientId: 'PT-30003', name: 'Lalita Devi', age: 64, gender: 'F',
    arrival: 'ambulance', arrivedAt: '2026-07-13T09:20:00Z', chiefComplaint: 'Fever 3 days, drowsy, oliguric',
    trauma: false, esi: 2, esiReason: 'qSOFA positive — sepsis suspected', area: 'CRITICAL',
    bedNumber: 'C-2', phase: 'in_treatment',
    vitalsHistory: [{ rr: 24, spo2: 93, sbp: 92, hr: 122, temp: 39.2, gcs: 13, at: '2026-07-13T09:25:00Z', by: 'Anjali Pillai' }],
  },
  {
    id: 'ER-seed-2', patientId: 'PT-30009', name: 'Imran Quraishi', age: 24, gender: 'M',
    arrival: 'ambulance', arrivedAt: '2026-07-13T10:05:00Z', chiefComplaint: 'Penetrating abdominal stab wound',
    trauma: true, esi: 1, esiReason: 'Penetrating trauma · haemodynamic instability', area: 'RESUS',
    bedNumber: 'R-2', phase: 'in_treatment',
    vitalsHistory: [{ rr: 28, spo2: 94, sbp: 86, hr: 132, temp: 36.4, gcs: 15, at: '2026-07-13T10:08:00Z', by: 'Anjali Pillai' }],
  },
];

for (const p of cases) {
  await c.query(`
    insert into er_cases (id, patient_id, patient_name, age, sex, arrival_at, chief_complaint, esi, data)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    on conflict (id) do nothing`,
    [p.id, p.patientId, p.name, p.age, p.gender === 'M' ? 'Male' : 'Female', p.arrivedAt, p.chiefComplaint, String(p.esi), JSON.stringify(p)]);
}
const n = (await c.query('select count(*)::int n from er_cases')).rows[0].n;
console.log('er_cases count:', n);
await c.end();
