# @lib-stack/scheduler

A lightweight task scheduler with support for async task queues, concurrency control, priority execution, task dependencies, timeout, retry, and cancellation.

## Installation

```bash
pnpm add @lib-stack/scheduler
```

## Quick Start

```ts
import { createScheduler } from '@lib-stack/scheduler'

const scheduler = createScheduler({ concurrency: 3 })

const task = scheduler.add({
  id: 'fetch-data',
  fn: async ({ signal }) => {
    const res = await fetch('/api/data', { signal })
    return res.json()
  },
  timeout: 5000,
  retries: 2,
  retryDelay: 1000,
})

scheduler.start()
const result = await task.promise
```

## API

### `createScheduler(options?)`

Creates a new scheduler instance.

```ts
interface SchedulerOptions {
  concurrency?: number // Max concurrent tasks (default: Infinity)
  mode?: 'parallel' | 'serial' // serial = concurrency 1 + auto-pass previous result
  debug?: boolean // Enable debug mode (throws on circular deps)
  logger?: SchedulerLogger // Optional logger, no logging if omitted
}
```

### `scheduler.add(taskOptions)`

Adds a task to the scheduler and returns a `TaskHandle`.

```ts
interface TaskOptions<TInput, TOutput> {
  id?: string // Optional, auto-generated if omitted
  fn: (ctx: TaskContext<TInput>) => Promise<TOutput> | TOutput
  priority?: number // Higher = executed first (default: 0)
  timeout?: number // Milliseconds, 0 = no timeout
  retries?: number // Max retry attempts (default: 0)
  retryDelay?: RetryDelay // Delay between retries
  retryCondition?: (error: unknown) => boolean // Should retry? (default: always)
  dependencies?: string[] // IDs of tasks this task depends on
}
```

### `scheduler.start()`

Starts the scheduler. Does not wait for task completion — use `task.promise` for that.

### `scheduler.stop(id?)`

Stops execution. Running tasks are aborted but reset to `pending` (not counted as failure, no retry consumed). Call `start()` again to resume.

- `stop()` — stops all tasks and pauses the scheduler
- `stop(id)` — stops only the specified task

### `scheduler.cancel(id?)`

Permanently cancels tasks. Cancelled tasks cannot be resumed.

- `cancel(id)` — cancels the specified task
- `cancel()` — cancels all tasks

### TaskHandle

```ts
interface TaskHandle<TOutput> {
  readonly id: string
  readonly status: TaskStatus // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  readonly result: TOutput | undefined
  readonly error: unknown
  cancel: () => void
  promise: Promise<TOutput>
}
```

## Features

### Task Context

Each task function receives a `TaskContext`:

```ts
interface TaskContext<TInput> {
  signal: AbortSignal // For cancellation/timeout detection
  dependencyResults: Record<string, unknown> // Results from dependency tasks
  previousResult?: TInput // Previous task result (serial mode only)
}
```

### Retry with Configurable Delay

```ts
// Fixed delay
scheduler.add({
  fn: async () => { /* ... */ },
  retries: 3,
  retryDelay: 1000,
})

// Exponential backoff
scheduler.add({
  fn: async () => { /* ... */ },
  retries: 3,
  retryDelay: ({ attempt }) => 2 ** attempt * 1000,
})

// Conditional retry
scheduler.add({
  fn: async () => { /* ... */ },
  retries: 3,
  retryCondition: error => error instanceof NetworkError,
})
```

### Dependencies

Tasks can declare dependencies. Dependent tasks wait until their dependencies complete, and receive the results via `ctx.dependencyResults`.

```ts
scheduler.add({
  id: 'fetch',
  fn: async () => fetchData(),
})

scheduler.add({
  id: 'process',
  dependencies: ['fetch'],
  fn: async ({ dependencyResults }) => {
    const data = dependencyResults.fetch
    return transform(data)
  },
})
```

If a dependency fails, all dependents are automatically marked as failed.

### Priority Inheritance

When a high-priority task depends on a low-priority task, the dependency's effective priority is elevated:

```ts
scheduler.add({ id: 'low', priority: 1, fn: lowPriorityWork })
scheduler.add({ id: 'high', priority: 10, dependencies: ['low'], fn: highPriorityWork })
// 'low' will execute with effective priority 10
```

### Circular Dependency Detection

- `debug: true` — throws an Error immediately
- `debug: false` (default) — logs a warning (if logger provided) and marks the task as failed

### Serial Mode

In serial mode, tasks execute one at a time and the previous task's result is passed to the next:

```ts
const scheduler = createScheduler({ mode: 'serial' })

scheduler.add({
  id: 'step1',
  priority: 2,
  fn: async () => ({ count: 1 }),
})

scheduler.add({
  id: 'step2',
  priority: 1,
  fn: async ({ previousResult }) => {
    return { count: previousResult.count + 1 }
  },
})
```

### Stop vs Cancel

| Behavior | `stop()` | `cancel()` |
|---|---|---|
| Running tasks | Aborted, reset to `pending` | Aborted, marked `cancelled` |
| Consumes retry | No | N/A |
| Resumable | Yes, via `start()` | No |
| Failed tasks | Unaffected | Unaffected |

### Custom Logger

Provide a logger matching the `SchedulerLogger` interface. If omitted, no logs are produced.

```ts
interface SchedulerLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

const scheduler = createScheduler({
  logger: {
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  },
})
```

## Error Types

- `TimeoutError` — thrown when a task exceeds its timeout
- `CancelError` — thrown when a task is cancelled

```ts
import { CancelError, TimeoutError } from '@lib-stack/scheduler'
```

## License

MIT
