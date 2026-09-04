"use client"

import { useIsMounted } from "@/lib/useIsMounted"

// Renders children only after mount. Use to wrap UI that derives text from
// client-state timestamps (relative countdowns, absolute clock times) — those
// drift between the server render and the first client render and would
// otherwise cause hydration mismatches. Server + first client render show the
// fallback (identical), then the real content mounts in.
export function ClientOnly({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const mounted = useIsMounted()
  return <>{mounted ? children : fallback}</>
}
