import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { LRUCache } from '@/lib/cache/LRUCache'
import { hashSignatureParts } from '@/lib/hash/signature'
import { hashStringToHexSharedContentCached } from '@/lib/hash/textHashCache'
import { AG_SUBGRAPHS_KEY, type UserSubgraph } from '@/lib/graph/subgraphs'
import { DESIGN_WIREFRAME_META_KEY } from '@/lib/render/designWireframeSettings'
import {
  readWorkspaceDataViewStateWithMeta,
  type WorkspaceDataViewGraphColumnRole,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { normalizeTableCellText, toTableCellStringArray } from '@/lib/markdown/tableCellConventions'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'

type TableNodeLike = {
  id?: unknown
  type?: unknown
  properties?: unknown
  metadata?: unknown
}

type DeriveArgs = {
  graphData: GraphData
  forceGraphEnabled?: boolean
}

const cache = new LRUCache<string, GraphData | null>(32, 30_000)
export const MARKDOWN_TABLE_GRAPH_CELL_PROPERTY_PREVIEW_CHAR_LIMIT = 240

const hashCellForSignature = (raw: string): string => {
  const text = String(raw || '')
  return `${text.length}:${hashStringToHexSharedContentCached(text, 'markdown-table-graph-cell')}`
}

const hashTableContentToHex = (header: string[], rows: string[][]): string => {
  const parts: Array<string | number> = ['table', header.length, rows.length]
  for (let i = 0; i < header.length; i += 1) {
    parts.push('h', i, header[i] ?? '')
  }
  for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
    const row = rows[rIdx]!
    parts.push('r', rIdx, row.length)
    for (let cIdx = 0; cIdx < row.length; cIdx += 1) {
      parts.push('c', cIdx, hashCellForSignature(row[cIdx] ?? ''))
    }
  }
  return hashSignatureParts(parts)
}

const normalizeText = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim()

const readGraphCellPropertyText = (raw: string, role: ColumnRole): string => {
  if (role !== 'none') return raw
  if (raw.length <= MARKDOWN_TABLE_GRAPH_CELL_PROPERTY_PREVIEW_CHAR_LIMIT) return raw
  return `${raw.slice(0, MARKDOWN_TABLE_GRAPH_CELL_PROPERTY_PREVIEW_CHAR_LIMIT).trimEnd()}...`
}

const readStringArrayProp = (props: unknown, key: string): string[] => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return []
  const v = (props as Record<string, unknown>)[key]
  if (!Array.isArray(v)) return []
  return v.map(x => normalizeText(x)).filter(Boolean)
}

const readStringMatrixProp = (props: unknown, key: string): string[][] => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return []
  const v = (props as Record<string, unknown>)[key]
  if (!Array.isArray(v)) return []
  const out: string[][] = []
  for (const row of v) {
    if (!Array.isArray(row)) continue
    out.push(row.map(x => normalizeText(x)))
  }
  return out
}

const readLineRange = (meta: unknown): { startLine: number; endLine: number; documentPath: string } => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return { startLine: 1, endLine: 1, documentPath: '' }
  const m = meta as Record<string, unknown>
  const startLine = Number.isFinite(m.lineStart) ? Number(m.lineStart) : 1
  const endLine = Number.isFinite(m.lineEnd) ? Number(m.lineEnd) : startLine
  const documentPath = normalizeText(m.documentPath)
  return {
    startLine: Math.max(1, Math.floor(startLine)),
    endLine: Math.max(1, Math.floor(endLine)),
    documentPath,
  }
}

type ColumnRole = WorkspaceDataViewGraphColumnRole

const inferRolesByHeader = (header: string[]): Record<string, ColumnRole> => {
  const out: Record<string, ColumnRole> = {}
  for (let i = 0; i < header.length; i += 1) {
    const name = normalizeText(header[i])
    const lower = name.toLowerCase()
    const colId = `col_${i}`
    if (lower === 'task') out[colId] = 'node'
    else if (lower === 'status') out[colId] = 'color'
    else if (lower === 'category') out[colId] = 'group'
    else if (lower === 'dependency' || lower === 'dependencies') out[colId] = 'dependsOn'
    else if (lower === 'predecessor' || lower === 'predecessors') out[colId] = 'predecessor'
    else if (lower === 'successor' || lower === 'successors') out[colId] = 'successor'
    else out[colId] = 'none'
  }
  return out
}

const coerceRole = (raw: unknown): ColumnRole => {
  const v = String(raw || '').trim()
  if (v === 'node' || v === 'color' || v === 'group' || v === 'dependsOn' || v === 'predecessor' || v === 'successor') return v
  return 'none'
}

const readRolesFromWorkspaceDataView = (args: {
  documentPath: string | null
  tableId: string
  header: string[]
  forceGraphEnabled?: boolean
}): { enabled: boolean; rolesByColumnId: Record<string, ColumnRole>; hasStoredValue: boolean } => {
  const { state, hasStoredValue } = readWorkspaceDataViewStateWithMeta({
    activeDocumentPath: args.documentPath,
    tableId: args.tableId,
  })
  const activeView = state.views.find(v => v.id === state.activeViewId) || state.views[0]
  const storedRolesRaw =
    activeView && (activeView as Record<string, unknown>).graphRolesByColumnId && typeof (activeView as Record<string, unknown>).graphRolesByColumnId === 'object'
      ? ((activeView as Record<string, unknown>).graphRolesByColumnId as Record<string, unknown>)
      : null
  const storedEnabledRaw = activeView ? (activeView as Record<string, unknown>).graphEnabled : undefined

  const inferred = inferRolesByHeader(args.header)
  if (args.forceGraphEnabled === true) {
    if (!storedRolesRaw) return { enabled: true, rolesByColumnId: inferred, hasStoredValue }
    const roles: Record<string, ColumnRole> = { ...inferred }
    for (const [k, v] of Object.entries(storedRolesRaw)) {
      const id = String(k || '').trim()
      if (!id) continue
      roles[id] = coerceRole(v)
    }
    return { enabled: true, rolesByColumnId: roles, hasStoredValue }
  }
  if (!hasStoredValue) {
    return { enabled: true, rolesByColumnId: inferred, hasStoredValue }
  }
  if (!storedRolesRaw) {
    const enabled = typeof storedEnabledRaw === 'boolean' ? storedEnabledRaw : false
    return { enabled, rolesByColumnId: inferred, hasStoredValue }
  }

  const roles: Record<string, ColumnRole> = { ...inferred }
  for (const [k, v] of Object.entries(storedRolesRaw)) {
    const id = String(k || '').trim()
    if (!id) continue
    roles[id] = coerceRole(v)
  }
  const enabled = typeof storedEnabledRaw === 'boolean' ? storedEnabledRaw : true
  return { enabled, rolesByColumnId: roles, hasStoredValue }
}

const statusToFill = (statusRaw: string): string | null => {
  const s = normalizeText(statusRaw).toLowerCase()
  if (!s) return null
  if (s === 'done') return '#10B981'
  if (s === 'doing' || s === 'in progress' || s === 'wip') return '#F59E0B'
  if (s === 'todo' || s === 'backlog') return '#6B7280'
  if (s === 'blocked') return '#EF4444'
  return '#3B82F6'
}

const normalizePropertyKey = (name: string): string => {
  const s = normalizeText(name).toLowerCase()
  const key = s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return key || 'col'
}

const makeStableId = (prefix: string, raw: string): string => {
  const h = hashSignatureParts([prefix, raw])
  return `${prefix}:${h.slice(0, 16)}`
}

export function deriveMarkdownTableGraphForFrontmatterMode(args: DeriveArgs): GraphData | null {
  const graphData = args.graphData

  const nodes = Array.isArray(graphData.nodes) ? graphData.nodes : []
  const docNode = nodes.find(n => String((n as { type?: unknown }).type || '') === 'Document') as
    | { properties?: Record<string, unknown> }
    | undefined
  const documentPath = normalizeText(docNode?.properties?.path)

  const tableNodes = nodes.filter(n => String((n as { type?: unknown }).type || '') === 'Table') as unknown as TableNodeLike[]
  if (tableNodes.length === 0) return null

  const tryDerive = (tn: TableNodeLike, tIdx: number, requireStored: boolean): GraphData | null => {
    const header = readStringArrayProp(tn.properties, 'table:header')
    const rows = readStringMatrixProp(tn.properties, 'table:rows')
    if (header.length < 2 || rows.length < 1) return null

    const meta = readLineRange(tn.metadata)
    const tableId = `md-block:${meta.startLine}-${meta.endLine}`
    const cfg = readRolesFromWorkspaceDataView({
      documentPath: documentPath || meta.documentPath || null,
      tableId,
      header,
      forceGraphEnabled: args.forceGraphEnabled === true,
    })
    if (!cfg.enabled) return null
    if (requireStored && !cfg.hasStoredValue) return null

    const cfgKey = hashSignatureParts([
      'cfg',
      cfg.enabled,
      Object.entries(cfg.rolesByColumnId)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('|'),
    ])
    const tableHash = hashTableContentToHex(header, rows)
    const cacheKey = buildScopedGraphSemanticKey('markdown-table-graph', {
      graphData: {
        type: 'GraphData',
        context: 'markdown-table',
        nodes: [
          {
            id: String(tn.id || tableId),
            type: String(tn.type || 'Table'),
            label: tableId,
            properties: {},
          } as GraphNode,
        ],
        edges: [],
      },
      graphSemanticKey: `${documentPath || meta.documentPath || ''}|${tableId}|${tIdx}`,
      sourceLayerHash: tableHash,
      sourceLayerOrderHash: cfgKey,
    })
    const cached = cache.get(cacheKey)
    if (cached !== undefined) return cached

    const colIndexById = new Map<string, number>()
    for (let i = 0; i < header.length; i += 1) colIndexById.set(`col_${i}`, i)

    const roleEntries = Object.entries(cfg.rolesByColumnId)
    const nodeColId = roleEntries.find(([, r]) => r === 'node')?.[0] || 'col_0'
    const colorColId = roleEntries.find(([, r]) => r === 'color')?.[0] || ''
    const groupColIds = roleEntries
      .filter(([, r]) => r === 'group')
      .map(([id]) => id)
    const edgeCols = roleEntries.filter(([, r]) => r === 'dependsOn' || r === 'predecessor' || r === 'successor')

    const nodeColIndex = colIndexById.get(nodeColId) ?? 0
    const colorColIndex = colorColId ? colIndexById.get(colorColId) ?? -1 : -1

    const tableKey = makeStableId('mdtbl', `${documentPath || meta.documentPath || ''}|${tableId}|${tIdx}`)

    const outNodes: GraphNode[] = []
    const nodeIdByLabelKey = new Map<string, string>()
    const nodeById = new Map<string, GraphNode>()

    for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
      const row = rows[rIdx]!
      const label = normalizeTableCellText(row[nodeColIndex] ?? '')
      if (!label) continue
      const labelKey = label.toLowerCase()
      if (nodeIdByLabelKey.has(labelKey)) continue

      const id = makeStableId(tableKey, labelKey)
      const props: Record<string, JSONValue> = {}
      for (let cIdx = 0; cIdx < header.length; cIdx += 1) {
        const colName = normalizeText(header[cIdx] ?? '') || `Column ${cIdx + 1}`
        const key = `md:table:${normalizePropertyKey(colName)}`
        const raw = normalizeTableCellText(row[cIdx] ?? '')
        if (!raw) continue
        const role = cfg.rolesByColumnId[`col_${cIdx}`] || 'none'
        const propertyText = readGraphCellPropertyText(raw, role)
        props[key] = role === 'group' ? (toTableCellStringArray(propertyText) as unknown as JSONValue) : propertyText
      }

      if (colorColIndex >= 0) {
        const status = normalizeTableCellText(row[colorColIndex] ?? '')
        const fill = statusToFill(status)
        if (fill) props['visual:fill'] = fill
        if (status) props['md:table:status'] = status
      }

      const n: GraphNode = {
        id,
        type: 'Task',
        label,
        properties: props,
      }
      outNodes.push(n)
      nodeIdByLabelKey.set(labelKey, id)
      nodeById.set(id, n)
    }

    if (outNodes.length < 1) return null

    const ensurePlaceholderNode = (label: string): string => {
      const key = label.toLowerCase()
      const existing = nodeIdByLabelKey.get(key)
      if (existing) return existing
      const id = makeStableId(tableKey, `placeholder|${key}`)
      const n: GraphNode = { id, type: 'Task', label, properties: { 'md:table:placeholder': true } }
      outNodes.push(n)
      nodeIdByLabelKey.set(key, id)
      nodeById.set(id, n)
      return id
    }

    const edges: GraphEdge[] = []
    const seenEdgeId = new Set<string>()
    for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
      const row = rows[rIdx]!
      const srcLabel = normalizeTableCellText(row[nodeColIndex] ?? '')
      if (!srcLabel) continue
      const srcId = nodeIdByLabelKey.get(srcLabel.toLowerCase())
      if (!srcId) continue

      for (const [colId, role] of edgeCols) {
        const idx = colIndexById.get(colId) ?? -1
        if (idx < 0) continue
        const cell = normalizeTableCellText(row[idx] ?? '')
        if (!cell) continue
        const targets = toTableCellStringArray(cell)
        for (const t of targets) {
          const tgtId = ensurePlaceholderNode(t)
          let source = srcId
          let target = tgtId
          let label = 'dependsOn'
          if (role === 'predecessor') {
            label = 'predecessor'
            source = tgtId
            target = srcId
          } else if (role === 'successor') {
            label = 'successor'
            source = srcId
            target = tgtId
          }
          const edgeId = makeStableId('e', `${tableKey}|${label}|${source}|${target}`)
          if (seenEdgeId.has(edgeId)) continue
          seenEdgeId.add(edgeId)
          edges.push({ id: edgeId, source, target, label, properties: { 'md:table:origin': tableId } })
        }
      }
    }

    const subgraphs: UserSubgraph[] = []
    const groupsById = new Map<string, { label: string; members: Set<string> }>()
    for (const n of outNodes) {
      const nodeProps = (n.properties || {}) as Record<string, unknown>
      for (const colId of groupColIds) {
        const idx = colIndexById.get(colId) ?? -1
        if (idx < 0) continue
        const colName = normalizeText(header[idx] ?? '') || `col_${idx}`
        const key = `md:table:${normalizePropertyKey(colName)}`
        const raw = nodeProps[key]
        const vals = Array.isArray(raw)
          ? raw.map(x => normalizeTableCellText(x)).filter(Boolean)
          : toTableCellStringArray(String(raw ?? ''))
        for (const v of vals) {
          const groupId = makeStableId('sg', `${tableKey}|${colName}|${v.toLowerCase()}`)
          const label = colName.trim().toLowerCase() === 'category' ? v : `${colName}: ${v}`
          const cur = groupsById.get(groupId) || { label, members: new Set<string>() }
          cur.members.add(String(n.id))
          groupsById.set(groupId, cur)
        }
      }
    }
    for (const [id, g] of groupsById) {
      const memberNodeIds = Array.from(g.members)
      if (memberNodeIds.length < 2) continue
      subgraphs.push({ id, label: g.label || id, memberNodeIds, kind: 'cluster' })
    }

    const baseGraphMeta = (graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
      ? (graphData.metadata as Record<string, JSONValue>)
      : ({} as Record<string, JSONValue>))
    const existingWireframeRaw = Object.prototype.hasOwnProperty.call(baseGraphMeta, DESIGN_WIREFRAME_META_KEY)
      ? (baseGraphMeta[DESIGN_WIREFRAME_META_KEY] as unknown)
      : undefined
    const existingWireframe =
      existingWireframeRaw && typeof existingWireframeRaw === 'object' && !Array.isArray(existingWireframeRaw)
        ? (existingWireframeRaw as Record<string, JSONValue>)
        : ({} as Record<string, JSONValue>)
    const nextWireframe = edgeCols.length > 0 ? ({ ...existingWireframe, showEdges: true } as unknown as JSONValue) : undefined

    const derived: GraphData = {
      type: 'Graph',
      context: 'markdown-table-graph',
      nodes: outNodes,
      edges,
      metadata: {
        ...baseGraphMeta,
        [AG_SUBGRAPHS_KEY]: (subgraphs as unknown as JSONValue) || ([] as unknown as JSONValue),
        ...(nextWireframe ? { [DESIGN_WIREFRAME_META_KEY]: nextWireframe } : null),
      },
    }
    cache.set(cacheKey, derived)
    return derived
  }

  for (let tIdx = 0; tIdx < tableNodes.length; tIdx += 1) {
    const tn = tableNodes[tIdx]!
    const derived = tryDerive(tn, tIdx, true)
    if (derived) return derived
  }

  for (let tIdx = 0; tIdx < tableNodes.length; tIdx += 1) {
    const tn = tableNodes[tIdx]!
    const derived = tryDerive(tn, tIdx, false)
    if (derived) return derived
  }
  return null
}
