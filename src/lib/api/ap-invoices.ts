/* Accounts payable — finance vendors + invoices, one `ap_invoices` table. */
import { z } from 'zod'
import { table } from './_core'
export const ApRowSchema = z.object({ id: z.string(), kind: z.enum(['vendor', 'invoice']), status: z.string().optional(), data: z.unknown() })
export type ApRow = z.infer<typeof ApRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<ApRow>('ap_invoices', ApRowSchema)
export const AccountsPayable = {
  async saveMany(input: { vendors: Rec[]; invoices: Rec[] }) {
    await Promise.all([
      ...input.vendors.map((v) => rows.put({ id: v.id, kind: 'vendor', data: v })),
      ...input.invoices.map((i) => rows.put({ id: i.id, kind: 'invoice', status: i.status, data: i })),
    ])
  },
  async list(): Promise<{ vendors: Rec[]; invoices: Rec[] }> {
    const all = await rows.list()
    return { vendors: all.filter((r) => r.kind === 'vendor').map((r) => r.data as Rec).filter(Boolean), invoices: all.filter((r) => r.kind === 'invoice').map((r) => r.data as Rec).filter(Boolean) }
  },
  _table: rows,
}
