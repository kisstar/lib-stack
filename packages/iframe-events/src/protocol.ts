import type { AppId, IframeMessage, MessageType } from './types'

let counter = 0

function uid(): string {
  return `${Date.now()}_${++counter}`
}

type CreateMessageInput = Omit<IframeMessage, '__iframe_events' | 'id'> & { id?: string }

export function createMessage(input: CreateMessageInput): IframeMessage {
  return {
    __iframe_events: true,
    id: input.id ?? uid(),
    type: input.type,
    channel: input.channel,
    source: input.source,
    target: input.target,
    payload: input.payload,
    error: input.error,
  }
}

export function isIframeMessage(data: unknown): data is IframeMessage {
  return (
    typeof data === 'object'
    && data !== null
    && (data as IframeMessage).__iframe_events === true
    && typeof (data as IframeMessage).id === 'string'
    && typeof (data as IframeMessage).channel === 'string'
  )
}

// Re-export for test utilities
export { uid as _uid }

export type { AppId, MessageType }
