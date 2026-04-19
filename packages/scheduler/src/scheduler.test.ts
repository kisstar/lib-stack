import { afterEach, describe, expect, it, vi } from 'vitest'
import { createScheduler } from './scheduler'
import { resetUid } from './uid'

afterEach(() => {
  resetUid()
})

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe('scheduler', () => {
  describe('basic task execution', () => {
    it('should execute a single task', async () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({ fn: async () => 42 })
      scheduler.start()
      const result = await handle.promise
      expect(result).toBe(42)
      expect(handle.status).toBe('completed')
      expect(handle.result).toBe(42)
    })

    it('should auto-generate task id', () => {
      const scheduler = createScheduler()
      const h1 = scheduler.add({ fn: async () => {} })
      const h2 = scheduler.add({ fn: async () => {} })
      expect(h1.id).toBe('task_1')
      expect(h2.id).toBe('task_2')
    })

    it('should use user-provided id', () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({ id: 'my-task', fn: async () => {} })
      expect(handle.id).toBe('my-task')
    })

    it('should reject duplicate id', () => {
      const scheduler = createScheduler()
      scheduler.add({ id: 'dup', fn: async () => {} })
      expect(() => scheduler.add({ id: 'dup', fn: async () => {} })).toThrow('already exists')
    })

    it('should execute sync tasks', async () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({ fn: () => 'sync' })
      scheduler.start()
      expect(await handle.promise).toBe('sync')
    })
  })

  describe('concurrency control', () => {
    it('should respect max concurrency', async () => {
      const scheduler = createScheduler({ concurrency: 2 })
      let maxConcurrent = 0
      let current = 0

      const tasks = Array.from({ length: 5 }, (_, i) =>
        scheduler.add({
          id: `t${i}`,
          fn: async () => {
            current++
            maxConcurrent = Math.max(maxConcurrent, current)
            await wait(30)
            current--
            return i
          },
        }))

      scheduler.start()
      await Promise.all(tasks.map(t => t.promise))
      expect(maxConcurrent).toBeLessThanOrEqual(2)
    })
  })

  describe('priority', () => {
    it('should execute higher priority tasks first', async () => {
      const scheduler = createScheduler({ concurrency: 1 })
      const order: string[] = []

      scheduler.add({
        id: 'low',
        priority: 1,
        fn: async () => { order.push('low') },
      })
      scheduler.add({
        id: 'high',
        priority: 10,
        fn: async () => { order.push('high') },
      })
      scheduler.add({
        id: 'mid',
        priority: 5,
        fn: async () => { order.push('mid') },
      })

      scheduler.start()
      await wait(100)
      expect(order).toEqual(['high', 'mid', 'low'])
    })
  })

  describe('dependencies', () => {
    it('should execute dependencies before dependents', async () => {
      const scheduler = createScheduler()
      const order: string[] = []

      scheduler.add({
        id: 'a',
        fn: async () => {
          order.push('a')
          return 'resultA'
        },
      })
      scheduler.add({
        id: 'b',
        dependencies: ['a'],
        fn: async (ctx) => {
          order.push('b')
          return ctx.dependencyResults.a
        },
      })

      scheduler.start()
      await wait(100)
      expect(order).toEqual(['a', 'b'])
    })

    it('should pass dependency results', async () => {
      const scheduler = createScheduler()

      scheduler.add({
        id: 'dep',
        fn: async () => 'depResult',
      })
      const handle = scheduler.add({
        id: 'main',
        dependencies: ['dep'],
        fn: async ctx => ctx.dependencyResults.dep,
      })

      scheduler.start()
      expect(await handle.promise).toBe('depResult')
    })

    it('should fail dependent when dependency fails', async () => {
      const scheduler = createScheduler()

      scheduler.add({
        id: 'dep',
        fn: async () => { throw new Error('dep failed') },
      })
      const handle = scheduler.add({
        id: 'main',
        dependencies: ['dep'],
        fn: async () => 'should not run',
      })

      scheduler.start()
      await expect(handle.promise).rejects.toThrow('Dependency')
    })

    it('should detect circular dependency in debug mode', () => {
      const scheduler = createScheduler({ debug: true })
      scheduler.add({ id: 'a', dependencies: ['b'], fn: async () => {} })
      expect(() => scheduler.add({ id: 'b', dependencies: ['a'], fn: async () => {} })).toThrow('Circular dependency')
    })

    it('should mark circular dependency as failed in non-debug mode', async () => {
      const warnings: unknown[][] = []
      const scheduler = createScheduler({
        debug: false,
        logger: {
          info: () => {},
          warn: (...args: unknown[]) => warnings.push(args),
          error: () => {},
          debug: () => {},
        },
      })

      scheduler.add({ id: 'a', dependencies: ['b'], fn: async () => {} })
      const handle = scheduler.add({ id: 'b', dependencies: ['a'], fn: async () => {} })

      expect(handle.status).toBe('failed')
      expect(warnings.length).toBe(1)
    })
  })

  describe('priority inheritance', () => {
    it('should elevate dependency priority', async () => {
      const scheduler = createScheduler({ concurrency: 1 })
      const order: string[] = []

      // 'low' has priority 1, 'unrelated' has priority 5
      // 'high' has priority 10 and depends on 'low'
      // So 'low' should be elevated to 10 and run before 'unrelated'
      scheduler.add({
        id: 'low',
        priority: 1,
        fn: async () => { order.push('low') },
      })
      scheduler.add({
        id: 'unrelated',
        priority: 5,
        fn: async () => { order.push('unrelated') },
      })
      scheduler.add({
        id: 'high',
        priority: 10,
        dependencies: ['low'],
        fn: async () => { order.push('high') },
      })

      scheduler.start()
      await wait(100)
      // low gets elevated to 10 (same as high), so: low first (dep), then high, then unrelated
      expect(order).toEqual(['low', 'high', 'unrelated'])
    })
  })

  describe('timeout', () => {
    it('should timeout a task', async () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({
        timeout: 50,
        fn: async ({ signal }) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve('done'), 500)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(signal.reason)
            })
          })
        },
      })

      scheduler.start()
      await expect(handle.promise).rejects.toThrow('timed out')
    })
  })

  describe('retry', () => {
    it('should retry failed tasks', async () => {
      let calls = 0
      const scheduler = createScheduler()
      const handle = scheduler.add({
        retries: 2,
        retryDelay: 0,
        fn: async () => {
          calls++
          if (calls < 3)
            throw new Error('fail')
          return 'ok'
        },
      })

      scheduler.start()
      expect(await handle.promise).toBe('ok')
      expect(calls).toBe(3)
    })

    it('should support retryDelay as function', async () => {
      const delays: number[] = []
      let calls = 0
      const scheduler = createScheduler()
      const handle = scheduler.add({
        retries: 2,
        retryDelay: ({ attempt }) => {
          delays.push(attempt)
          return 0
        },
        fn: async () => {
          calls++
          if (calls < 3)
            throw new Error('fail')
          return 'ok'
        },
      })

      scheduler.start()
      await handle.promise
      expect(delays).toEqual([1, 2])
    })
  })

  describe('cancel', () => {
    it('should cancel a pending task', async () => {
      const scheduler = createScheduler({ concurrency: 1 })

      // Block with a long task
      scheduler.add({
        id: 'blocker',
        fn: async () => wait(200),
      })
      const handle = scheduler.add({
        id: 'target',
        fn: async () => 'should not run',
      })

      scheduler.start()
      scheduler.cancel('target')

      expect(handle.status).toBe('cancelled')
      await expect(handle.promise).rejects.toThrow('cancelled')
    })

    it('should cancel a running task', async () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({
        id: 'running',
        fn: async ({ signal }) => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve('done'), 500)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(signal.reason)
            })
          })
        },
      })

      scheduler.start()
      await wait(10)
      scheduler.cancel('running')

      await expect(handle.promise).rejects.toThrow('cancelled')
    })

    it('should cancel all tasks', async () => {
      const scheduler = createScheduler()
      const makeLongTask = () => async ({ signal }: { signal: AbortSignal }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 500)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(signal.reason)
          })
        })
      }
      const h1 = scheduler.add({ id: 'a', fn: makeLongTask() })
      const h2 = scheduler.add({ id: 'b', fn: makeLongTask() })

      scheduler.start()
      await wait(10)
      scheduler.cancel()

      await expect(h1.promise).rejects.toThrow('cancelled')
      await expect(h2.promise).rejects.toThrow('cancelled')
    })
  })

  describe('stop and resume', () => {
    it('should stop and resume tasks', async () => {
      const scheduler = createScheduler({ concurrency: 1 })
      const order: string[] = []

      scheduler.add({
        id: 'a',
        fn: async () => {
          order.push('a')
          return 'a'
        },
      })
      scheduler.add({
        id: 'b',
        fn: async () => {
          order.push('b')
          return 'b'
        },
      })

      // Start and let first complete
      scheduler.start()
      await wait(50)
      scheduler.stop()
      await wait(20)

      const orderAfterStop = [...order]

      // Resume
      scheduler.start()
      await wait(100)

      // Both should eventually run
      expect(order).toContain('a')
      expect(order).toContain('b')
      expect(order.length).toBeGreaterThanOrEqual(orderAfterStop.length)
    })

    it('should not execute cancelled tasks after resume', async () => {
      const scheduler = createScheduler({ concurrency: 1 })
      const fn = vi.fn(async () => 'result')

      const handle = scheduler.add({ id: 'task', fn })
      scheduler.cancel('task')
      scheduler.start()
      await wait(50)

      expect(fn).not.toHaveBeenCalled()
      expect(handle.status).toBe('cancelled')
    })
  })

  describe('serial mode', () => {
    it('should pass previous result in serial mode', async () => {
      const scheduler = createScheduler({ mode: 'serial' })
      const results: unknown[] = []

      scheduler.add({
        id: 'first',
        priority: 10,
        fn: async () => 'first-result',
      })
      scheduler.add({
        id: 'second',
        priority: 5,
        fn: async (ctx) => {
          results.push(ctx.previousResult)
          return 'second-result'
        },
      })
      scheduler.add({
        id: 'third',
        priority: 1,
        fn: async (ctx) => {
          results.push(ctx.previousResult)
          return 'third-result'
        },
      })

      scheduler.start()
      await wait(100)

      expect(results).toEqual(['first-result', 'second-result'])
    })
  })

  describe('logger', () => {
    it('should call logger methods', async () => {
      const logs: string[] = []
      const logger = {
        info: (...args: unknown[]) => logs.push(`info: ${args.join(' ')}`),
        warn: (...args: unknown[]) => logs.push(`warn: ${args.join(' ')}`),
        error: (...args: unknown[]) => logs.push(`error: ${args.join(' ')}`),
        debug: (...args: unknown[]) => logs.push(`debug: ${args.join(' ')}`),
      }

      const scheduler = createScheduler({ logger })
      scheduler.add({ fn: async () => 'ok' })
      scheduler.start()
      await wait(50)

      expect(logs.some(l => l.startsWith('info:'))).toBe(true)
      expect(logs.some(l => l.startsWith('debug:'))).toBe(true)
    })

    it('should work without logger', async () => {
      const scheduler = createScheduler()
      const handle = scheduler.add({ fn: async () => 42 })
      scheduler.start()
      expect(await handle.promise).toBe(42)
    })
  })
})
