import { resolveUhid } from '@/lib/uhid'

export type ClaimCandidate = {
  id: string
  uhid?: string | null
  phone: string
  fullName: string
  authUserId?: string | null
}

export type ClaimInput = {
  uhid: string
  phone: string
  fullName: string
}

// Indian numbers are stored inconsistently across intake paths ("+91 98109 44012",
// "098109-44012", "9810944012"). Compare on digits alone, dropping a leading 91 or
// 0 so the same subscriber matches however it was typed. Result must be exactly 10 digits.
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits
}

export function isValidNormalizedPhone(normalized: string): boolean {
  return normalized.length === 10
}

export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC')
}

// All three factors must match, and the record must be unclaimed. The UHID is
// compared through resolveUhid because most rows have a NULL uhid column and
// derive the value the patient is actually shown.
export function matchesClaim(patient: ClaimCandidate, claim: ClaimInput): boolean {
  if (patient.authUserId) return false
  const expected = resolveUhid(patient.id, patient.uhid).toUpperCase()
  if (expected !== claim.uhid.trim().toUpperCase()) return false

  const patientPhone = normalizePhone(patient.phone)
  const claimPhone = normalizePhone(claim.phone)
  if (!isValidNormalizedPhone(patientPhone) || !isValidNormalizedPhone(claimPhone)) return false
  if (patientPhone !== claimPhone) return false

  return normalizeName(patient.fullName) === normalizeName(claim.fullName)
}
