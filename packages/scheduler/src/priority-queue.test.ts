import type { InternalTask } from './types'
import { describe, expect, it } from 'vitest'
import { PriorityQueue } from './priority-queue'

function makeTask(id: string, effectivePriority: number): InternalTask {
  return {
    id,
    fn: async () => {},
    priority: effectivePriority,
    effectivePriority,
    timeout: 0,
    retries: 0,
    retryDelay: 0,
    retryCondition: () => true,
    dependencies: [],
    status: 'pending',
    result: undefined,
    error: undefined,
    attemptsMade: 0,
    abortController: null,
    resolve: () => {},
    reject: () => {},
    stopped: false,
  } as InternalTask
}

describe('priorityQueue', () => {
  it('should dequeue in priority order (higher first)', () => {
    const q = new PriorityQueue()
    q.enqueue(makeTask('low', 1))
    q.enqueue(makeTask('high', 10))
    q.enqueue(makeTask('mid', 5))

    expect(q.dequeue()!.id).toBe('high')
    expect(q.dequeue()!.id).toBe('mid')
    expect(q.dequeue()!.id).toBe('low')
  })

  it('should return undefined when empty', () => {
    const q = new PriorityQueue()
    expect(q.dequeue()).toBeUndefined()
    expect(q.peek()).toBeUndefined()
  })

  it('should report correct size', () => {
    const q = new PriorityQueue()
    expect(q.size).toBe(0)
    q.enqueue(makeTask('a', 1))
    expect(q.size).toBe(1)
    q.dequeue()
    expect(q.size).toBe(0)
  })

  it('should remove by id', () => {
    const q = new PriorityQueue()
    q.enqueue(makeTask('a', 1))
    q.enqueue(makeTask('b', 2))
    const removed = q.remove('a')
    expect(removed!.id).toBe('a')
    expect(q.size).toBe(1)
    expect(q.remove('nonexistent')).toBeUndefined()
  })

  it('should re-sort after effectivePriority changes', () => {
    const q = new PriorityQueue()
    const low = makeTask('low', 1)
    const high = makeTask('high', 10)
    q.enqueue(low)
    q.enqueue(high)

    low.effectivePriority = 20
    q.sort()

    expect(q.dequeue()!.id).toBe('low')
  })

  it('should clear all items', () => {
    const q = new PriorityQueue()
    q.enqueue(makeTask('a', 1))
    q.enqueue(makeTask('b', 2))
    q.clear()
    expect(q.size).toBe(0)
  })
})
