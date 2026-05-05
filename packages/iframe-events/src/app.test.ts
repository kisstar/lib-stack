import type { WinContext } from './hub'
import type { NodeWinContext } from './node'
import type { IframeMessage } from './types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHub } from './hub'
import { createNode } from './node'
import { isIframeMessage } from './protocol'

// ---------------------------------------------------------------------------
// MockWindow: 模拟 iframe window，支持 postMessage 路由
// ---------------------------------------------------------------------------

interface MockWindow {
  readonly __id: string
  postMessage: ReturnType<typeof vi.fn>
  listeners: ((event: { data: unknown, source: MockWindow }) => void)[]
  /** 向此窗口投递一条消息（测试工具） */
  receive: (data: unknown, source: MockWindow) => void
}

function createMockWindow(id: string): MockWindow {
  const listeners: MockWindow['listeners'] = []
  const win: MockWindow = {
    __id: id,
    postMessage: vi.fn(),
    listeners,
    receive(data, source) {
      for (const handler of [...listeners]) {
        handler({ data, source })
      }
    },
  }
  return win
}

/** 从 MockWindow.postMessage 调用中提取 IframeMessage */
function getSentMessages(win: MockWindow): IframeMessage[] {
  return (win.postMessage as ReturnType<typeof vi.fn>).mock.calls.map(([data]) => data).filter((d): d is IframeMessage => isIframeMessage(d))
}

// ---------------------------------------------------------------------------
// 工厂辅助：创建 Hub 的测试用 WinContext
// ---------------------------------------------------------------------------

function makeHubCtx(): WinContext {
  const listeners: ((e: MessageEvent) => void)[] = []
  return {
    addEventListener(_type, handler) {
      listeners.push(handler)
    },
    removeEventListener(_type, handler) {
      const idx = listeners.indexOf(handler)
      if (idx >= 0)
        listeners.splice(idx, 1)
    },
    /** 测试专用：模拟外部消息送达 hub */
    _receive(data: unknown, source: MockWindow) {
      for (const h of [...listeners]) {
        h({ data, source } as unknown as MessageEvent)
      }
    },
  } as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
}

// ---------------------------------------------------------------------------
// 工厂辅助：创建 Node 的测试用 NodeWinContext
// ---------------------------------------------------------------------------

function makeNodeCtx(
  nodeWin: MockWindow,
  parentWin: MockWindow,
): NodeWinContext & { _receive: (d: unknown, s: MockWindow) => void } {
  const listeners: ((e: MessageEvent) => void)[] = []

  // parentWin.postMessage → 触发 parentWin.receive（模拟消息送达父窗口）
  parentWin.postMessage.mockImplementation((data: unknown) => {
    parentWin.receive(data, nodeWin)
  })

  return {
    addEventListener(_type, handler) {
      listeners.push(handler)
    },
    removeEventListener(_type, handler) {
      const idx = listeners.indexOf(handler)
      if (idx >= 0)
        listeners.splice(idx, 1)
    },
    postMessageToParent(msg) {
      parentWin.postMessage(msg, '*')
    },
    parentRef: parentWin as unknown as Window,
    /** 测试专用：模拟消息送达此 node */
    _receive(data: unknown, source: MockWindow) {
      for (const h of [...listeners]) {
        h({ data, source } as unknown as MessageEvent)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// createHub 测试
// ---------------------------------------------------------------------------

describe('createHub (root node)', () => {
  let hubCtx: ReturnType<typeof makeHubCtx>

  beforeEach(() => {
    hubCtx = makeHubCtx()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('ready() resolves immediately', async () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    await expect(hub.ready()).resolves.toBeUndefined()
    hub.destroy()
  })

  it('isRoot is true', () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    expect(hub.isRoot).toBe(true)
    hub.destroy()
  })

  it('accepts child handshake and sends handshake-ack', () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const childWin = createMockWindow('app-a')
    const ctx = hubCtx as ReturnType<typeof makeHubCtx> & { _receive: (d: unknown, s: MockWindow) => void }

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childWin,
    )

    const acks = getSentMessages(childWin).filter(m => m.type === 'handshake-ack')
    expect(acks).toHaveLength(1)
    expect(acks[0]?.target).toBe('app-a')

    hub.destroy()
  })

  it('registers descendant via register bubble-up and routes invoke to correct first hop', () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const ctx = hubCtx as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
    const childAWin = createMockWindow('app-a')

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childAWin,
    )
    ctx._receive(
      { __iframe_events: true, id: 'r1', type: 'register', channel: 'register', source: 'app-a-1' },
      childAWin,
    )

    hub.invoke('app-a-1', 'test', undefined, { timeout: 100 }).catch(() => { /* timeout */ })

    const routed = getSentMessages(childAWin).find(m => m.type === 'request' && m.target === 'app-a-1')
    expect(routed).toBeDefined()

    hub.destroy()
  })

  it('on + event from child triggers handler', () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const ctx = hubCtx as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
    const childWin = createMockWindow('app-a')

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childWin,
    )

    const received: { payload: unknown, from: string }[] = []
    hub.on('action', (payload, from) => received.push({ payload, from }))

    ctx._receive(
      { __iframe_events: true, id: 'e1', type: 'event', channel: 'action', source: 'app-a', target: 'root', payload: { type: 'click' } },
      childWin,
    )

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ payload: { type: 'click' }, from: 'app-a' })

    hub.destroy()
  })

  it('invoke resolves when child responds', async () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const ctx = hubCtx as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
    const childWin = createMockWindow('app-a')

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childWin,
    )

    // 拦截发给 app-a 的消息，模拟子节点回复
    childWin.postMessage.mockImplementation((data: unknown) => {
      if (isIframeMessage(data) && data.type === 'request') {
        ctx._receive(
          { __iframe_events: true, id: data.id, type: 'response', channel: data.channel, source: 'app-a', target: 'root', payload: 'pong' },
          childWin,
        )
      }
    })

    const result = await hub.invoke('app-a', 'ping')
    expect(result).toBe('pong')

    hub.destroy()
  })

  it('invoke rejects when target not found', async () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    await expect(hub.invoke('nonexistent', 'test')).rejects.toThrow('target not found')
    hub.destroy()
  })

  it('broadcast reaches all direct children', () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const ctx = hubCtx as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
    const childAWin = createMockWindow('app-a')
    const childBWin = createMockWindow('app-b')

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childAWin,
    )
    ctx._receive(
      { __iframe_events: true, id: 'h2', type: 'handshake', channel: 'handshake', source: 'app-b' },
      childBWin,
    )

    hub.broadcast('theme', { value: 'dark' })

    const sentToA = getSentMessages(childAWin).filter(m => m.type === 'broadcast' && m.channel === 'theme')
    const sentToB = getSentMessages(childBWin).filter(m => m.type === 'broadcast' && m.channel === 'theme')

    expect(sentToA).toHaveLength(1)
    expect(sentToB).toHaveLength(1)

    hub.destroy()
  })

  it('destroy rejects all pending invokes', async () => {
    const hub = createHub({ id: 'root' }, hubCtx)
    const ctx = hubCtx as WinContext & { _receive: (d: unknown, s: MockWindow) => void }
    const childWin = createMockWindow('app-a')

    ctx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake', channel: 'handshake', source: 'app-a' },
      childWin,
    )
    childWin.postMessage.mockImplementation(() => { /* swallow */ })

    const promise = hub.invoke('app-a', 'getData', undefined, { timeout: 10000 })
    hub.destroy()

    await expect(promise).rejects.toThrow('destroyed')
  })
})

// ---------------------------------------------------------------------------
// createNode 测试
// ---------------------------------------------------------------------------

describe('createNode (non-root node)', () => {
  let parentWin: MockWindow
  let nodeWin: MockWindow
  let nodeCtx: ReturnType<typeof makeNodeCtx>

  beforeEach(() => {
    parentWin = createMockWindow('root')
    nodeWin = createMockWindow('app-a')
    nodeCtx = makeNodeCtx(nodeWin, parentWin)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('isRoot is false', () => {
    const node = createNode({ id: 'app-a', connectTimeout: 100 }, nodeCtx)
    expect(node.isRoot).toBe(false)
    node.destroy()
  })

  it('sends handshake to parent on creation', () => {
    const node = createNode({ id: 'app-a', connectTimeout: 100 }, nodeCtx)
    const msgs = getSentMessages(parentWin)
    const handshake = msgs.find(m => m.type === 'handshake')
    expect(handshake?.source).toBe('app-a')
    node.destroy()
  })

  it('ready() resolves after handshake-ack', async () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)

    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    await expect(node.ready()).resolves.toBeUndefined()
    node.destroy()
  })

  it('ready() rejects on connect timeout', async () => {
    vi.useFakeTimers()
    const node = createNode({ id: 'app-a', connectTimeout: 100 }, nodeCtx)
    vi.advanceTimersByTime(200)
    await expect(node.ready()).rejects.toThrow('connect timeout')
    node.destroy()
    vi.useRealTimers()
  })

  it('queues messages before connected, flushes after handshake-ack', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    node.emit('root', 'action', { v: 1 })

    const beforeAck = getSentMessages(parentWin).filter(m => m.type === 'event')
    expect(beforeAck).toHaveLength(0)

    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    const afterAck = getSentMessages(parentWin).filter(m => m.type === 'event')
    expect(afterAck).toHaveLength(1)

    node.destroy()
  })

  it('handle + receives request from parent and replies', async () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    node.handle('getInfo', () => ({ version: '1.0' }))

    nodeCtx._receive(
      { __iframe_events: true, id: 'req1', type: 'request', channel: 'getInfo', source: 'root', target: 'app-a' },
      parentWin,
    )

    await new Promise(r => setTimeout(r, 0))

    const responses = getSentMessages(parentWin).filter(m => m.type === 'response')
    expect(responses).toHaveLength(1)
    expect(responses[0]?.payload).toEqual({ version: '1.0' })

    node.destroy()
  })

  it('invoke unknown target routes to parent', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    node.invoke('app-b', 'test', undefined, { timeout: 100 }).catch(() => { /* timeout */ })

    const sent = getSentMessages(parentWin).filter(m => m.type === 'request' && m.target === 'app-b')
    expect(sent).toHaveLength(1)

    node.destroy()
  })

  it('invoke resolves when routed response arrives', async () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    // parentWin 收到 request 后立即模拟回复
    parentWin.postMessage.mockImplementation((data: unknown) => {
      if (isIframeMessage(data) && data.type === 'request') {
        nodeCtx._receive(
          { __iframe_events: true, id: data.id, type: 'response', channel: data.channel, source: 'root', target: 'app-a', payload: 42 },
          parentWin,
        )
      }
    })

    const result = await node.invoke('root', 'getValue')
    expect(result).toBe(42)

    node.destroy()
  })

  it('child handshake triggers register bubble-up to parent', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    const grandChildWin = createMockWindow('app-a-1')
    nodeCtx._receive(
      { __iframe_events: true, id: 'c1', type: 'handshake', channel: 'handshake', source: 'app-a-1' },
      grandChildWin,
    )

    const registers = getSentMessages(parentWin).filter(m => m.type === 'register' && m.source === 'app-a-1')
    expect(registers).toHaveLength(1)

    node.destroy()
  })

  it('broadcast from node bubbles up to parent', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    node.broadcast('theme', { value: 'dark' })

    const broadcasts = getSentMessages(parentWin).filter(m => m.type === 'broadcast')
    expect(broadcasts).toHaveLength(1)
    expect(broadcasts[0]?.channel).toBe('theme')

    node.destroy()
  })

  it('broadcast from parent propagates to children and triggers local handlers', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    const grandChildWin = createMockWindow('app-a-1')
    nodeCtx._receive(
      { __iframe_events: true, id: 'c1', type: 'handshake', channel: 'handshake', source: 'app-a-1' },
      grandChildWin,
    )

    const received: unknown[] = []
    node.on('theme', p => received.push(p))

    const broadcastMsg: IframeMessage = {
      __iframe_events: true,
      id: 'bc1',
      type: 'broadcast',
      channel: 'theme',
      source: 'root',
      payload: { value: 'dark' },
    }
    nodeCtx._receive(broadcastMsg, parentWin)

    expect(received).toHaveLength(1)
    const forwardedToChild = getSentMessages(grandChildWin).filter(m => m.type === 'broadcast')
    expect(forwardedToChild).toHaveLength(1)

    node.destroy()
  })

  it('does not re-trigger broadcast that this node originated', () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    const received: unknown[] = []
    node.on('theme', p => received.push(p))

    node.broadcast('theme', { value: 'dark' })

    // 截取发出去的 broadcast 消息，模拟根节点将其下发回来
    const sent = getSentMessages(parentWin).find(m => m.type === 'broadcast')
    expect(sent).toBeDefined()
    nodeCtx._receive(sent!, parentWin)

    // processedBroadcasts 防重，不应再次触发
    expect(received).toHaveLength(0)

    node.destroy()
  })

  it('destroy rejects pending invokes', async () => {
    const node = createNode({ id: 'app-a' }, nodeCtx)
    nodeCtx._receive(
      { __iframe_events: true, id: 'h1', type: 'handshake-ack', channel: 'handshake-ack', source: 'root', target: 'app-a' },
      parentWin,
    )

    parentWin.postMessage.mockImplementation(() => { /* swallow */ })

    const promise = node.invoke('root', 'getData', undefined, { timeout: 10000 })
    node.destroy()

    await expect(promise).rejects.toThrow('destroyed')
  })
})
