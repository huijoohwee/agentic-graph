import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { LS_KEYS } from '@/lib/config'
import { setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'

export async function testWorkspaceSourceIndexCoalescesWrites() {
  const { restore } = initJsdomHarness()
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error('expected jsdom localStorage')
    }

    const key = String(LS_KEYS.markdownWorkspaceSourcesByPath)
    const storage = window.localStorage
    const proto = Object.getPrototypeOf(storage) as Storage
    const originalSetItem = proto.setItem

    let setItemCalls = 0
    let lastRaw: string | null = null
    ;(proto as unknown as { setItem: (k: string, v: string) => void }).setItem = function (k, v) {
      if (k === key) {
        setItemCalls += 1
        lastRaw = v
      }
      return originalSetItem.call(this, k, v)
    }

    try {
      const p1 = '/__tests__/sourceIndex/a.md'
      const p2 = '/__tests__/sourceIndex/b.md'
      setWorkspaceEntrySource(p1, { kind: 'url', url: 'https://example.com/a' })
      setWorkspaceEntrySource(p1, { kind: 'url', url: 'https://example.com/b' })
      setWorkspaceEntrySource(p2, { kind: 'local', originalName: 'b.md' })

      await new Promise(resolve => setTimeout(resolve, 400))

      if (setItemCalls !== 1) {
        throw new Error(`expected 1 coalesced write for ${key}, got ${setItemCalls}`)
      }
      if (!lastRaw) {
        throw new Error('expected lastRaw to be written')
      }
      const parsed = JSON.parse(lastRaw) as Record<string, unknown>
      const a = parsed[p1] as { kind?: unknown; url?: unknown } | undefined
      if (!a || a.kind !== 'url' || a.url !== 'https://example.com/b') {
        throw new Error('expected last write to preserve latest url source for p1')
      }
      const b = parsed[p2] as { kind?: unknown; originalName?: unknown } | undefined
      if (!b || b.kind !== 'local' || b.originalName !== 'b.md') {
        throw new Error('expected last write to include local source for p2')
      }
    } finally {
      ;(proto as unknown as { setItem: (k: string, v: string) => void }).setItem = originalSetItem
    }
  } finally {
    restore()
  }
}
