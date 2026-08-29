/* Notifications — cross-role bus, one `notifications` table (data jsonb). */
import { z } from 'zod'
import { table } from './_core'
export const NotificationRowSchema = z.object({ id: z.string(), targetRole: z.string().optional(), read: z.boolean().optional(), data: z.unknown() })
export type NotificationRow = z.infer<typeof NotificationRowSchema>
type Rec = { id: string; targetRole?: string; read?: boolean; [k: string]: unknown }
const rows = table<NotificationRow>('notifications', NotificationRowSchema)
export const Notifications = {
  async saveMany(notifications: Rec[]) {
    await Promise.all(notifications.map((n) => rows.put({ id: n.id, targetRole: n.targetRole, read: n.read, data: n })))
  },
  async list(): Promise<Rec[]> { return (await rows.list()).map((r) => r.data as Rec).filter(Boolean) },
  _table: rows,
}
