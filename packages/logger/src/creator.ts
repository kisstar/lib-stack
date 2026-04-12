import type { LogLevel, LogType } from './constants'
import type { LogApi } from './log-api'
import { LEVEL_VALUES, LOG_TYPES } from './constants'
import { defaultLogApi } from './log-api'

export type LogFn = (...args: unknown[]) => void

export interface LoggerOptions {
  name?: string
  parent?: Logger
  logApi?: LogApi
}

export interface Logger {
  trace: LogFn
  debug: LogFn
  info: LogFn
  warn: LogFn
  error: LogFn
  fatal: LogFn
  setLevel: (level: LogLevel) => void
  getLevel: () => LogLevel
  get: (name?: string, options?: Omit<LoggerOptions, 'name' | 'parent'>) => Logger
  getAll: () => Logger[]
  parent: () => Logger | undefined
}

function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function createLogDispatcher(options: LoggerOptions = {}) {
  const { name = 'default', logApi = defaultLogApi } = options
  return function dispatch(type: LogType, level: LogLevel, ...args: unknown[]) {
    const fn = logApi[type]
    if (!fn || LEVEL_VALUES[type] < LEVEL_VALUES[level])
      return

    fn(`[${formatDate()}]`, `[${type.toUpperCase()}]`, `[${name}]`, '-', ...args)
  }
}

/**
 * Create a logger with configurable log level and hierarchical child loggers.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const children = new Map<string, Logger>()
  const dispatch = createLogDispatcher(options)
  let localLevel: LogLevel = 'off'

  const logger: Logger = Object.create(null)

  for (const type of LOG_TYPES) {
    logger[type] = (...args: unknown[]) => dispatch(type, localLevel, ...args)
  }

  logger.setLevel = (level: LogLevel) => {
    localLevel = level
  }
  logger.getLevel = () => localLevel
  logger.get = (name = 'default', opts?) => {
    const existing = children.get(name)
    if (existing)
      return existing
    const child = createLogger({ name, parent: logger, ...opts })
    children.set(name, child)
    return child
  }
  logger.getAll = () => Array.from(children.values())
  logger.parent = () => options.parent

  return logger
}

export const logger = createLogger()
