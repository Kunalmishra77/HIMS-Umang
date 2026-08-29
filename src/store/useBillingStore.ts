import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuditStore } from './useAuditStore'
import { getSupabaseClient } from '@/lib/supabase/client'

export type ChargeType = 'consultation' | 'lab' | 'radiology' | 'pharmacy' | 'ward' | 'procedure' | 'consumable' | 'nursing' | 'ot'

export type ChargeLineItem = {
  id: string
  patientId: string
  type: ChargeType
  description: string
  amount: number
  quantity: number
  date: string
  source: string
  isNonPayable?: boolean
}

export type BillStatus = 'draft' | 'frozen' | 'settled' | 'dispute'

export type Bill = {
  id: string
  patientId: string
  patientName: string
  visitType: 'OPD' | 'IPD' | 'Emergency' | 'Day Care'
  admissionDate?: string
  dischargeDate?: string
  subtotal: number
  discounts: number
  nonPayables: number
  insuranceCovered: number
  patientDue: number
  status: BillStatus
  payerType: string
  paymentMode?: 'Cash' | 'UPI' | 'Card' | 'Insurance'
  paidAmount: number
  receiptNumber?: string
  /** The real Supabase `bills.id` this row is backed by, once known — set
   * immediately for anything pulled in by hydrateReal() (where it equals
   * `id`), or lazily stamped on for a legacy/mock bill the first time a
   * write-through materializes a matching real row (see addCharge). */
  realId?: string
}

// AI duplicate-charge alert returned from detectDuplicates().
export type DuplicateAlert = {
  groupKey: string
  description: string
  ids: string[]
  totalAmount: number
  reason: string
}

interface BillingState {
  bills: Bill[]
  lineItems: ChargeLineItem[]
  /** Pull real bills/lines (+ patient names) from Supabase and merge them in. */
  hydrateReal: () => Promise<void>
  addCharge: (charge: Omit<ChargeLineItem, 'id'>, actorName?: string) => void
  freezeBill: (billId: string, actorName?: string) => void
  applyInsuranceCoverage: (billId: string, amount: number, actorName?: string) => void
  recordPayment: (billId: string, amount: number, mode: Bill['paymentMode'], actorName?: string) => void
  getBillForPatient: (patientId: string) => Bill | undefined
  getItemsForPatient: (patientId: string) => ChargeLineItem[]
  // AI: same description + same date for a patient = potential duplicate.
  detectDuplicates: (patientId: string) => DuplicateAlert[]
}

// Real bills.ts BillLine 'source' values <-> this store's ChargeType. Mirrors
// the fixed mapping the billing bridge spec settled on; the two extra
// ChargeTypes ('radiology', 'nursing', 'ot') have no dedicated real source,
// so reverseMapType folds them into the closest existing one.
type RealBillSource = 'order' | 'drug' | 'bed' | 'procedure' | 'consult' | 'misc'

function mapSourceToType(source: RealBillSource): ChargeType {
  switch (source) {
    case 'consult': return 'consultation'
    case 'drug': return 'pharmacy'
    case 'bed': return 'ward'
    case 'procedure': return 'procedure'
    case 'order': return 'lab'
    case 'misc': return 'consumable'
  }
}

function reverseMapType(type: ChargeType): RealBillSource {
  switch (type) {
    case 'consultation': return 'consult'
    case 'pharmacy': return 'drug'
    case 'ward': return 'bed'
    case 'procedure': return 'procedure'
    case 'lab': return 'order'
    case 'radiology': return 'order'
    case 'consumable': return 'misc'
    case 'nursing': return 'misc'
    case 'ot': return 'procedure'
  }
}

const MOCK_BILLS: Bill[] = [
  {
    id: 'BILL-2024-001',
    patientId: 'PT-10203',
    patientName: 'Mohan Lal',
    visitType: 'IPD',
    admissionDate: new Date(Date.now() - 4 * 24 * 3600000).toISOString(),
    subtotal: 42500,
    discounts: 0,
    nonPayables: 1200,
    insuranceCovered: 38000,
    patientDue: 4500,
    status: 'draft',
    payerType: 'Cashless (Star Health)',
    paidAmount: 0,
  },
  {
    id: 'BILL-2024-002',
    patientId: 'PT-10202',
    patientName: 'Priya Sharma',
    visitType: 'IPD',
    admissionDate: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
    subtotal: 28000,
    discounts: 2000,
    nonPayables: 500,
    insuranceCovered: 0,
    patientDue: 25500,
    status: 'draft',
    payerType: 'General (Cash)',
    paidAmount: 10000,
  },
  {
    id: 'BILL-2024-003',
    patientId: 'PT-10234',
    patientName: 'Aarav Sharma',
    visitType: 'OPD',
    subtotal: 1800,
    discounts: 0,
    nonPayables: 0,
    insuranceCovered: 0,
    patientDue: 1800,
    status: 'draft',
    payerType: 'General',
    paidAmount: 0,
  },
]

const MOCK_LINE_ITEMS: ChargeLineItem[] = [
  { id: 'CI-001', patientId: 'PT-10203', type: 'ward', description: 'Semi-Private Room (4 days)', amount: 12000, quantity: 4, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'Ward' },
  { id: 'CI-002', patientId: 'PT-10203', type: 'nursing', description: 'Nursing Charges (4 days)', amount: 4000, quantity: 4, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'Nursing' },
  { id: 'CI-003', patientId: 'PT-10203', type: 'consultation', description: 'Physician Consultation', amount: 1500, quantity: 1, date: new Date(Date.now() - 4 * 24 * 3600000).toISOString(), source: 'OPD' },
  { id: 'CI-004', patientId: 'PT-10203', type: 'lab', description: 'HbA1c', amount: 800, quantity: 1, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'Lab' },
  { id: 'CI-005', patientId: 'PT-10203', type: 'lab', description: 'Renal Function Test (RFT)', amount: 600, quantity: 1, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'Lab' },
  { id: 'CI-006', patientId: 'PT-10203', type: 'pharmacy', description: 'Insulin (Lantus 10mL)', amount: 2200, quantity: 2, date: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), source: 'Pharmacy' },
  { id: 'CI-007', patientId: 'PT-10203', type: 'pharmacy', description: 'IV Fluids & Consumables', amount: 1800, quantity: 1, date: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), source: 'Pharmacy', isNonPayable: false },
  { id: 'CI-008', patientId: 'PT-10203', type: 'consumable', description: 'Gloves, syringes (non-payable)', amount: 1200, quantity: 1, date: new Date(Date.now() - 1 * 24 * 3600000).toISOString(), source: 'Nursing', isNonPayable: true },

  { id: 'CI-010', patientId: 'PT-10202', type: 'ward', description: 'General Ward (3 days)', amount: 6000, quantity: 3, date: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), source: 'Ward' },
  { id: 'CI-011', patientId: 'PT-10202', type: 'procedure', description: 'Laparoscopic Appendectomy', amount: 18000, quantity: 1, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'OT' },
  { id: 'CI-012', patientId: 'PT-10202', type: 'lab', description: 'Pre-op CBC & LFT Panel', amount: 1400, quantity: 1, date: new Date(Date.now() - 3 * 24 * 3600000).toISOString(), source: 'Lab' },
  { id: 'CI-013', patientId: 'PT-10202', type: 'pharmacy', description: 'Antibiotics (3 days)', amount: 900, quantity: 3, date: new Date(Date.now() - 2 * 24 * 3600000).toISOString(), source: 'Pharmacy' },

  { id: 'CI-020', patientId: 'PT-10234', type: 'consultation', description: 'OPD Consultation', amount: 500, quantity: 1, date: new Date().toISOString(), source: 'OPD' },
  { id: 'CI-021', patientId: 'PT-10234', type: 'lab', description: 'Complete Blood Count (CBC)', amount: 400, quantity: 1, date: new Date().toISOString(), source: 'Lab' },
  { id: 'CI-022', patientId: 'PT-10234', type: 'pharmacy', description: 'Prescription Medicines', amount: 900, quantity: 1, date: new Date().toISOString(), source: 'Pharmacy' },

  // Kiran Patil — NSTEMI post-PCI, 3-day IPD stay
  { id: 'CI-030', patientId: 'PT-20394', type: 'ward',         description: 'ICU bed (2 days)',                          amount: 18000, quantity: 2, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'ICU' },
  { id: 'CI-031', patientId: 'PT-20394', type: 'ward',         description: 'Cardiac ward (1 day)',                      amount: 4500,  quantity: 1, date: new Date(Date.now() - 1 * 86400000).toISOString(), source: 'Ward' },
  { id: 'CI-032', patientId: 'PT-20394', type: 'procedure',    description: 'PCI with drug-eluting stent (LAD)',          amount: 145000, quantity: 1, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'Cath Lab' },
  { id: 'CI-033', patientId: 'PT-20394', type: 'consumable',   description: 'Drug-eluting stent (BIS-approved batch)',    amount: 60000, quantity: 1, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'Cath Lab' },
  { id: 'CI-034', patientId: 'PT-20394', type: 'lab',          description: 'Troponin I (serial)',                        amount: 1200,  quantity: 3, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'Lab' },
  { id: 'CI-035', patientId: 'PT-20394', type: 'radiology',    description: 'X-Ray Chest PA/Lateral',                    amount: 600,   quantity: 1, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'Radiology' },
  { id: 'CI-036', patientId: 'PT-20394', type: 'pharmacy',     description: 'Aspirin + Clopidogrel + Atorvastatin (TTO)', amount: 3200,  quantity: 1, date: new Date(Date.now() - 1 * 86400000).toISOString(), source: 'Pharmacy' },
  { id: 'CI-037', patientId: 'PT-20394', type: 'consultation', description: 'Cardiology rounds (3 days)',                amount: 1500,  quantity: 3, date: new Date(Date.now() - 2 * 86400000).toISOString(), source: 'Cardiology' },
  { id: 'CI-038', patientId: 'PT-20394', type: 'nursing',      description: 'ICU nursing (2 days)',                       amount: 3500,  quantity: 2, date: new Date(Date.now() - 3 * 86400000).toISOString(), source: 'Nursing' },
]

const KIRAN_BILL: Bill = {
  id: 'BILL-2026-KP1',
  patientId: 'PT-20394',
  patientName: 'Kiran Patil',
  visitType: 'IPD',
  admissionDate: new Date(Date.now() - 3 * 86400000).toISOString(),
  dischargeDate: undefined,
  subtotal: 248500,
  discounts: 0,
  nonPayables: 0,
  insuranceCovered: 0,
  patientDue: 248500,
  status: 'draft',
  payerType: 'Cashless (HDFC ERGO)',
  paidAmount: 0,
}
MOCK_BILLS.push(KIRAN_BILL)

export const useBillingStore = create<BillingState>()(persist((set, get) => ({
  bills: MOCK_BILLS,
  lineItems: MOCK_LINE_ITEMS,

  hydrateReal: async () => {
    const { data: { session } } = await getSupabaseClient().auth.getSession()
    if (!session) return
    const { Bills, Patients, patientDueOf } = await import('@/lib/api')
    const [realBills, patients] = await Promise.all([Bills.list(), Patients.list()])
    if (!realBills.length) return
    const nameById = new Map(patients.map(p => [p.id, p.fullName]))

    const mappedBills: Bill[] = realBills.map(b => ({
      id: b.id,
      realId: b.id,
      patientId: b.patientId,
      patientName: nameById.get(b.patientId) ?? b.patientId,
      visitType: b.ipdStayId ? 'IPD' : 'OPD',
      subtotal: b.total,
      discounts: b.discount,
      nonPayables: b.nonPayable,
      insuranceCovered: b.insuranceCovered,
      patientDue: patientDueOf(b),
      status: b.status === 'paid' ? 'settled' : b.status === 'frozen' ? 'frozen' : 'draft',
      payerType: b.payerName ?? b.payerType,
      paidAmount: b.paid,
    }))
    const mappedLineItems: ChargeLineItem[] = realBills.flatMap(b => b.lines.map(l => ({
      id: l.id,
      patientId: b.patientId,
      type: mapSourceToType(l.source),
      description: l.name,
      amount: l.unitPrice,
      quantity: l.qty,
      date: b.createdAt,
      source: l.source,
    })))

    set(s => {
      const bills = [...s.bills]
      for (const mb of mappedBills) {
        const idx = bills.findIndex(b => b.realId === mb.realId)
        if (idx >= 0) bills[idx] = mb
        else bills.unshift(mb)
      }
      const lineItems = [...s.lineItems]
      for (const ml of mappedLineItems) {
        const idx = lineItems.findIndex(i => i.id === ml.id)
        if (idx >= 0) lineItems[idx] = ml
        else lineItems.unshift(ml)
      }
      return { bills, lineItems }
    })
  },

  addCharge: (charge, actorName) => {
    set((s) => ({
      lineItems: [...s.lineItems, { ...charge, id: `CI-${Date.now()}` }],
      bills: s.bills.map(b => {
        if (b.patientId !== charge.patientId) return b
        const addedAmt = charge.amount * charge.quantity
        return { ...b, subtotal: b.subtotal + addedAmt, patientDue: b.patientDue + addedAmt - (charge.isNonPayable ? addedAmt : 0) }
      }),
    }))
    useAuditStore.getState().log({
      userId: 'BL-2001', userName: actorName ?? 'Billing Officer',
      action: 'billing_charge',
      resource: 'charge_line_item', resourceId: charge.patientId,
      detail: `${charge.type} · ${charge.description} · ₹${(charge.amount * charge.quantity).toLocaleString('en-IN')}`,
    })

    // Real backend write-through (session-gated, fire-and-forget). Local
    // state above is already updated, so a failure here just leaves the
    // charge un-synced rather than losing it.
    void (async () => {
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        if (!session) return
        const { Bills } = await import('@/lib/api')
        let billRealId = get().bills.find(b => b.patientId === charge.patientId)?.realId
        if (!billRealId) {
          const existing = await Bills.byPatient(charge.patientId)
          const openBill = existing
            .filter(b => b.status !== 'frozen' && b.status !== 'cancelled')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          const bill = openBill ?? await Bills.create({ patientId: charge.patientId, payerType: 'cash' })
          billRealId = bill.id
          // Stamp the newly-resolved real id onto the matching local bill(s) so
          // the next addCharge/recordPayment/freezeBill for this patient reuses
          // the same real row instead of creating a duplicate.
          set(s => ({
            bills: s.bills.map(b => b.patientId === charge.patientId && !b.realId ? { ...b, realId: billRealId } : b),
          }))
        }
        await Bills.addLine(billRealId, {
          source: reverseMapType(charge.type),
          name: charge.description,
          qty: charge.quantity,
          unitPrice: charge.amount,
          total: charge.amount * charge.quantity,
          duplicateFlag: false,
        })
      } catch (err) {
        console.error('[useBillingStore] real backend addCharge failed (local charge still recorded):', err)
      }
    })()
  },

  freezeBill: (billId, actorName) => {
    const bill = get().bills.find(b => b.id === billId)
    set((s) => ({
      bills: s.bills.map(b => b.id === billId ? { ...b, status: 'frozen' } : b),
    }))
    if (bill) {
      useAuditStore.getState().log({
        userId: 'BL-2001', userName: actorName ?? 'Billing Officer',
        action: 'billing_charge',
        resource: 'bill', resourceId: billId,
        detail: `Bill frozen for ${bill.patientName} (${bill.patientId}) · ₹${bill.subtotal.toLocaleString('en-IN')}`,
      })
    }

    void (async () => {
      try {
        if (!bill?.realId) return
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        if (!session) return
        const { Bills } = await import('@/lib/api')
        await Bills.freeze(bill.realId, { userId: 'BL', userName: actorName ?? 'Billing Officer' })
      } catch (err) {
        console.error('[useBillingStore] real backend freezeBill failed (local bill still frozen):', err)
      }
    })()
  },

  applyInsuranceCoverage: (billId, amount, actorName) => {
    const bill = get().bills.find(b => b.id === billId)
    set((s) => ({
      bills: s.bills.map(b =>
        b.id === billId ? { ...b, insuranceCovered: amount, patientDue: Math.max(0, b.subtotal - b.discounts - b.nonPayables - amount) } : b
      ),
    }))
    if (bill) {
      useAuditStore.getState().log({
        userId: 'BL-2001', userName: actorName ?? 'Billing Officer',
        action: 'billing_charge',
        resource: 'bill', resourceId: billId,
        detail: `Insurance coverage applied · ₹${amount.toLocaleString('en-IN')} · ${bill.payerType}`,
      })
    }

    void (async () => {
      try {
        if (!bill?.realId) return
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        if (!session) return
        const { Bills } = await import('@/lib/api')
        await Bills.setAdjustments(bill.realId, { insuranceCovered: amount }, { userId: 'BL', userName: actorName ?? 'Billing Officer' })
      } catch (err) {
        console.error('[useBillingStore] real backend applyInsuranceCoverage failed (local bill still updated):', err)
      }
    })()
  },

  recordPayment: (billId, amount, mode, actorName) => {
    const bill = get().bills.find(b => b.id === billId)
    set((s) => ({
      bills: s.bills.map(b => {
        if (b.id !== billId) return b
        const newPaid = b.paidAmount + amount
        return { ...b, paidAmount: newPaid, paymentMode: mode, status: newPaid >= b.patientDue ? 'settled' : b.status, receiptNumber: `RCT-${Date.now()}` }
      }),
    }))
    if (bill) {
      useAuditStore.getState().log({
        userId: 'BL-2001', userName: actorName ?? 'Billing Officer',
        action: 'billing_charge',
        resource: 'bill', resourceId: billId,
        detail: `Payment received · ₹${amount.toLocaleString('en-IN')} via ${mode} · ${bill.patientName}`,
      })
    }

    void (async () => {
      try {
        // No payment mode supplied -> skip the real capture rather than guess
        // one; the local record above still reflects the payment either way.
        if (!bill?.realId || !mode) return
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        if (!session) return
        const { Bills } = await import('@/lib/api')
        await Bills.capturePayment(bill.realId, { mode: mode.toLowerCase() as 'cash' | 'upi' | 'card' | 'insurance', amount })
      } catch (err) {
        console.error('[useBillingStore] real backend recordPayment failed (local payment still recorded):', err)
      }
    })()
  },

  getBillForPatient: (patientId) => get().bills.find(b => b.patientId === patientId),
  getItemsForPatient: (patientId) => get().lineItems.filter(i => i.patientId === patientId),

  // Group line items by description + date prefix; flag any group with >1 entry
  // unless explicitly marked as a recurring charge (ward / nursing / consultation).
  detectDuplicates: (patientId) => {
    const items = get().lineItems.filter(i => i.patientId === patientId)
    const RECURRING: ChargeLineItem['type'][] = ['ward', 'nursing', 'consultation']
    const groups = new Map<string, ChargeLineItem[]>()
    for (const i of items) {
      if (RECURRING.includes(i.type)) continue
      const dayKey = i.date.slice(0, 10)
      const key = `${i.type}::${i.description.toLowerCase().trim()}::${dayKey}`
      const list = groups.get(key) ?? []
      list.push(i)
      groups.set(key, list)
    }
    const alerts: DuplicateAlert[] = []
    for (const [key, list] of groups) {
      if (list.length > 1) {
        const totalAmount = list.reduce((s, x) => s + x.amount * x.quantity, 0)
        alerts.push({
          groupKey: key,
          description: list[0]!.description,
          ids: list.map(x => x.id),
          totalAmount,
          reason: `${list.length} identical ${list[0]!.type} entries on same day`,
        })
      }
    }
    return alerts
  },
}),
  {
    name: 'agentix-billingstore', version: 1,
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  },
))
