// Tier 0 (T0.7): seed the one gap in the migrated demo data — an IPD stay.
// The migrated data has a coherent OPD journey (patient→visit→orders→labs/
// radiology/prescriptions→dispenses) but 2 admission_requests with 0 ipd_stays.
// This admits a real requested patient into an ICU bed so the IPD / nursing /
// discharge portals have live data. Idempotent; run once via the session pooler
// (postgres role, bypasses RLS — appropriate for an ops seed). Env: NEW_DB_SESSION.
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const AR = 'ADM-mrafnlmb-9s06-24';   // requested ICU admission (chest pain, Critical)
const PID = 'PT-1783414555843';
const BED = 'BED-ICU-1';
const STAY = 'IPD-alok-icu-1';

// Confirm the source admission still exists and is not already admitted elsewhere.
const ar = await c.query('select id, patient_id, diagnosis from admission_requests where id=$1', [AR]);
if (!ar.rowCount) { console.error(`admission_request ${AR} not found — aborting`); process.exit(1); }

// 1) ICU bed, occupied by the patient (idempotent upsert).
await c.query(`
  insert into beds (id, bed_number, ward, floor, status, occupant_id, occupant_name, gender)
  values ($1,'ICU-1','ICU','1','Occupied',$2,'alok kumar','Male')
  on conflict (id) do update set status='Occupied', occupant_id=excluded.occupant_id,
    occupant_name=excluded.occupant_name`, [BED, PID]);

// 2) IPD stay (idempotent — skip if already seeded).
// Shapes must match IpdWardVitalsSchema (latestVitals) and IpdRoundSchema (rounds) in ipd-stays.ts.
const vitals = JSON.stringify({ hr: 96, bp: '138/88', temp: 98.9, spo2: 95, at: '2026-07-07T10:05:00.000Z' });
const round = JSON.stringify([{ id: 'RND-1', scheduledAt: '2026-07-07T11:00:00.000Z', doctor: 'Dr. Priya Nair', done: true,
  doneAt: '2026-07-07T11:15:00.000Z',
  note: 'ACS protocol started — dual antiplatelet + statin; serial troponin ordered; cardiology consult.',
  vitals: { bp: '138/88', pulse: '96', temp: '98.9', spo2: '95', rr: '20' } }]);
const ins = await c.query(`
  insert into ipd_stays
    (id, admission_request_id, patient_id, patient_name, age, gender, bed, ward,
     admitting_doctor, diagnosis, condition, stage, admitted_at, latest_bp,
     latest_vitals, rounds, code_status)
  values ($1,$2,$3,'alok kumar',40,'Male',$4,'ICU',
     'Dr. Priya Nair','Chest pain — ACS/NSTEMI workup','Critical','under_treatment',
     '2026-07-07T09:40:00.000Z','138/88',$5::jsonb,$6::jsonb,'Full code')
  on conflict (id) do nothing`, [STAY, AR, PID, BED, vitals, round]);

// 3) Mark the admission admitted.
await c.query(`update admission_requests set status='admitted' where id=$1`, [AR]);

const cnt = await c.query('select count(*)::int n from ipd_stays');
const row = await c.query('select id, patient_name, ward, bed, condition, stage from ipd_stays where id=$1', [STAY]);
console.log(ins.rowCount ? 'ipd_stay inserted' : 'ipd_stay already present (idempotent)');
console.log('ipd_stays count:', cnt.rows[0].n);
console.log('seeded stay:', JSON.stringify(row.rows[0]));
await c.end();
