/* Housekeeping — cleaning tasks + staff, one `housekeeping` table. */
import { z } from 'zod'
import { table } from './_core'
export const HousekeepingRowSchema = z.object({ id: z.string(), kind: z.enum(['task', 'staff']), status: z.string().optional(), data: z.unknown() })
export type HousekeepingRow = z.infer<typeof HousekeepingRowSchema>
type Rec = { id: string; status?: string; [k: string]: unknown }
const rows = table<HousekeepingRow>('housekeeping', HousekeepingRowSchema)
export const Housekeeping = {
  async saveMany(input: { tasks: Rec[]; staff: Rec[] }) {
    await Promise.all([
      ...input.tasks.map((t) => rows.put({ id: t.id, kind: 'task', status: t.status, data: t })),
      ...input.staff.map((s) => rows.put({ id: s.id, kind: 'staff', data: s })),
    ])
  },
  async list(): Promise<{ tasks: Rec[]; staff: Rec[] }> {
    const all = await rows.list()
    return { tasks: all.filter((r) => r.kind === 'task').map((r) => r.data as Rec).filter(Boolean), staff: all.filter((r) => r.kind === 'staff').map((r) => r.data as Rec).filter(Boolean) }
  },
  _table: rows,
}
