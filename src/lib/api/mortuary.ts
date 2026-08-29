/* Mortuary — deceased records, one `mortuary` table (data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const MortuaryRowSchema = z.object({ id: z.string(), status: z.string().optional(), patientId: z.string().optional(), data: z.unknown() })
export type MortuaryRow = z.infer<typeof MortuaryRowSchema>
type Rec = { id: string; status?: string; patientId?: string; [k: string]: unknown }
const rows = table<MortuaryRow>('mortuary', MortuaryRowSchema)
export const Mortuary = {
  async saveMany(records: Rec[]) {
    await Promise.all(records.map((r) => rows.put({ id: r.id, status: r.status, patientId: r.patientId, data: r })))
  },
  async list(): Promise<Rec[]> {
    return (await rows.list()).map((r) => r.data as Rec).filter(Boolean)
  },
  _table: rows,
}
