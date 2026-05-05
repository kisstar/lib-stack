# @lib-stack/iframe-events

A type-safe, request-response communication library for multi-level iframe trees. Supports N-level nesting, precise addressing, RPC-style `invoke`/`handle`, pub-sub events, and full-tree broadcast — with an API inspired by Electron's IPC model.

## Installation

```bash
pnpm add @lib-stack/iframe-events
```

## Quick Start

Each application calls `createIframeApp()` with a unique ID. The role (root vs. child) is detected automatically at runtime — no compile-time configuration needed.

```ts
// app.ts (same code works both standalone and embedded)
import { createIframeApp } from '@lib-stack/iframe-events'

const app = createIframeApp({ id: 'my-app' })

// Register a request handler
app.handle('get-user', async (payload, from) => {
  return { name: 'Alice', id: payload.userId }
})

// Subscribe to events
app.on('theme-changed', (payload) => {
  applyTheme(payload.theme)
})

// Wait for connection before doing anything
await app.ready()
```

## Communication Patterns

### RPC: `invoke` / `handle`

Request-response calls with full type safety and timeout support.

```ts
// Receiver — registers a handler
app.handle<{ userId: string }, { name: string }>('get-user', async (payload, from) => {
  return fetchUser(payload.userId)
})

// Caller — sends a request and awaits the response
const user = await app.invoke<{ name: string }>('child-app', 'get-user', { userId: '42' })
```

With a custom timeout:

```ts
const result = await app.invoke('child-app', 'get-user', { userId: '42' }, { timeout: 3000 })
```

### One-way Events: `emit` / `on`

Send an event to a specific app without expecting a response.

```ts
// Sender
app.emit('child-app', 'theme-changed', { theme: 'dark' })

// Receiver
const unsubscribe = app.on<{ theme: string }>('theme-changed', (payload, from) => {
  console.log(`Theme from ${from}: ${payload.theme}`)
})

// Unsubscribe
unsubscribe()
// or
app.off('theme-changed', handler)
```

### Broadcast

Broadcast an event to every node in the tree.

```ts
// Sends to all apps (root + all descendants)
app.broadcast('reload', { reason: 'config-update' })

// Any app can subscribe to broadcasts with `on`
app.on('reload', (payload) => {
  console.log('Reload triggered:', payload.reason)
})
```

## Role Detection

`createIframeApp()` detects the current role at runtime:

- **Root** (`window.parent === window`): resolves `ready()` immediately, acts as the routing hub
- **Child** (embedded in iframe): sends a handshake to its parent, resolves `ready()` after acknowledgment

```ts
const app = createIframeApp({ id: 'shell' })

console.log(app.isRoot) // true if running standalone, false if in iframe

await app.ready() // always await before communicating
```

## N-level Tree Routing

Any node can communicate with any other node regardless of depth. Messages route automatically through the tree.

```
Root
├── App A           (direct child)
│   ├── App A-1     (grandchild)
│   └── App A-2     (grandchild)
└── App B           (direct child)
```

```ts
// App A-1 can invoke Root directly
await appA1.invoke('root', 'get-config', { key: 'theme' })

// Root can invoke App A-1 directly
await root.invoke('app-a-1', 'do-work', { input: 42 })

// App A-1 can invoke App B (cross-subtree)
await appA1.invoke('app-b', 'ping', {})
```

## Lifecycle

### `ready()`

Always await `ready()` before sending messages. It is safe to call multiple times.

```ts
await app.ready()
// Now safe to invoke / emit / broadcast
```

### `destroy()`

Cleans up all listeners and rejects all pending `invoke` calls.

```ts
app.destroy()
```

## API Reference

### `createIframeApp(options)`

Creates and returns an `IframeApp` instance. Role is detected automatically.

```ts
interface IframeAppOptions {
  id: string // Globally unique app identifier
  connectTimeout?: number // Child-to-parent handshake timeout in ms (default: 5000)
  debug?: boolean // Enable debug logging
}
```

### `IframeApp`

```ts
interface IframeApp {
  readonly id: AppId
  readonly isRoot: boolean

  // Subscribe to one-way events; returns unsubscribe function
  on: <T>(channel: string, handler: EventHandler<T>) => () => void

  // Unsubscribe a specific handler
  off: (channel: string, handler: EventHandler) => void

  // Register an RPC handler (like Electron ipcMain.handle); returns unsubscribe function
  handle: <TReq, TRes>(channel: string, handler: RequestHandler<TReq, TRes>) => () => void

  // Send an RPC request and await the response (like Electron ipcRenderer.invoke)
  invoke: <TRes>(target: AppId, channel: string, payload?: unknown, options?: RequestOptions) => Promise<TRes>

  // Send a one-way event to a specific app
  emit: (target: AppId, channel: string, payload?: unknown) => void

  // Broadcast an event to the entire iframe tree
  broadcast: (channel: string, payload?: unknown) => void

  // Wait for the app to be ready (root resolves immediately; child waits for handshake)
  ready: () => Promise<void>

  // Tear down the instance
  destroy: () => void
}
```

### `RequestOptions`

```ts
interface RequestOptions {
  timeout?: number // Override default invoke timeout (ms)
}
```

### Handler types

```ts
type EventHandler<T = unknown> = (payload: T, from: AppId) => void

type RequestHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  from: AppId,
) => TRes | Promise<TRes>
```

## License

MIT
