/* Quality / NABH — incidents + audit tasks (arrays) + metrics + nabh (singletons),
 * one `quality` table (kind + data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const QualityRowSchema = z.object({ id: z.string(), kind: z.enum(['incident', 'audit_task', 'metrics', 'nabh']), status: z.string().optional(), data: z.unknown() })
export type QualityRow = z.infer<typeof QualityRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<QualityRow>('quality', QualityRowSchema)
export const Quality = {
  async saveMany(input: { incidents: Rec[]; auditTasks: Rec[]; qualityMetrics?: unknown; nabh?: unknown }) {
    const puts = [
      ...input.incidents.map((i) => rows.put({ id: i.id, kind: 'incident' as const, status: i.status, data: i })),
      ...input.auditTasks.map((t) => rows.put({ id: t.id, kind: 'audit_task' as const, status: t.status, data: t })),
    ]
    if (input.qualityMetrics !== undefined) puts.push(rows.put({ id: 'metrics', kind: 'metrics', data: input.qualityMetrics }))
    if (input.nabh !== undefined) puts.push(rows.put({ id: 'nabh', kind: 'nabh', data: input.nabh }))
    await Promise.all(puts)
  },
  async list(): Promise<{ incidents: Rec[]; auditTasks: Rec[]; qualityMetrics?: unknown; nabh?: unknown }> {
    const all = await rows.list()
    const of = (k: string) => all.filter((r) => r.kind === k).map((r) => r.data as Rec).filter(Boolean)
    const single = (k: string) => all.find((r) => r.kind === k)?.data
    return { incidents: of('incident'), auditTasks: of('audit_task'), qualityMetrics: single('metrics'), nabh: single('nabh') }
  },
  _table: rows,
}
