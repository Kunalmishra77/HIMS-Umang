/* Drug master — formulary reference data, one `drug_master` table (data jsonb).
 * Read-only from the UI (the store has no mutations); pharmacy maintains it. */
import { z } from 'zod'
import { table } from './_core'
export const DrugMasterRowSchema = z.object({ id: z.string(), data: z.unknown() })
export type DrugMasterRow = z.infer<typeof DrugMasterRowSchema>
type Rec = { id: string; [k: string]: unknown }
const rows = table<DrugMasterRow>('drug_master', DrugMasterRowSchema)
export const DrugMaster = {
  async list(): Promise<Rec[]> { return (await rows.list()).map((r) => r.data as Rec).filter(Boolean) },
  async saveMany(drugs: Rec[]) { await Promise.all(drugs.map((d) => rows.put({ id: d.id, data: d }))) },
  _table: rows,
}
