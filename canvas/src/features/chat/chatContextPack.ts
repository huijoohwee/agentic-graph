import type { GraphData, GraphEdge, GraphNode, JSONValue } from '@/lib/graph/types'
import { parseMarkdownFrontmatter, splitMarkdownLines } from '@/lib/markdown'
import {
  CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  buildGuidelineDigest,
  clampChatContextMaxTokens,
  clipByTokenApprox,
} from '@/features/chat/chatAiMarkdownSpec'

export type ChatPackedContext = {
  selected_node: {
    id: string
    label: string
    type: string
    properties: Record<string, JSONValue>
    metadata: Record<string, JSONValue>
  } | null
  connected_edges: Array<{
    id: string
    source: string
    target: string
    label: string
    properties: Record<string, JSONValue>
  }>
  frontmatter: Record<string, JSONValue> | null
  graph_summary: string
  guideline_digest: string
}

const isRecord = (v: unknown): v is Record<string, unknown> => {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const clipText = (raw: unknown, maxChars: number): string => {
  const text = typeof raw === 'string' ? raw : ''
  const cleaned = text.replace(/\r\n/g, '\n')
  if (!cleaned.trim()) return ''
  if (cleaned.length <= maxChars) return cleaned
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`
}

const CHAT_CONTEXT_JSON_MAX_DEPTH = 8
const CHAT_CONTEXT_JSON_MAX_VALUES = 512
const CHAT_CONTEXT_JSON_TRUNCATED = '[context truncated]'

const clipJsonValue = (raw: unknown, maxChars: number): JSONValue => {
  let remaining = CHAT_CONTEXT_JSON_MAX_VALUES
  const ancestors = new WeakSet<object>()
  const visit = (value: unknown, chars: number, depth: number): JSONValue => {
    if (remaining <= 0) return CHAT_CONTEXT_JSON_TRUNCATED
    remaining -= 1
    if (value == null) return null
    if (typeof value === 'string') return clipText(value, chars)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (typeof value !== 'object') return clipText(String(value), chars)
    if (depth >= CHAT_CONTEXT_JSON_MAX_DEPTH || ancestors.has(value)) return CHAT_CONTEXT_JSON_TRUNCATED
    ancestors.add(value)
    try {
      if (Array.isArray(value)) {
        const out: JSONValue[] = []
        for (const item of value.slice(0, 12)) {
          if (remaining <= 0) { out.push(CHAT_CONTEXT_JSON_TRUNCATED); break }
          out.push(visit(item, Math.max(24, Math.floor(chars / 3)), depth + 1))
        }
        return out
      }
      const out: Record<string, JSONValue> = {}
      for (const key of Object.keys(value).slice(0, 24)) {
        if (remaining <= 0) { out[key] = CHAT_CONTEXT_JSON_TRUNCATED; break }
        out[key] = visit((value as Record<string, unknown>)[key], Math.max(24, Math.floor(chars / 2)), depth + 1)
      }
      return out
    } finally {
      ancestors.delete(value)
    }
  }
  return visit(raw, maxChars, 0)
}

const extractFrontmatterJson = (markdownText: string | null): Record<string, JSONValue> | null => {
  const text = typeof markdownText === 'string' ? markdownText : ''
  if (!text.trim()) return null
  const parsed = parseMarkdownFrontmatter(splitMarkdownLines(text))
  const fm = parsed?.meta
  if (!fm || !isRecord(fm)) return null
  return clipJsonValue(fm, 2800) as Record<string, JSONValue>
}

const buildGraphSummary = (
  graphData: GraphData | null,
  currentNode: GraphNode | null,
  maxTokens: number,
): string => {
  const nodes = Array.isArray(graphData?.nodes) ? graphData!.nodes : []
  const edges = Array.isArray(graphData?.edges) ? graphData!.edges : []
  const focus = currentNode?.id ? String(currentNode.id) : ''
  const incident = focus
    ? edges.filter(e => e.source === focus || e.target === focus)
    : []
  const labels = nodes
    .slice(0, 10)
    .map(n => String(n.label || n.id || '').trim())
    .filter(Boolean)

  const parts = [
    `nodes=${nodes.length}`, 
    `edges=${edges.length}`,
    focus ? `selected=${focus}` : '',
    focus ? `connected_edges=${incident.length}` : '',
    labels.length ? `sample_nodes=${labels.join(' | ')}` : '',
  ].filter(Boolean)
  return clipByTokenApprox(parts.join(' · '), maxTokens)
}

export const packChatContext = (args: {
  graphData: GraphData | null
  currentNode: GraphNode | null
  markdownText: string | null
  graphSummaryMaxTokens?: number
  guidelineDigestMaxTokens?: number
}): ChatPackedContext => {
  const graphSummaryMaxTokens = clampChatContextMaxTokens(
    args.graphSummaryMaxTokens,
    CHAT_AI_MARKDOWN_GRAPH_SUMMARY_MAX_TOKENS_DEFAULT,
  )
  const guidelineDigestMaxTokens = clampChatContextMaxTokens(
    args.guidelineDigestMaxTokens,
    CHAT_AI_MARKDOWN_GUIDELINE_DIGEST_MAX_TOKENS_DEFAULT,
  )
  const selected = args.currentNode
  const selectedNode = selected
    ? {
      id: String(selected.id || ''),
      label: String(selected.label || ''),
      type: String(selected.type || ''),
      properties: (clipJsonValue(selected.properties || {}, 2200) as Record<string, JSONValue>) || {},
      metadata: (clipJsonValue(selected.metadata || {}, 1400) as Record<string, JSONValue>) || {},
    }
    : null
  const edgesAll = Array.isArray(args.graphData?.edges) ? args.graphData!.edges : []
  const focusId = selectedNode?.id || ''
  const connectedEdges: GraphEdge[] = focusId
    ? edgesAll.filter(e => e.source === focusId || e.target === focusId).slice(0, 50)
    : []

  return {
    selected_node: selectedNode && selectedNode.id ? selectedNode : null,
    connected_edges: connectedEdges.map(e => ({
      id: String(e.id || ''),
      source: String(e.source || ''),
      target: String(e.target || ''),
      label: String(e.label || ''),
      properties: (clipJsonValue(e.properties || {}, 1000) as Record<string, JSONValue>) || {},
    })),
    frontmatter: extractFrontmatterJson(args.markdownText),
    graph_summary: buildGraphSummary(args.graphData, args.currentNode, graphSummaryMaxTokens),
    guideline_digest: buildGuidelineDigest(guidelineDigestMaxTokens),
  }
}

export const buildPackedContextSystemPrompt = (ctx: ChatPackedContext): string => {
  const payload = {
    selected_node: ctx.selected_node,
    connected_edges: ctx.connected_edges,
    frontmatter: ctx.frontmatter,
    graph_summary: ctx.graph_summary,
  }
  return [
    'packContext(): Use the provided <guidelines> and <context> only. Do not invent missing graph structure.',
    '',
    `<guidelines>\n${ctx.guideline_digest}\n</guidelines>`,
    '',
    '<context>',
    '```json',
    JSON.stringify(payload, null, 2),
    '```',
    '</context>',
  ].join('\n')
}
