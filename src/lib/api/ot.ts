/* Operation Theatre — procedures + rooms, persisted to one `ot` table (kind
 * discriminator + data jsonb). The store owns the rich OTProcedure / OTRoom
 * types; here they round-trip through `data`. */
import { z } from 'zod'
import { table } from './_core'

export const OtRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['procedure', 'room']),
  patientId: z.string().optional(),
  status: z.string().optional(),
  otRoom: z.string().optional(),
  data: z.unknown(),
})
export type OtRow = z.infer<typeof OtRowSchema>

type ProcedureLike = { id: string; patientId?: string; status?: string; otRoom?: string; [k: string]: unknown }
type RoomLike = { id: string; status?: string; [k: string]: unknown }

const rows = table<OtRow>('ot', OtRowSchema)

export const OT = {
  /** Upsert the full procedure + room set (called after each store mutation). */
  async saveMany(input: { procedures: ProcedureLike[]; rooms: RoomLike[] }) {
    await Promise.all([
      ...input.procedures.map((p) => rows.put({ id: p.id, kind: 'procedure', patientId: p.patientId, status: p.status, otRoom: p.otRoom, data: p })),
      ...input.rooms.map((r) => rows.put({ id: r.id, kind: 'room', status: r.status, data: r })),
    ])
  },
  /** All OT rows split into procedures + rooms (the full `data` records). */
  async list(): Promise<{ procedures: ProcedureLike[]; rooms: RoomLike[] }> {
    const all = await rows.list()
    return {
      procedures: all.filter((r) => r.kind === 'procedure').map((r) => r.data as ProcedureLike).filter(Boolean),
      rooms: all.filter((r) => r.kind === 'room').map((r) => r.data as RoomLike).filter(Boolean),
    }
  },
  _table: rows,
}
