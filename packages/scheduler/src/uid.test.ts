import { describe, expect, it } from 'vitest'
import { resetUid, uid } from './uid'

describe('uid', () => {
  it('should generate incremental ids', () => {
    resetUid()
    expect(uid()).toBe('task_1')
    expect(uid()).toBe('task_2')
    expect(uid()).toBe('task_3')
  })

  it('should reset counter', () => {
    resetUid()
    expect(uid()).toBe('task_1')
    resetUid()
    expect(uid()).toBe('task_1')
  })
})
