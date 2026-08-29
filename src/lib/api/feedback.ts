/* Feedback — patient feedback requests + records, one `feedback` table. */
import { z } from 'zod'
import { table } from './_core'
export const FeedbackRowSchema = z.object({ id: z.string(), kind: z.enum(['request', 'record']), status: z.string().optional(), patientId: z.string().optional(), data: z.unknown() })
export type FeedbackRow = z.infer<typeof FeedbackRowSchema>
type Rec = { id: string; status?: string; patientId?: string; [k: string]: unknown }
const rows = table<FeedbackRow>('feedback', FeedbackRowSchema)
export const Feedback = {
  async saveMany(input: { requests: Rec[]; records: Rec[] }) {
    await Promise.all([
      ...input.requests.map((r) => rows.put({ id: r.id, kind: 'request', status: r.status, patientId: r.patientId, data: r })),
      ...input.records.map((r) => rows.put({ id: r.id, kind: 'record', status: r.status, patientId: r.patientId, data: r })),
    ])
  },
  async list(): Promise<{ requests: Rec[]; records: Rec[] }> {
    const all = await rows.list()
    return { requests: all.filter((r) => r.kind === 'request').map((r) => r.data as Rec).filter(Boolean), records: all.filter((r) => r.kind === 'record').map((r) => r.data as Rec).filter(Boolean) }
  },
  _table: rows,
}
