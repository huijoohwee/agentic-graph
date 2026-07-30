import type { GraphNode, JSONValue } from '@/lib/graph/types'
import { buildCanonicalWidgetRegistryDraft } from '@/features/storyboard-widget-manager/registryTemplates'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { KG_SUBGRAPHS_KEY, type UserSubgraph } from '@/lib/graph/subgraphs'
import {
  FLOW_WIDGET_FORM_ID_KEY,
  FLOW_WIDGET_TYPE_ID_KEY,
} from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { RegistryEntry, RegistryPort } from '@/features/parsers/markdownFrontmatterFlowGraph.connections'
import {
  FRONTMATTER_FLOW_WIDGET_FIELDS_KEY,
} from '@/features/parsers/markdownFrontmatterFlowGraph.flowBlock'
import { hashText } from '@/features/parsers/hash'
import { normalizeSigilId } from '@/features/parsers/markdownFrontmatterFlowGraph.sigil'
import { spreadMissingNodePositions } from '@/features/parsers/markdownFrontmatterFlowGraph.nodePositions'

const FRONTMATTER_REGISTRY_UPDATED_AT = '1970-01-01T00:00:00.000Z'
const FLOW_PORT_TYPES_KEY = 'flow:portTypes' as const
const FRONTMATTER_PRIMITIVE_KEY = 'frontmatter:primitive' as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function asStringOrKtvValue(v: unknown): string {
  const direct = asString(v)
  if (direct) return direct
  if (!isRecord(v)) return ''
  return asString(v.value)
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return null
}

function canonicalWidgetFormIdForNodeType(nodeTypeId: string): string | null {
  const typeId = String(nodeTypeId || '').trim()
  if (typeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) return 'textGeneration'
  if (typeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) return 'imageGeneration'
  if (typeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) return 'videoGeneration'
  if (typeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return 'richMediaPanel'
  if (typeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) return 'videoTranscriber'
  return null
}

function readFirstStringPropertyValue(
  properties: Record<string, JSONValue>,
  keys: readonly string[],
): string {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const value = properties[key]
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  return ''
}

function canonicalizeLegacyRichMediaNodeSeed(args: {
  type: string
  properties: Record<string, JSONValue>
}): {
  type: string
  properties: Record<string, JSONValue>
} {
  const type = String(args.type || '').trim()
  const typeNorm = type.toLowerCase()
  if (typeNorm !== 'image' && typeNorm !== 'video' && typeNorm !== 'iframe') {
    return { type, properties: args.properties }
  }

  const properties = { ...args.properties }
  const mediaUrl = readFirstStringPropertyValue(properties, [
    'imageUrl',
    'image',
    'videoUrl',
    'video',
    'iframe_url',
    'media_url',
    'mediaUrl',
    'media',
    'url',
    'src',
  ])

  if (typeNorm === 'image') {
    if (typeof properties.richMediaActiveTab !== 'string') properties.richMediaActiveTab = 'image'
    if (typeof properties.imageUrl !== 'string' && mediaUrl) properties.imageUrl = mediaUrl
    if (typeof properties.media_interactive === 'undefined') properties.media_interactive = false
  } else if (typeNorm === 'video') {
    if (typeof properties.richMediaActiveTab !== 'string') properties.richMediaActiveTab = 'video'
    if (typeof properties.videoUrl !== 'string' && mediaUrl) properties.videoUrl = mediaUrl
    if (typeof properties.media_interactive === 'undefined') properties.media_interactive = true
  } else {
    const hasInlineText =
      (typeof properties.output === 'string' && properties.output.trim().length > 0)
      || (typeof properties.outputSrcDoc === 'string' && properties.outputSrcDoc.trim().length > 0)
    if (typeof properties.richMediaActiveTab !== 'string') {
      properties.richMediaActiveTab = hasInlineText ? 'text' : 'auto'
    }
    if (typeof properties.media_interactive === 'undefined') properties.media_interactive = true
  }

  return {
    type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    properties,
  }
}

function cleanIdPart(v: unknown): string {
  return String(typeof v === 'string' ? v : '').trim().replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function coerceFrontmatterNodeRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    const id = normalizeSigilId(raw, 'node')
    if (!id || !id.startsWith('@node:')) return null
    return {
      id,
      label: id,
      type: 'Node',
      properties: {
        [FRONTMATTER_PRIMITIVE_KEY]: 'node',
        'frontmatter:sigilId': id,
      },
    }
  }
  if (!isRecord(raw)) return null
  const explicitId = asString(raw.id)
  if (explicitId) return raw
  const pairs = Object.entries(raw)
  if (pairs.length !== 1) return null
  const [rawId, value] = pairs[0] || []
  const id = normalizeSigilId(rawId, 'node')
  if (!id || !id.startsWith('@node:')) return null
  const base = isRecord(value) ? value : {}
  const baseProps = isRecord(base.properties) ? (base.properties as Record<string, JSONValue>) : {}
  const labelFromId = id.split(':').slice(2).join(':')
  return {
    ...base,
    id,
    type: asString(base.type) || 'Node',
    label: asString(base.label) || labelFromId || id,
    properties: {
      ...baseProps,
      [FRONTMATTER_PRIMITIVE_KEY]: 'node',
      'frontmatter:sigilId': id,
    } as Record<string, JSONValue>,
  }
}

export function normalizeClusters(meta: Record<string, unknown>, nodes: GraphNode[]): {
  clusterNodes: GraphNode[]
  subgraphs: UserSubgraph[]
} {
  const rawClusters = Array.isArray(meta.clusters) ? meta.clusters : []
  if (rawClusters.length === 0) return { clusterNodes: [], subgraphs: [] }
  const nodeIdSet = new Set<string>()
  for (let i = 0; i < nodes.length; i += 1) {
    const id = asString(nodes[i]?.id)
    if (id) nodeIdSet.add(id)
  }
  const clusterNodes: GraphNode[] = []
  const subgraphs: UserSubgraph[] = []
  const seenClusterIds = new Set<string>()
  for (let i = 0; i < rawClusters.length; i += 1) {
    const row = rawClusters[i]
    if (!isRecord(row)) continue
    const pairs = Object.entries(row)
    if (pairs.length !== 1) continue
    const [rawId, descriptor] = pairs[0] || []
    const id = normalizeSigilId(rawId, 'cluster')
    if (!id || seenClusterIds.has(id)) continue
    seenClusterIds.add(id)
    const rec = isRecord(descriptor) ? descriptor : {}
    const label = asString(rec.label) || id
    const color = asString(rec.color)
    const members = Array.isArray(rec.members) ? rec.members : []
    const memberNodeIds: string[] = []
    const seenMembers = new Set<string>()
    for (let j = 0; j < members.length; j += 1) {
      const member = normalizeSigilId(members[j], 'node')
      if (!member || seenMembers.has(member)) continue
      if (!nodeIdSet.has(member)) continue
      seenMembers.add(member)
      memberNodeIds.push(member)
    }
    memberNodeIds.sort((a, b) => a.localeCompare(b))
    subgraphs.push({ id, label, memberNodeIds, parentId: null, kind: 'cluster' })
    clusterNodes.push({
      id,
      label,
      type: 'ClusterRef',
      properties: {
        [FRONTMATTER_PRIMITIVE_KEY]: 'cluster',
        'frontmatter:sigilId': id,
        'visual:shape': 'circle',
        ...(color ? ({ 'visual:fill': color } as unknown as Record<string, JSONValue>) : {}),
      },
    })
  }
  return { clusterNodes, subgraphs }
}

function categoryLayerIndex(category: string): number | null {
  const key = String(category || '').trim().toLowerCase()
  if (!key) return null
  if (key === 'source') return 0
  if (key === 'timing') return 1
  if (key === 'audio') return 2
  if (key === 'visual') return 3
  if (key === 'overlay') return 4
  if (key === 'assembly') return 5
  if (key === 'publish') return 6
  if (key === 'output') return 7
  return null
}

export function normalizeSubgraphsFromFrontmatter(args: {
  meta: Record<string, unknown>
  rawNodes: ReadonlyArray<unknown>
}): UserSubgraph[] | null {
  const raw = args.meta[KG_SUBGRAPHS_KEY]
  if (!Array.isArray(raw)) return null
  const nodeIdSet = new Set<string>()
  for (let i = 0; i < args.rawNodes.length; i += 1) {
    const row = args.rawNodes[i]
    if (!isRecord(row)) continue
    const id = asString(row.id)
    if (id) nodeIdSet.add(id)
  }
  const out: UserSubgraph[] = []
  const seen = new Set<string>()
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i]
    if (!isRecord(row)) continue
    const id = asString(row.id)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = asString(row.label) || id
    const memberNodeIds = (() => {
      const ids = Array.isArray(row.memberNodeIds) ? row.memberNodeIds : []
      const set = new Set<string>()
      for (let j = 0; j < ids.length; j += 1) {
        const nid = asString(ids[j])
        if (!nid) continue
        if (!nodeIdSet.has(nid)) continue
        set.add(nid)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    })()
    const parentId = row.parentId == null ? null : asString(row.parentId) || null
    const kindRaw = asString(row.kind)
    const kind = kindRaw === 'cluster' ? 'cluster' : kindRaw === 'subgraph' ? 'subgraph' : undefined
    const autoBounds = row.autoBounds === true
    out.push({
      id,
      label,
      memberNodeIds,
      ...(parentId !== undefined ? { parentId } : {}),
      ...(kind ? { kind } : {}),
      ...(autoBounds ? { autoBounds: true } : {}),
    })
  }
  return out
}

function normalizeRegistryPorts(args: { inputs: unknown; outputs: unknown }): RegistryPort[] {
  const ports: RegistryPort[] = []
  const seen = new Set<string>()
  const add = (dir: 'input' | 'output', raw: unknown) => {
    if (!isRecord(raw)) return
    const portKey = asString(raw.port)
    if (!portKey) return
    const k = `${dir}:${portKey}`
    if (seen.has(k)) return
    seen.add(k)
    const schemaPathRaw = asString(raw.schemaPath)
    ports.push({
      portKey,
      direction: dir,
      ...(schemaPathRaw ? { schemaPath: schemaPathRaw } : {}),
    })
  }
  const inputs = Array.isArray(args.inputs) ? args.inputs : []
  const outputs = Array.isArray(args.outputs) ? args.outputs : []
  for (let i = 0; i < inputs.length; i += 1) add('input', inputs[i])
  for (let i = 0; i < outputs.length; i += 1) add('output', outputs[i])
  return ports
}

function normalizeFlowPortTypes(args: { inputs: unknown; outputs: unknown }): JSONValue | null {
  const inByKey: Record<string, JSONValue> = {}
  const outByKey: Record<string, JSONValue> = {}
  const add = (dir: 'in' | 'out', raw: unknown) => {
    if (!isRecord(raw)) return
    const portKey = asString(raw.port)
    if (!portKey) return
    const type = asString(raw.type)
    if (!type) return
    if (dir === 'in') inByKey[portKey] = type
    else outByKey[portKey] = type
  }
  const inputs = Array.isArray(args.inputs) ? args.inputs : []
  const outputs = Array.isArray(args.outputs) ? args.outputs : []
  for (let i = 0; i < inputs.length; i += 1) add('in', inputs[i])
  for (let i = 0; i < outputs.length; i += 1) add('out', outputs[i])
  if (Object.keys(inByKey).length === 0 && Object.keys(outByKey).length === 0) return null
  return { in: inByKey, out: outByKey } as unknown as JSONValue
}

function normalizeVisualOverrides(raw: unknown): Record<string, JSONValue> {
  if (!isRecord(raw)) return {}
  const out: Record<string, JSONValue> = {}
  for (const k of Object.keys(raw)) {
    const key = String(k || '').trim()
    if (!key) continue
    const destKey = key.startsWith('visual:') ? key : `visual:${key}`
    const v = raw[key]
    const numLike = destKey === 'visual:opacity' || destKey === 'visual:zIndex' || destKey === 'visual:layer' || destKey === 'visual:depth' || destKey === 'visual:width' || destKey === 'visual:height' || destKey === 'visual:xIndex' || destKey === 'visual:yIndex'
    if (numLike) {
      const n = asFiniteNumber(v)
      if (n != null) {
        out[destKey] = destKey === 'visual:opacity' ? Math.max(0, Math.min(1, n)) : Math.floor(n)
        continue
      }
    }
    out[destKey] = v as JSONValue
  }
  return out
}

export function normalizeNodes(meta: Record<string, unknown>): { nodes: GraphNode[]; registry: RegistryEntry[] } | null {
  const rawNodes = Array.isArray(meta.nodes) ? meta.nodes : null
  if (!rawNodes || rawNodes.length === 0) return null
  const nodes: GraphNode[] = []
  const registry: RegistryEntry[] = []
  const seenIds = new Set<string>()

  for (let i = 0; i < rawNodes.length; i += 1) {
    const row = coerceFrontmatterNodeRecord(rawNodes[i])
    if (!row) continue
    const id = asString(row.id)
    if (!id) continue
    if (seenIds.has(id)) continue
    seenIds.add(id)
    const label = asString(row.label) || id
    const pos = isRecord(row.pos) ? row.pos : null
    const x = pos ? asFiniteNumber(pos.x) : asFiniteNumber((row as Record<string, unknown>).pos_x)
    const y = pos ? asFiniteNumber(pos.y) : asFiniteNumber((row as Record<string, unknown>).pos_y)
    const category = asString(row.category)
    const layer = categoryLayerIndex(category)
    const ports = normalizeRegistryPorts({ inputs: row.inputs, outputs: row.outputs })
    const portTypes = normalizeFlowPortTypes({ inputs: row.inputs, outputs: row.outputs })
    const rawType = asString(row.type) || 'Node'
    const propsFromRowBase = isRecord(row.properties) ? (row.properties as Record<string, JSONValue>) : ({} as Record<string, JSONValue>)
    const canonicalizedSeed = canonicalizeLegacyRichMediaNodeSeed({
      type: rawType,
      properties: propsFromRowBase,
    })
    const type = canonicalizedSeed.type
    const propsFromRow = canonicalizedSeed.properties
    const canonicalWidgetDraft = buildCanonicalWidgetRegistryDraft({ nodeTypeId: type })
    const canonicalWidgetFormId = String(canonicalWidgetDraft?.formId || canonicalWidgetFormIdForNodeType(type) || '').trim()
    const canonicalWidgetTypeId = String(canonicalWidgetDraft?.widgetTypeId || 'default').trim() || 'default'
    const formIdFallback = canonicalWidgetFormId || `fm:${id}`
    const explicitFormId = typeof propsFromRow[FLOW_WIDGET_FORM_ID_KEY] === 'string'
      ? String(propsFromRow[FLOW_WIDGET_FORM_ID_KEY] || '').trim()
      : ''
    const explicitWidgetTypeId = typeof propsFromRow[FLOW_WIDGET_TYPE_ID_KEY] === 'string'
      ? String(propsFromRow[FLOW_WIDGET_TYPE_ID_KEY] || '').trim()
      : ''
    const formId = explicitFormId || formIdFallback
    const widgetTypeId = explicitWidgetTypeId || canonicalWidgetTypeId
    const fieldsFromRow = (() => {
      const raw = (propsFromRow as unknown as Record<string, unknown>)[FRONTMATTER_FLOW_WIDGET_FIELDS_KEY]
      if (!Array.isArray(raw)) return [] as Array<{ fieldKey: string; fieldType: string; schemaPath?: string }>
      const out: Array<{ fieldKey: string; fieldType: string; schemaPath?: string }> = []
      const seen = new Set<string>()
      for (let j = 0; j < raw.length; j += 1) {
        const item = raw[j]
        if (!isRecord(item)) continue
        const fieldKey = asString((item as Record<string, unknown>).fieldKey)
        const fieldType = asString((item as Record<string, unknown>).fieldType)
        const schemaPath = asString((item as Record<string, unknown>).schemaPath)
        if (!fieldKey || !fieldType) continue
        const uniq = `${fieldKey}|${schemaPath}`
        if (seen.has(uniq)) continue
        seen.add(uniq)
        out.push({ fieldKey, fieldType, ...(schemaPath ? { schemaPath } : {}) })
      }
      return out
    })()
    const visualOverrides = normalizeVisualOverrides(row.visual)
    const paramsFromRow = isRecord(row.params) ? (row.params as unknown as JSONValue) : null
    const hasDataFromRow = Object.prototype.hasOwnProperty.call(row, 'data')
    const dataFromRow = hasDataFromRow && typeof row.data !== 'undefined' ? (row.data as JSONValue) : null
    const computeFromRow = asStringOrKtvValue(row.compute)
    const properties: Record<string, JSONValue> = {
      ...propsFromRow,
      ...(category && propsFromRow.category == null ? ({ category } as unknown as Record<string, JSONValue>) : {}),
      ...(category && propsFromRow['visual:layer'] == null ? ({ 'visual:layer': category } as unknown as Record<string, JSONValue>) : {}),
      ...(layer != null && propsFromRow['visual:depth'] == null ? ({ 'visual:depth': layer } as unknown as Record<string, JSONValue>) : {}),
      ...(x != null && propsFromRow['visual:xIndex'] == null ? ({ 'visual:xIndex': Math.floor(x / 320) } as unknown as Record<string, JSONValue>) : {}),
      ...(y != null && propsFromRow['visual:yIndex'] == null ? ({ 'visual:yIndex': Math.floor(y / 220) } as unknown as Record<string, JSONValue>) : {}),
      ...visualOverrides,
      ...(portTypes != null && propsFromRow[FLOW_PORT_TYPES_KEY] == null ? ({ [FLOW_PORT_TYPES_KEY]: portTypes } as unknown as Record<string, JSONValue>) : {}),
      ...(paramsFromRow != null ? ({ params: paramsFromRow } as unknown as Record<string, JSONValue>) : {}),
      ...(dataFromRow != null ? ({ data: dataFromRow } as unknown as Record<string, JSONValue>) : {}),
      ...(computeFromRow ? ({ 'flow:compute': computeFromRow } as unknown as Record<string, JSONValue>) : {}),
      ...(propsFromRow[FRONTMATTER_PRIMITIVE_KEY] == null
        ? ({
            [FRONTMATTER_PRIMITIVE_KEY]: String(id).startsWith('@cluster:') ? 'cluster' : 'node',
          } as unknown as Record<string, JSONValue>)
        : {}),
      ...(propsFromRow[FLOW_WIDGET_FORM_ID_KEY] == null
        ? ({ [FLOW_WIDGET_FORM_ID_KEY]: formId } as unknown as Record<string, JSONValue>)
        : {}),
      ...(((propsFromRow[FLOW_WIDGET_TYPE_ID_KEY] == null && type === FLOW_VIDEO_GENERATION_NODE_TYPE_ID)
        || (explicitWidgetTypeId && explicitWidgetTypeId !== widgetTypeId))
        ? ({ [FLOW_WIDGET_TYPE_ID_KEY]: widgetTypeId } as unknown as Record<string, JSONValue>)
        : {}),
    }
    nodes.push({
      id,
      label,
      type,
      ...(x != null ? { x } : {}),
      ...(y != null ? { y } : {}),
      properties,
    })
    const isWidgetSeedNodeType =
      type === FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || type === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
      || type === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
      || type === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    const shouldEmitDocRegistryEntry = !isWidgetSeedNodeType || formId.startsWith('fm:')

    if (shouldEmitDocRegistryEntry) {
      registry.push({
        id: `qer-fm-${cleanIdPart(type) || 'node'}-${cleanIdPart(id) || hashText(id)}`,
        isEnabled: true,
        nodeTypeId: type,
        widgetTypeId,
        formId,
        fields: fieldsFromRow,
        ports,
        updatedAt: FRONTMATTER_REGISTRY_UPDATED_AT,
      })
    }
  }
  if (nodes.length === 0) return null
  const layoutedNodes = spreadMissingNodePositions(nodes)
  return { nodes: layoutedNodes, registry }
}

export function collectNodePositionWarnings(rawNodes: ReadonlyArray<unknown>): string[] {
  const warnings: string[] = []
  let hasAnyPos = false
  for (let i = 0; i < rawNodes.length; i += 1) {
    const row = coerceFrontmatterNodeRecord(rawNodes[i])
    if (!row) continue
    const pos = isRecord(row.pos) ? row.pos : null
    const x = pos ? asFiniteNumber(pos.x) : asFiniteNumber((row as Record<string, unknown>).pos_x)
    const y = pos ? asFiniteNumber(pos.y) : asFiniteNumber((row as Record<string, unknown>).pos_y)
    if (x != null || y != null) {
      hasAnyPos = true
      break
    }
  }
  if (!hasAnyPos) return warnings
  for (let i = 0; i < rawNodes.length; i += 1) {
    const row = coerceFrontmatterNodeRecord(rawNodes[i])
    if (!row) continue
    const id = asString(row.id)
    if (!id) continue
    const pos = isRecord(row.pos) ? row.pos : null
    const x = pos ? asFiniteNumber(pos.x) : asFiniteNumber((row as Record<string, unknown>).pos_x)
    const y = pos ? asFiniteNumber(pos.y) : asFiniteNumber((row as Record<string, unknown>).pos_y)
    if (x == null || y == null) warnings.push(`Node missing pos: ${id}`)
  }
  return warnings
}
