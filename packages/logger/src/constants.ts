export type LogLevel = 'all' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'off'

export type LogType = Exclude<LogLevel, 'off' | 'all'>

export const LOG_TYPES: LogType[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

export const LEVEL_VALUES: Record<LogLevel, number> = {
  all: 0,
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  off: 6,
}
