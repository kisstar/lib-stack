export interface SchedulerLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

export interface SchedulerOptions {
  concurrency?: number
  mode?: 'parallel' | 'serial'
  debug?: boolean
  logger?: SchedulerLogger
}

export type RetryDelay = number | ((context: { attempt: number }) => number)

export interface TaskOptions<TInput = unknown, TOutput = unknown> {
  id?: string
  fn: (ctx: TaskContext<TInput>) => Promise<TOutput> | TOutput
  priority?: number
  timeout?: number
  retries?: number
  retryDelay?: RetryDelay
  retryCondition?: (error: unknown) => boolean
  dependencies?: string[]
}

export interface TaskContext<TInput = unknown> {
  signal: AbortSignal
  dependencyResults: Record<string, unknown>
  previousResult?: TInput
}

export type TaskStatus = 'pending' | 'waiting' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface TaskHandle<TOutput = unknown> {
  readonly id: string
  readonly status: TaskStatus
  readonly result: TOutput | undefined
  readonly error: unknown | undefined
  cancel: () => void
  promise: Promise<TOutput>
}

export interface Scheduler {
  add: <TInput = unknown, TOutput = unknown>(options: TaskOptions<TInput, TOutput>) => TaskHandle<TOutput>
  start: () => void
  stop: (id?: string) => void
  cancel: (id?: string) => void
}

/**
 * Internal task representation used by the scheduler engine.
 */
export interface InternalTask<TOutput = unknown> {
  id: string
  fn: (ctx: TaskContext) => Promise<TOutput> | TOutput
  priority: number
  effectivePriority: number
  timeout: number
  retries: number
  retryDelay: RetryDelay
  retryCondition: (error: unknown) => boolean
  dependencies: string[]
  status: TaskStatus
  result: TOutput | undefined
  error: unknown | undefined
  attemptsMade: number
  abortController: AbortController | null
  resolve: (value: TOutput) => void
  reject: (reason: unknown) => void
  stopped: boolean
}
