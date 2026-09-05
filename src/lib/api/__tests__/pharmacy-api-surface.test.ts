import { describe, expect, it } from 'vitest'
import * as Api from '@/lib/api'

// The pharmacy stores reach these through `await import('@/lib/api')` and
// destructure them. A missing export fails at runtime as `undefined` rather
// than at compile time, so assert the surface directly.
describe('pharmacy API surface', () => {
  it('exports every symbol the pharmacy stores destructure', () => {
    for (const name of [
      'PharmacyDispenses', 'PharmacyStock', 'PharmacyPurchaseOrders',
      'Prescriptions', 'NarcoticsLog', 'DrugMaster',
    ]) {
      expect(Api, `@/lib/api must export ${name}`).toHaveProperty(name)
    }
  })

  it('NarcoticsLog and DrugMaster expose the methods the stores call', () => {
    expect(typeof Api.NarcoticsLog.list).toBe('function')
    expect(typeof Api.NarcoticsLog.create).toBe('function')
    expect(typeof Api.DrugMaster.list).toBe('function')
    expect(typeof Api.DrugMaster.saveMany).toBe('function')
  })
})
