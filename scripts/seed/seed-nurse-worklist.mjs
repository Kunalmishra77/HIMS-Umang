// QA seed: the nurse portal's worklist tables were empty (nurse_tasks,
// shift_handovers, nurse_shift_assignments), so the nursing dashboard rendered
// blank. This seeds a coherent ICU shift for the migrated IPD patient
// (alok kumar, BED-ICU-1) assigned to the demo nurse (Anjali Desai). Idempotent
// (ON CONFLICT DO NOTHING); run once via the session pooler. Env: NEW_DB_SESSION.
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const NURSE_ID = 'd4b5937d-e428-4ed4-ba31-b3ddbade2fae'; // demo-nurse@example.test — Anjali Desai
const NURSE = 'Anjali Desai';
const PID = 'PT-1783414555843';
const PNAME = 'alok kumar';

// 1) Nurse shift assignment (ICU, morning).
await c.query(`
  insert into nurse_shift_assignments (id, nurse_id, nurse_name, ward, shift, responsibilities)
  values ('NSA-icu-anjali-1', $1, $2, 'ICU', 'Morning',
          array['Bed 1 — alok kumar (ACS)','Hourly vitals','Medication rounds','ICU documentation'])
  on conflict (id) do nothing`, [NURSE_ID, NURSE]);

// 2) Shift worklist — a realistic ICU task mix for the ACS patient (some done).
const tasks = [
  ['TASK-icu-1', 'Vitals',     'High',   'ai',     true,  'Hourly vitals — record BP/HR/SpO2'],
  ['TASK-icu-2', 'Medication', 'High',   'ai',     true,  'Administer dual antiplatelet + statin (ACS protocol)'],
  ['TASK-icu-3', 'Assessment', 'High',   'ai',     false, 'Cardiac monitoring — watch for arrhythmia / chest pain'],
  ['TASK-icu-4', 'Medication', 'Medium', 'manual', false, 'Draw serial troponin (next sample due)'],
  ['TASK-icu-5', 'Hygiene',    'Low',    'manual', false, 'Assist with morning hygiene / positioning'],
  ['TASK-icu-6', 'Documentation','Medium','ai',    false, 'Update ICU flow sheet + nursing notes'],
];
for (const [id, category, priority, source, done, title] of tasks) {
  await c.query(`
    insert into nurse_tasks (id, key, patient_id, patient_name, title, category, priority, source, done, created_at, done_at)
    values ($1, $1, $2, $3, $4, $5, $6, $7, $8, '2026-07-07T08:00:00.000Z', $9)
    on conflict (id) do nothing`,
    [id, PID, PNAME, title, category, priority, source, done, done ? '2026-07-07T08:45:00.000Z' : null]);
}

// 3) Night→Morning SBAR handover for the ICU.
await c.query(`
  insert into shift_handovers
    (id, ward, date, from_shift, to_shift, from_nurse_id, from_nurse_name,
     to_nurse_id, to_nurse_name, sbar, patient_count, signed_at, status)
  values ('HAND-icu-1', 'ICU', '2026-07-07', 'Night', 'Morning',
     $1, 'Kavita Menon', $2, $3,
     'S: 40M, ACS/NSTEMI, admitted overnight via ED, chest pain settled.\n' ||
     'B: Started on dual antiplatelet + statin; serial troponin trending; cardiology consult done.\n' ||
     'A: Haemodynamically stable, BP 138/88, SpO2 95% on 2L, pain 2/10.\n' ||
     'R: Continue hourly vitals + cardiac monitoring; next troponin due; watch for arrhythmia.',
     1, '2026-07-07T07:30:00.000Z', 'signed')
  on conflict (id) do nothing`, [NURSE_ID, NURSE_ID, NURSE]);

const counts = {};
for (const t of ['nurse_tasks', 'shift_handovers', 'nurse_shift_assignments']) {
  counts[t] = (await c.query(`select count(*)::int n from ${t}`)).rows[0].n;
}
console.log('seeded nurse worklist:', JSON.stringify(counts));
await c.end();
