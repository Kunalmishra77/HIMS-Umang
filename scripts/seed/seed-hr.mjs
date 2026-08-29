// Module 8 (HR): seed a few staff + one leave request + a shift template.
// Idempotent. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const staff = [
  { id: 'DR-1012', employeeId: 'EMP-2026-0012', name: 'Dr. Priya Nair', email: 'priya.nair@demo.gov', phone: '9800000012', role: 'doctor', department: 'General Medicine', designation: 'Consultant', branchId: 'UP-DEMO-01-B1', joiningDate: '2021-03-01', contractType: 'Permanent', status: 'Active', credentials: [{ id: 'CR-1', type: 'registration', label: 'Medical Council Reg.', number: 'MCI-19720', issuedDate: '2015-06-01', expiryDate: '2027-06-01' }] },
  { id: 'NR-402', employeeId: 'EMP-2026-0402', name: 'Anjali Desai', email: 'anjali.desai@demo.gov', phone: '9800000402', role: 'nurse', department: 'General Ward', designation: 'Staff Nurse', branchId: 'UP-DEMO-01-B1', joiningDate: '2022-07-15', contractType: 'Permanent', status: 'Active', credentials: [] },
  { id: 'PH-301', employeeId: 'EMP-2026-0301', name: 'Ritu Sharma', email: 'ritu.sharma@demo.gov', phone: '9800000301', role: 'pharmacy', department: 'Pharmacy', designation: 'Pharmacist', branchId: 'UP-DEMO-01-B1', joiningDate: '2020-01-10', contractType: 'Permanent', status: 'Active', credentials: [] },
];
const leave = { id: 'LV-DR-1012', staffId: 'DR-1012', staffName: 'Dr. Priya Nair', department: 'General Medicine', fromDate: '2026-07-20', toDate: '2026-07-22', reason: 'Conference', status: 'Pending', requestedAt: '2026-07-12T09:00:00Z' };
const tmpl = { id: 'TMPL-1', name: '5-on/2-off Morning', pattern: 'Morning', on: 5, off: 2 };

for (const s of staff) await c.query(`insert into hr (id, kind, status, data) values ($1,'staff',$2,$3::jsonb) on conflict (id) do nothing`, [`staff:${s.id}`, s.status, JSON.stringify(s)]);
await c.query(`insert into hr (id, kind, status, data) values ($1,'leave',$2,$3::jsonb) on conflict (id) do nothing`, [`leave:${leave.id}`, leave.status, JSON.stringify(leave)]);
await c.query(`insert into hr (id, kind, data) values ($1,'shift_template',$2::jsonb) on conflict (id) do nothing`, [`shift_template:${tmpl.id}`, JSON.stringify(tmpl)]);
console.log('hr rows:', JSON.stringify((await c.query('select kind, count(*)::int n from hr group by kind')).rows));
await c.end();
