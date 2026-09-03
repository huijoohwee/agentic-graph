import { parseJsonLd } from '@/lib/graph/jsonld/index'
import type { GraphData, JSONValue } from '@/lib/graph/types'
import { parseGraph } from '@/lib/graph/io/adapter'
import { parseGraphInWorker } from '@/lib/graph/parseWorker'
import { runGraphRagTextPipeline } from '@/lib/graph/graphragTextPipeline'
import { DEFAULT_GRAPHRAG_TEXT_CENTRALITY_CONFIG, parseGraphRagTextCentralityConfig } from '@/lib/graph/graphragTextConfig'
import type { ParserSpec } from './types'
import { toParserId } from './types'
import { pythonSpec } from './python/index'
import { buildMarkdownJsonLd } from './markdownJsonLd'
import { tryParseMarkdownFrontmatterFlowGraph } from './markdownFrontmatterFlowGraph'
import { tryParseMarkdownPanelFlowGraph } from './markdownPanelFlowGraph'
import { containsFrontmatterMermaid, isMarkdownLikeFileName } from 'grph-shared/markdown/mermaidInput'
import { LS_KEYS } from '@/lib/config'
import { lsJson } from '@/lib/persistence'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import { isCorpusSourceUnitMarkdown } from '@/features/queryable-corpus/corpusGraph'
import { queryableCorpusParsers } from '@/features/queryable-corpus/parserSpecs'
import { strybldrParsers } from '@/features/strybldr/parserSpecs'
import { isStrybldrStoryboardMarkdown } from '@/features/strybldr/strybldrStoryboard'
import {
  buildMarkdownLargeDocumentGraph,
  readMarkdownLargeDocumentProfile,
  shouldUseSummaryGraphForMarkdown,
} from './markdownLargeDocumentGraph'
import { withGraphTopologyMetadata } from '@/lib/graph/graphTopology'
import {
  mergeAgenticOsSemanticGraphIntoGraphData,
  parseAgenticOsSemanticGraphFromMarkdown,
} from './agenticOsSemanticGraph'

let mermaidFrontmatterGeometryModulePromise: Promise<typeof import('@/lib/mermaid/mermaidFrontmatterGeometry')> | null = null

const loadMermaidFrontmatterGeometryModule = (): Promise<typeof import('@/lib/mermaid/mermaidFrontmatterGeometry')> => {
  if (!mermaidFrontmatterGeometryModulePromise) {
    mermaidFrontmatterGeometryModulePromise = import('@/lib/mermaid/mermaidFrontmatterGeometry')
  }
  return mermaidFrontmatterGeometryModulePromise
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function mergeGraphDataPreferOverlay(args: { base: GraphData; overlay: GraphData }): GraphData {
  const base = args.base
  const overlay = args.overlay

  const overlayNodes = Array.isArray(overlay.nodes) ? overlay.nodes : []
  const baseNodes = Array.isArray(base.nodes) ? base.nodes : []
  const nodes: GraphData['nodes'] = []
  const seenNodeIds = new Set<string>()
  for (let i = 0; i < overlayNodes.length; i += 1) {
    const n = overlayNodes[i]
    const id = String((n as { id?: unknown })?.id || '').trim()
    if (!id || seenNodeIds.has(id)) continue
    seenNodeIds.add(id)
    nodes.push(n)
  }
  for (let i = 0; i < baseNodes.length; i += 1) {
    const n = baseNodes[i]
    const id = String((n as { id?: unknown })?.id || '').trim()
    if (!id || seenNodeIds.has(id)) continue
    seenNodeIds.add(id)
    nodes.push(n)
  }

  const overlayEdges = Array.isArray(overlay.edges) ? overlay.edges : []
  const baseEdges = Array.isArray(base.edges) ? base.edges : []
  const edges: GraphData['edges'] = []
  const seenEdgeIds = new Set<string>()
  for (let i = 0; i < overlayEdges.length; i += 1) {
    const e = overlayEdges[i]
    const id = String((e as { id?: unknown })?.id || '').trim()
    if (!id || seenEdgeIds.has(id)) continue
    seenEdgeIds.add(id)
    edges.push(e)
  }
  for (let i = 0; i < baseEdges.length; i += 1) {
    const e = baseEdges[i]
    const id = String((e as { id?: unknown })?.id || '').trim()
    if (!id || seenEdgeIds.has(id)) continue
    seenEdgeIds.add(id)
    edges.push(e)
  }

  const baseMeta = isRecord(base.metadata) ? (base.metadata as Record<string, JSONValue>) : ({} as Record<string, JSONValue>)
  const overlayMeta = isRecord(overlay.metadata) ? (overlay.metadata as Record<string, JSONValue>) : ({} as Record<string, JSONValue>)
  const kind = String(overlayMeta.kind ?? baseMeta.kind ?? '').trim()
  const metadata: Record<string, JSONValue> = {
    ...baseMeta,
    ...overlayMeta,
    ...(kind ? ({ kind } as unknown as Record<string, JSONValue>) : {}),
  }

  const context = String(overlay.context || base.context || '').trim()
  return {
    type: 'Graph',
    context,
    nodes,
    edges,
    metadata,
  }
}

function pickMarkdownReferenceGraph(args: { base: GraphData; overlay: GraphData }): GraphData {
  const overlayNodeIds = new Set(
    (Array.isArray(args.overlay.nodes) ? args.overlay.nodes : [])
      .map(node => String((node as { id?: unknown })?.id || '').trim())
      .filter(Boolean),
  )
  const semanticReferenceTypes = new Set(['InternalLink', 'WikiDocument', 'Anchor'])
  const nodes = (Array.isArray(args.base.nodes) ? args.base.nodes : []).filter(node => {
    const type = String((node as { type?: unknown })?.type || '').trim()
    return semanticReferenceTypes.has(type)
  })
  const referenceNodeIds = new Set(
    nodes
      .map(node => String((node as { id?: unknown })?.id || '').trim())
      .filter(Boolean),
  )
  const edges = (Array.isArray(args.base.edges) ? args.base.edges : []).filter(edge => {
    const source = String((edge as { source?: unknown })?.source || '').trim()
    const target = String((edge as { target?: unknown })?.target || '').trim()
    if (!source || !target) return false
    return referenceNodeIds.has(source) && (referenceNodeIds.has(target) || overlayNodeIds.has(target))
  })
  const baseMeta = isRecord(args.base.metadata) ? (args.base.metadata as Record<string, JSONValue>) : ({} as Record<string, JSONValue>)
  return {
    type: 'Graph',
    context: String(args.base.context || '').trim(),
    nodes,
    edges,
    metadata: baseMeta,
  }
}

function enrichFrontmatterFlowWithMarkdownReferences(args: {
  name: string
  text: string
  frontmatterFlow: { graphData: GraphData; warnings: string[] }
}): { graphData: GraphData; warnings: string[] } {
  const metadata = isRecord(args.frontmatterFlow.graphData.metadata)
    ? (args.frontmatterFlow.graphData.metadata as Record<string, unknown>)
    : null
  const frontmatterMeta = isRecord(metadata?.frontmatterMeta)
    ? (metadata.frontmatterMeta as Record<string, unknown>)
    : null
  const frontmatterModeEnabledRaw = frontmatterMeta?.kgFrontmatterModeEnabled
  const frontmatterModeEnabled =
    frontmatterModeEnabledRaw === true ||
    String(frontmatterModeEnabledRaw || '').trim().toLowerCase() === 'true'
  const canvas2dRenderer = String(frontmatterMeta?.kgCanvas2dRenderer || '').trim()
  if (isRecord(frontmatterMeta?.flow) || frontmatterModeEnabled || canvas2dRenderer === 'storyboard') {
    return args.frontmatterFlow
  }

  const markdownReferences = pickMarkdownReferenceGraph({
    base: parseJsonLd(buildMarkdownJsonLd(args.name, args.text)),
    overlay: args.frontmatterFlow.graphData,
  })
  return {
    graphData: mergeGraphDataPreferOverlay({
      base: markdownReferences,
      overlay: args.frontmatterFlow.graphData,
    }),
    warnings: args.frontmatterFlow.warnings,
  }
}

function mergeMarkdownAgenticOsSemanticGraph(args: {
  name: string
  text: string
  graphData: GraphData
  warnings: string[]
}): { graphData: GraphData; warnings: string[] } {
  const agenticOsSemantic = parseAgenticOsSemanticGraphFromMarkdown({
    name: args.name,
    text: args.text,
  })
  if (!agenticOsSemantic) return { graphData: args.graphData, warnings: args.warnings }
  return {
    graphData: mergeAgenticOsSemanticGraphIntoGraphData({
      base: args.graphData,
      semantic: agenticOsSemantic.graphData,
    }),
    warnings: Array.from(new Set([...(args.warnings || []), ...(agenticOsSemantic.warnings || [])].filter(Boolean))).sort((a, b) => a.localeCompare(b)),
  }
}

export { buildMarkdownJsonLd } from './markdownJsonLd'

export const hasMarkdownStructure = (raw: string): boolean =>
  /^\s*#{1,6}\s+/m.test(raw) ||
  /^\s*```/m.test(raw) ||
  /^\s*[-*+]\s+/m.test(raw) ||
  /^\s*>\s+/m.test(raw) ||
  /!\[[^\]]*]\([^)]+\)/.test(raw) ||
  /\[[^\]]+]\([^)]+\)/.test(raw) ||
  /^\s*\|.*\|\s*$/m.test(raw) ||
  /^\s*---\s*$/m.test(raw) ||
  /```mermaid/i.test(raw)

export const isLikelyPlainTextMarkdown = (text: string): boolean => {
  const raw = String(text || '').trim()
  if (!raw) return false
  if (raw.length > 20_000) return false
  const lines = raw.split('\n')
  const nonEmpty = lines.filter(l => l.trim().length > 0)
  if (nonEmpty.length > 12) return false
  if (hasMarkdownStructure(raw)) return false
  const alphaCount = raw.slice(0, 1024).replace(/[^a-zA-Z]/g, '').length
  return alphaCount >= 40
}

export const shouldPreferMarkdownParserInput = (name: string, text: string): boolean => {
  const lower = String(name || '').toLowerCase()
  const raw = String(text || '')
  if (!raw.trim()) return false
  if (isCorpusSourceUnitMarkdown(raw)) return false
  if (isStrybldrStoryboardMarkdown(raw)) return false
  if (containsFrontmatterMermaid(raw)) return true
  if (isMarkdownLikeFileName(lower)) {
    return !isLikelyPlainTextMarkdown(raw)
  }
  if (/^https?:\/\//i.test(lower)) {
    return hasMarkdownStructure(raw)
  }
  if (/^\s*---\s*$/m.test(raw) && /\bkgCanvas(?:SurfaceMode|RenderMode|2dRenderer|3dMode)\b/.test(raw)) {
    return true
  }
  if (/^\s*\|.*\|\s*$/m.test(raw) && /(?:\blat\b|\blng\b|\blatitude\b|\blongitude\b|FeatureCollection|```geojson|```json)/i.test(raw)) {
    return true
  }
  return hasMarkdownStructure(raw)
}

const markdownSpec: ParserSpec = {
  id: toParserId('markdown'),
  name: 'Markdown',
  match: (name, text) => {
    const lower = (name || '').toLowerCase()
    if (isStrybldrStoryboardMarkdown(text)) return false
    if (/^https?:\/\//i.test(lower)) {
      const isMdByName = isMarkdownLikeFileName(lower)
      if (isMdByName) return !isLikelyPlainTextMarkdown(text) || containsFrontmatterMermaid(text)
      return hasMarkdownStructure(String(text || ''))
    }
    if (isMarkdownLikeFileName(lower)) {
      if (isLikelyPlainTextMarkdown(text) && !containsFrontmatterMermaid(text)) return false
      return true
    }
    return false
  },
  parse: (name, text) => {
    const raw = String(text || '')
    const frontmatterWarnings = parseMarkdownFrontmatter(splitMarkdownLines(raw)).warnings || []
    const largeProfile = readMarkdownLargeDocumentProfile(raw)
    const summaryOnlyLargeGraph = largeProfile.reason && shouldUseSummaryGraphForMarkdown(raw)
      ? buildMarkdownLargeDocumentGraph({ name, rawText: raw, profile: largeProfile })
      : null
    if (summaryOnlyLargeGraph) {
      return mergeMarkdownAgenticOsSemanticGraph({
        name,
        text,
        graphData: summaryOnlyLargeGraph.graphData,
        warnings: summaryOnlyLargeGraph.warnings,
      })
    }
    const frontmatterFlow = tryParseMarkdownFrontmatterFlowGraph(name, raw)
    const panelFlow = frontmatterFlow ? null : tryParseMarkdownPanelFlowGraph(name, raw)
    if (frontmatterFlow) {
      const flowResult = enrichFrontmatterFlowWithMarkdownReferences({ name, text, frontmatterFlow })
      return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData: flowResult.graphData, warnings: flowResult.warnings })
    }
    if (largeProfile.reason && !panelFlow) return buildMarkdownLargeDocumentGraph({ name, rawText: raw, profile: largeProfile })
    if (largeProfile.reason && panelFlow) {
      return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData: panelFlow.graphData, warnings: panelFlow.warnings })
    }
    const t0 = Date.now()
    const jsonld = buildMarkdownJsonLd(name, text)
    const t1 = Date.now()
    const baseGraph = parseJsonLd(jsonld)
    const t2 = Date.now()
    const baseMeta =
      baseGraph.metadata && typeof baseGraph.metadata === 'object' && !Array.isArray(baseGraph.metadata)
        ? baseGraph.metadata
        : ({} as Record<string, JSONValue>)
    const ingestionMetrics: Record<string, JSONValue> = {
      kind: 'markdown',
      buildMarkdownJsonLdMs: t1 - t0,
      parseJsonLdMs: t2 - t1,
      totalMs: t2 - t0,
    }
    const nextMeta: Record<string, JSONValue> = {
      ...baseMeta,
      ingestionMetrics,
    }
    let graphData: GraphData = { ...baseGraph, metadata: nextMeta }
    const extra = panelFlow?.graphData || null
    const extraWarnings = panelFlow?.warnings || []
    if (extra) {
      graphData = mergeGraphDataPreferOverlay({ base: graphData, overlay: extra })
    }
    const warnings = Array.from(new Set([...(frontmatterWarnings || []), ...(extraWarnings || [])].filter(Boolean))).sort((a, b) => a.localeCompare(b))
    return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData, warnings })
  },
  parseAsync: async (name, text) => {
    const raw = String(text || '')
    const frontmatterWarnings = parseMarkdownFrontmatter(splitMarkdownLines(raw)).warnings || []
    const largeProfile = readMarkdownLargeDocumentProfile(raw)
    const summaryOnlyLargeGraph = largeProfile.reason && shouldUseSummaryGraphForMarkdown(raw)
      ? buildMarkdownLargeDocumentGraph({ name, rawText: raw, profile: largeProfile })
      : null
    if (summaryOnlyLargeGraph) {
      return mergeMarkdownAgenticOsSemanticGraph({
        name,
        text,
        graphData: summaryOnlyLargeGraph.graphData,
        warnings: summaryOnlyLargeGraph.warnings,
      })
    }
    const frontmatterFlow = tryParseMarkdownFrontmatterFlowGraph(name, raw)
    const panelFlow = frontmatterFlow ? null : tryParseMarkdownPanelFlowGraph(name, raw)
    if (frontmatterFlow) {
      const flowResult = enrichFrontmatterFlowWithMarkdownReferences({ name, text, frontmatterFlow })
      return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData: flowResult.graphData, warnings: flowResult.warnings })
    }
    if (largeProfile.reason && !panelFlow) return buildMarkdownLargeDocumentGraph({ name, rawText: raw, profile: largeProfile })
    if (largeProfile.reason && panelFlow) {
      return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData: panelFlow.graphData, warnings: panelFlow.warnings })
    }

    const t0 = Date.now()
    const jsonld = buildMarkdownJsonLd(name, text)
    const t1 = Date.now()
    const baseGraph = parseJsonLd(jsonld)
    const t2 = Date.now()

    const baseMeta =
      baseGraph.metadata && typeof baseGraph.metadata === 'object' && !Array.isArray(baseGraph.metadata)
        ? baseGraph.metadata
        : ({} as Record<string, JSONValue>)
    const ingestionMetrics: Record<string, JSONValue> = {
      kind: 'markdown',
      buildMarkdownJsonLdMs: t1 - t0,
      parseJsonLdMs: t2 - t1,
      totalMs: t2 - t0,
    }
    const nextMeta: Record<string, JSONValue> = {
      ...baseMeta,
      ingestionMetrics,
    }

    let graphData: GraphData = { ...baseGraph, metadata: nextMeta }
    const extra = panelFlow?.graphData || null
    const extraWarnings = panelFlow?.warnings || []
    if (extra) {
      graphData = mergeGraphDataPreferOverlay({ base: graphData, overlay: extra })
    }
    if (containsFrontmatterMermaid(raw)) {
      try {
        const { applyMermaidFrontmatterGeometryToGraphData } = await loadMermaidFrontmatterGeometryModule()
        graphData = await applyMermaidFrontmatterGeometryToGraphData(graphData)
      } catch {
        void 0
      }
    }

    const warnings = Array.from(new Set([...(frontmatterWarnings || []), ...(extraWarnings || [])].filter(Boolean))).sort((a, b) => a.localeCompare(b))
    return mergeMarkdownAgenticOsSemanticGraph({ name, text, graphData, warnings })
  },
}

const autoGraphSpec: ParserSpec = {
  id: toParserId('auto'),
  name: 'Auto (CSV/JSON/JSON‑LD)',
  match: () => true,
  parseAsync: async (name, text) => {
    const workerData = await parseGraphInWorker(name, text)
    if (workerData) return { graphData: workerData, warnings: [] }
    const parsed = parseGraph(name, text)
    return { graphData: parsed.data, warnings: parsed.diag.warnings || [] }
  },
  parse: (name, text) => {
    const parsed = parseGraph(name, text)
    return { graphData: parsed.data, warnings: parsed.diag.warnings || [] }
  },
}

const jsonSpec: ParserSpec = {
  id: toParserId('json'),
  name: 'JSON',
  match: (name) => {
    const lower = (name || '').toLowerCase()
    if (/^https?:\/\//i.test(lower)) return lower.endsWith('.json') || lower.endsWith('.geojson')
    return lower.endsWith('.json') || lower.endsWith('.geojson')
  },
  parseAsync: (name, text) => autoGraphSpec.parseAsync!(name, text),
  parse: (name, text) => autoGraphSpec.parse(name, text),
}

const csvSpec: ParserSpec = {
  id: toParserId('csv'),
  name: 'CSV',
  match: (name) => {
    const lower = (name || '').toLowerCase()
    if (/^https?:\/\//i.test(lower)) return lower.endsWith('.csv')
    return lower.endsWith('.csv')
  },
  parseAsync: (name, text) => autoGraphSpec.parseAsync!(name, text),
  parse: (name, text) => autoGraphSpec.parse(name, text),
}

const jsonLdSpec: ParserSpec = {
  id: toParserId('jsonld'),
  name: 'JSON‑LD',
  match: (name) => {
    const lower = (name || '').toLowerCase()
    if (/^https?:\/\//i.test(lower)) return lower.endsWith('.jsonld')
    return lower.endsWith('.jsonld')
  },
  parseAsync: (name, text) => autoGraphSpec.parseAsync!(name, text),
  parse: (name, text) => autoGraphSpec.parse(name, text),
}

const graphragTextSpec: ParserSpec = {
  id: toParserId('graphrag-text'),
  name: 'GraphRAG Text (Heuristic)',
  match: (name, text) => {
    const lower = String(name || '').toLowerCase()
    if (lower.endsWith('.txt')) return true
    if (lower.endsWith('.text')) return true
    if (/^https?:\/\//i.test(lower)) return false
    const raw = String(text || '').trim()
    if (!raw) return false
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return isLikelyPlainTextMarkdown(raw)
    }
    if (lower.endsWith('.json') || lower.endsWith('.jsonld') || lower.endsWith('.csv')) return false
    if (raw.startsWith('{') || raw.startsWith('[')) return false
    const alphaCount = raw.slice(0, 512).replace(/[^a-zA-Z]/g, '').length
    return alphaCount >= 40
  },
  parse: (name, text) => {
    void name
    const centrality = lsJson(
      LS_KEYS.graphragTextCentralityConfig,
      DEFAULT_GRAPHRAG_TEXT_CENTRALITY_CONFIG,
      parseGraphRagTextCentralityConfig,
    )
    const res = runGraphRagTextPipeline(text, { centrality })
    return { graphData: res.graphData, warnings: res.warnings }
  },
}

const withParserTopologyResult = (result: { graphData: GraphData; warnings: string[] }): { graphData: GraphData; warnings: string[] } => {
  const graphData = withGraphTopologyMetadata({
    graphData: result.graphData,
    stage: 'parser',
    annotate: true,
  }) || result.graphData
  return graphData === result.graphData ? result : { ...result, graphData }
}

const withParserTopology = (spec: ParserSpec): ParserSpec => ({
  ...spec,
  parse: (name, text) => withParserTopologyResult(spec.parse(name, text)),
  parseAsync: spec.parseAsync
    ? async (name, text) => withParserTopologyResult(await spec.parseAsync!(name, text))
    : undefined,
})

const rawBuiltInParsers: ParserSpec[] = [
  ...strybldrParsers,
  ...queryableCorpusParsers,
  markdownSpec,
  graphragTextSpec,
  pythonSpec,
  jsonSpec,
  csvSpec,
  jsonLdSpec,
  autoGraphSpec,
]

export const builtInParsers: ParserSpec[] = rawBuiltInParsers.map(withParserTopology)
