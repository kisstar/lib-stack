import { describe, expect, it } from 'vitest'
import { LEVEL_VALUES, LOG_TYPES } from './constants'

describe('lOG_TYPES', () => {
  it('should contain all 6 log types in order', () => {
    expect(LOG_TYPES).toEqual(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
  })
})

describe('lEVEL_VALUES', () => {
  it('should have ascending values from trace to fatal', () => {
    for (let i = 1; i < LOG_TYPES.length; i++) {
      expect(LEVEL_VALUES[LOG_TYPES[i]!]).toBeGreaterThan(LEVEL_VALUES[LOG_TYPES[i - 1]!])
    }
  })

  it('should have "all" equal to trace (lowest)', () => {
    expect(LEVEL_VALUES.all).toBe(LEVEL_VALUES.trace)
  })

  it('should have "off" greater than fatal (highest)', () => {
    expect(LEVEL_VALUES.off).toBeGreaterThan(LEVEL_VALUES.fatal)
  })
})
