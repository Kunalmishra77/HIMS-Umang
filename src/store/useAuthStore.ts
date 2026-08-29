import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Role } from '@/types/roles'
import { getSupabaseClient } from '@/lib/supabase/client'

export type { Role }

export type User = {
  id: string
  name: string
  role: Role
  avatar?: string
  department?: string
  specialization?: string
}

interface AuthState {
  currentUser: User | null
  activeRole: Role
  isRealSession: boolean
  setUser: (user: User) => void
  setRole: (role: Role) => void
  logout: () => void
  hydrateFromSession: () => Promise<void>
}

const DEMO_USERS: Record<Role, User> = {
  doctor:    { id: 'DR-1012',  name: 'Dr. Priya Nair', role: 'doctor',    department: 'General Medicine', specialization: 'General Physician' },
  nurse:     { id: 'NR-402',   name: 'Anjali Desai',   role: 'nurse',     department: 'General Ward' },
  reception: { id: 'RC-204',   name: 'Sunita Joshi',   role: 'reception' },
  billing:   { id: 'BL-801',   name: 'Suresh Nair',    role: 'billing',   department: 'Billing Dept' },
  admin:     { id: 'ADM-01',   name: 'Rajesh Kulkarni', role: 'admin' },
  patient:   { id: 'PT-20394', name: 'Kiran Patil',    role: 'patient' },
}

export const DEMO_USERS_MAP = DEMO_USERS

export const useAuthStore = create<AuthState>()(persist((set) => ({
  currentUser: DEMO_USERS.doctor,
  activeRole: 'doctor',
  isRealSession: false,
  setUser: (user) => set({ currentUser: user, isRealSession: false }),
  setRole: (role) => set({ activeRole: role, currentUser: DEMO_USERS[role], isRealSession: false }),
  logout: () => {
    set({ currentUser: null, isRealSession: false })
    void getSupabaseClient().auth.signOut()
    void fetch('/api/auth/session', { method: 'DELETE' })
  },
  hydrateFromSession: async () => {
    const supabase = getSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      set({ currentUser: null, isRealSession: false })
      return
    }
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, full_name, department, specialization')
      .eq('id', session.user.id)
      .maybeSingle()
    if (error || !profile) {
      set({ currentUser: null, isRealSession: false })
      return
    }
    set({
      activeRole: profile.role as Role,
      currentUser: {
        id: session.user.id,
        name: profile.full_name,
        role: profile.role as Role,
        department: profile.department ?? undefined,
        specialization: profile.specialization ?? undefined,
      },
      isRealSession: true,
    })
  },
}),
  {
    name: 'agentix-authstore', version: 1,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  },
))
