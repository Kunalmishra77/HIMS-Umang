/* Consent — informed-consent records, one `consent` table (data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const ConsentRowSchema = z.object({ id: z.string(), status: z.string().optional(), patientId: z.string().optional(), data: z.unknown() })
export type ConsentRow = z.infer<typeof ConsentRowSchema>
type Rec = { id: string; status?: string; patientId?: string; [k: string]: unknown }
const rows = table<ConsentRow>('consent', ConsentRowSchema)
export const Consent = {
  async saveMany(records: Rec[]) {
    await Promise.all(records.map((r) => rows.put({ id: r.id, status: r.status, patientId: r.patientId, data: r })))
  },
  async list(): Promise<Rec[]> { return (await rows.list()).map((r) => r.data as Rec).filter(Boolean) },
  _table: rows,
}
