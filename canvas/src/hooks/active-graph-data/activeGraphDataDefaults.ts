import type { GraphData } from '@/lib/graph/types'
import type { Canvas2dRendererId } from '@/lib/config'

export const INACTIVE_GRAPH_SLICE = {
  baseGraphDataRaw: null as GraphData | null,
  mode: 'document' as 'document' | 'keyword',
  markdownName: null as string | null,
  markdownText: null as string | null,
  canvasRenderMode: '2d' as '2d' | '3d',
  canvas2dRenderer: 'd3' as Canvas2dRendererId,
  keywordSourceMaxLines: 8000,
  keywordSourceMaxChars: 120_000,
  keywordGraphPreviewDebounceMs: 200,
  keywordGraphFullDebounceMs: 800,
  keywordGraphEdgesPerNode: 6,
  keywordGraphMaxEdgesCap: 2400,
  keywordGraphMentionEdgesPerSourceNode: 6,
  revision: 0,
} as const
