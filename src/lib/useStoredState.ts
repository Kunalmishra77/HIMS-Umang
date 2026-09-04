"use client"

import { useCallback, useMemo, useState } from "react"
import { useIsMounted } from "@/lib/useIsMounted"

/**
 * State seeded from a browser-only source (localStorage), then owned locally.
 *
 * The obvious spelling — `useState(fallback)` plus an effect that reads storage
 * and calls `setState` — is a synchronous setState inside an effect: it renders
 * once with the wrong value and immediately re-renders, and React's compiler
 * rules reject it. Here the stored value is read once, in a memo that only
 * re-runs when the component reaches the client, and edits are layered on top.
 *
 * `load` and `serverFallback` must be stable (module-scope) values, otherwise
 * the memo re-reads storage on every render.
 *
 * Returns `[value, setValue, ready]`; `ready` is false for the server render
 * and the first client render, which is when `value` is still the fallback.
 */
export function useStoredState<T>(
  load: () => T,
  serverFallback: T,
): [T, (next: T | ((cur: T) => T)) => void, boolean] {
  const ready = useIsMounted()
  const stored = useMemo(() => (ready ? load() : serverFallback), [ready, load, serverFallback])
  const [edited, setEdited] = useState<{ value: T } | null>(null)

  const value = edited ? edited.value : stored

  const setValue = useCallback((next: T | ((cur: T) => T)) => {
    setEdited((cur) => {
      const base = cur ? cur.value : stored
      return { value: typeof next === "function" ? (next as (c: T) => T)(base) : next }
    })
  }, [stored])

  return [value, setValue, ready]
}
