import { describe, expect, it } from 'vitest'
import { isDef, isNonNullable } from './is'

describe('isDefined', () => {
  it('should return true for defined values', () => {
    expect(isDef(0)).toBe(true)
    expect(isDef('')).toBe(true)
    expect(isDef(false)).toBe(true)
    expect(isDef(null)).toBe(true)
  })

  it('should return false for undefined and null', () => {
    expect(isDef(undefined)).toBe(false)
  })
})

describe('isNonNullable', () => {
  it('should return true for non-nullable values', () => {
    expect(isNonNullable(0)).toBe(true)
    expect(isNonNullable('')).toBe(true)
    expect(isNonNullable(false)).toBe(true)
  })

  it('should return false for undefined and null', () => {
    expect(isNonNullable(undefined)).toBe(false)
    expect(isNonNullable(null)).toBe(false)
  })
})
