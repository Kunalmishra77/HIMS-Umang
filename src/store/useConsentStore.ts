import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { issueFamilyToken } from '@/lib/familyToken'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { ConsentRecord, ConsentStatus, NextOfKin } from '@/types/consent'

let _seq = 0
const uid = () => `CST-${String(++_seq).padStart(4, '0')}`

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

interface ConsentState {
  records: ConsentRecord[]

  /** Pull real consent records from Supabase and replace local state. */
  hydrateReal: () => Promise<void>

  createConsentRequest: (
    patientId: string,
    patientName: string,
    procedureName: string,
    requestedBy: string,
    nok: NextOfKin,
  ) => { id: string; token: string; otp: string; expiresAt: string }

  getByToken: (token: string) => ConsentRecord | undefined
  getByJti: (jti: string) => ConsentRecord | undefined
  getPendingForPatient: (patientId: string) => ConsentRecord[]
  getLatestForPatient: (patientId: string) => ConsentRecord | undefined

  markSent: (id: string) => void
  markViewed: (id: string) => void
  verifyOTP: (id: string, entered: string) => boolean
  signConsent: (id: string, signatureBase64: string, signedByName: string) => boolean
  expireStale: () => void
}

// ── Real-backend bridge ──────────────────────────────────────────────────
// Session-gated write-through: local state is always the source of truth for
// the UI; the Supabase write is best-effort and never blocks/reverts a
// mutation on failure (matches useStatutoryStore / useMortuaryStore).
async function persistConsent() {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session) return
  try {
    const { Consent } = await import('@/lib/api')
    await Consent.saveMany(useConsentStore.getState().records as unknown as Parameters<typeof Consent.saveMany>[0])
  } catch (err) {
    console.error('[useConsentStore] persist failed', err)
  }
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set, get) => ({
      records: [],

      hydrateReal: async () => {
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        if (!session) return
        const { Consent } = await import('@/lib/api')
        const records = await Consent.list()
        if (records.length) set({ records: records as unknown as ConsentRecord[] })
      },

      createConsentRequest: (patientId, patientName, procedureName, requestedBy, nok) => {
        const { token, payload } = issueFamilyToken(patientId, patientName, { ttlHours: 6, consent: true })
        const otp = genOtp()
        const expiresAt = new Date(payload.exp).toISOString()
        const record: ConsentRecord = {
          id: uid(),
          patientId,
          patientName,
          procedureName,
          requestedBy,
          requestedAt: new Date().toISOString(),
          nok,
          token,
          tokenJti: payload.jti,
          otp,
          status: 'pending',
          expiresAt,
        }
        set(s => ({ records: [record, ...s.records] }))
        void persistConsent()
        return { id: record.id, token, otp, expiresAt }
      },

      getByToken: (token) => get().records.find(r => r.token === token),

      getByJti: (jti) => get().records.find(r => r.tokenJti === jti),

      getPendingForPatient: (patientId) =>
        get().records.filter(r => r.patientId === patientId && r.status !== 'signed' && r.status !== 'expired' && r.status !== 'rejected'),

      getLatestForPatient: (patientId) =>
        get().records
          .filter(r => r.patientId === patientId)
          .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0],

      markSent: (id) => {
        set(s => ({
          records: s.records.map(r => r.id === id ? { ...r, status: 'sent' as ConsentStatus } : r),
        }))
        void persistConsent()
      },

      markViewed: (id) => {
        set(s => ({
          records: s.records.map(r =>
            r.id === id && r.status !== 'signed'
              ? { ...r, status: 'viewed' as ConsentStatus, viewedAt: new Date().toISOString() }
              : r,
          ),
        }))
        void persistConsent()
      },

      verifyOTP: (id, entered) => {
        const record = get().records.find(r => r.id === id)
        if (!record) return false
        if (record.otp !== entered.trim()) return false
        set(s => ({
          records: s.records.map(r =>
            r.id === id ? { ...r, otpVerifiedAt: new Date().toISOString() } : r,
          ),
        }))
        void persistConsent()
        return true
      },

      signConsent: (id, signatureBase64, signedByName) => {
        const record = get().records.find(r => r.id === id)
        if (!record || record.status === 'signed' || record.status === 'expired') return false
        const now = new Date().toISOString()
        set(s => ({
          records: s.records.map(r =>
            r.id === id
              ? { ...r, status: 'signed' as ConsentStatus, signedAt: now, signatureBase64, signedByName }
              : r,
          ),
        }))
        void persistConsent()
        return true
      },

      expireStale: () => {
        const now = Date.now()
        set(s => ({
          records: s.records.map(r =>
            r.status !== 'signed' && r.status !== 'rejected' && new Date(r.expiresAt).getTime() < now
              ? { ...r, status: 'expired' as ConsentStatus }
              : r,
          ),
        }))
        void persistConsent()
      },
    }),
    {
      name: 'agentix-consent-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
)
