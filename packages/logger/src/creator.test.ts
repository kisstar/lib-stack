import type { LogApi } from './log-api'
import { describe, expect, it, vi } from 'vitest'
import { createLogger } from './creator'

function createMockLogApi(): LogApi {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}

describe('createLogger', () => {
  it('should create a logger with default level "off"', () => {
    const log = createLogger()
    expect(log.getLevel()).toBe('off')
  })

  it('should not output anything when level is "off"', () => {
    const logApi = createMockLogApi()
    const log = createLogger({ logApi })
    log.info('test')
    expect(logApi.info).not.toHaveBeenCalled()
  })

  it('should output when level allows the log type', () => {
    const logApi = createMockLogApi()
    const log = createLogger({ logApi })
    log.setLevel('info')
    log.info('hello')
    expect(logApi.info).toHaveBeenCalledTimes(1)
    expect(logApi.info).toHaveBeenCalledWith(
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]$/),
      '[INFO]',
      '[default]',
      '-',
      'hello',
    )
  })

  it('should filter out log types below current level', () => {
    const logApi = createMockLogApi()
    const log = createLogger({ logApi })
    log.setLevel('warn')
    log.debug('should not appear')
    log.info('should not appear')
    log.warn('should appear')
    log.error('should appear')
    expect(logApi.debug).not.toHaveBeenCalled()
    expect(logApi.info).not.toHaveBeenCalled()
    expect(logApi.warn).toHaveBeenCalledTimes(1)
    expect(logApi.error).toHaveBeenCalledTimes(1)
  })

  it('should output all types when level is "all"', () => {
    const logApi = createMockLogApi()
    const log = createLogger({ logApi })
    log.setLevel('all')
    log.trace('t')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')
    log.fatal('f')
    expect(logApi.trace).toHaveBeenCalledTimes(1)
    expect(logApi.debug).toHaveBeenCalledTimes(1)
    expect(logApi.info).toHaveBeenCalledTimes(1)
    expect(logApi.warn).toHaveBeenCalledTimes(1)
    expect(logApi.error).toHaveBeenCalledTimes(1)
    expect(logApi.fatal).toHaveBeenCalledTimes(1)
  })

  it('should use custom name in log output', () => {
    const logApi = createMockLogApi()
    const log = createLogger({ name: 'app', logApi })
    log.setLevel('info')
    log.info('test')
    expect(logApi.info).toHaveBeenCalledWith(
      expect.any(String),
      '[INFO]',
      '[app]',
      '-',
      'test',
    )
  })
})

describe('child loggers', () => {
  it('should create and cache child loggers', () => {
    const log = createLogger()
    const child1 = log.get('child')
    const child2 = log.get('child')
    expect(child1).toBe(child2)
  })

  it('should have independent log levels', () => {
    const logApi = createMockLogApi()
    const parent = createLogger({ logApi })
    const child = parent.get('child', { logApi })
    parent.setLevel('error')
    child.setLevel('debug')
    parent.info('parent info')
    child.info('child info')
    expect(logApi.info).toHaveBeenCalledTimes(1)
    expect(logApi.info).toHaveBeenCalledWith(
      expect.any(String),
      '[INFO]',
      '[child]',
      '-',
      'child info',
    )
  })

  it('should navigate to parent', () => {
    const parent = createLogger()
    const child = parent.get('child')
    expect(child.parent()).toBe(parent)
  })

  it('should list all children via getAll()', () => {
    const parent = createLogger()
    parent.get('a')
    parent.get('b')
    expect(parent.getAll()).toHaveLength(2)
  })

  it('should return undefined for root logger parent', () => {
    const root = createLogger()
    expect(root.parent()).toBeUndefined()
  })
})
