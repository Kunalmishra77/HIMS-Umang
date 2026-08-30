// Task 12 (Layer 2) — route smoke: request every shipped page route in both
// locales against a running server and assert HTTP 200, no `MISSING_MESSAGE`
// / `IntlError` in the body, and no unhandled-exception markers in the body.
//
// Routes are derived from src/app/**/page.tsx (not hand-maintained) so a
// route added or removed in a later task is picked up automatically. Dynamic
// segments ([id], [uhid], [patientId]) get a placeholder value — every page
// under src/app is a "use client" component with no server-side notFound()
// gate on its param (confirmed by reading each dynamic page during Task 12),
// so a placeholder still exercises real SSR + i18n + auth-store bootstrap.
//
// The locale cookie is `locale` (see src/i18n/request.ts), NOT `NEXT_LOCALE`.
//
// Usage: node scripts/route-smoke.mjs   (server must already be running —
// prefer `npm run build && npm start` over `next dev`, see task report)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const LOCALES = ['en', 'hi']
const TIMEOUT_MS = 30000

function findPageFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) findPageFiles(full, out)
    else if (entry.isFile() && entry.name === 'page.tsx') out.push(full)
  }
  return out
}

function toRoute(pageFile) {
  const appDir = path.join(ROOT, 'src', 'app')
  let rel = path.relative(appDir, pageFile).replace(/\\/g, '/')
  rel = rel.replace(/(^|\/)page\.tsx$/, '')
  if (rel === '') return '/'
  // strip route groups like (group) — none currently exist here, kept for safety
  const segments = rel.split('/').filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  const withPlaceholders = segments.map((s) => (s.startsWith('[') && s.endsWith(']') ? 'route-smoke-test' : s))
  return '/' + withPlaceholders.join('/')
}

const pageFiles = findPageFiles(path.join(ROOT, 'src', 'app'))
const routes = [...new Set(pageFiles.map(toRoute))].sort()

console.log(`Discovered ${routes.length} page routes from src/app/**/page.tsx\n`)

const ERROR_MARKERS = ['MISSING_MESSAGE', 'IntlError', 'Application error: a client-side exception has occurred']

const results = []

async function checkOne(route, locale) {
  const url = `${BASE_URL}${route}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Cookie: `locale=${locale}` },
      signal: controller.signal,
    })
    const body = await res.text()
    const foundMarkers = ERROR_MARKERS.filter((m) => body.includes(m))
    const pass = res.status === 200 && foundMarkers.length === 0
    return { route, locale, status: res.status, pass, foundMarkers, bytes: body.length }
  } catch (err) {
    return { route, locale, status: 0, pass: false, foundMarkers: [], error: err.message }
  } finally {
    clearTimeout(timer)
  }
}

for (const route of routes) {
  for (const locale of LOCALES) {
    const r = await checkOne(route, locale)
    results.push(r)
    const label = r.pass ? 'PASS' : 'FAIL'
    const extra = r.error ? ` error=${r.error}` : r.foundMarkers.length ? ` markers=${r.foundMarkers.join(',')}` : ''
    console.log(`[${label}] ${locale}  ${route}  (${r.status})${extra}`)
  }
}

const fails = results.filter((r) => !r.pass)
console.log(`\n=== Route smoke summary ===`)
console.log(`${routes.length} routes x ${LOCALES.length} locales = ${results.length} checks`)
console.log(`PASS: ${results.length - fails.length}  FAIL: ${fails.length}`)
if (fails.length) {
  console.log('\nFailures:')
  for (const f of fails) {
    console.log(`  ${f.locale}  ${f.route}  status=${f.status}${f.error ? ` error=${f.error}` : ''}${f.foundMarkers?.length ? ` markers=${f.foundMarkers.join(',')}` : ''}`)
  }
}

process.exit(fails.length ? 1 : 0)
