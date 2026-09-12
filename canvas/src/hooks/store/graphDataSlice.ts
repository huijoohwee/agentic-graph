import type { GraphData } from '@/lib/graph/types'
import type { TraversalSummary } from '@/features/panels/utils/orchestratorTraversal'
import type { GetGraph, SetGraph } from './graph-data-slice/graphDataSliceAccess'
import { createGraphDataDocumentActions } from './graph-data-slice/graphDataDocumentActions'
import { createGraphDataCommitActions } from './graph-data-slice/graphDataCommitActions'
import { createGraphDataNodeActions } from './graph-data-slice/graphDataNodeActions'
import { createGraphDataEdgeActions } from './graph-data-slice/graphDataEdgeActions'
import { createGraphDataSubgraphActions } from './graph-data-slice/graphDataSubgraphActions'

export type { GetGraph } from './graph-data-slice/graphDataSliceAccess'

declare module './store-types/graph-state' {
  interface GraphState { launchProposalOverlay: GraphData | null }
}

export const createGraphDataSlice = (set: SetGraph, get: GetGraph) => ({
  graphData: null as GraphData | null,
  launchProposalOverlay: null as GraphData | null,
  graphDataRevision: 0,
  graphContentRevision: 0,
  docLocationRevision: 0,
  markdownDocumentName: null as string | null,
  markdownDocumentText: null as string | null,
  markdownDocumentApplyViewPreset: true as boolean,
  markdownDocumentApplyRevision: 0,
  markdownTokens: null as import('@/features/markdown/ui/markdownPreviewLex').TokenWithLines[] | null,
  markdownTokensPath: null as string | null,
  markdownTokensKey: null as string | null,
  markdownTokensMeta: null as import('@/lib/markdown').MarkdownFrontmatter | null,
  markdownTokensStartLineOffset: null as number | null,
  markdownDocumentSourceUrl: null as string | null,
  jsonSourceDocumentName: null as string | null,
  jsonSourceDocumentText: null as string | null,
  markdownPreviewMermaidFocusCode: null as string | null,
  markdownPreviewMermaidFocusConfig: null as Record<string, unknown> | null,
  markdownPreviewActiveMediaKey: null as string | null,
  graphRagWorkflowJsonText: null as string | null,
  lastTraversalSummary: null as TraversalSummary | null,
  ...createGraphDataDocumentActions(set, get),
  ...createGraphDataCommitActions(set, get),
  ...createGraphDataNodeActions(set, get),
  ...createGraphDataEdgeActions(set, get),
  ...createGraphDataSubgraphActions(set, get),
});
