"use client"

import { useEffect, useState } from "react"
import { nowMs } from "@/lib/clock"

/**
 * Current time as render-safe state.
 *
 * Reading `Date.now()` while rendering is impure and, on the server, produces
 * markup that disagrees with the client's first paint. This captures the clock
 * once on mount (so server and client agree on `0`, then settle together) and
 * re-reads it on an interval when a component shows a live "x minutes ago".
 *
 * Pass `intervalMs` only when the value is displayed; omit it for one-shot
 * comparisons so the component isn't re-rendered on a timer for nothing.
 */
export function useNow(intervalMs?: number): number {
  const [now, setNow] = useState(() => nowMs())

  useEffect(() => {
    if (!intervalMs) return
    const id = setInterval(() => setNow(nowMs()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
