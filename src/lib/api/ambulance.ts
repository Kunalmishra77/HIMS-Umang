/* Ambulance — vehicles + trips, persisted to one `ambulance` table (kind
 * discriminator + data jsonb). The store owns the rich vehicle/trip types. */
import { z } from 'zod'
import { table } from './_core'

export const AmbulanceRowSchema = z.object({
  id: z.string(),
  kind: z.enum(['vehicle', 'trip']),
  status: z.string().optional(),
  patientId: z.string().optional(),
  data: z.unknown(),
})
export type AmbulanceRow = z.infer<typeof AmbulanceRowSchema>

type VehicleLike = { id: string; status?: string; [k: string]: unknown }
type TripLike = { id: string; status?: string; patientId?: string; [k: string]: unknown }

const rows = table<AmbulanceRow>('ambulance', AmbulanceRowSchema)

export const Ambulance = {
  async saveMany(input: { vehicles: VehicleLike[]; trips: TripLike[] }) {
    await Promise.all([
      ...input.vehicles.map((v) => rows.put({ id: v.id, kind: 'vehicle', status: v.status, data: v })),
      ...input.trips.map((t) => rows.put({ id: t.id, kind: 'trip', status: t.status, patientId: t.patientId, data: t })),
    ])
  },
  async list(): Promise<{ vehicles: VehicleLike[]; trips: TripLike[] }> {
    const all = await rows.list()
    return {
      vehicles: all.filter((r) => r.kind === 'vehicle').map((r) => r.data as VehicleLike).filter(Boolean),
      trips: all.filter((r) => r.kind === 'trip').map((r) => r.data as TripLike).filter(Boolean),
    }
  },
  _table: rows,
}
