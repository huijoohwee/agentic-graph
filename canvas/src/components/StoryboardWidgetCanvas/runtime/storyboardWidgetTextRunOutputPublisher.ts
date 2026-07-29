import type { GraphData, GraphNode } from '@/lib/graph/types'

export type StoryboardWidgetTextRunOutputPublisher = (args: {
  anchorNode: GraphNode
  baseGraphData?: GraphData | null
  outputText: string
  title: string
  model?: unknown
  sourceUrl?: string
  outputPath?: string | null
  srcDoc?: string | null
  loading?: boolean
  loadingLabel?: string
  versionId?: string
  versionCreatedAt?: string
  outputKey?: string
  outputGroupId?: string
  outputThreadRootId?: string
  panelLabel?: string
  panelProperties?: Record<string, unknown>
  outputIndex?: number
  allowCreateStandaloneOutput?: boolean
  connectCreatedOutputToAnchor?: boolean
  ownedOutputOnly?: boolean
  suppressOwnedOutputFallback?: boolean
  deferPublishedGraphCommit?: boolean
}) => GraphData | null
