import { useMemo } from 'react'
import {
  useRadiologyStudiesStore,
  flatScans,
  type FlatScan,
  type RadiologyStudy,
} from '@/store/useRadiologyStudiesStore'
import { RADIOLOGY_CATALOG, type Modality } from '@/lib/radiologyCatalog'

// Back-compat surface for legacy consumers of the old flat RadiologyScan store.
// New code should read `useRadiologyStudiesStore` directly. advanceStatus (the
// RIS-pipeline simulation ResultsTicker used to drive) was removed with Task
// 9's order boundary — this project creates imaging orders but no portal
// fulfils them, so nothing here may advance a study past 'ordered'.
export type RadiologyScan = FlatScan

interface LegacyRadStore {
  scansToday: number
  scans: RadiologyScan[]
  addOrderFromDoctor: (order: {
    patientName: string
    patientId?: string
    scanType: 'X-Ray' | 'MRI' | 'CT Scan' | 'Ultrasound'
    bodyPart?: string
    priority?: 'Routine' | 'Urgent'
    orderedBy?: string
  }) => void
  acknowledgeScan: (id: string) => void
}

// Map the legacy scanType + bodyPart hint to a catalog code.
export function codeForLegacy(scanType: string, bodyPart?: string): string | undefined {
  const part = (bodyPart ?? '').toLowerCase()
  // Try exact catalog name first
  const byName = Object.values(RADIOLOGY_CATALOG).find(c => c.name === `${scanType}${bodyPart ? ` ${bodyPart}` : ''}`)
  if (byName) return byName.code
  // Modality fallback
  const modFromType: Record<string, Modality> = { 'X-Ray': 'XR', 'MRI': 'MRI', 'CT Scan': 'CT', 'Ultrasound': 'US' }
  const mod = modFromType[scanType]
  if (!mod) return undefined
  const candidates = Object.values(RADIOLOGY_CATALOG).filter(c => c.modality === mod)
  // Prefer the one whose bodyPart matches the hint
  const matched = candidates.find(c => c.bodyPart.toLowerCase() === part) ??
                  candidates.find(c => part.includes(c.bodyPart.toLowerCase()) || c.bodyPart.toLowerCase().includes(part))
  return matched?.code ?? candidates[0]?.code
}

// ─── Stable action refs (hoisted, like the lab shim) ──────────────────────

const addOrderFromDoctor: LegacyRadStore['addOrderFromDoctor'] = (o) => {
  const code = codeForLegacy(o.scanType, o.bodyPart)
  if (!code) {
    if (typeof window !== 'undefined') {
      console.warn(`[useRadiologyStore shim] No catalog code for ${o.scanType} / ${o.bodyPart}; order skipped.`)
    }
    return
  }
  useRadiologyStudiesStore.getState().addOrder({
    patientId: o.patientId ?? `PT-${Date.now()}`,
    patientName: o.patientName,
    source: 'OPD',
    doctorName: o.orderedBy ?? '—',
    paymentMode: 'Cash',
    code,
    priority: o.priority === 'Urgent' ? 'Urgent' : undefined,
  })
}

const acknowledgeScan: LegacyRadStore['acknowledgeScan'] = (id) =>
  useRadiologyStudiesStore.getState().ackResult(id)

function legacyFor(studies: RadiologyStudy[]): LegacyRadStore {
  const flat = flatScans(studies)
  const today = new Date().toDateString()
  return {
    scansToday: studies.filter(s => new Date(s.orderedAt).toDateString() === today).length,
    scans: flat,
    addOrderFromDoctor,
    acknowledgeScan,
  }
}

export function useRadiologyStore(): LegacyRadStore
export function useRadiologyStore<T>(selector: (s: LegacyRadStore) => T): T
export function useRadiologyStore<T>(selector?: (s: LegacyRadStore) => T): T | LegacyRadStore {
  const studies = useRadiologyStudiesStore(s => s.studies)
  const legacy = useMemo(() => legacyFor(studies), [studies])
  return selector ? selector(legacy) : legacy
}

useRadiologyStore.getState = (): LegacyRadStore =>
  legacyFor(useRadiologyStudiesStore.getState().studies)
