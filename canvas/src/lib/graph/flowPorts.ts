import type { GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { readNodeProperties } from '@/lib/graph/nodeProperties'
import { isPlainObject } from '@/lib/graph/value'

export const FLOW_EDGE_SOURCE_PORT_KEY = 'flow:sourcePortKey' as const
export const FLOW_EDGE_TARGET_PORT_KEY = 'flow:targetPortKey' as const
export const FLOW_EDGE_DISPLAY_LABEL_KEY = 'flow:displayLabel' as const
export const FLOW_DEFAULT_SOURCE_PORT_KEY = 'output' as const
export const FLOW_DEFAULT_TARGET_PORT_KEY = 'input' as const
export const FLOW_TEXT_OUTPUT_PORT_KEY = 'text_out' as const
export const FLOW_PROMPT_INPUT_PORT_KEY = 'prompt_in' as const

export function buildImplicitFlowEdgePortKey(args: { socketType: unknown; side: 'source' | 'target' }): string {
  const fallback = args.side === 'source' ? FLOW_DEFAULT_SOURCE_PORT_KEY : FLOW_DEFAULT_TARGET_PORT_KEY
  const raw = typeof args.socketType === 'string' ? args.socketType.trim() : ''
  if (!raw) return fallback
  const semantic = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  if (!semantic) return fallback
  return args.side === 'source' ? `${semantic}_out` : `${semantic}_in`
}

export const FLOW_SCHEMA_FIELD_PORT_PREFIX = 'field:' as const

export const FLOW_SCHEMA_FIELDS_PROPERTY_KEY = 'schema:fields' as const
export const FLOW_PORT_TYPES_KEY = 'flow:portTypes' as const

export function buildSchemaFieldPortKey(fieldId: string): string {
  const id = String(fieldId || '').trim()
  return `${FLOW_SCHEMA_FIELD_PORT_PREFIX}${id || 'field'}`
}

export function parseSchemaFieldPortKey(portKey: string | null | undefined): string | null {
  const key = String(portKey || '').trim()
  if (!key) return null
  if (!key.startsWith(FLOW_SCHEMA_FIELD_PORT_PREFIX)) return null
  const id = key.slice(FLOW_SCHEMA_FIELD_PORT_PREFIX.length).trim()
  return id || null
}

export function readFlowEdgePortKey(edge: Pick<GraphEdge, 'properties'> | null | undefined, side: 'source' | 'target'):
  | string
  | null {
  const props = edge?.properties
  if (!isPlainObject(props)) return null
  const key = side === 'source' ? FLOW_EDGE_SOURCE_PORT_KEY : FLOW_EDGE_TARGET_PORT_KEY
  const raw = (props as Record<string, JSONValue | undefined>)[key]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

export type SchemaFieldSpec = { id: string; label: string; type?: string }

export function readSchemaFieldSpecs(node: Pick<GraphNode, 'properties'> | null | undefined): SchemaFieldSpec[] {
  const props = readNodeProperties(node)
  const raw = (props as Record<string, JSONValue | undefined>)[FLOW_SCHEMA_FIELDS_PROPERTY_KEY]
  if (!Array.isArray(raw)) return []
  const out: SchemaFieldSpec[] = []

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]
    if (typeof item === 'string') {
      const id = item.trim()
      if (!id) continue
      out.push({ id, label: id })
      continue
    }
    if (!isPlainObject(item)) continue
    const rec = item as Record<string, JSONValue>
    const id = typeof rec.id === 'string' ? rec.id.trim() : typeof rec.title === 'string' ? rec.title.trim() : ''
    if (!id) continue
    const label = typeof rec.title === 'string' ? rec.title.trim() : id
    const type = typeof rec.type === 'string' ? rec.type.trim() : undefined
    out.push({ id, label, ...(type ? { type } : {}) })
  }

  return out
}
function readTypedFlowPortKeys(
  node: Pick<GraphNode, 'properties'> | null | undefined,
  dir: 'in' | 'out',
): string[] {
  const props = readNodeProperties(node)
  const rawPortTypes = (props as Record<string, JSONValue | undefined>)[FLOW_PORT_TYPES_KEY]
  if (!isPlainObject(rawPortTypes)) return []
  const bucket = rawPortTypes[dir]
  if (!isPlainObject(bucket)) return []
  return Object.keys(bucket)
    .map(key => String(key || '').trim())
    .filter(Boolean)
}

export function listTypedFlowPortKeys(
  node: Pick<GraphNode, 'properties'> | null | undefined,
  dir: 'in' | 'out',
): string[] {
  return readTypedFlowPortKeys(node, dir)
}

export function pickDefaultTypedFlowPortKey(
  node: Pick<GraphNode, 'properties'> | null | undefined,
  dir: 'in' | 'out',
): string | null {
  const typedPortKeys = listTypedFlowPortKeys(node, dir)
  return typedPortKeys.length > 0 ? typedPortKeys[0]! : null
}

export function pickDefaultFlowPortKey(
  node: Pick<GraphNode, 'properties'> | null | undefined,
  dir: 'in' | 'out',
): string | null {
  return pickDefaultTypedFlowPortKey(node, dir) || pickDefaultSchemaFieldPortKey(node) || null
}

export function pickDefaultSchemaFieldPortKey(node: Pick<GraphNode, 'properties'> | null | undefined): string | null {
  const fields = readSchemaFieldSpecs(node)
  const first = fields[0]
  if (!first?.id) return null
  return buildSchemaFieldPortKey(first.id)
}

export function readFlowEdgeDisplayLabel(edge: Pick<GraphEdge, 'properties'> | null | undefined): string | null {
  const props = edge?.properties
  if (!isPlainObject(props)) return null
  const raw = (props as Record<string, JSONValue | undefined>)[FLOW_EDGE_DISPLAY_LABEL_KEY]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

export function buildFlowEdgeDisplayLabelFromPorts(args: {
  sourceNode: Pick<GraphNode, 'properties'> | null | undefined
  targetNode: Pick<GraphNode, 'properties'> | null | undefined
  sourcePortKey: string | null | undefined
  targetPortKey: string | null | undefined
}): string | null {
  const srcId = parseSchemaFieldPortKey(args.sourcePortKey)
  const tgtId = parseSchemaFieldPortKey(args.targetPortKey)
  if (!srcId || !tgtId) return null

  const src = readSchemaFieldSpecs(args.sourceNode).find(f => f.id === srcId) || null
  const tgt = readSchemaFieldSpecs(args.targetNode).find(f => f.id === tgtId) || null
  const srcLabel = String(src?.label || srcId).trim()
  const tgtLabel = String(tgt?.label || tgtId).trim()
  if (!srcLabel || !tgtLabel) return null
  return `${srcLabel} → ${tgtLabel}`
}
