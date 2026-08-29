// Module 7 (Inventory): seed assets. Idempotent. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const assets = [
  { id: 'EQ-001', name: 'MRI Scanner (Siemens)', category: 'Equipment', status: 'Maintenance Required', vendor: 'Siemens Healthineers', unitCost: 12500000, aiMaintenanceAlert: 'Cooling system anomaly detected. Predict failure in 5 days.' },
  { id: 'CS-105', name: 'N95 Masks', category: 'Consumable', status: 'Low Stock', quantity: 150, reorderPoint: 500, uom: 'pcs', vendor: '3M India', unitCost: 35 },
  { id: 'CS-106', name: 'Surgical Gloves (M)', category: 'Consumable', status: 'Low Stock', quantity: 90, reorderPoint: 300, uom: 'pairs', vendor: 'Medline', unitCost: 12 },
  { id: 'CS-107', name: 'IV Cannula 18G', category: 'Consumable', status: 'Low Stock', quantity: 40, reorderPoint: 150, uom: 'pcs', vendor: 'BD India', unitCost: 28 },
  { id: 'EQ-002', name: 'Portable Ventilator', category: 'Equipment', status: 'Active', vendor: 'Hamilton Medical', unitCost: 850000 },
  { id: 'EQ-003', name: 'Defibrillator (LP15)', category: 'Equipment', status: 'Active', vendor: 'Stryker', unitCost: 720000 },
];
for (const a of assets) await c.query(`insert into inventory (id, kind, status, data) values ($1,'asset',$2,$3::jsonb) on conflict (id) do nothing`, [a.id, a.status, JSON.stringify(a)]);
console.log('inventory assets:', (await c.query(`select count(*)::int n from inventory where kind='asset'`)).rows[0].n);
await c.end();
