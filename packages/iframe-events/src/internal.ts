import type { AppId, EventHandler, IframeMessage, RequestHandler } from './types'
import { createMessage } from './protocol'

export interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function postToWindow(
  win: Window,
  msg: IframeMessage,
  onError: (err: unknown) => void,
): void {
  try {
    win.postMessage(msg, '*')
  }
  catch (err) {
    onError(err)
  }
}

export function triggerEventHandlers(
  eventHandlers: Map<string, Set<EventHandler>>,
  channel: string,
  payload: unknown,
  from: AppId,
): void {
  const handlers = eventHandlers.get(channel)
  if (handlers) {
    for (const handler of handlers) {
      handler(payload, from)
    }
  }
}

export function resolvePending(
  pendingRequests: Map<string, PendingRequest>,
  msg: IframeMessage,
): void {
  const pending = pendingRequests.get(msg.id)
  if (!pending)
    return
  clearTimeout(pending.timer)
  pendingRequests.delete(msg.id)
  if (msg.error) {
    pending.reject(new Error(msg.error.message))
  }
  else {
    pending.resolve(msg.payload)
  }
}

export async function executeRequestHandler(
  id: AppId,
  msg: IframeMessage,
  requestHandlers: Map<string, RequestHandler>,
  sendReply: (payload?: unknown, error?: { message: string }) => void,
): Promise<void> {
  const handler = requestHandlers.get(msg.channel)
  if (!handler) {
    sendReply(undefined, { message: `No handler for channel: ${msg.channel}` })
    return
  }
  try {
    const result = await handler(msg.payload, msg.source)
    sendReply(result)
  }
  catch (err) {
    sendReply(undefined, { message: err instanceof Error ? err.message : String(err) })
  }
}

export function rejectAllPending(
  pendingRequests: Map<string, PendingRequest>,
  reason: string,
): void {
  for (const [, pending] of pendingRequests) {
    clearTimeout(pending.timer)
    pending.reject(new Error(reason))
  }
  pendingRequests.clear()
}

export function buildResponseMessage(
  id: AppId,
  msg: IframeMessage,
  payload?: unknown,
  error?: { message: string },
): IframeMessage {
  return createMessage({
    id: msg.id,
    type: 'response',
    channel: msg.channel,
    source: id,
    target: msg.source,
    payload,
    error,
  })
}
