import type { InternalTask, Scheduler, SchedulerOptions, TaskContext, TaskHandle, TaskOptions } from './types'
import { DependencyGraph } from './dependency-graph'
import { PriorityQueue } from './priority-queue'
import { CancelError, executeTask } from './task-executor'
import { uid } from './uid'

export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const {
    concurrency = options.mode === 'serial' ? 1 : Number.POSITIVE_INFINITY,
    mode = 'parallel',
    debug = false,
    logger,
  } = options

  const maxConcurrency = mode === 'serial' ? 1 : concurrency

  const tasks = new Map<string, InternalTask>()
  const queue = new PriorityQueue()
  const graph = new DependencyGraph({ debug, logger })

  let running = false
  let runningCount = 0
  let lastSerialResult: unknown

  function scheduleNext(): void {
    if (!running)
      return

    // Try to find tasks in queue whose deps are resolved
    const candidates = queue.toArray()

    for (const task of candidates) {
      if (runningCount >= maxConcurrency)
        break

      if (task.status !== 'pending')
        continue

      // Check if any dependency failed/cancelled
      if (graph.hasFailedDependency(task.id, tasks)) {
        queue.remove(task.id)
        task.status = 'failed'
        task.error = new Error(`Dependency of task "${task.id}" failed`)
        task.reject(task.error)
        logger?.error(`Task "${task.id}" failed because a dependency failed`)
        // Continue scheduling after failure
        continue
      }

      if (!graph.areDependenciesResolved(task.id, tasks))
        continue

      // Ready to run
      queue.remove(task.id)
      runTask(task)
    }
  }

  function runTask(task: InternalTask): void {
    task.status = 'running'
    runningCount++

    // Build context
    const dependencyResults: Record<string, unknown> = {}
    for (const depId of task.dependencies) {
      const dep = tasks.get(depId)
      if (dep)
        dependencyResults[depId] = dep.result
    }

    const context: TaskContext = {
      signal: new AbortController().signal, // Will be replaced by executor
      dependencyResults,
    }

    if (mode === 'serial')
      context.previousResult = lastSerialResult

    logger?.debug(`Task "${task.id}" started`)

    executeTask({ task, context, logger })
      .then((result) => {
        task.status = 'completed'
        task.result = result
        task.resolve(result)

        if (mode === 'serial')
          lastSerialResult = result

        logger?.debug(`Task "${task.id}" completed`)
      })
      .catch((error) => {
        if (task.stopped) {
          // Stopped, not a real failure — reset to pending for restart
          task.stopped = false
          task.status = 'pending'
          task.abortController = null
          queue.enqueue(task)
          logger?.debug(`Task "${task.id}" stopped, will resume on next start`)
        }
        else if (task.status === 'cancelled') {
          task.error = error instanceof CancelError ? error : new CancelError(task.id)
          task.reject(task.error)
          logger?.debug(`Task "${task.id}" cancelled`)
        }
        else {
          task.status = 'failed'
          task.error = error
          task.reject(error)
          logger?.error(`Task "${task.id}" failed:`, error)
        }
      })
      .finally(() => {
        runningCount--
        scheduleNext()
      })
  }

  function stopTask(task: InternalTask): void {
    if (task.status === 'running') {
      task.stopped = true
      task.abortController?.abort(new Error('stopped'))
    }
    else if (task.status === 'pending') {
      // Already pending in queue, nothing to abort
    }
  }

  function cancelTask(task: InternalTask): void {
    if (!task)
      return

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled')
      return

    const wasRunning = task.status === 'running'
    task.status = 'cancelled'

    if (wasRunning) {
      task.abortController?.abort(new CancelError(task.id))
    }
    else {
      // Remove from queue if pending
      queue.remove(task.id)
      task.error = new CancelError(task.id)
      task.reject(task.error)
    }
  }

  const scheduler: Scheduler = {
    add<TInput = unknown, TOutput = unknown>(taskOptions: TaskOptions<TInput, TOutput>): TaskHandle<TOutput> {
      const id = taskOptions.id ?? uid()

      if (tasks.has(id)) {
        throw new Error(`Task with id "${id}" already exists`)
      }

      let resolve!: (value: TOutput) => void
      let reject!: (reason: unknown) => void
      const promise = new Promise<TOutput>((res, rej) => {
        resolve = res
        reject = rej
      })

      // Prevent unhandled rejection warnings — callers access via handle.promise
      promise.catch(() => {})

      const task: InternalTask<TOutput> = {
        id,
        fn: taskOptions.fn as (ctx: TaskContext) => Promise<TOutput> | TOutput,
        priority: taskOptions.priority ?? 0,
        effectivePriority: taskOptions.priority ?? 0,
        timeout: taskOptions.timeout ?? 0,
        retries: taskOptions.retries ?? 0,
        retryDelay: taskOptions.retryDelay ?? 0,
        retryCondition: taskOptions.retryCondition ?? (() => true),
        dependencies: taskOptions.dependencies ?? [],
        status: 'pending',
        result: undefined,
        error: undefined,
        attemptsMade: 0,
        abortController: null,
        resolve: resolve as (value: unknown) => void,
        reject,
        stopped: false,
      }

      tasks.set(id, task as InternalTask)

      // Add to dependency graph and check for cycles
      const valid = graph.addTask(task as InternalTask)
      if (!valid) {
        task.status = 'failed'
        task.error = new Error(`Circular dependency detected for task "${id}"`)
        task.reject(task.error)
      }
      else {
        // Propagate priority and re-sort
        graph.propagatePriority(tasks)
        queue.enqueue(task as InternalTask)
        queue.sort()

        // If scheduler is running, try to schedule immediately
        if (running)
          scheduleNext()
      }

      const handle: TaskHandle<TOutput> = {
        get id() { return task.id },
        get status() { return task.status },
        get result() { return task.result },
        get error() { return task.error },
        cancel() {
          scheduler.cancel(id)
        },
        promise,
      }

      return handle
    },

    start(): void {
      if (running)
        return
      running = true
      lastSerialResult = undefined
      logger?.info('Scheduler started')
      scheduleNext()
    },

    stop(id?: string): void {
      if (id !== undefined) {
        const task = tasks.get(id)
        if (task)
          stopTask(task)
        return
      }

      // Stop all
      running = false
      for (const task of tasks.values()) {
        if (task.status === 'running')
          stopTask(task)
      }
      logger?.info('Scheduler stopped')
    },

    cancel(id?: string): void {
      if (id === undefined) {
        for (const task of tasks.values()) {
          cancelTask(task)
        }
        logger?.info('All tasks cancelled')
        return
      }

      const task = tasks.get(id)

      if (task) {
        cancelTask(task)
        logger?.debug(`Task "${id}" cancelled`)
      }
    },
  }

  return scheduler
}
