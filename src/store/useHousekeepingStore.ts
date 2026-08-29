import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuditStore } from './useAuditStore'
import { getSupabaseClient } from '@/lib/supabase/client'

export type CleaningPriority = 'Urgent' | 'High' | 'Routine'
export type CleaningStatus = 'Pending' | 'In Progress' | 'Done' | 'Verified'

export type CleaningTask = {
  id: string
  bedId: string
  bedNumber: string
  ward: string
  priority: CleaningPriority
  reason: 'Discharge' | 'Transfer' | 'Routine' | 'Infection Control'
  status: CleaningStatus
  assignedTo?: string
  requestedAt: string
  startedAt?: string
  completedAt?: string
  verifiedAt?: string
  verifiedBy?: string
  notes?: string
}

export type HousekeepingStaff = { id: string; name: string; currentTaskId?: string }

interface HousekeepingState {
  tasks: CleaningTask[]
  staff: HousekeepingStaff[]
  /** Pull real cleaning tasks + staff from Supabase and replace local state. */
  hydrateReal: () => Promise<void>
  addTask: (task: Omit<CleaningTask, 'id' | 'requestedAt'>) => void
  assignTask: (taskId: string, staffName: string) => void
  startTask: (taskId: string) => void
  completeTask: (taskId: string) => void
  verifyTask: (taskId: string, verifiedBy: string) => void
}

// ── Real-backend bridge ──────────────────────────────────────────────────
// Session-gated write-through: local state is always the source of truth for
// the UI; the Supabase write is best-effort and never blocks/reverts a
// mutation on failure (matches useCSSDStore / useBloodBankStore).
async function persistHousekeeping() {
  const st = useHousekeepingStore.getState()
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session) return
  try {
    const { Housekeeping } = await import('@/lib/api')
    await Housekeeping.saveMany({ tasks: st.tasks, staff: st.staff } as unknown as Parameters<typeof Housekeeping.saveMany>[0])
  } catch (err) {
    console.error('[useHousekeepingStore] persist failed', err)
  }
}

export const useHousekeepingStore = create<HousekeepingState>()(persist((set) => ({
  tasks: [
    {
      id: 'HK-001',
      bedId: 'BED-103',
      bedNumber: '103',
      ward: 'General Ward',
      priority: 'Urgent',
      reason: 'Discharge',
      status: 'In Progress',
      assignedTo: 'Ramesh (HK)',
      requestedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      startedAt: new Date(Date.now() - 20 * 60000).toISOString(),
    },
    {
      id: 'HK-002',
      bedId: 'BED-302',
      bedNumber: '302',
      ward: 'Private Room',
      priority: 'High',
      reason: 'Transfer',
      status: 'Pending',
      requestedAt: new Date(Date.now() - 10 * 60000).toISOString(),
    },
    {
      id: 'HK-003',
      bedId: 'BED-201',
      bedNumber: '201',
      ward: 'Semi-Private',
      priority: 'Routine',
      reason: 'Routine',
      status: 'Verified',
      assignedTo: 'Sunita (HK)',
      requestedAt: new Date(Date.now() - 120 * 60000).toISOString(),
      startedAt: new Date(Date.now() - 100 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 80 * 60000).toISOString(),
      verifiedAt: new Date(Date.now() - 75 * 60000).toISOString(),
      verifiedBy: 'Head Nurse',
    },
  ],
  staff: [
    { id: 'HK-STAFF-01', name: 'Ramesh (HK)', currentTaskId: 'HK-001' },
    { id: 'HK-STAFF-02', name: 'Sunita (HK)' },
    { id: 'HK-STAFF-03', name: 'Govind (HK)' },
  ],

  hydrateReal: async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession()
    if (!session) return
    const { Housekeeping } = await import('@/lib/api')
    const { tasks, staff } = await Housekeeping.list()
    if (tasks.length || staff.length) set({ tasks: tasks as unknown as CleaningTask[], staff: staff as unknown as HousekeepingStaff[] })
  },

  addTask: (task) => {
    set((s) => ({
      tasks: [
        ...s.tasks,
        { ...task, id: `HK-${Date.now()}`, requestedAt: new Date().toISOString() },
      ],
    }))
    void persistHousekeeping()
  },

  assignTask: (taskId, staffName) => {
    set((s) => ({
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, assignedTo: staffName, status: 'Pending' } : t),
      staff: s.staff.map(st => st.name === staffName ? { ...st, currentTaskId: taskId } : st),
    }))
    void persistHousekeeping()
  },

  startTask: (taskId) => {
    set((s) => ({
      tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'In Progress', startedAt: new Date().toISOString() } : t),
    }))
    void persistHousekeeping()
  },

  completeTask: (taskId) => {
    let snapshot: CleaningTask | undefined
    set((s) => {
      snapshot = s.tasks.find(t => t.id === taskId)
      return {
        tasks: s.tasks.map(t => t.id === taskId ? { ...t, status: 'Done', completedAt: new Date().toISOString() } : t),
      }
    })
    if (snapshot) {
      useAuditStore.getState().log({
        userId: 'HK-STAFF-AUTO', userName: snapshot.assignedTo ?? 'Housekeeping',
        action: 'housekeeping_room_cleaned',
        resource: 'bed', resourceId: snapshot.bedId,
        detail: `Bed ${snapshot.bedNumber} cleaned (${snapshot.reason}) · ${snapshot.ward}`,
      })
    }
    void persistHousekeeping()
  },

  verifyTask: (taskId, verifiedBy) => {
    let snapshot: CleaningTask | undefined
    set((s) => {
      snapshot = s.tasks.find(t => t.id === taskId)
      return {
        tasks: s.tasks.map(t =>
          t.id === taskId ? { ...t, status: 'Verified', verifiedAt: new Date().toISOString(), verifiedBy } : t
        ),
        staff: s.staff.map(st => st.currentTaskId === taskId ? { ...st, currentTaskId: undefined } : st),
      }
    })
    if (snapshot) {
      useAuditStore.getState().log({
        userId: 'HK-VERIFY', userName: verifiedBy,
        action: 'housekeeping_bed_turned',
        resource: 'bed', resourceId: snapshot.bedId,
        detail: `Bed ${snapshot.bedNumber} verified ready by ${verifiedBy} · NABH HIC`,
      })
    }
    void persistHousekeeping()
  },
}),
  {
    name: 'agentix-housekeepingstore', version: 1,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  },
))
