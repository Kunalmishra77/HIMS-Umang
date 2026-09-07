/**
 * Give the integration tests a browser-like cookie jar.
 *
 * The stores call internal routes with `fetch`, and those routes authenticate
 * the caller from the Supabase session cookie. A browser sets that cookie when
 * the app bridges the session through POST /api/auth/session, then attaches it
 * to every same-origin request automatically. Node's `fetch` does neither, so
 * without this a signed-in test still reaches the server as an anonymous
 * caller and a session-gated route (see /api/opd-advance) rejects it.
 *
 * `attachServerSession` performs the same bridge the app performs and patches
 * `globalThis.fetch` to send the resulting cookies back. Call it after signing
 * in, and `detachServerSession` in `afterAll`.
 */
import { apiUrl } from '@/lib/apiUrl'

type Fetch = typeof globalThis.fetch

let originalFetch: Fetch | null = null

/** Split a Set-Cookie header into `name=value` pairs, dropping the attributes. */
function cookiePairs(setCookie: string[]): string[] {
  return setCookie.map((c) => c.split(';')[0]).filter(Boolean)
}

export async function attachServerSession(session: {
  access_token: string
  refresh_token: string
}): Promise<void> {
  const base = originalFetch ?? globalThis.fetch
  const res = await base(apiUrl('/api/auth/session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  })
  if (!res.ok) {
    throw new Error(`session bridge failed: ${res.status} ${await res.text()}`)
  }

  const cookies = cookiePairs(res.headers.getSetCookie())
  if (!cookies.length) throw new Error('session bridge returned no cookies')
  const cookieHeader = cookies.join('; ')

  if (!originalFetch) originalFetch = globalThis.fetch
  const inner = originalFetch
  globalThis.fetch = ((input, init) => {
    const headers = new Headers(init?.headers)
    if (!headers.has('cookie')) headers.set('cookie', cookieHeader)
    return inner(input, { ...init, headers })
  }) as Fetch
}

export function detachServerSession(): void {
  if (originalFetch) {
    globalThis.fetch = originalFetch
    originalFetch = null
  }
}
