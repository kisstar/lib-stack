import type { WinContext } from './hub'
import type { PendingRequest } from './internal'
import type {
  AppId,
  EventHandler,
  IframeApp,
  IframeAppOptions,
  IframeMessage,
  RequestHandler,
  RequestOptions,
} from './types'
import { createLogger } from '@lib-stack/logger'
import {
  buildResponseMessage,
  executeRequestHandler,
  postToWindow,
  rejectAllPending,
  resolvePending,
  triggerEventHandlers,
} from './internal'
import { createMessage, isIframeMessage } from './protocol'
import { LocalRouter } from './router'

/** 可注入的窗口上下文接口（供测试使用） */
export interface NodeWinContext extends WinContext {
  /** 向父窗口发送消息 */
  postMessageToParent: (msg: IframeMessage) => void
  /** 父窗口的引用，用于 fromParent 判断 */
  parentRef: Window
}

export function createNode(options: IframeAppOptions, ctx?: NodeWinContext): IframeApp {
  const { id, connectTimeout = 5000, debug = false } = options

  const win: NodeWinContext = ctx ?? {
    addEventListener: (t, h) => window.addEventListener(t, h as EventListener),
    removeEventListener: (t, h) => window.removeEventListener(t, h as EventListener),
    postMessageToParent: msg => window.parent.postMessage(msg, '*'),
    parentRef: window.parent,
  }

  const logger = createLogger({ name: `iframe-events:node:${id}` })
  if (debug)
    logger.setLevel('debug')

  const router = new LocalRouter()
  const eventHandlers = new Map<string, Set<EventHandler>>()
  const requestHandlers = new Map<string, RequestHandler>()
  const pendingRequests = new Map<string, PendingRequest>()
  const processedBroadcasts = new Set<string>()

  let connected = false
  let destroyed = false
  let messageQueue: IframeMessage[] = []

  let readyResolve!: () => void
  let readyReject!: (err: Error) => void
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })

  const connectTimer = setTimeout(() => {
    if (!connected) {
      readyReject(new Error(`[iframe-events] connect timeout: ${id}`))
    }
  }, connectTimeout)

  function sendToParent(msg: IframeMessage): void {
    if (!connected) {
      messageQueue.push(msg)
      return
    }
    try {
      win.postMessageToParent(msg)
    }
    catch (err) {
      logger.warn('sendToParent failed', err)
    }
  }

  function sendToChild(childWin: Window, msg: IframeMessage): void {
    postToWindow(childWin, msg, err => logger.warn('sendToChild failed', err))
  }

  function routeOrSendToParent(msg: IframeMessage): void {
    if (!msg.target) {
      sendToParent(msg)
      return
    }
    const nextHop = router.resolveNextHop(msg.target)
    if (nextHop) {
      sendToChild(nextHop, msg)
    }
    else {
      sendToParent(msg)
    }
  }

  function forwardBroadcastToChildren(msg: IframeMessage): void {
    for (const childWin of router.getAllDirectWindows()) {
      sendToChild(childWin, msg)
    }
  }

  function trackBroadcast(msgId: string): void {
    processedBroadcasts.add(msgId)
    setTimeout(() => processedBroadcasts.delete(msgId), 30_000)
  }

  function dispatchSelfMessage(msg: IframeMessage): void {
    if (msg.type === 'response') {
      resolvePending(pendingRequests, msg)
    }
    else if (msg.type === 'request') {
      const reply = (payload?: unknown, error?: { message: string }) => {
        routeOrSendToParent(buildResponseMessage(id, msg, payload, error))
      }
      executeRequestHandler(id, msg, requestHandlers, reply)
    }
    else if (msg.type === 'event') {
      triggerEventHandlers(eventHandlers, msg.channel, msg.payload, msg.source)
    }
  }

  function handleMessage(event: MessageEvent): void {
    if (destroyed)
      return
    if (!isIframeMessage(event.data))
      return
    const msg = event.data

    const fromParent = event.source === win.parentRef

    logger.debug('received', msg.type, msg.channel, 'from', msg.source, fromParent ? '(parent)' : '(child)')

    if (fromParent) {
      if (msg.type === 'handshake-ack') {
        clearTimeout(connectTimer)
        connected = true
        readyResolve()
        logger.debug('connected to parent')
        for (const queued of messageQueue) {
          try {
            win.postMessageToParent(queued)
          }
          catch { /* skip */ }
        }
        messageQueue = []
        return
      }

      if (msg.type === 'broadcast') {
        if (processedBroadcasts.has(msg.id)) {
          logger.debug('broadcast already processed, skipping', msg.id)
          return
        }
        trackBroadcast(msg.id)
        forwardBroadcastToChildren(msg)
        triggerEventHandlers(eventHandlers, msg.channel, msg.payload, msg.source)
        return
      }

      if (msg.target && msg.target !== id) {
        const nextHop = router.resolveNextHop(msg.target)
        if (nextHop) {
          sendToChild(nextHop, msg)
          return
        }
      }

      dispatchSelfMessage(msg)
      return
    }

    // ── 来自子节点 ──
    if (msg.type === 'handshake') {
      const sourceWin = event.source as Window
      router.addDirect(msg.source, sourceWin)
      sendToChild(sourceWin, createMessage({
        type: 'handshake-ack',
        channel: 'handshake-ack',
        source: id,
        target: msg.source,
      }))
      sendToParent(createMessage({
        type: 'register',
        channel: 'register',
        source: msg.source,
      }))
      logger.debug('child handshake from', msg.source)
      return
    }

    const viaChild = router.getChildIdByWindow(event.source as Window)
    if (!viaChild) {
      logger.debug('ignoring message from unknown source')
      return
    }

    if (msg.type === 'register') {
      router.addDescendant(msg.source, viaChild)
      logger.debug('registered descendant', msg.source, 'via', viaChild)
      sendToParent(msg)
      return
    }

    if (msg.type === 'broadcast') {
      sendToParent(msg)
      return
    }

    if (msg.target) {
      const nextHop = router.resolveNextHop(msg.target)
      if (nextHop) {
        sendToChild(nextHop, msg)
        return
      }
      if (msg.target === id) {
        dispatchSelfMessage(msg)
        return
      }
      sendToParent(msg)
      return
    }

    sendToParent(msg)
  }

  win.addEventListener('message', handleMessage)

  try {
    win.postMessageToParent(
      createMessage({ type: 'handshake', channel: 'handshake', source: id }),
    )
  }
  catch (err) {
    logger.warn('initial handshake postMessage failed', err)
  }

  return {
    id,
    isRoot: false,

    on<T>(channel: string, handler: EventHandler<T>) {
      if (!eventHandlers.has(channel)) {
        eventHandlers.set(channel, new Set())
      }
      eventHandlers.get(channel)!.add(handler as EventHandler)
      return () => {
        eventHandlers.get(channel)?.delete(handler as EventHandler)
      }
    },

    off(channel: string, handler: EventHandler) {
      eventHandlers.get(channel)?.delete(handler)
    },

    handle<TReq, TRes>(channel: string, handler: RequestHandler<TReq, TRes>) {
      requestHandlers.set(channel, handler as RequestHandler)
      return () => {
        requestHandlers.delete(channel)
      }
    },

    invoke<TRes>(
      target: AppId,
      channel: string,
      payload?: unknown,
      options?: RequestOptions,
    ): Promise<TRes> {
      const { timeout = 5000 } = options ?? {}
      const msg = createMessage({ type: 'request', channel, source: id, target, payload })

      return new Promise<TRes>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRequests.delete(msg.id)
          reject(new Error(`[iframe-events] invoke timeout: ${channel} → ${target}`))
        }, timeout)

        pendingRequests.set(msg.id, {
          resolve: resolve as (v: unknown) => void,
          reject,
          timer,
        })

        routeOrSendToParent(msg)
      })
    },

    emit(target: AppId, channel: string, payload?: unknown) {
      const msg = createMessage({ type: 'event', channel, source: id, target, payload })
      routeOrSendToParent(msg)
    },

    broadcast(channel: string, payload?: unknown) {
      const msg = createMessage({ type: 'broadcast', channel, source: id, payload })
      trackBroadcast(msg.id)
      sendToParent(msg)
    },

    ready() {
      return readyPromise
    },

    destroy() {
      destroyed = true
      clearTimeout(connectTimer)
      win.removeEventListener('message', handleMessage)
      rejectAllPending(pendingRequests, '[iframe-events] destroyed')
      eventHandlers.clear()
      requestHandlers.clear()
      processedBroadcasts.clear()
      messageQueue = []
    },
  }
}
