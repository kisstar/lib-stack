import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRouter } from './router'

function mockWindow(name: string): Window {
  return { __name: name } as unknown as Window
}

describe('localRouter', () => {
  let router: LocalRouter
  const winA = mockWindow('app-a')
  const winB = mockWindow('app-b')

  beforeEach(() => {
    router = new LocalRouter()
  })

  describe('addDirect / resolveNextHop', () => {
    it('resolves direct child', () => {
      router.addDirect('app-a', winA)
      expect(router.resolveNextHop('app-a')).toBe(winA)
    })

    it('returns null for unknown target', () => {
      expect(router.resolveNextHop('unknown')).toBeNull()
    })

    it('overwrites existing direct entry on re-registration', () => {
      const winA2 = mockWindow('app-a-v2')
      router.addDirect('app-a', winA)
      router.addDirect('app-a', winA2)
      expect(router.resolveNextHop('app-a')).toBe(winA2)
    })
  })

  describe('addDescendant / resolveNextHop', () => {
    it('resolves descendant via first hop', () => {
      router.addDirect('app-a', winA)
      router.addDescendant('app-a-1', 'app-a')
      expect(router.resolveNextHop('app-a-1')).toBe(winA)
    })

    it('returns null if first-hop child is not in directMap', () => {
      router.addDescendant('app-a-1', 'app-a') // app-a not added to directMap
      expect(router.resolveNextHop('app-a-1')).toBeNull()
    })

    it('resolves multi-level descendant through single first-hop', () => {
      router.addDirect('app-a', winA)
      router.addDescendant('app-a-1', 'app-a')
      router.addDescendant('app-a-1-1', 'app-a') // root only knows first hop
      expect(router.resolveNextHop('app-a-1-1')).toBe(winA)
    })
  })

  describe('getChildIdByWindow', () => {
    it('returns appId for known window', () => {
      router.addDirect('app-a', winA)
      expect(router.getChildIdByWindow(winA)).toBe('app-a')
    })

    it('returns null for unknown window', () => {
      expect(router.getChildIdByWindow(winA)).toBeNull()
    })
  })

  describe('getAllDirectWindows', () => {
    it('returns all direct child windows', () => {
      router.addDirect('app-a', winA)
      router.addDirect('app-b', winB)
      const wins = router.getAllDirectWindows()
      expect(wins).toHaveLength(2)
      expect(wins).toContain(winA)
      expect(wins).toContain(winB)
    })

    it('returns empty array when no children', () => {
      expect(router.getAllDirectWindows()).toHaveLength(0)
    })
  })

  describe('getAll', () => {
    it('returns both direct and descendant appIds', () => {
      router.addDirect('app-a', winA)
      router.addDescendant('app-a-1', 'app-a')
      const all = router.getAll()
      expect(all).toContain('app-a')
      expect(all).toContain('app-a-1')
    })
  })

  describe('remove', () => {
    it('removes direct child and its descendants', () => {
      router.addDirect('app-a', winA)
      // app-a-1 仅作为后代路由存在，未在 directMap 中注册
      router.addDescendant('app-a-1', 'app-a')
      router.remove('app-a')
      expect(router.resolveNextHop('app-a')).toBeNull()
      expect(router.resolveNextHop('app-a-1')).toBeNull() // descendant route removed
    })

    it('does not affect unrelated entries', () => {
      router.addDirect('app-a', winA)
      router.addDirect('app-b', winB)
      router.remove('app-a')
      expect(router.resolveNextHop('app-b')).toBe(winB)
    })
  })
})
