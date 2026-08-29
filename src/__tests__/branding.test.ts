import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The old product name must not survive anywhere a user or a maintainer reads.
const FORBIDDEN = ['Agentix']

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|json)$/.test(e.name)) out.push(p)
  }
  return out
}

describe('branding', () => {
  it('no file under src/ or messages/ mentions the old product name', () => {
    const roots = ['src', 'messages'].map((d) => path.join(process.cwd(), d))
    // This file itself must name the forbidden term literally to check for it —
    // skip it so the guard doesn't perpetually flag its own definition.
    const self = path.join(process.cwd(), 'src', '__tests__', 'branding.test.ts')
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of walk(root)) {
        if (file === self) continue
        const text = fs.readFileSync(file, 'utf8')
        for (const term of FORBIDDEN) {
          if (text.includes(term)) {
            offenders.push(`${path.relative(process.cwd(), file)} -> ${term}`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
