import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { getSupabaseClient } from '@/lib/supabase/client'

// Same isBrowser-guarded storage fix as useNarcoticsStore.ts's Phase 6 Task 6
// fix — bare `createJSONStorage(() => localStorage)` throws uncaught the
// first time persist calls getItem/setItem in any non-browser environment
// (SSR, this Node-based vitest suite). Latent here until StoreHydrator
// actually calls `.persist.rehydrate()` for this store.
const isBrowser = typeof window !== 'undefined'
const safeStorage = {
  getItem: (name: string) => isBrowser ? localStorage.getItem(name) : null,
  setItem: (name: string, value: string) => { if (isBrowser) localStorage.setItem(name, value) },
  removeItem: (name: string) => { if (isBrowser) localStorage.removeItem(name) },
}

export type DrugSchedule = 'OTC' | 'H' | 'H1' | 'X' | 'G'
export type DrugForm = 'tablet' | 'capsule' | 'syrup' | 'injection' | 'cream' | 'drops' | 'inhaler' | 'patch'

export interface DrugEntry {
  id: string
  genericName: string
  brandNames: string[]
  form: DrugForm
  strength: string
  schedule: DrugSchedule
  atcCode?: string
  contraindications: string[]
  interactions: string[]
  allergyClasses: string[]
  maxDailyDoseMg?: number
  requiresDualSignature?: boolean
}

interface DrugMasterState {
  drugs: DrugEntry[]
  search: (query: string) => DrugEntry[]
  getById: (id: string) => DrugEntry | undefined
  hydrateReal: () => Promise<void>
}

const DRUG_CATALOG: DrugEntry[] = [
  { id: 'D-001', genericName: 'Metformin', brandNames: ['Glyciphage', 'Glucophage'], form: 'tablet', strength: '500mg', schedule: 'H', atcCode: 'A10BA02', contraindications: ['eGFR<30', 'hepatic failure'], interactions: ['Contrast media', 'Alcohol'], allergyClasses: ['Biguanide'], maxDailyDoseMg: 2550 },
  { id: 'D-002', genericName: 'Amlodipine', brandNames: ['Amlokind', 'Stamlo'], form: 'tablet', strength: '5mg', schedule: 'H', atcCode: 'C08CA01', contraindications: ['Cardiogenic shock'], interactions: ['Simvastatin'], allergyClasses: ['Dihydropyridine CCB'], maxDailyDoseMg: 10 },
  { id: 'D-003', genericName: 'Warfarin', brandNames: ['Warf', 'Coumadin'], form: 'tablet', strength: '2mg', schedule: 'H', atcCode: 'B01AA03', contraindications: ['Active bleeding', 'Pregnancy'], interactions: ['Aspirin', 'NSAIDs', 'Amiodarone'], allergyClasses: ['Coumarin anticoagulant'], maxDailyDoseMg: 10 },
  { id: 'D-004', genericName: 'Morphine', brandNames: ['Morcontin'], form: 'injection', strength: '10mg/mL', schedule: 'X', atcCode: 'N02AA01', contraindications: ['Respiratory depression', 'Head injury'], interactions: ['Benzodiazepines', 'MAOIs'], allergyClasses: ['Opioid'], maxDailyDoseMg: 120, requiresDualSignature: true },
  { id: 'D-005', genericName: 'Amoxicillin', brandNames: ['Mox', 'Amoxil'], form: 'capsule', strength: '500mg', schedule: 'H', atcCode: 'J01CA04', contraindications: ['Penicillin allergy'], interactions: ['Warfarin', 'Methotrexate'], allergyClasses: ['Penicillin'], maxDailyDoseMg: 3000 },
  { id: 'D-006', genericName: 'Atorvastatin', brandNames: ['Atorva', 'Lipitor'], form: 'tablet', strength: '10mg', schedule: 'H', atcCode: 'C10AA05', contraindications: ['Active liver disease'], interactions: ['Clarithromycin', 'Amlodipine'], allergyClasses: ['Statin'], maxDailyDoseMg: 80 },
  { id: 'D-007', genericName: 'Diazepam', brandNames: ['Valium', 'Calmpose'], form: 'tablet', strength: '5mg', schedule: 'X', atcCode: 'N05BA01', contraindications: ['Myasthenia gravis', 'Severe respiratory insufficiency'], interactions: ['Alcohol', 'Opioids'], allergyClasses: ['Benzodiazepine'], maxDailyDoseMg: 40, requiresDualSignature: true },
  { id: 'D-008', genericName: 'Paracetamol', brandNames: ['Crocin', 'Dolo', 'Combiflam'], form: 'tablet', strength: '500mg', schedule: 'OTC', atcCode: 'N02BE01', contraindications: ['Severe hepatic impairment'], interactions: ['Warfarin', 'Alcohol'], allergyClasses: ['Analgesic-antipyretic'], maxDailyDoseMg: 4000 },
]

export const useDrugMasterStore = create<DrugMasterState>()(persist((set, get) => ({
  drugs: DRUG_CATALOG,
  search: (query) => {
    const q = query.toLowerCase()
    return get().drugs.filter(
      (d) =>
        d.genericName.toLowerCase().includes(q) ||
        d.brandNames.some((b) => b.toLowerCase().includes(q))
    )
  },
  getById: (id) => get().drugs.find((d) => d.id === id),
  // Read-only reference data: pull the tenant's formulary from Supabase (pharmacy
  // maintains it there). Falls back to the static catalog when empty/offline.
  hydrateReal: async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession()
    if (!session) return
    try {
      const { DrugMaster } = await import('@/lib/api')
      const drugs = await DrugMaster.list()
      if (drugs.length) set({ drugs: drugs as unknown as DrugEntry[] })
    } catch (err) {
      console.error('[useDrugMasterStore] hydrate failed', err)
    }
  },
}),
  {
    name: 'agentix-drugmasterstore', version: 1,
    storage: createJSONStorage(() => safeStorage),
    skipHydration: true,
  },
))
