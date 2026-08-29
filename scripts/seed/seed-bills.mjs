// Module 1 (Billing): seed 2 real bills linked to real patients so the billing
// desk has live data. Idempotent; ops action via session pooler. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

const bills = [
  {
    id: 'BIL-alok-ipd', patient_id: 'PT-1783414555843', payer_type: 'insurance', payer_name: 'HDFC ERGO',
    status: 'open',
    lines: [
      { id: 'L1', source: 'bed', name: 'ICU bed (2 days)', qty: 2, unitPrice: 9000, total: 18000, duplicateFlag: false },
      { id: 'L2', source: 'procedure', name: 'PCI with drug-eluting stent (LAD)', qty: 1, unitPrice: 145000, total: 145000, duplicateFlag: false },
      { id: 'L3', source: 'drug', name: 'DAPT + statin (TTO)', qty: 1, unitPrice: 3200, total: 3200, duplicateFlag: false },
    ],
    total: 166200, discount: 0, non_payable: 0, insurance_covered: 150000, paid: 0, balance: 16200,
  },
  {
    id: 'BIL-opd-1', patient_id: 'PT-1783500191570', payer_type: 'cash', status: 'open',
    lines: [{ id: 'L1', source: 'consult', name: 'OPD consultation', qty: 1, unitPrice: 500, total: 500, duplicateFlag: false }],
    total: 500, discount: 0, non_payable: 0, insurance_covered: 0, paid: 500, balance: 0,
  },
];

for (const b of bills) {
  await c.query(`
    insert into bills (id, patient_id, payer_type, payer_name, status, lines, total, discount, non_payable, insurance_covered, paid, balance, created_at, updated_at)
    values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12, now(), now())
    on conflict (id) do nothing`,
    [b.id, b.patient_id, b.payer_type, b.payer_name ?? null, b.id === 'BIL-opd-1' ? 'paid' : b.status,
     JSON.stringify(b.lines), b.total, b.discount, b.non_payable, b.insurance_covered, b.paid, b.balance]);
}
console.log('bills count:', (await c.query('select count(*)::int n from bills')).rows[0].n);
await c.end();
