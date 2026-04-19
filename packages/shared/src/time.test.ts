import { describe, expect, it } from 'vitest'
import { formatDate } from './time'

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date(2023, 9, 15, 12, 30, 45)
    expect(formatDate(date)).toBe('2023-10-15 12:30:45')
  })
})
