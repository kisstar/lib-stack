import type { LogType } from './constants'

export type LogApi = {
  [K in LogType]: (...args: unknown[]) => void
}

export const defaultLogApi: LogApi = {
  // eslint-disable-next-line no-console
  trace: console.log.bind(console),
  // eslint-disable-next-line no-console
  debug: console.debug.bind(console),
  // eslint-disable-next-line no-console
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  fatal: console.error.bind(console),
}
