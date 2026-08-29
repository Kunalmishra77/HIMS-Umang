import { useMemo } from 'react'
import {
  useLabOrdersStore,
  flatTests,
  type FlatSample,
  type LabOrder,
} from '@/store/useLabOrdersStore'
import { LAB_CATALOG } from '@/lib/labCatalog'

// Back-compat surface for legacy consumers of the old flat-sample lab store.
// New code should read `useLabOrdersStore` directly — this shim exists so
// doctor/dashboard, doctor/inbox, ResultsTicker's former callers, etc. keep
// working without edits while the lab module is rebuilt around the richer
// LabOrder model. advanceStatus/acknowledgeCritical (the bench-pipeline
// simulation ResultsTicker used to drive) were removed with Task 9's order
// boundary — this project creates lab orders but no portal fulfils them, so
// nothing here may advance a test past 'ordered'.
export type LabSample = FlatSample

interface LegacyLabStore {
  pendingTests: number
  samples: LabSample[]
  addOrderFromDoctor: (order: {
    patientName: string
    patientId?: string
    testName: string
    priority?: 'Routine' | 'Urgent'
    orderedBy?: string
  }) => void
  acknowledgeResult: (id: string) => void
}

const codeByName = (name: string): string | undefined =>
  Object.values(LAB_CATALOG).find(e => e.name === name || e.code === name)?.code

// ─── Stable action refs ───────────────────────────────────────────────────
// All actions delegate to useLabOrdersStore.getState() — they don't depend on
// reactive state, so they can be defined once at module load and reused across
// every render. This avoids breaking reference equality for downstream
// useEffect/useMemo consumers.

const addOrderFromDoctor: LegacyLabStore['addOrderFromDoctor'] = (o) => {
  const code = codeByName(o.testName)
  if (!code) {
    // Reject unknown test names rather than silently rewriting them as CBC.
    // Callers should pick from the catalog or extend it.
    if (typeof window !== 'undefined') {
      console.warn(`[useLabStore shim] Unknown testName "${o.testName}" — order skipped. Add it to LAB_CATALOG or use a typed picker.`)
    }
    return
  }
  useLabOrdersStore.getState().addOrder({
    patientId: o.patientId ?? `PT-${Date.now()}`,
    patientName: o.patientName,
    source: 'OPD',
    doctorName: o.orderedBy ?? '—',
    paymentMode: 'Cash',
    testCodes: [code],
  })
}

const acknowledgeResult: LegacyLabStore['acknowledgeResult'] = (id) =>
  useLabOrdersStore.getState().ackResult(id)

function legacyFor(orders: LabOrder[]): LegacyLabStore {
  const samples = flatTests(orders)
  return {
    pendingTests: samples.filter(s => s.status !== 'Completed').length,
    samples,
    addOrderFromDoctor,
    acknowledgeResult,
  }
}

export function useLabStore(): LegacyLabStore
export function useLabStore<T>(selector: (s: LegacyLabStore) => T): T
export function useLabStore<T>(selector?: (s: LegacyLabStore) => T): T | LegacyLabStore {
  const orders = useLabOrdersStore(s => s.orders)
  // Memoize: only rebuild legacy state when orders change. Action refs are
  // module-level, so reference equality is stable across renders.
  const legacy = useMemo(() => legacyFor(orders), [orders])
  return selector ? selector(legacy) : legacy
}

useLabStore.getState = (): LegacyLabStore => legacyFor(useLabOrdersStore.getState().orders)
