"use client"

import { useSyncExternalStore } from "react"

// `useSyncExternalStore` is React's supported way to ask "am I on the client
// yet?" without a setState-in-effect: the server snapshot is `false`, the
// client snapshot is `true`, and React re-renders once after hydration. Both
// snapshots are constants, so they are stable across repeated reads.
const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

/**
 * `false` during the server render and the first client render, `true`
 * afterwards. Use it to gate UI whose content is derived from browser-only
 * state (localStorage, `window.location`, the wall clock) so the two renders
 * agree and hydration stays clean.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
