import type { GraphData, JSONValue } from '@/lib/graph/types'
import { isStrybldrStoryboardMarkdown } from '@/features/strybldr/strybldrStoryboard'

export function withMarkdownDocumentSourceMetadata(
  graphData: GraphData,
  name: string,
  canvasWorkspacePreset: Record<string, JSONValue> | null,
): GraphData {
  const source = `markdown:${String(name || '').trim()}`
  if (!source || source === 'markdown:') return graphData
  const metadata = graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, JSONValue>)
    : {}
  if (metadata.source === source && !canvasWorkspacePreset) return graphData
  return {
    ...graphData,
    metadata: {
      ...metadata,
      source,
      markdownDocumentName: String(name || '').trim(),
      ...(canvasWorkspacePreset ? { canvasWorkspacePreset } : {}),
    } as unknown as GraphData['metadata'],
  }
}

export function canReuseParsedMarkdownSourceGraph(args: {
  text: string
  graphData: GraphData | null | undefined
}): boolean {
  const graphData = args.graphData || null
  if (!graphData) return false
  if (!isStrybldrStoryboardMarkdown(args.text)) return true
  const metadata = graphData.metadata && typeof graphData.metadata === 'object' && !Array.isArray(graphData.metadata)
    ? (graphData.metadata as Record<string, unknown>)
    : null
  const parserId = String(metadata?.parserId || '').trim()
  const kind = String(metadata?.kind || graphData.context || '').trim()
  if (parserId !== 'strybldr-storyboard' && kind !== 'strybldr-storyboard') return false
  return Array.isArray(graphData.nodes) && graphData.nodes.length > 0
}
