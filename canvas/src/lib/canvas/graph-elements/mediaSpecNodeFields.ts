import { unwrapKeyTypeValue as unwrapNodeFieldValue } from '@/lib/graph/keyTypeValue'
export { unwrapKeyTypeValue as unwrapNodeFieldValue } from '@/lib/graph/keyTypeValue'
import type { GraphNode } from '@/lib/graph/types'


export function readNodeFieldValue(
  node: GraphNode,
  props: Record<string, unknown>,
  key: string,
): unknown {
  if (typeof props[key] !== 'undefined') return unwrapNodeFieldValue(props[key], key)
  return unwrapNodeFieldValue((node as unknown as Record<string, unknown>)[key], key)
}

export function readNodeFieldString(
  node: GraphNode,
  props: Record<string, unknown>,
  key: string,
): string {
  const value = readNodeFieldValue(node, props, key)
  return typeof value === 'string' ? value.trim() : ''
}

export function readNodeFieldBoolean(
  node: GraphNode,
  props: Record<string, unknown>,
  key: string,
): boolean {
  const value = readNodeFieldValue(node, props, key)
  if (value === true) return true
  if (value === false) return false
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return text === 'true' || text === '1' || text === 'yes' || text === 'on'
}
