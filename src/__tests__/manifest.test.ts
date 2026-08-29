import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ALL_ROLES } from '@/types/roles'

const APP = path.join(process.cwd(), 'src/app')

const EXPECTED_ROLES = ['doctor', 'nurse', 'reception', 'billing', 'admin', 'patient']

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

const sourceFiles = (dir = path.join(process.cwd(), 'src'), out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}
const REMOVED_PORTALS = [
  'admin', 'admission', 'ambulance', 'audit', 'bloodbank', 'bmw', 'cmo', 'consent',
  'cssd', 'dietary', 'discharge', 'emergency', 'family-track', 'feedback',
  'housekeeping', 'hr', 'insurance', 'inventory', 'journey', 'lab', 'mortuary',
  'ot', 'pharmacy', 'quality', 'radiology', 'secretary', 'vendor-manager',
]

describe('role manifest', () => {
  it('ships exactly the six approved roles', () => {
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
})
