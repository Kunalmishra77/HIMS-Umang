/* Vendor Management — vendors + contracts + POs + payments, one `vendor_mgmt`
 * table (kind + data jsonb). The store owns the rich types. */
import { z } from 'zod'
import { table } from './_core'
export const VendorRowSchema = z.object({ id: z.string(), kind: z.enum(['vendor', 'contract', 'po', 'payment']), status: z.string().optional(), data: z.unknown() })
export type VendorRow = z.infer<typeof VendorRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<VendorRow>('vendor_mgmt', VendorRowSchema)
const put = (kind: VendorRow['kind']) => (e: Rec) => rows.put({ id: e.id, kind, status: e.status, data: e })
export const VendorMgmt = {
  async saveMany(input: { vendors: Rec[]; contracts: Rec[]; purchaseOrders: Rec[]; payments: Rec[] }) {
    await Promise.all([
      ...input.vendors.map(put('vendor')), ...input.contracts.map(put('contract')),
      ...input.purchaseOrders.map(put('po')), ...input.payments.map(put('payment')),
    ])
  },
  async list(): Promise<{ vendors: Rec[]; contracts: Rec[]; purchaseOrders: Rec[]; payments: Rec[] }> {
    const all = await rows.list()
    const of = (k: string) => all.filter((r) => r.kind === k).map((r) => r.data as Rec).filter(Boolean)
    return { vendors: of('vendor'), contracts: of('contract'), purchaseOrders: of('po'), payments: of('payment') }
  },
  _table: rows,
}
