/* Statutory compliance — returns/filings, one `statutory` table (data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const StatutoryRowSchema = z.object({ id: z.string(), status: z.string().optional(), data: z.unknown() })
export type StatutoryRow = z.infer<typeof StatutoryRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<StatutoryRow>('statutory', StatutoryRowSchema)
export const Statutory = {
  async saveMany(entries: Rec[]) {
    await Promise.all(entries.map((e) => rows.put({ id: e.id, status: e.status, data: e })))
  },
  async list(): Promise<Rec[]> { return (await rows.list()).map((r) => r.data as Rec).filter(Boolean) },
  _table: rows,
}
