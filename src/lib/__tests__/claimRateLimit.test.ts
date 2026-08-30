import { beforeEach, describe, expect, it } from 'vitest'
import { checkAndRecord, recordFailure, resetLimits, getMapSize } from '@/lib/claimRateLimit'

const T0 = 1_700_000_000_000

beforeEach(() => resetLimits())

describe('per-IP rate limit', () => {
  it('allows 5 attempts then blocks the 6th', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkAndRecord({ ip: '1.1.1.1', uhid: `PUH-2026-0000${i}` }, T0).allowed).toBe(true)
    }
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00009' }, T0).allowed).toBe(false)
  })

  it('allows again once the window has passed', () => {
    for (let i = 0; i < 5; i++) checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0)
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0 + 15 * 60_000 + 1).allowed).toBe(true)
  })

  it('tracks each IP separately', () => {
    for (let i = 0; i < 5; i++) checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0)
    expect(checkAndRecord({ ip: '2.2.2.2', uhid: 'PUH-2026-00001' }, T0).allowed).toBe(true)
  })
})

describe('per-UHID lockout', () => {
  it('locks a UHID after 5 failures, regardless of IP', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: `9.9.9.${i}`, uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01464' }, T0).allowed).toBe(false)
  })

  it('releases the lock after an hour', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: '9.9.9.9', uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01464' }, T0 + 60 * 60_000 + 1).allowed).toBe(true)
  })

  it('does not lock a different UHID', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: '9.9.9.9', uhid: 'PUH-2026-01464' }, T0)
    expect(checkAndRecord({ ip: '3.3.3.3', uhid: 'PUH-2026-01465' }, T0).allowed).toBe(true)
  })

  it('blocked attempts do not extend the window', () => {
    for (let i = 0; i < 5; i++) checkAndRecord({ ip: '1.1.1.1', uhid: `PUH-2026-0000${i}` }, T0)
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00099' }, T0).allowed).toBe(false)
    for (let i = 1; i <= 5; i++) {
      checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00099' }, T0 + i * 60_000)
    }
    expect(checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00100' }, T0 + 15 * 60_000 + 1).allowed).toBe(true)
  })
})

describe('memory management', () => {
  it('cleans up expired entries when their windows pass', () => {
    checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00001' }, T0)
    checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00002' }, T0)
    let size = getMapSize()
    expect(size.ipAttempts).toBe(1)

    checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-00003' }, T0 + 15 * 60_000 + 1)
    size = getMapSize()
    expect(size.ipAttempts).toBe(1)
  })

  it('cleans up UHID failure entries after they expire', () => {
    for (let i = 0; i < 5; i++) recordFailure({ ip: '9.9.9.9', uhid: 'PUH-2026-01464' }, T0)
    let size = getMapSize()
    expect(size.uhidFailures).toBe(1)

    checkAndRecord({ ip: '1.1.1.1', uhid: 'PUH-2026-01464' }, T0 + 60 * 60_000 + 1)
    size = getMapSize()
    expect(size.uhidFailures).toBe(0)
  })
})
