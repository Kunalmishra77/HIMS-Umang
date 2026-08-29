// Dietary seed. The jsonb in `dietary.data` is read back UNVALIDATED (the API
// schema uses `data: z.unknown()`) and cast straight to the store's DietPlan /
// MealOrder shapes, so the jsonb MUST match those interfaces exactly (see
// src/store/useDietaryStore.ts) — a missing `allergyFlags` / `items` crashes
// the dashboard render. Idempotent: re-seeds the demo rows to the current shape.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.NEW_DB_SESSION, ssl: { rejectUnauthorized: false } });
await c.connect();

// DietPlan[] — shape mirrors useDietaryStore.DietPlan
const plans = [
  { id: 'DP-alok', patientId: 'PT-1783414555843', patientName: 'alok kumar', ward: 'ICU',
    bedNumber: 'ICU-1', dietType: 'Low Salt', allergyFlags: [], calorieTarget: 1800,
    notes: 'Cardiac / low-sodium, low-fat (ACS protocol)', prescribedBy: 'Nalini Bose',
    startDate: '2026-07-07', aiGenerated: true, aiConfidence: 0.9 },
];

// MealOrder[] — shape mirrors useDietaryStore.MealOrder
const orders = [
  { id: 'MO-alok-bf', dietPlanId: 'DP-alok', patientId: 'PT-1783414555843', patientName: 'alok kumar',
    ward: 'ICU', bedNumber: 'ICU-1', mealType: 'Breakfast', scheduledAt: '2026-07-14T07:30:00Z',
    status: 'delivered', items: ['Low-salt vegetable upma', 'Egg-white omelette', 'Herbal tea'],
    deliveredAt: '2026-07-14T07:45:00Z' },
  { id: 'MO-alok-ln', dietPlanId: 'DP-alok', patientId: 'PT-1783414555843', patientName: 'alok kumar',
    ward: 'ICU', bedNumber: 'ICU-1', mealType: 'Lunch', scheduledAt: '2026-07-14T12:30:00Z',
    status: 'scheduled', items: ['Steamed rice', 'Moong dal (no salt)', 'Boiled vegetables', 'Curd'] },
];

// Replace any prior (possibly wrong-shaped) demo rows.
await c.query(`delete from dietary where id = any($1)`, [[...plans.map(p => p.id), ...orders.map(o => o.id)]]);
for (const p of plans) await c.query(`insert into dietary (id,kind,patient_id,data) values ($1,'plan',$2,$3::jsonb)`, [p.id, p.patientId, JSON.stringify(p)]);
for (const o of orders) await c.query(`insert into dietary (id,kind,status,patient_id,data) values ($1,'order',$2,$3,$4::jsonb)`, [o.id, o.status, o.patientId, JSON.stringify(o)]);
console.log('dietary:', JSON.stringify((await c.query('select kind,count(*)::int n from dietary group by kind')).rows));
await c.end();
