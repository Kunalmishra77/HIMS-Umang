import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const STORES = ['usePharmacyStore', 'useLabOrdersStore', 'useRadiologyStudiesStore']

// Action-name stems that advance an order past 'ordered'. This project creates
// orders and never fulfils them — no portal here could act on these.
//
// The brief's initial guesses ('dispense', 'collectSpecimen', 'accession', …)
// don't match this codebase's real action names (Step 1 inventory) and are
// kept below for reference/future-proofing, but they under-report: every
// store passed with only those stems. Widened with the actual per-store
// action names being removed, found by reading each store's action list and
// its live callers (docs/task-9-report.md has the full inventory).
const FULFILMENT = [
  'dispense', 'collectSpecimen', 'enterResult', 'recordResult',
  'verifyResult', 'approveResult', 'runQC', 'recordQC', 'triggerReflex',
  'scheduleScan', 'recordAcquisition', 'startReading', 'authorReport',
  'publishReport', 'distributeReport', 'decrementStock',
  // usePharmacyStore — dispensing-counter pipeline (queued→preparing→ready→collected).
  // NOTE: pharmacy's own `release` action is deliberately NOT listed as a bare
  // stem — useLabOrdersStore's kept STATUS_MAP has a literal `released:` key
  // (a TestStatus→display-label mapping, not an action) that the naive
  // startsWith('release') check would false-positive on forever. `claim` /
  // `updateStatus` / `markCollected` already pin the pharmacy store's removal.
  'updateStatus', 'markCollected', 'claim', 'setMedicineSupply',
  'substituteMedicine', 'togglePatientModification', 'applyModification',
  'requestProcurement', 'adjustQuantity', 'approveSupervisorOverride',
  // useLabOrdersStore — bench pipeline (collect→claim→enter→verify→release) + reflex queue.
  'collectOrder', 'rejectSpecimen', 'recollectOrder', 'unclaim', 'enterAnalyte',
  'finishEntry', 'verifyTest', 'releaseTest', 'rejectTest', 'analyzerAutoFeed',
  'microAdvance', 'microRelease', 'logCallback', 'pushReflex', 'orderReflex',
  'dismissReflex',
  // useRadiologyStudiesStore — RIS pipeline (schedule→arrive→acquire→read→report→verify/release).
  'schedule', 'markArrived', 'claimAcquisition', 'markAcquired', 'attachImage',
  'claimReading', 'setAIPrelim', 'updateReportSection', 'submitReport',
  'verifyAndRelease', 'cancelStudy', 'setContrastConsented', 'setNoShowRisk',
  'setPredictedDuration', 'recordDose', 'setAIFindings', 'flagQuality',
  'residentSubmit', 'consultantVerify', 'recordDistribution', 'startEscalation',
  'ackEscalation', 'linkPrior',
]

const actionNames = (file: string): string[] => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/store', `${file}.ts`), 'utf8')
  return [...src.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => m[1])
}

describe('order boundary', () => {
  for (const store of STORES) {
    it(`${store} exposes no fulfilment action`, () => {
      const names = actionNames(store)
      expect(names.length).toBeGreaterThan(0)
      const offenders = names.filter((n) =>
        FULFILMENT.some((f) => n.toLowerCase().startsWith(f.toLowerCase())))
      expect(offenders).toEqual([])
    })

    it(`${store} still exposes at least one create action`, () => {
      const names = actionNames(store)
      expect(names.some((n) => /^(add|create|order|place|prescribe)/i.test(n))).toBe(true)
    })
  }
})
