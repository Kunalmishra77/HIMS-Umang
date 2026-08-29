import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const vendors = [
  { id: 'VEN-001', name: 'Siemens Healthineers', category: 'Equipment', gstin: '27AABCS1234A1Z5', status: 'active', rating: 4.6, totalSpend: 12500000, activeContracts: 1, riskLevel: 'low', createdAt: '2024-01-10T00:00:00Z' },
  { id: 'VEN-002', name: 'Sodexo Facilities', category: 'Services', gstin: '27AACCS9876B1Z2', status: 'active', rating: 4.1, totalSpend: 2850000, activeContracts: 1, riskLevel: 'medium', createdAt: '2024-03-01T00:00:00Z' },
];
const pos = [{ id: 'PO-2026-004', vendorId: 'VEN-002', vendorName: 'Sodexo Facilities', items: 'Monthly catering', amount: 285000, status: 'delivered', createdAt: '2026-07-01T00:00:00Z', expectedDelivery: '2026-07-31' }];
const payments = [{ id: 'PAY-004', vendorId: 'VEN-002', poId: 'PO-2026-004', amount: 285000, status: 'paid', method: 'NEFT', ref: 'NEFT-2026-A8821', createdAt: '2026-07-02T00:00:00Z' }];
const put = async (kind, arr) => { for (const e of arr) await c.query(`insert into vendor_mgmt (id,kind,status,data) values ($1,$2,$3,$4::jsonb) on conflict (id) do nothing`, [e.id, kind, e.status, JSON.stringify(e)]); };
await put('vendor', vendors); await put('po', pos); await put('payment', payments);
console.log('vendor_mgmt:', JSON.stringify((await c.query('select kind,count(*)::int n from vendor_mgmt group by kind')).rows));
await c.end();
