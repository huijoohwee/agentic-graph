import type { GraphData, JSONValue } from '@/lib/graph/types'
import { hashText } from '@/features/parsers/hash'
import { slugify } from './markdownJsonLd'

const MARKDOWN_FULL_GRAPH_MAX_CHARS = 500_000
const MARKDOWN_FULL_GRAPH_MAX_LINES = 8_000
const MARKDOWN_FULL_GRAPH_MAX_NODES = 500
const MARKDOWN_FULL_GRAPH_MAX_EDGES = 1_000
const MARKDOWN_SUMMARY_PREVIEW_CHARS = 32_000
const FLOW_SCAN_PREFIX_CHARS = 64_000

type MarkdownLargeDocumentProfile = {
  lineCount: number
  originalLength: number
  reason: 'chars' | 'lines' | 'structure' | null
}

function countLines(text: string): number {
  if (!text) return 0
  let lines = 1
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lines += 1
  }
  return lines
}

function readLeadingFrontmatter(text: string): string {
  const raw = String(text || '').replace(/^\uFEFF/, '')
  if (!raw.trimStart().startsWith('---')) return ''
  const offset = raw.search(/\S/)
  if (offset < 0) return ''
  const prefix = raw.slice(offset, Math.min(raw.length, offset + FLOW_SCAN_PREFIX_CHARS))
  const close = prefix.indexOf('\n---', 3)
  if (close < 0) return ''
  return prefix.slice(0, close + 4)
}

function mayContainFlowGraphDeclaration(text: string): boolean {
  const prefix = String(text || '').slice(0, FLOW_SCAN_PREFIX_CHARS)
  if (!prefix.trim()) return false
  if (prefix.includes('← Inputs') && prefix.includes('Outputs →') && prefix.includes('**Edges**')) return true
  if (/```(?:mermaid|flow|graph)\b/i.test(prefix)) return true
  if (/^\s*(?:flowchart|graph)\s+(?:TD|LR|RL|TB|BT)\b/im.test(prefix)) return true
  if (/^\s*(?:flow|flow_diagrams|kgCanvasRenderMode|kgVideoAgentImport)\s*:/m.test(prefix)) return true
  const frontmatter = readLeadingFrontmatter(prefix)
  if (!frontmatter) return false
  return /\b(?:flow|flow_diagrams|nodes|connections|frontmatterFlowSettings|runtime|pipeline|mermaid|widget_bundle|graph_meta|index)\s*:/m.test(frontmatter)
}

export function readMarkdownLargeDocumentProfile(rawText: string): MarkdownLargeDocumentProfile {
  const raw = String(rawText || '')
  const lineCount = countLines(raw)
  const originalLength = raw.length
  const reason =
    originalLength > MARKDOWN_FULL_GRAPH_MAX_CHARS
      ? 'chars'
      : lineCount > MARKDOWN_FULL_GRAPH_MAX_LINES
        ? 'lines'
        : null
  return { lineCount, originalLength, reason }
}

export function shouldUseSummaryGraphForMarkdown(rawText: string): boolean {
  const profile = readMarkdownLargeDocumentProfile(rawText)
  if (!profile.reason) return false
  return !mayContainFlowGraphDeclaration(rawText)
}

// Apply only to the automatic document projection, after explicit flow graphs
// have been routed. Compact lists can produce large continuously simulated graphs.
export function exceedsMarkdownDocumentGraphBudget(graph: GraphData): boolean {
  return graph.nodes.length > MARKDOWN_FULL_GRAPH_MAX_NODES || graph.edges.length > MARKDOWN_FULL_GRAPH_MAX_EDGES
}

export function buildMarkdownLargeDocumentGraph(args: {
  name: string
  rawText: string
  profile?: MarkdownLargeDocumentProfile
}): { graphData: GraphData; warnings: string[] } {
  const raw = String(args.rawText || '')
  const profile = args.profile || readMarkdownLargeDocumentProfile(raw)
  const baseName = (args.name || '').replace(/\\/g, '/').split('/').pop() || ''
  const stem = baseName.replace(/\.(md|markdown|mmd)$/i, '') || 'markdown'
  const nodeId = `md:large:${slugify(stem)}`
  const label = stem || baseName || 'Markdown Document'
  const preview = raw.slice(0, MARKDOWN_SUMMARY_PREVIEW_CHARS)
  const sourceLayerHash = `md-large:v2:${hashText(`${args.name}\n${raw}`)}`
  const graphData: GraphData = {
    type: 'Graph',
    context: 'markdown-large',
    nodes: [
      {
        id: nodeId,
        label,
        type: 'Document',
        properties: {
          format: 'text/markdown',
          path: baseName,
          length: raw.length,
          lineCount: profile.lineCount,
          preview,
        },
        metadata: {
          truncated: raw.length > preview.length,
          summaryReason: profile.reason || 'chars',
        },
      },
    ],
    edges: [],
    metadata: {
      kind: 'markdown-large',
      source: baseName || stem,
      sourceLayerHash,
      ingestionMetrics: {
        kind: 'markdown-large',
        originalLength: profile.originalLength,
        lineCount: profile.lineCount,
        previewLength: preview.length,
        truncated: raw.length > preview.length,
        summaryReason: (profile.reason || 'chars') as unknown as JSONValue,
      },
    },
  }
  return {
    graphData,
    warnings: [
      'Very large markdown document ingested as a summary-only graph for performance.',
    ],
  }
}
