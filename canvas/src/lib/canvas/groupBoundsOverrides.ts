import type { GraphSchema } from '@/lib/graph/schema'
import type { GraphNode } from '@/lib/graph/types'
import type { GraphGroup } from '@/components/GraphCanvas/layout/graphGroupsTypes'
import { SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES } from '@/lib/config.render'
import { toMetadataRecord } from '@/lib/graph/documentMetadata'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import { isPlainObject } from '@/lib/graph/value'

export type GroupBoundsOverride = {
  x: number
  y: number
  width: number
  height: number
  labelX?: number
  labelY?: number
}

const readPlainObject = (value: unknown): Record<string, unknown> | null => {
  return isPlainObject(value) ? (value as Record<string, unknown>) : null
}

const readGroupBoundsOverride = (raw: unknown): GroupBoundsOverride | null => {
  const record = readPlainObject(raw)
  if (!record) return null
  const x = typeof record.x === 'number' && Number.isFinite(record.x) ? record.x : Number.NaN
  const y = typeof record.y === 'number' && Number.isFinite(record.y) ? record.y : Number.NaN
  const width = typeof record.width === 'number' && Number.isFinite(record.width) ? record.width : Number.NaN
  const height = typeof record.height === 'number' && Number.isFinite(record.height) ? record.height : Number.NaN
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const labelX = typeof record.labelX === 'number' && Number.isFinite(record.labelX) ? record.labelX : undefined
  const labelY = typeof record.labelY === 'number' && Number.isFinite(record.labelY) ? record.labelY : undefined
  return { x, y, width, height, ...(labelX != null ? { labelX } : {}), ...(labelY != null ? { labelY } : {}) }
}

export const readSchemaGroupBoundsOverrides = (schema: GraphSchema): Record<string, GroupBoundsOverride> => {
  const meta = toMetadataRecord((schema as unknown as { metadata?: unknown })?.metadata)
  const raw = readPlainObject(meta[SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES])
  if (!raw) return {}
  const out: Record<string, GroupBoundsOverride> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (!k) continue
    const bounds = readGroupBoundsOverride(v)
    if (!bounds) continue
    out[k] = bounds
  }
  return out
}

export const applySchemaGroupBoundsOverrides = (groups: GraphGroup[], overridesById: Record<string, GroupBoundsOverride>): GraphGroup[] => {
  if (!groups.length) return groups
  const keys = Object.keys(overridesById)
  if (keys.length === 0) return groups
  return groups.map(g => {
    const id = String(g.id || '').trim()
    if (!id) return g
    if (g.autoBounds === true) return { ...g, bounds: undefined }
    if (g.bounds) return g
    const b = overridesById[id]
    if (!b) return g
    return { ...g, bounds: b }
  })
}

export const readNodeBoundsOverride = (node: GraphNode | null | undefined): GroupBoundsOverride | null => {
  const props = readNodeProperties(node as Pick<GraphNode, 'properties'> | null | undefined)
  return readGroupBoundsOverride(props['visual:boundsOverride'])
}

export const withSchemaGroupBoundsOverride = (schema: GraphSchema, groupId: string, bounds: GroupBoundsOverride): GraphSchema => {
  const id = String(groupId || '').trim()
  if (!id) return schema
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y) || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return schema
  if (bounds.width <= 0 || bounds.height <= 0) return schema

  const baseMeta = toMetadataRecord((schema as unknown as { metadata?: unknown }).metadata)
  const currentRaw = baseMeta[SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES]
  const current = readPlainObject(currentRaw) || {}
  const next = { ...current, [id]: { ...bounds } }
  return { ...schema, metadata: { ...(baseMeta as Record<string, any>), [SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES]: next } as any }
}

export const withoutSchemaGroupBoundsOverride = (schema: GraphSchema, groupId: string): GraphSchema => {
  const id = String(groupId || '').trim()
  if (!id) return schema
  const baseMeta = toMetadataRecord((schema as unknown as { metadata?: unknown }).metadata)
  const currentRaw = baseMeta[SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES]
  const current = readPlainObject(currentRaw)
  if (!current || !(id in current)) return schema
  const next = { ...current }
  delete (next as Record<string, unknown>)[id]
  return { ...schema, metadata: { ...(baseMeta as Record<string, any>), [SCHEMA_META_KEY_GROUP_BOUNDS_OVERRIDES]: next } as any }
}

export const readGroupBoundsOverrideSource = (args: {
  groupId: string
  graphNodes: ReadonlyArray<GraphNode>
  schema: GraphSchema
}): { source: 'node' | 'schema' | null; bounds: GroupBoundsOverride | null } => {
  const id = String(args.groupId || '').trim()
  if (!id) return { source: null, bounds: null }

  const findNode = (nodeId: string): GraphNode | null => {
    for (let i = 0; i < args.graphNodes.length; i += 1) {
      const n = args.graphNodes[i]
      if (String(n.id || '') === nodeId) return n
    }
    return null
  }

  const node = findNode(id) || (id.startsWith('md:') ? findNode(id.slice('md:'.length).trim()) : null)
  const nodeBounds = node ? readNodeBoundsOverride(node) : null
  if (nodeBounds) return { source: 'node', bounds: nodeBounds }

  const schemaBounds = readSchemaGroupBoundsOverrides(args.schema)[id] || null
  if (schemaBounds) return { source: 'schema', bounds: schemaBounds }
  return { source: null, bounds: null }
}
