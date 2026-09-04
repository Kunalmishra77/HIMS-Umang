import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast } from '@/lib/testing/contrast'

const css = readFileSync(join(import.meta.dirname, '../globals.css'), 'utf8')

/** Read a custom property's hex value from a named block of globals.css. */
function token(name: string, block: 'root' | 'intake' = 'root'): string {
  const scope = block === 'root'
    ? css.slice(0, css.indexOf('.intake-theme {'))
    : css.slice(css.indexOf('.intake-theme {'))
  const m = scope.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --${name} not found in ${block} block`)
  return m[1]
}

const WHITE = '#FFFFFF'

describe('brand palette — Umang website teal', () => {
  it('uses the website brand hues', () => {
    expect(token('color-primary').toUpperCase()).toBe('#1E97B2')
    expect(token('color-primary-dark').toUpperCase()).toBe('#196B7E')
    expect(token('color-accent').toUpperCase()).toBe('#955408')
  })

  it('keeps every text pairing at AA (4.5:1)', () => {
    // Brand fill carries navy text, not white — white on #1E97B2 is only 3.4:1.
    expect(contrast(token('color-primary'), token('color-on-primary'))).toBeGreaterThanOrEqual(4.5)
    // The dark teal is the one safe to put white text on.
    expect(contrast(token('color-primary-dark'), WHITE)).toBeGreaterThanOrEqual(4.5)
    // Accent is a text colour on white surfaces.
    expect(contrast(token('color-accent'), WHITE)).toBeGreaterThanOrEqual(4.5)
  })

  it('proves white-on-primary is NOT safe, so the split stays justified', () => {
    expect(contrast(token('color-primary'), WHITE)).toBeLessThan(4.5)
  })

  it('keeps clinical severity colours frozen', () => {
    expect(token('color-brand-amber').toUpperCase()).toBe('#F59E0B')
    expect(token('color-brand-green').toUpperCase()).toBe('#16A34A')
    expect(token('color-warning').toUpperCase()).toBe('#F59E0B')
  })

  it('never lets brand orange become a text colour', () => {
    // Read live, not as a literal: this test's job is to notice if the token
    // is ever changed to a value that would be safe as text, which is what
    // would let brand colour start being used as ink.
    expect(contrast(token('color-brand-orange'), WHITE)).toBeLessThan(3)
  })
})

describe('.intake-theme scoped palette', () => {
  it('tracks the root brand hues instead of keeping the retired orange', () => {
    expect(token('color-primary', 'intake').toUpperCase()).toBe('#1E97B2')
    expect(token('color-primary-dark', 'intake').toUpperCase()).toBe('#196B7E')
    expect(token('color-accent', 'intake').toUpperCase()).toBe('#955408')
  })

  it('keeps its text pairings at AA', () => {
    expect(contrast(token('color-primary-dark', 'intake'), WHITE)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('color-accent', 'intake'), WHITE)).toBeGreaterThanOrEqual(4.5)
  })
})

/** Every .ts/.tsx file under src/, recursively. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('brand fills are used in their AA-safe pairing', () => {
  it('never puts white text on the brand teal', () => {
    // #1E97B2 with white is 3.43:1 — below the 4.5 floor for normal text.
    // A text-bearing fill must use --color-primary-dark (6.1:1 with white),
    // or keep --color-primary and switch the ink to --color-on-primary
    // (4.8:1). This guards the pairing; the tests above only guard the values.
    const offending = sourceFiles(join(import.meta.dirname, '../..'))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf8')
        const hits = text.match(/class(?:Name)?="[^"]*"/g) ?? []
        return hits
          .filter((c) => /text-white/.test(c))
          .filter((c) => /bg-primary|bg-\[var\(--color-primary\)\]/.test(c))
          .map(() => file.replace(/^.*[\/]src[\/]/, 'src/'))
      })
    expect([...new Set(offending)]).toEqual([])
  })
})
