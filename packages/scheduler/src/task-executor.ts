import type { InternalTask, RetryDelay, SchedulerLogger, TaskContext } from './types'

export class TimeoutError extends Error {
  constructor(taskId: string, timeout: number) {
    super(`Task "${taskId}" timed out after ${timeout}ms`)
    this.name = 'TimeoutError'
  }
}

export class CancelError extends Error {
  constructor(taskId: string) {
    super(`Task "${taskId}" was cancelled`)
    this.name = 'CancelError'
  }
}

function resolveRetryDelay(retryDelay: RetryDelay, attempt: number): number {
  if (typeof retryDelay === 'function')
    return retryDelay({ attempt })
  return retryDelay
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0)
    return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

export interface ExecuteOptions {
  task: InternalTask
  context: TaskContext
  logger?: SchedulerLogger
}

export async function executeTask(options: ExecuteOptions): Promise<unknown> {
  const { task, context, logger } = options

  while (true) {
    const abortController = new AbortController()
    task.abortController = abortController

    const ctx: TaskContext = {
      ...context,
      signal: abortController.signal,
    }

    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    try {
      const resultPromise = Promise.resolve(task.fn(ctx))

      let racePromises: Promise<unknown>[]

      if (task.timeout > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            abortController.abort(new TimeoutError(task.id, task.timeout))
            reject(new TimeoutError(task.id, task.timeout))
          }, task.timeout)
        })
        racePromises = [resultPromise, timeoutPromise]
      }
      else {
        racePromises = [resultPromise]
      }

      const result = await Promise.race(racePromises)

      if (timeoutTimer)
        clearTimeout(timeoutTimer)

      task.abortController = null
      return result
    }
    catch (error) {
      if (timeoutTimer)
        clearTimeout(timeoutTimer)

      task.abortController = null

      // If task was stopped (not a real cancel), throw immediately so scheduler can handle
      if (task.stopped) {
        throw error
      }

      // If cancelled, don't retry
      if (task.status === 'cancelled') {
        throw new CancelError(task.id)
      }

      task.attemptsMade++

      if (task.attemptsMade <= task.retries && task.retryCondition(error)) {
        const retryMs = resolveRetryDelay(task.retryDelay, task.attemptsMade)
        logger?.debug(`Task "${task.id}" failed, retrying (attempt ${task.attemptsMade}/${task.retries}) after ${retryMs}ms`)

        if (retryMs > 0) {
          // Create a new controller for the delay period
          const delayController = new AbortController()
          task.abortController = delayController
          try {
            await delay(retryMs, delayController.signal)
          }
          catch {
            // Aborted during delay (stop or cancel)
            task.abortController = null
            throw error
          }
          task.abortController = null
        }

        // Check again if stopped during delay
        if (task.stopped) {
          throw error
        }

        continue
      }

      throw error
    }
  }
}
