import type { InternalTask } from './types'

export class PriorityQueue {
  private items: InternalTask[] = []

  enqueue(task: InternalTask): void {
    this.items.push(task)
    this.sort()
  }

  dequeue(): InternalTask | undefined {
    return this.items.shift()
  }

  remove(id: string): InternalTask | undefined {
    const index = this.items.findIndex(t => t.id === id)
    if (index === -1)
      return undefined
    return this.items.splice(index, 1)[0]
  }

  peek(): InternalTask | undefined {
    return this.items[0]
  }

  get size(): number {
    return this.items.length
  }

  toArray(): InternalTask[] {
    return [...this.items]
  }

  sort(): void {
    this.items.sort((a, b) => b.effectivePriority - a.effectivePriority)
  }

  clear(): void {
    this.items = []
  }
}
