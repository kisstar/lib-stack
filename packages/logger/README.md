# @lib-stack/logger

A lightweight logger with configurable log levels, hierarchical child loggers, and pluggable output backends.

## Install

```bash
pnpm add @lib-stack/logger
```

## Usage

```ts
import { createLogger, logger } from '@lib-stack/logger'

// Use the pre-built default logger
logger.setLevel('info')
logger.info('Hello world') // [2025-04-11 10:00:00] [INFO] [default] - Hello world
logger.debug('Hidden') // (no output, debug < info)

// Create a named logger
const app = createLogger({ name: 'app' })
app.setLevel('warn')
app.warn('Something is off')
app.error('Something broke')
```

### Child Loggers

```ts
const parent = createLogger({ name: 'server' })
parent.setLevel('info')

const child = parent.get('http')
child.setLevel('debug')

child.debug('Request received') // [2025-04-11 10:00:00] [DEBUG] [http] - Request received
child.parent() // => parent logger
parent.getAll() // => [child]
```

### Custom Log Backend

```ts
import type { LogApi } from '@lib-stack/logger'
import { createLogger } from '@lib-stack/logger'

const customApi: LogApi = {
  trace: (...args) => sendToServer('trace', args),
  debug: (...args) => sendToServer('debug', args),
  info: (...args) => sendToServer('info', args),
  warn: (...args) => sendToServer('warn', args),
  error: (...args) => sendToServer('error', args),
  fatal: (...args) => sendToServer('fatal', args),
}

const log = createLogger({ name: 'remote', logApi: customApi })
log.setLevel('error')
log.error('Critical failure') // sent to server
```

## Log Levels

From lowest to highest priority:

| Level | Value | Description |
|-------|-------|-------------|
| `all` | 0 | Enable all log types |
| `trace` | 0 | Detailed tracing |
| `debug` | 1 | Debug information |
| `info` | 2 | General information |
| `warn` | 3 | Warnings |
| `error` | 4 | Errors |
| `fatal` | 5 | Fatal errors |
| `off` | 6 | Disable all logging |

A log call is only emitted when its level value is >= the logger's current level.

## API

### `createLogger(options?): Logger`

Create a new logger instance.

- `options.name` - Logger name, shown in output (default: `'default'`)
- `options.logApi` - Custom output backend (default: `defaultLogApi` using `console`)
- `options.parent` - Parent logger reference

### `Logger`

| Method | Description |
|--------|-------------|
| `trace(...args)` | Log at trace level |
| `debug(...args)` | Log at debug level |
| `info(...args)` | Log at info level |
| `warn(...args)` | Log at warn level |
| `error(...args)` | Log at error level |
| `fatal(...args)` | Log at fatal level |
| `setLevel(level)` | Set the minimum log level |
| `getLevel()` | Get the current log level |
| `get(name?, options?)` | Get or create a child logger |
| `getAll()` | List all child loggers |
| `parent()` | Get the parent logger |

### `logger`

A pre-built default logger instance (level defaults to `'off'`).

## License

MIT
