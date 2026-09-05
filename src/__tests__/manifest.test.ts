import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ALL_ROLES } from '@/types/roles'

const APP = path.join(process.cwd(), 'src/app')

const EXPECTED_ROLES = ['doctor', 'nurse', 'reception', 'billing', 'admin', 'patient', 'pharmacy']

// Every route this project actually ships, as segment arrays. A '[param]'
// segment matches any single literal segment; '(group)' segments are routing-
// only and do not appear in URLs.
const shippedRoutes = (): string[][] => {
  const out: string[][] = []
  const walk = (dir: string, segs: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const next = e.name.startsWith('(') ? segs : [...segs, e.name]
      const d = path.join(dir, e.name)
      if (fs.existsSync(path.join(d, 'page.tsx')) || fs.existsSync(path.join(d, 'route.ts'))) {
        out.push(next)
      }
      walk(d, next)
    }
  }
  if (fs.existsSync(path.join(APP, 'page.tsx'))) out.push([])
  walk(APP, [])
  return out
}

const routeMatches = (route: string[], link: string): boolean => {
  const segs = link.split('/').filter(Boolean)
  if (segs.length !== route.length) return false
  return route.every((r, i) => (r.startsWith('[') ? true : r === segs[i]))
}

// A shipped route "starts with" a template literal's static leading segments
// — the interpolated part (patient id, uhid, ...) fills in whatever comes
// after. '[param]' segments in that leading portion match anything, same as
// routeMatches.
const prefixMatches = (route: string[], prefixSegs: string[]): boolean => {
  if (route.length < prefixSegs.length) return false
  return prefixSegs.every((s, i) => route[i] === s || route[i]?.startsWith('['))
}

// Internal links, read only from contexts that actually navigate. Narrow on
// purpose: a broad scan for any '/foo' string produces false positives from
// class names, asset paths and API URLs.
const internalLinks = (src: string): string[] => {
  const pats = [
    /href=["'](\/[a-z0-9/[\]-]*)["']/g,
    /href:\s*["'](\/[a-z0-9/[\]-]*)["']/g,
    /router\.(?:push|replace|prefetch)\(\s*["'](\/[a-z0-9/[\]-]*)["']/g,
    /redirect\(\s*["'](\/[a-z0-9/[\]-]*)["']/g,
  ]
  const found = new Set<string>()
  for (const p of pats) for (const m of src.matchAll(p)) found.add(m[1])
  return [...found].filter((l) => l !== '/' && !l.startsWith('/api/'))
}

// Template-literal navigation — `router.push(\`/journey/${id}\`)`,
// `href={\`/nurse/patients/${id}\`}` — is invisible to internalLinks() (it
// only matches a string literal immediately after href=/href:/router.push/
// redirect). Same four call contexts, but capturing the STATIC prefix up to
// the first interpolation; the char class already excludes '$' and '?', so
// it naturally stops there without extra handling.
const templatePrefixes = (src: string): string[] => {
  const pats = [
    /href=\{`(\/[a-z0-9/[\]-]*)\$\{/g,
    /href:\s*`(\/[a-z0-9/[\]-]*)\$\{/g,
    /router\.(?:push|replace|prefetch)\(\s*`(\/[a-z0-9/[\]-]*)\$\{/g,
    /redirect\(\s*`(\/[a-z0-9/[\]-]*)\$\{/g,
  ]
  const found = new Set<string>()
  for (const p of pats) for (const m of src.matchAll(p)) found.add(m[1])
  return [...found]
}

const sourceFiles = (dir = path.join(process.cwd(), 'src'), out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

// A route-shaped literal: starts with '/', then lowercase-alphanumeric/
// hyphen/slash segments.
const ROUTE_SHAPE = /^\/[a-z0-9][a-z0-9/-]*$/

// Route-shaped string literals that are not routes. Keep this small and
// commented — a growing list is a signal the matcher is too broad, not that
// the codebase has a lot of route-shaped non-routes.
const ALLOWED_NON_ROUTES = new Set<string>([
  '/min', // src/components/nurse/VitalsFields.tsx — respiratory-rate unit label ("breaths /min"), not a link
])

// Every route-shaped literal anywhere in `src` — not just ones adjacent to
// href=/router.push/redirect (internalLinks/templatePrefixes above only look
// there). This is what catches a plain object-literal property like
// `route: "/doctor/ipd"` — exactly the shape destinationFor() returns and
// CommandPalette later feeds to router.push, and exactly what a name-based
// denylist for kept-portal sub-paths can't safely catch (see REMOVED_PORTALS
// comment below). Two shapes:
//   - a plain quoted/backtick string whose ENTIRE content matches
//     ROUTE_SHAPE (isPrefix: false — must equal a shipped route exactly).
//   - a template literal's static leading segment(s) up to the first
//     interpolation (isPrefix: true — the interpolation fills in the rest,
//     so this only needs to prefix-match a shipped route).
const routeLikeLiterals = (src: string): { value: string; isPrefix: boolean }[] => {
  const out: { value: string; isPrefix: boolean }[] = []
  for (const m of src.matchAll(/'(\/[a-z0-9][a-z0-9/-]*)'/g)) out.push({ value: m[1], isPrefix: false })
  for (const m of src.matchAll(/"(\/[a-z0-9][a-z0-9/-]*)"/g)) out.push({ value: m[1], isPrefix: false })
  for (const m of src.matchAll(/`(\/[a-z0-9][a-z0-9/-]*)`/g)) out.push({ value: m[1], isPrefix: false })
  for (const m of src.matchAll(/`(\/[a-z0-9][a-z0-9/-]*)\$\{/g)) out.push({ value: m[1], isPrefix: true })
  return out
}

// Top-level portals/routes Task 3 deleted. Used both to assert none of their
// directories exist on disk AND, below, as a denylist scanned across every
// source file. The route-shaped-literal allowlist check further down catches
// a route-shaped literal that starts a string/template ('/family-track',
// `/family-track/${token}`) — but bce547e's re-review found it does NOT
// catch a route segment that appears after a leading interpolation, e.g.
// `${origin}/family-track/${token}`: routeLikeLiterals() only extracts a
// template's STATIC LEADING segment up to the first interpolation, and here
// the very first thing in the template IS an interpolation, so the
// '/family-track/' that follows it is invisible to that check. The denylist
// below has no such blind spot — it scans the raw source text for the
// literal path segment anywhere, regardless of what precedes it. Does NOT
// include sub-paths of a kept portal (e.g. the former /doctor/ipd) — those
// names ('ipd', 'beds', 'online', 'teleconsult', ...) are common enough as
// ordinary words/abbreviations that a segment-anywhere scan for them would
// false-positive; those stay covered by the routeMatches/prefixMatches
// checks instead, which validate against real shipped routes rather than a
// keyword list. 'journey' is NOT in this list — Task 4 fix round 2 restored
// src/app/journey/[patientId] as the reception journey board's per-patient
// detail view. 'pharmacy' is NOT in this list either — it was Task 3's one
// deliberate exception (see README's "Doctor creates orders; only pharmacy
// fulfils them"), and the pharmacy portal shipped for real in Tasks 3-5.
const REMOVED_PORTALS = [
  'admin', 'admission', 'ambulance', 'audit', 'bloodbank', 'bmw', 'cmo', 'consent',
  'cssd', 'dietary', 'discharge', 'emergency', 'family-track', 'feedback',
  'housekeeping', 'hr', 'insurance', 'inventory', 'lab', 'mortuary',
  'ot', 'quality', 'radiology', 'secretary', 'vendor-manager',
]

// Matches '/<name>' as a genuine path segment, not a substring of a longer
// word or a longer real path: the character before '/' must not be part of
// an identifier, a relative import ('./hr', '../lab') or another path
// segment ('/patient/feedback' must NOT match 'feedback'), and the character
// after the name must end the segment (another '/', a quote/backtick, '?',
// ')', '}', or end of string).
const removedPortalHit = (src: string, name: string): boolean =>
  new RegExp(`(?<![\\w./-])/${name}(?=[/'"\`?)}]|$)`, 'm').test(src)

describe('role manifest', () => {
  it('ships exactly the seven approved roles', () => {
    expect([...ALL_ROLES].sort()).toEqual([...EXPECTED_ROLES].sort())
  })
})

describe('route manifest', () => {
  it('has no directory for any removed portal', () => {
    const present = REMOVED_PORTALS.filter((p) => fs.existsSync(path.join(APP, p)))
    expect(present).toEqual([])
  })

  it('ships no teleconsult route on either side', () => {
    expect(fs.existsSync(path.join(APP, 'doctor/online'))).toBe(false)
    expect(fs.existsSync(path.join(APP, 'patient/teleconsult'))).toBe(false)
  })

  it('never mentions a removed portal as a path segment anywhere in source', () => {
    const hits: string[] = []
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const name of REMOVED_PORTALS) {
        if (removedPortalHit(src, name)) {
          hits.push(`${path.relative(process.cwd(), file)} -> /${name}`)
        }
      }
    }
    expect(hits).toEqual([])
  })

  it('has no internal link anywhere that points at a route this project does not ship', () => {
    const routes = shippedRoutes()
    expect(routes.length).toBeGreaterThan(10)

    const broken: string[] = []
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const link of internalLinks(src)) {
        if (!routes.some((r) => routeMatches(r, link))) {
          broken.push(`${path.relative(process.cwd(), file)} -> ${link}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('has no template-literal navigation whose static prefix matches no shipped route', () => {
    const routes = shippedRoutes()
    expect(routes.length).toBeGreaterThan(10)

    const broken: string[] = []
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const prefix of templatePrefixes(src)) {
        const segs = prefix.split('/').filter(Boolean)
        if (segs.length === 0) continue
        if (!routes.some((r) => prefixMatches(r, segs))) {
          broken.push(`${path.relative(process.cwd(), file)} -> \`${prefix}\${...}\``)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('has no route-shaped string literal anywhere that does not resolve to a shipped route', () => {
    const routes = shippedRoutes()
    expect(routes.length).toBeGreaterThan(10)

    const broken: string[] = []
    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8')
      for (const { value, isPrefix } of routeLikeLiterals(src)) {
        if (value.startsWith('/api/')) continue
        if (ALLOWED_NON_ROUTES.has(value)) continue
        if (!ROUTE_SHAPE.test(value)) continue
        const segs = value.split('/').filter(Boolean)
        if (segs.length === 0) continue
        const ok = isPrefix
          ? routes.some((r) => prefixMatches(r, segs))
          : routes.some((r) => routeMatches(r, value))
        if (!ok) {
          broken.push(`${path.relative(process.cwd(), file)} -> ${value}${isPrefix ? '${...}' : ''}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

})
