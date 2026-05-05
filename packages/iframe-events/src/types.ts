export type AppId = string

export type MessageType
  = | 'request'
    | 'response'
    | 'event'
    | 'handshake'
    | 'handshake-ack'
    | 'register'
    | 'broadcast'

export interface IframeMessage {
  __iframe_events: true
  id: string
  type: MessageType
  channel: string
  source: AppId
  target?: AppId
  payload?: unknown
  error?: { message: string, code?: string }
}

export type EventHandler<T = unknown> = (payload: T, from: AppId) => void
export type RequestHandler<TReq = unknown, TRes = unknown> = (
  payload: TReq,
  from: AppId,
) => TRes | Promise<TRes>

export interface RequestOptions {
  timeout?: number
}

export interface IframeApp {
  readonly id: AppId
  /** 当前实例是否作为根节点运行（即非 iframe 嵌入状态） */
  readonly isRoot: boolean
  /** 订阅单向事件，返回取消订阅函数 */
  on: <T = unknown>(channel: string, handler: EventHandler<T>) => () => void
  /** 取消订阅 */
  off: (channel: string, handler: EventHandler) => void
  /** 注册可被 invoke 调用的处理器，对应 Electron ipcMain.handle */
  handle: <TReq = unknown, TRes = unknown>(
    channel: string,
    handler: RequestHandler<TReq, TRes>,
  ) => () => void
  /** 向目标发起 RPC 调用，返回 Promise，对应 Electron ipcRenderer.invoke */
  invoke: <TRes = unknown>(
    target: AppId,
    channel: string,
    payload?: unknown,
    options?: RequestOptions,
  ) => Promise<TRes>
  /** 向目标发送单向事件（不需要响应） */
  emit: (target: AppId, channel: string, payload?: unknown) => void
  /** 向全树广播事件 */
  broadcast: (channel: string, payload?: unknown) => void
  /**
   * 等待就绪：
   * - 根节点：立即 resolve
   * - 子节点：等待父节点 handshake-ack，超时后 reject
   */
  ready: () => Promise<void>
  /** 销毁实例，移除所有监听器，reject 所有 pending invoke */
  destroy: () => void
}

export interface IframeAppOptions {
  /** 当前应用的全局唯一 ID */
  id: AppId
  /** 子节点连接父节点的超时时间（ms），默认 5000，根节点忽略 */
  connectTimeout?: number
  debug?: boolean
}
