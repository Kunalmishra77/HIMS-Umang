import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const KEPT = [
  'abha', 'checkin', 'discovery', 'doctor', 'intake', 'journey', 'labs', 'landing',
  'nav', 'notify', 'nurse', 'orderSets', 'p', 'patient', 'reception', 'ui',
]

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name) && !p.includes('__tests__')) out.push(p)
  }
  return out
}

const usedNamespaces = () => {
  const found = new Set<string>()
  for (const f of walk(path.join(ROOT, 'src'))) {
    const src = fs.readFileSync(f, 'utf8')
    for (const m of src.matchAll(/(?:useTranslations|getTranslations)\(\s*['"]([^'".]+)/g)) {
      found.add(m[1])
    }
  }
  return [...found].sort()
}

describe('i18n namespaces', () => {
  for (const locale of ['en', 'hi']) {
    it(`${locale} ships exactly the kept namespaces as JSON files`, () => {
      const files = fs.readdirSync(path.join(ROOT, 'messages', locale))
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.replace('.json', ''))
        .sort()
      expect(files).toEqual([...KEPT].sort())
    })
  }

  it('every namespace the code asks for exists in both locales', () => {
    const used = usedNamespaces()
    expect(used.length).toBeGreaterThan(0)
    for (const locale of ['en', 'hi']) {
      const missing = used.filter(
        (ns) => !fs.existsSync(path.join(ROOT, 'messages', locale, `${ns}.json`)))
      expect({ locale, missing }).toEqual({ locale, missing: [] })
    }
  })

  it('ships no namespace the code never asks for', () => {
    const used = new Set(usedNamespaces())
    expect(KEPT.filter((ns) => !used.has(ns))).toEqual([])
  })
})
