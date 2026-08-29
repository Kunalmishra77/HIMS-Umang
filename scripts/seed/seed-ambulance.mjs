// Module 6 (Ambulance): seed fleet + a live trip. Idempotent. Env: NEW_DB_SESSION.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();
const vehicles = [
  { id: 'AMB-01', vehicleNumber: 'UP-32-AA-1234', type: 'Advanced Life Support', driverId: 'DRV-01', driverName: 'Sunil Yadav', paramedicName: 'Ravi Sharma', status: 'available', lastServiceDate: '2026-06-15', currentLocation: 'Hospital Bay', fuelLevel: 90 },
  { id: 'AMB-02', vehicleNumber: 'UP-32-AA-5678', type: 'Basic Life Support', driverId: 'DRV-02', driverName: 'Mahesh Patil', status: 'on_trip', lastServiceDate: '2026-06-20', fuelLevel: 65 },
  { id: 'AMB-03', vehicleNumber: 'UP-32-AA-9012', type: 'Patient Transport', driverId: 'DRV-03', driverName: 'Ganesh Rao', status: 'available', lastServiceDate: '2026-07-01', currentLocation: 'Hospital Bay', fuelLevel: 80 },
];
const trips = [
  { id: 'TRIP-001', vehicleId: 'AMB-02', vehicleNumber: 'UP-32-AA-5678', tripType: 'emergency', pickupLocation: 'Hazratganj, Lucknow', destination: 'Demo District Hospital', dispatchedAt: '2026-07-13T09:10:00Z', status: 'transporting', callerName: 'Ramesh', callerPhone: '9876543210', chiefComplaint: 'Chest pain', responseTimeMinutes: 8 },
];
for (const v of vehicles) await c.query(`insert into ambulance (id, kind, status, data) values ($1,'vehicle',$2,$3::jsonb) on conflict (id) do nothing`, [v.id, v.status, JSON.stringify(v)]);
for (const t of trips) await c.query(`insert into ambulance (id, kind, status, data) values ($1,'trip',$2,$3::jsonb) on conflict (id) do nothing`, [t.id, t.status, JSON.stringify(t)]);
console.log('ambulance rows:', JSON.stringify((await c.query('select kind, count(*)::int n from ambulance group by kind')).rows));
await c.end();
