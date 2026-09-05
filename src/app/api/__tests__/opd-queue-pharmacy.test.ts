import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The mapping is a module-private const in a route handler, so assert it at
// the source. A visit written as 'pharmacy' must surface as 'pharmacy' — it
// was collapsed into 'billing' only because no pharmacy portal shipped.
describe('opd-queue visit-status mapping', () => {
  it('no longer collapses pharmacy into billing', () => {
    const src = readFileSync(
      join(import.meta.dirname, '../opd-queue/route.ts'), 'utf8',
    )
    const map = src.slice(src.indexOf('VISIT_TO_QUEUE'), src.indexOf('}', src.indexOf('VISIT_TO_QUEUE')))
    expect(map).toMatch(/pharmacy:\s*'pharmacy'/)
    expect(map).not.toMatch(/pharmacy:\s*'billing'/)
  })
})
