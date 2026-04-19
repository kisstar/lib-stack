import type { InternalTask } from './types'
import { describe, expect, it } from 'vitest'
import { DependencyGraph } from './dependency-graph'

function makeTask(id: string, deps: string[] = [], priority = 0): InternalTask {
  return {
    id,
    fn: async () => {},
    priority,
    effectivePriority: priority,
    timeout: 0,
    retries: 0,
    retryDelay: 0,
    retryCondition: () => true,
    dependencies: deps,
    status: 'pending',
    result: undefined,
    error: undefined,
    attemptsMade: 0,
    abortController: null,
    resolve: () => {},
    reject: () => {},
    stopped: false,
  } as InternalTask
}

describe('dependencyGraph', () => {
  it('should add tasks with dependencies', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a')
    const b = makeTask('b', ['a'])

    expect(graph.addTask(a)).toBe(true)
    expect(graph.addTask(b)).toBe(true)
    expect(graph.getDependencies('b')).toEqual(['a'])
    expect(graph.getDependents('a')).toEqual(['b'])
  })

  it('should detect circular dependency in debug mode', () => {
    const graph = new DependencyGraph({ debug: true })
    const a = makeTask('a', ['b'])
    const b = makeTask('b', ['a'])

    graph.addTask(a)
    expect(() => graph.addTask(b)).toThrow('Circular dependency detected')
  })

  it('should return false for circular dependency in non-debug mode', () => {
    const warnings: unknown[][] = []
    const graph = new DependencyGraph({
      debug: false,
      logger: {
        info: () => {},
        warn: (...args: unknown[]) => warnings.push(args),
        error: () => {},
        debug: () => {},
      },
    })
    const a = makeTask('a', ['b'])
    const b = makeTask('b', ['a'])

    graph.addTask(a)
    expect(graph.addTask(b)).toBe(false)
    expect(warnings.length).toBe(1)
  })

  it('should check if dependencies are resolved', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a')
    const b = makeTask('b', ['a'])
    graph.addTask(a)
    graph.addTask(b)

    const tasks = new Map<string, InternalTask>([['a', a], ['b', b]])

    expect(graph.areDependenciesResolved('b', tasks)).toBe(false)
    a.status = 'completed'
    expect(graph.areDependenciesResolved('b', tasks)).toBe(true)
  })

  it('should detect failed dependencies', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a')
    const b = makeTask('b', ['a'])
    graph.addTask(a)
    graph.addTask(b)

    const tasks = new Map<string, InternalTask>([['a', a], ['b', b]])

    expect(graph.hasFailedDependency('b', tasks)).toBe(false)
    a.status = 'failed'
    expect(graph.hasFailedDependency('b', tasks)).toBe(true)
  })

  it('should propagate priority inheritance', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a', [], 1)
    const b = makeTask('b', ['a'], 10)
    graph.addTask(a)
    graph.addTask(b)

    const tasks = new Map<string, InternalTask>([['a', a], ['b', b]])
    graph.propagatePriority(tasks)

    expect(a.effectivePriority).toBe(10)
    expect(b.effectivePriority).toBe(10)
  })

  it('should propagate priority through chains', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a', [], 1)
    const b = makeTask('b', ['a'], 2)
    const c = makeTask('c', ['b'], 20)
    graph.addTask(a)
    graph.addTask(b)
    graph.addTask(c)

    const tasks = new Map<string, InternalTask>([['a', a], ['b', b], ['c', c]])
    graph.propagatePriority(tasks)

    expect(a.effectivePriority).toBe(20)
    expect(b.effectivePriority).toBe(20)
    expect(c.effectivePriority).toBe(20)
  })

  it('should remove task and clean up edges', () => {
    const graph = new DependencyGraph()
    const a = makeTask('a')
    const b = makeTask('b', ['a'])
    graph.addTask(a)
    graph.addTask(b)

    graph.removeTask('a')
    expect(graph.getDependencies('b')).toEqual([])
    expect(graph.getDependents('a')).toEqual([])
  })
})
