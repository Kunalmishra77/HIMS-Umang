/* Dietary — diet plans + meal orders, one `dietary` table (kind + data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const DietaryRowSchema = z.object({ id: z.string(), kind: z.enum(['plan', 'order']), status: z.string().optional(), patientId: z.string().optional(), data: z.unknown() })
export type DietaryRow = z.infer<typeof DietaryRowSchema>
type Rec = { id: string; status?: string; patientId?: string; [k: string]: unknown }
const rows = table<DietaryRow>('dietary', DietaryRowSchema)
export const Dietary = {
  async saveMany(input: { dietPlans: Rec[]; mealOrders: Rec[] }) {
    await Promise.all([
      ...input.dietPlans.map((p) => rows.put({ id: p.id, kind: 'plan', status: p.status, patientId: p.patientId, data: p })),
      ...input.mealOrders.map((o) => rows.put({ id: o.id, kind: 'order', status: o.status, patientId: o.patientId, data: o })),
    ])
  },
  async list(): Promise<{ dietPlans: Rec[]; mealOrders: Rec[] }> {
    const all = await rows.list()
    return { dietPlans: all.filter((r) => r.kind === 'plan').map((r) => r.data as Rec).filter(Boolean), mealOrders: all.filter((r) => r.kind === 'order').map((r) => r.data as Rec).filter(Boolean) }
  },
  _table: rows,
}
