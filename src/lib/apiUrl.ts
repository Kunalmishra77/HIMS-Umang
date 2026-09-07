/**
 * Resolve an internal API path for `fetch`.
 *
 * In the browser a root-relative path is already correct, so it is returned
 * untouched. Outside the browser — the integration tests, and any future
 * server-side caller — `fetch` rejects a relative URL ("Failed to parse URL"),
 * so the path is resolved against the app's own origin.
 */
export function apiUrl(path: string): string {
  if (typeof window !== "undefined") return path

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.TEST_BASE_URL ??
    "http://localhost:3000"

  return new URL(path, base).toString()
}
