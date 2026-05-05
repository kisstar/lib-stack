import type { IframeApp, IframeAppOptions } from './types'
import { createHub } from './hub'
import { createNode } from './node'

/**
 * 创建一个 iframe 通信实例。
 *
 * 运行时自动探测当前角色：
 * - `window.parent === window`（顶层窗口）→ 根节点（Hub），`ready()` 立即就绪
 * - `window.parent !== window`（嵌入为 iframe）→ 子节点（Node），`ready()` 等待父节点握手
 *
 * 同一份代码在两种场景下无需任何修改。
 *
 * @example
 * ```ts
 * const app = createIframeApp({ id: 'my-app' })
 * await app.ready()
 *
 * app.handle('getUser', () => ({ id: 1, name: 'Alice' }))
 * const result = await app.invoke('other-app', 'getUser')
 * ```
 */
export function createIframeApp(options: IframeAppOptions): IframeApp {
  const isRoot = window.parent === window
  return isRoot ? createHub(options) : createNode(options)
}
