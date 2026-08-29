/* CSSD — sterilization cycles + instruments, persisted to one `cssd` table
 * (kind discriminator + data jsonb). The store owns the rich types. */
import { z } from 'zod'
import { table } from './_core'

export const CssdRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['cycle', 'instrument']),
  status: z.string().optional(),
  data: z.unknown(),
})
export type CssdRow = z.infer<typeof CssdRowSchema>

type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<CssdRow>('cssd', CssdRowSchema)

export const CSSD = {
  async saveMany(input: { cycles: Rec[]; instruments: Rec[] }) {
    await Promise.all([
      ...input.cycles.map((c) => rows.put({ id: c.id, kind: 'cycle', status: c.status, data: c })),
      ...input.instruments.map((i) => rows.put({ id: i.id, kind: 'instrument', status: i.status, data: i })),
    ])
  },
  async list(): Promise<{ cycles: Rec[]; instruments: Rec[] }> {
    const all = await rows.list()
    return {
      cycles: all.filter((r) => r.kind === 'cycle').map((r) => r.data as Rec).filter(Boolean),
      instruments: all.filter((r) => r.kind === 'instrument').map((r) => r.data as Rec).filter(Boolean),
    }
  },
  _table: rows,
}
