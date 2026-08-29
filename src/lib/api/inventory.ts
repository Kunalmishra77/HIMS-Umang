/* Inventory — assets + requisitions + repairs, persisted to one `inventory`
 * table (kind discriminator + data jsonb). The store owns the rich types. */
import { z } from 'zod'
import { table } from './_core'

export const InventoryRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['asset', 'requisition', 'repair']),
  status: z.string().optional(),
  data: z.unknown(),
})
export type InventoryRow = z.infer<typeof InventoryRowSchema>

type Rec = { id: string; status?: string; [k: string]: unknown }

const rows = table<InventoryRow>('inventory', InventoryRowSchema)

export const Inventory = {
  async saveMany(input: { assets: Rec[]; requisitions: Rec[]; repairs: Rec[] }) {
    await Promise.all([
      ...input.assets.map((a) => rows.put({ id: a.id, kind: 'asset', status: a.status, data: a })),
      ...input.requisitions.map((r) => rows.put({ id: r.id, kind: 'requisition', status: r.status, data: r })),
      ...input.repairs.map((r) => rows.put({ id: r.id, kind: 'repair', status: r.status, data: r })),
    ])
  },
  async list(): Promise<{ assets: Rec[]; requisitions: Rec[]; repairs: Rec[] }> {
    const all = await rows.list()
    const of = (k: string) => all.filter((r) => r.kind === k).map((r) => r.data as Rec).filter(Boolean)
    return { assets: of('asset'), requisitions: of('requisition'), repairs: of('repair') }
  },
  _table: rows,
}
