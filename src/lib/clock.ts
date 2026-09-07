/* Clock and id helpers.
 *
 * `Date.now()`, `new Date()` and `Math.random()` are impure: React's compiler
 * rules (react-hooks/purity) reject them in a component body because a render
 * must be replayable. Calling them through these helpers keeps the intent
 * obvious at the call site and confines the impurity to one module — event
 * handlers and effects are free to use them, render paths should take a
 * timestamp from `useNow()` instead.
 */

export function nowMs(): number {
  return Date.now()
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** ISO timestamp `days` before now — used to backfill demo/fallback records. */
export function daysAgoIso(days: number): string {
  return new Date(nowMs() - days * 86400000).toISOString()
}

/** Short opaque id. Not a UUID — only used for client-side row keys. */
export function randomId(): string {
  return Math.random().toString(36).slice(2)
}
