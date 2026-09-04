import { readFileSync } from 'node:fs'
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
    // #FFA600 is ~1.96:1 on white. Present as a fill token, but the low ratio
    // is the reason no component may use it for text.
    expect(contrast('#FFA600', WHITE)).toBeLessThan(3)
  })
})
