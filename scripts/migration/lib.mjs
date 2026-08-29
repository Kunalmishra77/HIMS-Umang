import pg from 'pg';

export const MIG_DIR = 'd:/tmp/hims-migration';

// pg returns bigint/numeric as string by default — keep as-is for fidelity.
export function getClient(connStr) {
  return new pg.Client({ connectionString: connStr, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
}

export function logStep(msg) { console.log(`[mig] ${msg}`); }

// Columns holding a user UUID that must be remapped old->new (spec §5).
export const USER_COLS = {
  profiles: ['id'],
  patients: ['auth_user_id'],
  admission_requests: ['doctor_id'],
  appointments: ['doctor_id'],
  encounters: ['doctor_id'],
  ipd_vitals: ['recorded_by'],
  nurse_shift_assignments: ['nurse_id'],
  orders: ['doctor_id'],
  prescriptions: ['doctor_id'],
  shift_handovers: ['from_nurse_id', 'received_by_id', 'to_nurse_id'],
  visits: ['doctor_id'],
  vitals_readings: ['recorded_by'],
};

export async function discoverTables(client) {
  const r = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  return r.rows.map(x => x.table_name);
}

// Column metadata (ordered) for a table: name + udt_name (for casting).
export async function columnMeta(client, table) {
  const r = await client.query(
    `select column_name, udt_name from information_schema.columns
     where table_schema='public' and table_name=$1 order by ordinal_position`, [table]);
  return r.rows;
}

// Topological order (parents before children) from public->public FK edges.
export async function loadOrder(client) {
  const tables = await discoverTables(client);
  const edges = await client.query(
    `select tc.table_name as child, ccu.table_name as parent
     from information_schema.table_constraints tc
     join information_schema.constraint_column_usage ccu
       on tc.constraint_name=ccu.constraint_name and tc.table_schema=ccu.table_schema
     where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
       and ccu.table_schema='public' and tc.table_name<>ccu.table_name`);
  const deps = new Map(tables.map(t => [t, new Set()]));
  for (const { child, parent } of edges.rows) {
    if (deps.has(child) && deps.has(parent)) deps.get(child).add(parent);
  }
  const out = [], done = new Set();
  while (out.length < tables.length) {
    const ready = tables.filter(t => !done.has(t) && [...deps.get(t)].every(p => done.has(p)));
    if (ready.length === 0) { // cycle or self-safe remainder — append the rest deterministically
      for (const t of tables) if (!done.has(t)) { out.push(t); done.add(t); }
      break;
    }
    for (const t of ready.sort()) { out.push(t); done.add(t); }
  }
  return out;
}

// Build INSERT text + params for one row, casting each column to its udt and
// JSON-encoding json/jsonb. `remap` is oldId->newId (or null to skip).
export function buildInsert(table, cols, row, userCols, remap) {
  const names = cols.map(c => `"${c.column_name}"`);
  const vals = [], params = [];
  cols.forEach((c, i) => {
    let v = row[c.column_name];
    if ((userCols || []).includes(c.column_name) && v != null && remap) {
      v = remap.get(v) ?? v; // leave unmapped values as-is; verify step catches orphans
    }
    if (v == null) { params.push(null); vals.push(`$${params.length}::"${c.udt_name}"`); return; }
    if (c.udt_name === 'json' || c.udt_name === 'jsonb') { params.push(JSON.stringify(v)); vals.push(`$${params.length}::${c.udt_name}`); return; }
    params.push(v); vals.push(`$${params.length}::"${c.udt_name}"`);
  });
  return { text: `insert into "${table}" (${names.join(',')}) values (${vals.join(',')})`, params };
}
