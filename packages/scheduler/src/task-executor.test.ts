import type { InternalTask, TaskContext } from './types'
import { describe, expect, it } from 'vitest'
import { CancelError, executeTask, TimeoutError } from './task-executor'

function makeTask(overrides: Partial<InternalTask> = {}): InternalTask {
  let res: (value: unknown) => void = () => {}
  let rej: (reason: unknown) => void = () => {}
  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })
  void promise

  return {
    id: 'test',
    fn: async () => 'result',
    priority: 0,
    effectivePriority: 0,
    timeout: 0,
    retries: 0,
    retryDelay: 0,
    retryCondition: () => true,
    dependencies: [],
    status: 'running',
    result: undefined,
    error: undefined,
    attemptsMade: 0,
    abortController: null,
    resolve: res as (value: unknown) => void,
    reject: rej as (reason: unknown) => void,
    stopped: false,
    ...overrides,
  } as InternalTask
}

function makeContext(): TaskContext {
  return {
    signal: new AbortController().signal,
    dependencyResults: {},
  }
}

describe('taskExecutor', () => {
  it('should execute a simple task', async () => {
    const task = makeTask({ fn: async () => 42 })
    const result = await executeTask({ task, context: makeContext() })
    expect(result).toBe(42)
  })

  it('should execute a sync task', async () => {
    const task = makeTask({ fn: () => 'sync' })
    const result = await executeTask({ task, context: makeContext() })
    expect(result).toBe('sync')
  })

  it('should timeout', async () => {
    const task = makeTask({
      timeout: 50,
      fn: async ({ signal }) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('done'), 200)
          signal.addEventListener('abort', () => {
            clearTimeout(timer)
            reject(signal.reason)
          })
        })
      },
    })

    await expect(executeTask({ task, context: makeContext() })).rejects.toThrow(TimeoutError)
  })

  it('should retry on failure', async () => {
    let calls = 0
    const task = makeTask({
      retries: 2,
      retryDelay: 0,
      fn: async () => {
        calls++
        if (calls < 3)
          throw new Error('fail')
        return 'success'
      },
    })

    const result = await executeTask({ task, context: makeContext() })
    expect(result).toBe('success')
    expect(calls).toBe(3)
  })

  it('should respect retryCondition', async () => {
    let calls = 0
    const task = makeTask({
      retries: 3,
      retryDelay: 0,
      retryCondition: () => false,
      fn: async () => {
        calls++
        throw new Error('fail')
      },
    })

    await expect(executeTask({ task, context: makeContext() })).rejects.toThrow('fail')
    expect(calls).toBe(1)
  })

  it('should support retryDelay as function', async () => {
    const delays: number[] = []
    let calls = 0
    const task = makeTask({
      retries: 2,
      retryDelay: ({ attempt }) => {
        delays.push(attempt)
        return 0 // use 0 for fast tests
      },
      fn: async () => {
        calls++
        if (calls < 3)
          throw new Error('fail')
        return 'ok'
      },
    })

    await executeTask({ task, context: makeContext() })
    expect(delays).toEqual([1, 2])
  })

  it('should throw CancelError when cancelled', async () => {
    const task = makeTask({
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

    const promise = executeTask({ task, context: makeContext() })

    // Cancel after a short delay
    setTimeout(() => {
      task.status = 'cancelled'
      task.abortController?.abort(new CancelError(task.id))
    }, 10)

    await expect(promise).rejects.toThrow(CancelError)
  })

  it('should pass context to task function', async () => {
    let receivedCtx: TaskContext | null = null
    const task = makeTask({
      fn: async (ctx) => {
        receivedCtx = ctx
        return 'ok'
      },
    })

    const context: TaskContext = {
      signal: new AbortController().signal,
      dependencyResults: { dep1: 'value1' },
      previousResult: 'prev',
    }

    await executeTask({ task, context })
    expect(receivedCtx).not.toBeNull()
    expect(receivedCtx!.dependencyResults).toEqual({ dep1: 'value1' })
    expect(receivedCtx!.previousResult).toBe('prev')
  })
})
