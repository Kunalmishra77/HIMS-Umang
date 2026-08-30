import { describe, expect, it } from 'vitest'
import { matchesClaim, normalizeName, normalizePhone } from '@/lib/patientClaim'
import { deriveUhid } from '@/lib/uhid'

const base = {
  id: 'PT-20394',
  uhid: null,
  phone: '+91 98109 44012',
  fullName: 'Kiran Patil',
  authUserId: null,
}

describe('normalizePhone', () => {
  it('strips spaces, hyphens and a +91 country code', () => {
    expect(normalizePhone('+91 98109 44012')).toBe('9810944012')
    expect(normalizePhone('098109-44012')).toBe('9810944012')
    expect(normalizePhone('9810944012')).toBe('9810944012')
  })
})

describe('normalizeName', () => {
  it('casefolds and collapses whitespace', () => {
    expect(normalizeName('  Kiran   PATIL ')).toBe('kiran patil')
  })
})

describe('matchesClaim', () => {
  const uhid = deriveUhid('PT-20394')

  it('matches a derived UHID when the column is null', () => {
    expect(matchesClaim(base, { uhid, phone: '9810944012', fullName: 'kiran patil' })).toBe(true)
  })

  it('matches a canonical UHID when the column is set', () => {
    const p = { ...base, uhid: 'PUH-2026-01464' }
    expect(matchesClaim(p, { uhid: 'PUH-2026-01464', phone: '9810944012', fullName: 'Kiran Patil' })).toBe(true)
  })

  it('is case-insensitive on the UHID', () => {
    expect(matchesClaim(base, { uhid: uhid.toLowerCase(), phone: '9810944012', fullName: 'Kiran Patil' })).toBe(true)
  })

  it('rejects a wrong phone', () => {
    expect(matchesClaim(base, { uhid, phone: '9999999999', fullName: 'Kiran Patil' })).toBe(false)
  })

  it('rejects a wrong name', () => {
    expect(matchesClaim(base, { uhid, phone: '9810944012', fullName: 'Someone Else' })).toBe(false)
  })

  it('rejects an already-claimed record', () => {
    const claimed = { ...base, authUserId: '00000000-0000-0000-0000-000000000001' }
    expect(matchesClaim(claimed, { uhid, phone: '9810944012', fullName: 'Kiran Patil' })).toBe(false)
  })
})
