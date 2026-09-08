import assert from 'node:assert/strict'
import { packChatContext } from '@/features/chat/chatContextPack'
import type { GraphNode } from '@/lib/graph/types'

const project = (properties: unknown) => packChatContext({
  graphData: null, markdownText: null,
  currentNode: { id: 'focus', label: 'Focus', type: 'card', properties } as GraphNode,
}).selected_node?.properties

export function testChatContextProjectionHandlesCycles() {
  const value: Record<string, unknown> = { title: 'keep me' }
  value.self = value
  const projected = project(value)
  assert.equal(projected?.title, 'keep me')
  assert.match(JSON.stringify(projected), /context truncated/)
  assert.equal(value.self, value)
}

export function testChatContextProjectionBoundsRepeatedSubtrees() {
  let value: unknown = { caption: 'leaf' }
  for (let index = 0; index < 13; index += 1) value = { left: value, right: value }
  const serialized = JSON.stringify(project(value))
  assert.ok(serialized.length < 32000, `expanded context projection has ${serialized.length} characters`)
  assert.match(serialized, /context truncated/)
  const leaf = { caption: 'budget-leaf' }
  const row = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`field${index}`, leaf]))
  const wide = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`row${index}`, row]))
  const wideProjection = JSON.stringify(project(wide))
  assert.ok((wideProjection.match(/budget-leaf/g) || []).length <= 256)
  assert.match(wideProjection, /context truncated/)
}

export function testChatContextProjectionPreservesOrdinaryValues() {
  const shared = Object.freeze({ caption: 'same source' })
  const value = Object.freeze({ count: 4, enabled: true, missing: null,
    rows: Object.freeze(['hello', 2]), left: shared, right: shared })
  assert.deepEqual(project(value), value)
}
