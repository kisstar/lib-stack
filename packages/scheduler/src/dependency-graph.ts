import type { InternalTask, SchedulerLogger } from './types'

export interface DependencyGraphOptions {
  debug?: boolean
  logger?: SchedulerLogger
}

export class DependencyGraph {
  /** taskId -> set of task ids it depends on */
  private deps = new Map<string, Set<string>>()
  /** taskId -> set of task ids that depend on it (reverse) */
  private reverseDeps = new Map<string, Set<string>>()
  private options: DependencyGraphOptions

  constructor(options: DependencyGraphOptions = {}) {
    this.options = options
  }

  addTask(task: InternalTask): boolean {
    const id = task.id
    const depIds = task.dependencies

    this.deps.set(id, new Set(depIds))

    if (!this.reverseDeps.has(id))
      this.reverseDeps.set(id, new Set())

    for (const depId of depIds) {
      if (!this.reverseDeps.has(depId))
        this.reverseDeps.set(depId, new Set())
      this.reverseDeps.get(depId)!.add(id)
    }

    if (this.hasCycle(id)) {
      if (this.options.debug) {
        throw new Error(`Circular dependency detected involving task "${id}"`)
      }
      this.options.logger?.warn(`Circular dependency detected involving task "${id}", marking as failed`)
      return false
    }

    return true
  }

  removeTask(id: string): void {
    const depIds = this.deps.get(id)
    if (depIds) {
      for (const depId of depIds) {
        this.reverseDeps.get(depId)?.delete(id)
      }
    }
    this.deps.delete(id)

    const rdeps = this.reverseDeps.get(id)
    if (rdeps) {
      for (const rid of rdeps) {
        this.deps.get(rid)?.delete(id)
      }
    }
    this.reverseDeps.delete(id)
  }

  getDependencies(id: string): string[] {
    return Array.from(this.deps.get(id) ?? [])
  }

  getDependents(id: string): string[] {
    return Array.from(this.reverseDeps.get(id) ?? [])
  }

  areDependenciesResolved(id: string, tasks: Map<string, InternalTask>): boolean {
    const depIds = this.deps.get(id)
    if (!depIds || depIds.size === 0)
      return true
    for (const depId of depIds) {
      const dep = tasks.get(depId)
      if (!dep || dep.status !== 'completed')
        return false
    }
    return true
  }

  hasFailedDependency(id: string, tasks: Map<string, InternalTask>): boolean {
    const depIds = this.deps.get(id)
    if (!depIds)
      return false
    for (const depId of depIds) {
      const dep = tasks.get(depId)
      if (dep && (dep.status === 'failed' || dep.status === 'cancelled'))
        return true
    }
    return false
  }

  /**
   * Propagate priority inheritance: if task A depends on task B,
   * B's effectivePriority should be at least as high as A's.
   * Uses BFS from the given task through reverse deps (upward) to collect
   * max priority, then propagates downward through deps.
   */
  propagatePriority(tasks: Map<string, InternalTask>): void {
    // Reset all effective priorities to their base priority
    for (const task of tasks.values()) {
      task.effectivePriority = task.priority
    }

    // For each task, propagate its effective priority to its dependencies
    // Repeat until stable (handles chains)
    let changed = true
    while (changed) {
      changed = false
      for (const task of tasks.values()) {
        const depIds = this.deps.get(task.id)
        if (!depIds)
          continue
        for (const depId of depIds) {
          const dep = tasks.get(depId)
          if (dep && dep.effectivePriority < task.effectivePriority) {
            dep.effectivePriority = task.effectivePriority
            changed = true
          }
        }
      }
    }
  }

  private hasCycle(startId: string): boolean {
    const WHITE = 0
    const GRAY = 1
    const BLACK = 2
    const color = new Map<string, number>()

    const dfs = (id: string): boolean => {
      color.set(id, GRAY)
      const neighbors = this.deps.get(id)
      if (neighbors) {
        for (const nid of neighbors) {
          const c = color.get(nid) ?? WHITE
          if (c === GRAY)
            return true
          if (c === WHITE && dfs(nid))
            return true
        }
      }
      color.set(id, BLACK)
      return false
    }

    return dfs(startId)
  }

  clear(): void {
    this.deps.clear()
    this.reverseDeps.clear()
  }
}
