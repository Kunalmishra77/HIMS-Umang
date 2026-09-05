import { describe, expect, it } from 'vitest'
import { ALL_ROLES } from '@/types/roles'

describe('roles', () => {
  it('includes pharmacy, which ships a portal', () => {
    expect(ALL_ROLES).toContain('pharmacy')
  })
})
