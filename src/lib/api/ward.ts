/* Ward — nursing-station bed/patient view, one `ward` table (data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const WardRowSchema = z.object({ id: z.string(), status: z.string().optional(), patientId: z.string().optional(), data: z.unknown() })
export type WardRow = z.infer<typeof WardRowSchema>
type Rec = { id: string; status?: string; patientId?: string; [k: string]: unknown }
const rows = table<WardRow>('ward', WardRowSchema)
export const Ward = {
  async saveMany(patients: Rec[]) {
    await Promise.all(patients.map((p) => rows.put({ id: p.id, status: p.status, patientId: p.patientId, data: p })))
  },
  async list(): Promise<Rec[]> { return (await rows.list()).map((r) => r.data as Rec).filter(Boolean) },
  _table: rows,
}
