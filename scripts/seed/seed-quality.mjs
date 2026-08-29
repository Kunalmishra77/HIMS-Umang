import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const incidents = [
  { id: 'INC-2026-009', type: 'Medication error', severity: 'moderate', description: 'Wrong route documented; no harm; CAPA initiated', reportedBy: 'Dr. Lalitha Iyer', reportedAt: '2026-07-11T10:00:00Z', status: 'open' },
  { id: 'INC-2026-007', type: 'Equipment failure', severity: 'low', description: 'Infusion pump replaced, biomedical sign-off', reportedBy: 'Dr. Lalitha Iyer', reportedAt: '2026-07-10T14:00:00Z', status: 'resolved', correctiveAction: 'Replaced pump; added to PM schedule' },
];
const auditTasks = [{ id: 'AUD-T-1', area: 'Hand Hygiene', dueDate: '2026-07-20', assignedTo: 'Quality Team', status: 'pending' }];
const metrics = { fallsThisMonth: 2, medicationErrors: 1, haiCount: 0, readmissionRate: 4.2, avgLOS: 3.8, patientSatisfaction: 88, auditCompletionPct: 76 };
const nabh = { patientSafety: 82, infectionControl: 90, medicationMgmt: 78, recordKeeping: 85 };
for (const i of incidents) await c.query(`insert into quality (id,kind,status,data) values ($1,'incident',$2,$3::jsonb) on conflict (id) do nothing`, [i.id, i.status, JSON.stringify(i)]);
for (const t of auditTasks) await c.query(`insert into quality (id,kind,status,data) values ($1,'audit_task',$2,$3::jsonb) on conflict (id) do nothing`, [t.id, t.status, JSON.stringify(t)]);
await c.query(`insert into quality (id,kind,data) values ('metrics','metrics',$1::jsonb) on conflict (id) do nothing`, [JSON.stringify(metrics)]);
await c.query(`insert into quality (id,kind,data) values ('nabh','nabh',$1::jsonb) on conflict (id) do nothing`, [JSON.stringify(nabh)]);
console.log('quality:', JSON.stringify((await c.query('select kind,count(*)::int n from quality group by kind')).rows));
await c.end();
