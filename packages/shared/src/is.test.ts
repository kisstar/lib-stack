import { describe, expect, it } from 'vitest'
import { isDef } from './is'

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDef(0)).toBe(true)
    expect(isDef('')).toBe(true)
    expect(isDef(false)).toBe(true)
  })

  it('should return false for undefined and null', () => {
    expect(isDef(undefined)).toBe(false)
    expect(isDef(null)).toBe(false)
  })
})
