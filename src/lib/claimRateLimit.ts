// In-memory limits for the patient claim endpoint. Single-instance only — these
// counters do not survive a restart and are not shared between instances. That is
// adequate for this build and is recorded in the spec; a multi-instance
// deployment must move them to Postgres or Redis.

const IP_MAX = 5
const IP_WINDOW_MS = 15 * 60_000
const UHID_MAX_FAILURES = 5
const UHID_LOCK_MS = 60 * 60_000

const ipAttempts = new Map<string, number[]>()
const uhidFailures = new Map<string, number[]>()

const withinWindow = (times: number[], now: number, window: number) =>
  times.filter((t) => now - t < window)

const setOrDelete = <K>(map: Map<K, number[]>, key: K, times: number[]): void => {
  if (times.length > 0) map.set(key, times)
  else map.delete(key)
}

const sweepExpiredEntries = (map: Map<string, number[]>, now: number, window: number): void => {
  for (const [key, times] of map) {
    const filtered = withinWindow(times, now, window)
    if (filtered.length === 0) map.delete(key)
    else if (filtered.length !== times.length) map.set(key, filtered)
  }
}

export function resetLimits(): void {
  ipAttempts.clear()
  uhidFailures.clear()
}

export function recordFailure(key: { ip: string; uhid: string }, now = Date.now()): void {
  const uhid = key.uhid.trim().toUpperCase()
  const prior = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  setOrDelete(uhidFailures, uhid, [...prior, now])
  sweepExpiredEntries(ipAttempts, now, IP_WINDOW_MS)
}

export function checkAndRecord(key: { ip: string; uhid: string }, now = Date.now()): { allowed: boolean } {
  const uhid = key.uhid.trim().toUpperCase()

  sweepExpiredEntries(uhidFailures, now, UHID_LOCK_MS)
  const failures = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  if (failures.length >= UHID_MAX_FAILURES) {
    setOrDelete(uhidFailures, uhid, failures)
    return { allowed: false }
  }

  sweepExpiredEntries(ipAttempts, now, IP_WINDOW_MS)
  const attempts = withinWindow(ipAttempts.get(key.ip) ?? [], now, IP_WINDOW_MS)
  if (attempts.length >= IP_MAX) {
    setOrDelete(ipAttempts, key.ip, attempts)
    return { allowed: false }
  }

  setOrDelete(ipAttempts, key.ip, [...attempts, now])
  return { allowed: true }
}

export function getMapSize(): { ipAttempts: number; uhidFailures: number } {
  return { ipAttempts: ipAttempts.size, uhidFailures: uhidFailures.size }
}
