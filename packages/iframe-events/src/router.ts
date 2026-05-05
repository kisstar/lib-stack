import type { AppId } from './types'

export class LocalRouter {
  /** 直接子节点：appId → 其 Window 对象 */
  private directMap = new Map<AppId, Window>()
  /** 后代节点路由：appId → 第一跳直接子节点 appId */
  private descendantMap = new Map<AppId, AppId>()

  addDirect(appId: AppId, win: Window): void {
    this.directMap.set(appId, win)
  }

  addDescendant(appId: AppId, viaChildId: AppId): void {
    this.descendantMap.set(appId, viaChildId)
  }

  /**
   * 查找目标的下一跳 Window。
   * 先查直接子节点，再查后代路由。找不到返回 null。
   */
  resolveNextHop(target: AppId): Window | null {
    const direct = this.directMap.get(target)
    if (direct)
      return direct

    const via = this.descendantMap.get(target)
    if (via)
      return this.directMap.get(via) ?? null

    return null
  }

  /** 根据 Window 对象反查直接子节点 appId */
  getChildIdByWindow(win: Window): AppId | null {
    for (const [appId, w] of this.directMap) {
      if (w === win)
        return appId
    }
    return null
  }

  /** 获取所有直接子节点的 Window 列表 */
  getAllDirectWindows(): Window[] {
    return [...this.directMap.values()]
  }

  /** 获取所有已知节点（直接 + 后代） */
  getAll(): AppId[] {
    return [...this.directMap.keys(), ...this.descendantMap.keys()]
  }

  /**
   * 移除一个节点及其所有以该节点为第一跳的后代路由。
   * 用于节点注销或重连时清理旧记录。
   */
  remove(appId: AppId): void {
    this.directMap.delete(appId)
    for (const [descId, via] of this.descendantMap) {
      if (via === appId) {
        this.descendantMap.delete(descId)
      }
    }
    this.descendantMap.delete(appId)
  }
}
