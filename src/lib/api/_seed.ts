/* Demo seed — real-DB era (T0.7).
 *
 * The Supabase project now holds MIGRATED real data — patients, visits, orders,
 * lab/radiology results, prescriptions, dispenses, admissions, and 1,495 audit
 * entries. That IS the demo dataset. We therefore no longer seed a hardcoded
 * "Anil/Kiran journey" into the tables on mount: under a real session (T0.1)
 * `_core.table()` writes to Postgres, so mount-time seeding would duplicate and
 * pollute the real data. Seeding is now an OPS action (see `scripts/seed/*`),
 * not a page-load side effect.
 *
 * `ensureSeeded()` is retained because `StoreHydrator` calls it on mount — it now
 * only installs the audit bridge so api-module `audit.emit(...)` calls persist to
 * `audit_entries`. `reseed()` (admin DemoSeedControl) is likewise audit-bridge
 * only: in the real-DB era there is no browser-local demo state to reset, and we
 * must never wipe/re-seed the live tables from the UI.
 */
import { installAuditBridge } from './audit'

export async function ensureSeeded(): Promise<void> {
  installAuditBridge()
}

export async function reseed(): Promise<void> {
  installAuditBridge()
}
