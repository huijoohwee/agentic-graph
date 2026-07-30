import type { GetGraph } from '@/hooks/store/graph-data-slice/graphDataSliceAccess'
import type { GraphData } from '@/lib/graph/types'
import { parseLayoutMode } from './graphDataSliceParsers'
import { getCachedDerivedFields, parseGraphFieldId } from '@/features/graph-fields/graphFields'
import {
  buildDefaultVisibleColumns,
  isGraphDataTablePropertyColumnKey,
  type GraphDataTableColumnKey,
  type GraphDataTableColumnVisibilityByKey,
} from '@/features/graph-data-table/graphDataTable'
import { readCanvasWorkspaceFrontmatterPresetFromMeta } from '@/lib/markdown/frontmatter'
import { readValidatedWidgetRegistryMetadataEntries } from '@/hooks/store/storyboardWidgetManagerSlice'
import { hashRecordSignature, hashSignatureParts } from '@/lib/hash/signature'
import { isStoryboardCanvas2dRenderer } from '@/lib/config.render'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'

const FLOW_WIDGET_FORM_ID_KEY = 'flow:widgetFormId' as const

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function arraysEqual(a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function recordsShallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true
  const ak = Object.keys(a)
  const bk = Object.keys(b)
  if (ak.length !== bk.length) return false
  for (let i = 0; i < ak.length; i += 1) {
    const k = ak[i]!
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (a[k] !== b[k]) return false
  }
  return true
}

function readMetadataString(record: Record<string, unknown> | null, key: string): string {
  return String(record?.[key] || '').trim()
}

function hasNon2dCanvasWorkspacePreset(metadata: Record<string, unknown>): boolean {
  const frontmatterMeta = isRecord(metadata.frontmatterMeta)
    ? (metadata.frontmatterMeta as Record<string, unknown>)
    : null
  const explicitFrontmatterPreset = readCanvasWorkspaceFrontmatterPresetFromMeta(frontmatterMeta)
  const canvasWorkspacePreset = isRecord(metadata.canvasWorkspacePreset)
    ? (metadata.canvasWorkspacePreset as Record<string, unknown>)
    : null
  const canvasSurfaceMode = String(
    explicitFrontmatterPreset?.canvasSurfaceMode
    || readMetadataString(canvasWorkspacePreset, 'canvasSurfaceMode'),
  ).trim()
  if (canvasSurfaceMode === '3d' || canvasSurfaceMode === 'xr' || canvasSurfaceMode === 'geo-xr') return true
  if (canvasSurfaceMode === '2d' || canvasSurfaceMode === 'geospatial') return false
  const canvasRenderMode = String(
    explicitFrontmatterPreset?.canvasRenderMode
    || readMetadataString(canvasWorkspacePreset, 'canvasRenderMode'),
  ).trim()
  return canvasRenderMode === '3d'
}

function hasExplicitCanvasWorkspaceSurfacePreset(metadata: Record<string, unknown>): boolean {
  const frontmatterMeta = isRecord(metadata.frontmatterMeta)
    ? (metadata.frontmatterMeta as Record<string, unknown>)
    : null
  const explicitFrontmatterPreset = readCanvasWorkspaceFrontmatterPresetFromMeta(frontmatterMeta)
  const canvasWorkspacePreset = isRecord(metadata.canvasWorkspacePreset)
    ? (metadata.canvasWorkspacePreset as Record<string, unknown>)
    : null
  return !!(
    explicitFrontmatterPreset?.canvas2dRenderer
    || explicitFrontmatterPreset?.canvasSurfaceMode
    || explicitFrontmatterPreset?.canvasRenderMode
    || explicitFrontmatterPreset?.canvas3dMode
    || readMetadataString(canvasWorkspacePreset, 'canvas2dRenderer')
    || readMetadataString(canvasWorkspacePreset, 'canvasSurfaceMode')
    || readMetadataString(canvasWorkspacePreset, 'canvasRenderMode')
    || readMetadataString(canvasWorkspacePreset, 'canvas3dMode')
  )
}

function computeRegistrySignature(entries: Array<{ id: string; updatedAt: string }>): string {
  const pairs = entries
    .map(e => `${String(e.id || '').trim()}@${String(e.updatedAt || '').trim()}`)
    .filter(Boolean)
    .sort()
  return `${pairs.length}:${pairs.join('|')}`
}

const HASH_CACHE = new WeakMap<object, string>()

const GRAPH_SYNC_VOLATILE_METADATA_KEYS = [
  'hash',
  'graphDataRevision',
  'updatedAt',
  'modifiedAt',
  'lastUpdated',
] as const

function buildGraphDataPreviewSyncComparisonValue(graphData: unknown): unknown {
  if (!graphData || typeof graphData !== 'object' || Array.isArray(graphData)) return graphData
  const graphRecord = graphData as Record<string, unknown>
  const metadata = isRecord(graphRecord.metadata)
    ? { ...graphRecord.metadata }
    : graphRecord.metadata
  if (isRecord(metadata)) {
    for (const key of GRAPH_SYNC_VOLATILE_METADATA_KEYS) delete metadata[key]
  }
  return { ...graphRecord, metadata }
}

export function areGraphDataPreviewSyncContentsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  try {
    return JSON.stringify(buildGraphDataPreviewSyncComparisonValue(left))
      === JSON.stringify(buildGraphDataPreviewSyncComparisonValue(right))
  } catch {
    // Graph commits must continue when an exact comparison cannot be proven.
    return false
  }
}

function sampleHeadTailStrings(
  length: number,
  maxSamples: number,
  getAt: (idx: number) => string,
): string[] {
  const max = Math.max(0, Math.floor(maxSamples))
  const len = Math.max(0, Math.floor(length))
  if (len === 0 || max === 0) return []
  if (len <= max) {
    const out: string[] = []
    for (let i = 0; i < len; i += 1) out.push(getAt(i))
    return out
  }
  const headCount = Math.max(1, Math.floor(max / 2))
  const tailCount = Math.max(1, max - headCount)
  const out: string[] = []
  const head = Math.min(headCount, len)
  for (let i = 0; i < head; i += 1) out.push(getAt(i))
  const startTail = Math.max(head, len - tailCount)
  for (let i = startTail; i < len; i += 1) out.push(getAt(i))
  return out
}

export function withGraphDataRevision(graphData: GraphData, nextRevision: number): GraphData {
  const base = graphData as unknown as { metadata?: unknown }
  const metaRaw = base.metadata
  const meta = isRecord(metaRaw) ? metaRaw : {}
  const nextMeta: Record<string, unknown> = {
    ...meta,
    graphDataRevision: nextRevision,
    hash: `rev:${nextRevision}`,
  }
  return { ...(graphData as unknown as Record<string, unknown>), metadata: nextMeta } as unknown as GraphData
}

export function hashGraphDataForPreviewSync(graphData: unknown): string {
  try {
    if (!graphData || typeof graphData !== 'object') return ''
    const cached = HASH_CACHE.get(graphData as object)
    if (cached) return cached

    const gd = graphData as unknown as { metadata?: unknown; nodes?: unknown; edges?: unknown }
    const metaRaw = gd.metadata
    const meta = isRecord(metaRaw) ? (metaRaw as Record<string, unknown>) : null
    const metaSansVolatile = (() => {
      if (!meta) return null
      const out: Record<string, unknown> = { ...meta }
      for (const key of GRAPH_SYNC_VOLATILE_METADATA_KEYS) delete out[key]
      return out
    })()

    const nodes = Array.isArray(gd.nodes) ? (gd.nodes as Array<Record<string, unknown>>) : []
    const edges = Array.isArray(gd.edges) ? (gd.edges as Array<Record<string, unknown>>) : []

    const nodeSamples = sampleHeadTailStrings(nodes.length, 32, idx => {
      const n = nodes[idx]
      return String(n?.id ?? '')
    })
    const edgeSamples = sampleHeadTailStrings(edges.length, 32, idx => {
      const e = edges[idx]
      const id = String(e?.id ?? '')
      const s = String(e?.source ?? '')
      const t = String(e?.target ?? '')
      const label = String(e?.label ?? '')
      return `${id}|${s}|${t}|${label}`
    })

    const out = hashSignatureParts([
      'v2',
      nodes.length,
      edges.length,
      metaSansVolatile ? hashRecordSignature(metaSansVolatile, { maxEntries: 60 }) : '',
      nodeSamples.length,
      ...nodeSamples,
      edgeSamples.length,
      ...edgeSamples,
    ])
    HASH_CACHE.set(graphData as object, out)
    return out
  } catch {
    return ''
  }
}

export function shouldSkipGraphDataPreviewSync(nextGraphData: unknown, currentGraphData: unknown): boolean {
  const nextHash = hashGraphDataForPreviewSync(nextGraphData)
  const currentHash = hashGraphDataForPreviewSync(currentGraphData)
  return Boolean(
    nextHash
    && currentHash
    && nextHash === currentHash
    && areGraphDataPreviewSyncContentsEqual(nextGraphData, currentGraphData),
  )
}

export function applyLayoutAutosuggestFromMetadata(get: GetGraph, metadata: unknown) {
  if (!isRecord(metadata)) return
  const rawMode =
    metadata['canvas:layoutMode'] ??
    metadata['canvas:layout.mode'] ??
    metadata['layoutMode'] ??
    (isRecord(metadata['canvas:layout']) ? metadata['canvas:layout'].mode : undefined)

  const modeSuggestion = parseLayoutMode(rawMode)
  if (!modeSuggestion) return

  const schema = get().schema
  const curLayout = schema.layout || {}
  const currentMode = (() => {
    const raw = String(curLayout.mode || '').trim().toLowerCase()
    if (raw === 'block') return 'block'
    return 'radial'
  })()
  if (currentMode === 'block') return
  if (modeSuggestion === 'radial') return

  const nextLayout: NonNullable<typeof schema.layout> = { ...curLayout, mode: modeSuggestion }
  get().setSchema({ ...schema, layout: nextLayout })
  if ((nextLayout.mode || schema.layout?.mode) === 'block') {
    if (!hasNon2dCanvasWorkspacePreset(metadata)) {
      const setCanvasRenderMode = get().setCanvasRenderMode
      if (typeof setCanvasRenderMode === 'function') setCanvasRenderMode('2d')
    }

    const setCanvas2dRenderer = get().setCanvas2dRenderer
    const currentRenderer = get().canvas2dRenderer
    const frontmatterMeta = isRecord(metadata.frontmatterMeta)
      ? (metadata.frontmatterMeta as Record<string, unknown>)
      : null
    const explicitFrontmatterPreset = readCanvasWorkspaceFrontmatterPresetFromMeta(frontmatterMeta)
    const shouldPreserveExplicitRenderer =
      !!explicitFrontmatterPreset?.canvas2dRenderer
      || !!explicitFrontmatterPreset?.canvasSurfaceMode
      || hasExplicitCanvasWorkspaceSurfacePreset(metadata)
      || isFrontmatterFlowGraph(get().graphData)
    if (
      typeof setCanvas2dRenderer === 'function'
      && !shouldPreserveExplicitRenderer
      && !isStoryboardCanvas2dRenderer(currentRenderer)
    ) {
      setCanvas2dRenderer('flowchart')
    }
  }
}

export function applyWidgetRegistryFromMetadata(get: GetGraph, metadata: unknown, graphData?: GraphData | null) {
  const metadataRecord = isRecord(metadata) ? metadata : ({} as Record<string, unknown>)
  const raw = metadataRecord.widgetRegistry
  const rawArr = Array.isArray(raw) ? raw : []
  void rawArr
  const validatedRaw = readValidatedWidgetRegistryMetadataEntries(metadata)
  const validated = (() => {
    const graph = graphData || null
    if (!graph) return validatedRaw
    if (!isFrontmatterFlowGraph(graph)) return validatedRaw

    const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
    const expectedByFormId = new Map<string, string>()
    const expectedNodeTypes = new Set<string>()
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i]
      const nodeId = String(node?.id || '').trim()
      if (!nodeId) continue
      const nodeType = String(node?.type || '').trim()
      if (nodeType) expectedNodeTypes.add(nodeType)
      const props = (node?.properties || {}) as Record<string, unknown>
      const explicitFormId =
        typeof props[FLOW_WIDGET_FORM_ID_KEY] === 'string'
          ? String(props[FLOW_WIDGET_FORM_ID_KEY] || '').trim()
          : ''
      const expectedFormId = explicitFormId || `fm:${nodeId}`
      if (!expectedFormId) continue
      expectedByFormId.set(expectedFormId, String(node?.type || 'Node') || 'Node')
    }
    if (expectedByFormId.size === 0) return []

    const out: typeof validatedRaw = []
    const seenFormIds = new Set<string>()
    for (let i = 0; i < validatedRaw.length; i += 1) {
      const entry = validatedRaw[i]
      const formId = String(entry.formId || '').trim()
      if (!formId || seenFormIds.has(formId)) continue
      const expectedNodeType = expectedByFormId.get(formId) || ''
      if (!expectedNodeType) continue
      const entryNodeType = String(entry.nodeTypeId || '').trim()
      if (entryNodeType && expectedNodeType && entryNodeType !== expectedNodeType) continue
      seenFormIds.add(formId)
      out.push(entry)
    }
    if (out.length > 0) return out

    // Fallback: preserve node-type-matching entries when form IDs were normalized away upstream.
    const byNodeType: typeof validatedRaw = []
    for (let i = 0; i < validatedRaw.length; i += 1) {
      const entry = validatedRaw[i]
      const entryNodeType = String(entry.nodeTypeId || '').trim()
      if (!entryNodeType || !expectedNodeTypes.has(entryNodeType)) continue
      byNodeType.push(entry)
    }
    if (byNodeType.length > 0) return byNodeType
    return out
  })()

  const current = Array.isArray(get().documentWidgetRegistry) ? get().documentWidgetRegistry : []
  const currentSig = computeRegistrySignature(current)
  const nextSig = computeRegistrySignature(validated)
  if (currentSig === nextSig) return

  const setRegistry = get().setDocumentWidgetRegistry
  if (typeof setRegistry !== 'function') return
  setRegistry(validated, { graphData: graphData || null })
}

export function syncGraphFieldsWithGraphData(
  get: GetGraph,
  graphData: GraphData,
  options?: { resetVisibleColumns?: boolean },
) {
  const derived = getCachedDerivedFields({
    graphData,
    graphRevision: get().graphDataRevision || 0,
  })
  const derivedFieldIds = new Set<string>(derived.map(f => f.id))
  const derivedPropColumnKeys = new Set<string>(derived.map(f => `prop:${f.scope}:${f.key}`))

  const currentSettings = get().graphFieldSettingsById || {}
  const customPropColumnKeys = new Set<string>()
  for (const [k, v] of Object.entries(currentSettings)) {
    if (!v || v.isCustom !== true) continue
    const parsed = parseGraphFieldId(k)
    if (parsed) customPropColumnKeys.add(`prop:${parsed.scope}:${parsed.key}`)
  }

  const activePropColumnKeys = new Set<string>([...derivedPropColumnKeys, ...customPropColumnKeys])

  const currentOrder = get().graphDataTableColumnOrder || []
  const baseAndActiveOrder = currentOrder.filter(
    k => !isGraphDataTablePropertyColumnKey(k) || activePropColumnKeys.has(k),
  )
  const missingPropKeys: GraphDataTableColumnKey[] = []
  for (const key of activePropColumnKeys) {
    const colKey = key as GraphDataTableColumnKey
    if (!baseAndActiveOrder.includes(colKey)) {
      missingPropKeys.push(colKey)
    }
  }
  const nextOrder = [...baseAndActiveOrder, ...missingPropKeys]
  if (!arraysEqual(currentOrder, nextOrder)) get().setGraphDataTableColumnOrder(nextOrder)

  const currentVisible = (get().graphDataTableVisibleColumns || {}) as Record<
    string,
    boolean | undefined
  >
  const nextVisible: Record<string, boolean | undefined> = options?.resetVisibleColumns
    ? { ...buildDefaultVisibleColumns() }
    : { ...currentVisible }
  for (const rawKey of Object.keys(nextVisible)) {
    if (!isGraphDataTablePropertyColumnKey(rawKey as GraphDataTableColumnKey)) continue
    if (!activePropColumnKeys.has(rawKey)) delete nextVisible[rawKey]
  }
  for (const key of activePropColumnKeys) {
    if (options?.resetVisibleColumns || nextVisible[key] === undefined) {
      const parsed = key.startsWith('prop:node:')
        ? { scope: 'node', id: `node:${key.slice('prop:node:'.length)}` }
        : key.startsWith('prop:edge:')
          ? { scope: 'edge', id: `edge:${key.slice('prop:edge:'.length)}` }
          : null
      const fieldId = parsed?.id
      const hidden = fieldId ? currentSettings[fieldId as keyof typeof currentSettings]?.isHidden : undefined
      nextVisible[key] = typeof hidden === 'boolean' ? !hidden : true
    }
  }
  if (!recordsShallowEqual(currentVisible, nextVisible)) {
    get().setGraphDataTableVisibleColumns(nextVisible as GraphDataTableColumnVisibilityByKey)
  }

  const nextSettings: typeof currentSettings = {}
  for (const [k, v] of Object.entries(currentSettings)) {
    if (!v) continue
    const isDerived = derivedFieldIds.has(k)
    if (!isDerived && v.isCustom !== true) continue
    nextSettings[k as keyof typeof currentSettings] = v
  }
  if (!recordsShallowEqual(currentSettings as Record<string, unknown>, nextSettings as Record<string, unknown>)) {
    const state = get()
    const currentKeys = new Set(Object.keys(currentSettings))
    const nextKeys = new Set(Object.keys(nextSettings))
    for (const staleKey of currentKeys) {
      if (nextKeys.has(staleKey)) continue
      state.removeGraphFieldSetting(staleKey as keyof typeof nextSettings & string)
    }
  }
}

export function readGraphRagWorkflowJsonTextFromGraphData(graphData: GraphData): string | null {
  const meta = graphData.metadata
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null
  const rawText = (meta as Record<string, unknown>).graphRagWorkflowJsonText as unknown
  if (typeof rawText === 'string') {
    const trimmed = rawText.trim()
    return trimmed ? rawText : null
  }
  const rawDoc = (meta as Record<string, unknown>).graphRagWorkflowJsonLd as unknown
  if (!rawDoc || typeof rawDoc !== 'object') return null
  if (Array.isArray(rawDoc)) return null
  try {
    const text = JSON.stringify(rawDoc, null, 2)
    return text && text.trim() ? text : null
  } catch {
    return null
  }
}
