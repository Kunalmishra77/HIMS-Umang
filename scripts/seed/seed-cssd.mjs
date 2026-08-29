import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const instruments = [
  { id: 'INS-001', name: 'Scalpel Handle No.3', category: 'General Surgery', quantity: 12, status: 'ready', lastSterilizedAt: '2026-07-12T06:00:00Z' },
  { id: 'INS-002', name: 'Mosquito Forceps', category: 'General Surgery', quantity: 24, status: 'sterilizing', currentCycleId: 'CYC-001' },
  { id: 'INS-003', name: 'Laparoscope 10mm', category: 'Laparoscopy', quantity: 4, status: 'in_use', assignedOT: 'OT-2' },
  { id: 'INS-004', name: 'Retractor Set', category: 'General Surgery', quantity: 6, status: 'dirty' },
  { id: 'INS-006', name: 'TKR Tray', category: 'Orthopaedic', quantity: 1, status: 'dirty' },
];
const cycles = [
  { id: 'CYC-001', method: 'Steam (Autoclave)', status: 'in_progress', instrumentIds: ['INS-002'], operatorId: 'CS-1301', operatorName: 'Shalini Mehta', startedAt: '2026-07-13T08:00:00Z' },
];
for (const i of instruments) await c.query(`insert into cssd (id,kind,status,data) values ($1,'instrument',$2,$3::jsonb) on conflict (id) do nothing`, [i.id, i.status, JSON.stringify(i)]);
for (const y of cycles) await c.query(`insert into cssd (id,kind,status,data) values ($1,'cycle',$2,$3::jsonb) on conflict (id) do nothing`, [y.id, y.status, JSON.stringify(y)]);
console.log('cssd:', JSON.stringify((await c.query('select kind,count(*)::int n from cssd group by kind')).rows));
await c.end();
