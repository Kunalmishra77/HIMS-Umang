/* Blood Bank — units + cross-match requests, persisted to one `blood_bank`
 * table (kind discriminator + data jsonb). The store owns the rich BloodUnit /
 * CrossMatchRequest types; here they round-trip through `data`. */
import { z } from 'zod'
import { table } from './_core'

export const BloodBankRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['unit', 'request']),
  bloodGroup: z.string().optional(),
  status: z.string().optional(),
  patientId: z.string().optional(),
  data: z.unknown(),
})
export type BloodBankRow = z.infer<typeof BloodBankRowSchema>

type UnitLike = { id: string; bloodGroup?: string; status?: string; [k: string]: unknown }
type RequestLike = { id: string; bloodGroup?: string; status?: string; patientId?: string; [k: string]: unknown }

const rows = table<BloodBankRow>('blood_bank', BloodBankRowSchema)

export const BloodBank = {
  /** Upsert the full inventory + request set (called after each store mutation). */
  async saveMany(input: { units: UnitLike[]; requests: RequestLike[] }) {
    await Promise.all([
      ...input.units.map((u) => rows.put({ id: u.id, kind: 'unit', bloodGroup: u.bloodGroup, status: u.status, data: u })),
      ...input.requests.map((r) => rows.put({ id: r.id, kind: 'request', bloodGroup: r.bloodGroup, status: r.status, patientId: r.patientId, data: r })),
    ])
  },
  /** All blood-bank rows split into units + requests (the full `data` records). */
  async list(): Promise<{ units: UnitLike[]; requests: RequestLike[] }> {
    const all = await rows.list()
    return {
      units: all.filter((r) => r.kind === 'unit').map((r) => r.data as UnitLike).filter(Boolean),
      requests: all.filter((r) => r.kind === 'request').map((r) => r.data as RequestLike).filter(Boolean),
    }
  },
  _table: rows,
}
