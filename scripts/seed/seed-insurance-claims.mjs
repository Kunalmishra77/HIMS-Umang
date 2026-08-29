// Module 2 (Insurance): seed one real insurance_claims row linked to a real
// patient so the TPA pipeline board has live data. Idempotent; ops action via
// the session pooler (postgres role). Env: NEW_DB_SESSION.
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const PID = 'PT-1783414555843';   // alok kumar — ICU/ACS IPD patient (from the IPD seed)
const ID = 'CLM-alok-acs-1';
const documents = JSON.stringify([
  { id: 'd-policy', name: 'Policy copy', status: 'verified', uploadedAt: '2026-07-07T10:00:00Z' },
  { id: 'd-admission', name: 'Admission summary', status: 'verified', uploadedAt: '2026-07-07T10:05:00Z' },
  { id: 'd-cathlab', name: 'Cath-lab procedure report', status: 'verified', uploadedAt: '2026-07-07T14:00:00Z' },
  { id: 'd-discharge', name: 'Discharge summary', status: 'pending' },
  { id: 'd-bill', name: 'Final hospital bill', status: 'pending' },
]);
const timeline = JSON.stringify([
  { at: '2026-07-07T10:10:00Z', actor: 'TPA Desk', label: 'Pre-authorisation requested for cardiac procedure', kind: 'submitted' },
  { at: '2026-07-07T12:30:00Z', actor: 'HDFC ERGO', label: 'Pre-auth approved for cath-lab + 48h ICU', kind: 'approved' },
]);

const r = await c.query(`
  insert into insurance_claims
    (id, patient_id, patient_name, policy_number, policy_holder, sum_insured, available,
     provider, amount, status, approval_stage, ai_probability, submission_status,
     documents, timeline, diagnosis, treatment_summary)
  values ($1,$2,'alok kumar','HDFC-ERGO-NCB-4412','alok kumar',500000,251500,
     'HDFC ERGO',248500,'In Process','docs_collection',88,'validated',
     $3::jsonb,$4::jsonb,'NSTEMI · PCI with drug-eluting stent (LAD)',
     'Chest pain; troponin elevated. Successful PCI with DES in LAD. ICU 2 days, discharged on DAPT + statin.')
  on conflict (id) do nothing`, [ID, PID, documents, timeline]);

const n = (await c.query('select count(*)::int n from insurance_claims')).rows[0].n;
console.log(r.rowCount ? 'insurance claim inserted' : 'already present (idempotent)');
console.log('insurance_claims count:', n);
await c.end();
