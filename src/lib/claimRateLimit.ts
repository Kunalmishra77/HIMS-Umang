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

export function resetLimits(): void {
  ipAttempts.clear()
  uhidFailures.clear()
}

export function recordFailure(key: { ip: string; uhid: string }, now = Date.now()): void {
  const uhid = key.uhid.trim().toUpperCase()
  const prior = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  uhidFailures.set(uhid, [...prior, now])
}

export function checkAndRecord(key: { ip: string; uhid: string }, now = Date.now()): { allowed: boolean } {
  const uhid = key.uhid.trim().toUpperCase()

  const failures = withinWindow(uhidFailures.get(uhid) ?? [], now, UHID_LOCK_MS)
  uhidFailures.set(uhid, failures)
  if (failures.length >= UHID_MAX_FAILURES) return { allowed: false }

  const attempts = withinWindow(ipAttempts.get(key.ip) ?? [], now, IP_WINDOW_MS)
  if (attempts.length >= IP_MAX) {
    ipAttempts.set(key.ip, attempts)
    return { allowed: false }
  }

  ipAttempts.set(key.ip, [...attempts, now])
  return { allowed: true }
}
