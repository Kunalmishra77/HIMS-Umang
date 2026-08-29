/* BMW (Bio-Medical Waste) — waste logs + compliance reports, one `bmw` table. */
import { z } from 'zod'
import { table } from './_core'
export const BmwRowSchema = z.object({ id: z.string(), kind: z.enum(['log', 'report']), status: z.string().optional(), data: z.unknown() })
export type BmwRow = z.infer<typeof BmwRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<BmwRow>('bmw', BmwRowSchema)
export const BMW = {
  async saveMany(input: { wasteLogs: Rec[]; reports: Rec[] }) {
    await Promise.all([
      ...input.wasteLogs.map((l) => rows.put({ id: l.id, kind: 'log', status: l.status, data: l })),
      ...input.reports.map((r) => rows.put({ id: r.id, kind: 'report', status: r.status, data: r })),
    ])
  },
  async list(): Promise<{ wasteLogs: Rec[]; reports: Rec[] }> {
    const all = await rows.list()
    return { wasteLogs: all.filter((r) => r.kind === 'log').map((r) => r.data as Rec).filter(Boolean), reports: all.filter((r) => r.kind === 'report').map((r) => r.data as Rec).filter(Boolean) }
  },
  _table: rows,
}
