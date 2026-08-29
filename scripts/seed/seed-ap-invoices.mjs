import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const vendors = [
  { id: 'FV-001', name: 'Sodexo Facilities', category: 'Catering', gstin: '27AACCS9876B1Z2', mouExpiry: '2027-03-31' },
  { id: 'FV-002', name: 'Clean Linen Co.', category: 'Laundry', gstin: '09AAECL1234C1Z0', mouExpiry: '2026-09-30' },
];
const invoices = [
  { id: 'INV-004', vendorId: 'FV-001', vendorName: 'Sodexo Facilities', invoiceNo: 'SOD-2026-0512', amount: 285000, status: 'paid', paymentRef: 'NEFT-2026-A8821', dueDate: '2026-07-05', raisedAt: '2026-06-20T00:00:00Z' },
  { id: 'INV-005', vendorId: 'FV-002', vendorName: 'Clean Linen Co.', invoiceNo: 'CL-2026-0998', amount: 94000, status: 'disputed', disputeReason: 'Weight discrepancy 940 vs 1180kg', dueDate: '2026-07-20', raisedAt: '2026-07-01T00:00:00Z' },
];
for (const v of vendors) await c.query(`insert into ap_invoices (id,kind,data) values ($1,'vendor',$2::jsonb) on conflict (id) do nothing`, [v.id, JSON.stringify(v)]);
for (const i of invoices) await c.query(`insert into ap_invoices (id,kind,status,data) values ($1,'invoice',$2,$3::jsonb) on conflict (id) do nothing`, [i.id, i.status, JSON.stringify(i)]);
console.log('ap_invoices:', JSON.stringify((await c.query('select kind,count(*)::int n from ap_invoices group by kind')).rows));
await c.end();
