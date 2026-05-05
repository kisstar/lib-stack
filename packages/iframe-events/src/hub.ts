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
export interface WinContext {
  addEventListener: (type: string, handler: (e: MessageEvent) => void) => void
  removeEventListener: (type: string, handler: (e: MessageEvent) => void) => void
}

export function createHub(options: IframeAppOptions, ctx?: WinContext): IframeApp {
  const { id, debug = false } = options
  const win: WinContext = ctx ?? {
    addEventListener: (t, h) => window.addEventListener(t, h as EventListener),
    removeEventListener: (t, h) => window.removeEventListener(t, h as EventListener),
  }

  const logger = createLogger({ name: `iframe-events:hub:${id}` })
  if (debug)
    logger.setLevel('debug')

  const router = new LocalRouter()
  const eventHandlers = new Map<string, Set<EventHandler>>()
  const requestHandlers = new Map<string, RequestHandler>()
  const pendingRequests = new Map<string, PendingRequest>()
  let destroyed = false

  function sendTo(target: Window, msg: IframeMessage): void {
    postToWindow(target, msg, err => logger.warn('postMessage failed', err))
  }

  function forwardBroadcastToChildren(msg: IframeMessage): void {
    for (const childWin of router.getAllDirectWindows()) {
      sendTo(childWin, msg)
    }
  }

  function handleMessage(event: MessageEvent): void {
    if (destroyed)
      return
    if (!isIframeMessage(event.data))
      return
    const msg = event.data

    logger.debug('received', msg.type, msg.channel, 'from', msg.source)

    if (msg.type === 'handshake') {
      const sourceWin = event.source as Window
      router.addDirect(msg.source, sourceWin)
      sendTo(sourceWin, createMessage({
        type: 'handshake-ack',
        channel: 'handshake-ack',
        source: id,
        target: msg.source,
      }))
      logger.debug('handshake accepted from', msg.source)
      return
    }

    if (msg.type === 'register') {
      const viaChild = router.getChildIdByWindow(event.source as Window)
      if (viaChild) {
        router.addDescendant(msg.source, viaChild)
        logger.debug('registered descendant', msg.source, 'via', viaChild)
      }
      return
    }

    if (msg.type === 'broadcast') {
      forwardBroadcastToChildren(msg)
      triggerEventHandlers(eventHandlers, msg.channel, msg.payload, msg.source)
      return
    }

    if (msg.target && msg.target !== id) {
      const nextHop = router.resolveNextHop(msg.target)
      if (!nextHop) {
        logger.debug('target not found:', msg.target)
        if (msg.type === 'request') {
          const sourceWin = router.resolveNextHop(msg.source)
          if (sourceWin) {
            sendTo(sourceWin, buildResponseMessage(id, msg, undefined, {
              message: `Target not found: ${msg.target}`,
            }))
          }
        }
        return
      }
      sendTo(nextHop, msg)
      return
    }

    if (msg.type === 'response') {
      resolvePending(pendingRequests, msg)
    }
    else if (msg.type === 'request') {
      const replyTo = (payload?: unknown, error?: { message: string }) => {
        const sourceWin = router.resolveNextHop(msg.source)
        if (sourceWin)
          sendTo(sourceWin, buildResponseMessage(id, msg, payload, error))
      }
      executeRequestHandler(id, msg, requestHandlers, replyTo)
    }
    else if (msg.type === 'event') {
      triggerEventHandlers(eventHandlers, msg.channel, msg.payload, msg.source)
    }
  }

  win.addEventListener('message', handleMessage)

  return {
    id,
    isRoot: true,

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
        const nextHop = router.resolveNextHop(target)
        if (!nextHop) {
          reject(new Error(`[iframe-events] target not found: ${target}`))
          return
        }

        const timer = setTimeout(() => {
          pendingRequests.delete(msg.id)
          reject(new Error(`[iframe-events] invoke timeout: ${channel} → ${target}`))
        }, timeout)

        pendingRequests.set(msg.id, {
          resolve: resolve as (v: unknown) => void,
          reject,
          timer,
        })
        sendTo(nextHop, msg)
      })
    },

    emit(target: AppId, channel: string, payload?: unknown) {
      const msg = createMessage({ type: 'event', channel, source: id, target, payload })
      const nextHop = router.resolveNextHop(target)
      if (nextHop) {
        sendTo(nextHop, msg)
      }
      else {
        logger.debug('emit: target not found:', target)
      }
    },

    broadcast(channel: string, payload?: unknown) {
      const msg = createMessage({ type: 'broadcast', channel, source: id, payload })
      forwardBroadcastToChildren(msg)
      triggerEventHandlers(eventHandlers, channel, payload, id)
    },

    ready() {
      return Promise.resolve()
    },

    destroy() {
      destroyed = true
      win.removeEventListener('message', handleMessage)
      rejectAllPending(pendingRequests, '[iframe-events] destroyed')
      eventHandlers.clear()
      requestHandlers.clear()
    },
  }
}
