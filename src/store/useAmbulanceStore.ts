import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuditStore } from './useAuditStore'
import { getSupabaseClient } from '@/lib/supabase/client'

export type VehicleStatus = 'available' | 'on_trip' | 'maintenance' | 'out_of_service'
export type TripStatus = 'dispatched' | 'en_route' | 'at_scene' | 'transporting' | 'completed' | 'cancelled'
export type TripType = 'emergency' | 'transfer' | 'discharge' | 'scheduled'

export interface AmbulanceVehicle {
  id: string
  vehicleNumber: string
  type: 'Basic Life Support' | 'Advanced Life Support' | 'Neonatal' | 'Patient Transport'
  driverId: string
  driverName: string
  paramedicId?: string
  paramedicName?: string
  status: VehicleStatus
  lastServiceDate: string
  currentLocation?: string
  fuelLevel?: number
}

export interface AmbulanceTrip {
  id: string
  vehicleId: string
  vehicleNumber: string
  tripType: TripType
  patientName?: string
  patientId?: string
  pickupLocation: string
  destination: string
  dispatchedAt: string
  arrivedAt?: string
  completedAt?: string
  status: TripStatus
  callerName?: string
  callerPhone?: string
  chiefComplaint?: string
  responseTimeMinutes?: number
}

interface AmbulanceState {
  vehicles: AmbulanceVehicle[]
  trips: AmbulanceTrip[]
  /** Pull real ambulance vehicles + trips from Supabase and replace local state. */
  hydrateReal: () => Promise<void>
  dispatch: (vehicleId: string, trip: Omit<AmbulanceTrip, 'id' | 'vehicleId' | 'vehicleNumber' | 'dispatchedAt' | 'status'>) => void
  updateTrip: (id: string, update: Partial<AmbulanceTrip>) => void
  updateVehicle: (id: string, update: Partial<AmbulanceVehicle>) => void
  availableVehicles: () => AmbulanceVehicle[]
}

const VEHICLES: AmbulanceVehicle[] = [
  { id: 'AMB-01', vehicleNumber: 'MH-01-AA-1234', type: 'Advanced Life Support', driverId: 'DRV-01', driverName: 'Sunil Yadav', paramedicId: 'PARA-01', paramedicName: 'Ravi Sharma', status: 'available', lastServiceDate: '2026-04-15', currentLocation: 'Hospital Bay', fuelLevel: 90 },
  { id: 'AMB-02', vehicleNumber: 'MH-01-AA-5678', type: 'Basic Life Support', driverId: 'DRV-02', driverName: 'Mahesh Patil', status: 'on_trip', lastServiceDate: '2026-04-20', fuelLevel: 65 },
  { id: 'AMB-03', vehicleNumber: 'MH-01-AA-9012', type: 'Patient Transport', driverId: 'DRV-03', driverName: 'Ganesh Rao', status: 'available', lastServiceDate: '2026-05-01', currentLocation: 'Hospital Bay', fuelLevel: 80 },
  { id: 'AMB-04', vehicleNumber: 'MH-01-AA-3456', type: 'Neonatal', driverId: 'DRV-04', driverName: 'Ashok Kumar', status: 'maintenance', lastServiceDate: '2026-04-10' },
]

const TRIPS: AmbulanceTrip[] = [
  { id: 'TRIP-001', vehicleId: 'AMB-02', vehicleNumber: 'MH-01-AA-5678', tripType: 'emergency', pickupLocation: 'Andheri East, Mumbai', destination: 'Agentix HIMS', dispatchedAt: new Date(Date.now() - 1800000).toISOString(), status: 'transporting', callerName: 'Ramesh', callerPhone: '9876543210', chiefComplaint: 'Chest pain', responseTimeMinutes: 8 },
  { id: 'TRIP-002', vehicleId: 'AMB-01', vehicleNumber: 'MH-01-AA-1234', tripType: 'transfer', patientName: 'Kiran Patil', patientId: 'PT-20394', pickupLocation: 'Agentix HIMS', destination: 'AIIMS Delhi', dispatchedAt: new Date(Date.now() - 86400000).toISOString(), completedAt: new Date(Date.now() - 75600000).toISOString(), status: 'completed', responseTimeMinutes: 5 },
]

// ── Real-backend bridge ──────────────────────────────────────────────────
// Session-gated write-through: local state is always the source of truth for
// the UI; the Supabase write is best-effort and never blocks/reverts a
// mutation on failure (matches useBloodBankStore / useOTStore).
async function persistAmbulance() {
  const st = useAmbulanceStore.getState()
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session) return
  try {
    const { Ambulance } = await import('@/lib/api')
    await Ambulance.saveMany({ vehicles: st.vehicles, trips: st.trips } as unknown as Parameters<typeof Ambulance.saveMany>[0])
  } catch (err) {
    console.error('[useAmbulanceStore] persist failed', err)
  }
}

export const useAmbulanceStore = create<AmbulanceState>()(persist((set, get) => ({
  vehicles: VEHICLES,
  trips: TRIPS,

  hydrateReal: async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession()
    if (!session) return
    const { Ambulance } = await import('@/lib/api')
    const { vehicles, trips } = await Ambulance.list()
    if (vehicles.length || trips.length) set({ vehicles: vehicles as unknown as AmbulanceVehicle[], trips: trips as unknown as AmbulanceTrip[] })
  },

  dispatch: (vehicleId, trip) => {
    const vehicle = get().vehicles.find((v) => v.id === vehicleId)
    if (!vehicle) return
    const id = `TRIP-${Date.now()}`
    const newTrip: AmbulanceTrip = {
      ...trip, id, vehicleId, vehicleNumber: vehicle.vehicleNumber,
      dispatchedAt: new Date().toISOString(), status: 'dispatched',
    }
    set((state) => ({
      trips: [newTrip, ...state.trips],
      vehicles: state.vehicles.map((v) => v.id === vehicleId ? { ...v, status: 'on_trip' } : v),
    }))
    useAuditStore.getState().log({
      userId: 'AMB-DISP-01', userName: 'Dispatch Console',
      action: 'ambulance_dispatched',
      resource: 'ambulance_trip', resourceId: id,
      detail: `${vehicle.vehicleNumber} (${vehicle.type}) → ${trip.pickupLocation}${trip.chiefComplaint ? ` · ${trip.chiefComplaint}` : ''}`,
    })
    void persistAmbulance()
  },
  updateTrip: (id, update) => {
    const before = get().trips.find(t => t.id === id)
    set((state) => ({ trips: state.trips.map((t) => t.id === id ? { ...t, ...update } : t) }))
    // When completing a trip, fire audit + free the vehicle.
    if (update.status === 'completed' && before && before.status !== 'completed') {
      const vehicleId = before.vehicleId
      set(state => ({
        vehicles: state.vehicles.map(v => v.id === vehicleId ? { ...v, status: 'available' as const } : v),
      }))
      const minsFromDispatch = Math.max(0, Math.round((Date.now() - new Date(before.dispatchedAt).getTime()) / 60000))
      useAuditStore.getState().log({
        userId: 'AMB-DISP-01', userName: 'Dispatch Console',
        action: 'ambulance_completed',
        resource: 'ambulance_trip', resourceId: id,
        detail: `${before.vehicleNumber} trip closed · ${minsFromDispatch} min · ${before.pickupLocation} → ${before.destination}`,
      })
    }
    void persistAmbulance()
  },
  updateVehicle: (id, update) => {
    set((state) => ({ vehicles: state.vehicles.map((v) => v.id === id ? { ...v, ...update } : v) }))
    void persistAmbulance()
  },
  availableVehicles: () => get().vehicles.filter((v) => v.status === 'available'),
}),
  {
    name: 'agentix-ambulancestore', version: 1,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  },
))
