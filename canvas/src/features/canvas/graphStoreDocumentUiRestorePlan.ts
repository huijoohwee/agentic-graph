import { isDataViewCanvas2dRenderer } from '@/lib/config.render'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import type { GraphData } from '@/lib/graph/types'
import type { PerDocumentUiState } from '@/lib/persistence/perDocumentUiState'

export type SavedDocumentUiModeState = {
  documentSemanticMode: PerDocumentUiState['documentSemanticMode']
  frontmatterModeEnabled: PerDocumentUiState['frontmatterModeEnabled']
  multiDimTableModeEnabled: PerDocumentUiState['multiDimTableModeEnabled']
  canvasRenderMode: PerDocumentUiState['canvasRenderMode']
  canvas3dMode: PerDocumentUiState['canvas3dMode']
  canvas2dRenderer: PerDocumentUiState['canvas2dRenderer']
}

export type SavedDocumentUiPresentationPlan = {
  shouldPreferFrontmatterFlowLanding: boolean
  modeState: SavedDocumentUiModeState
}

export function buildSavedDocumentUiModeState(saved: PerDocumentUiState): SavedDocumentUiModeState {
  return {
    documentSemanticMode: saved.documentSemanticMode,
    frontmatterModeEnabled: saved.frontmatterModeEnabled,
    multiDimTableModeEnabled: saved.multiDimTableModeEnabled,
    canvasRenderMode: saved.canvasRenderMode,
    canvas3dMode: saved.canvas3dMode,
    canvas2dRenderer: saved.canvas2dRenderer,
  }
}

export function buildSavedDocumentUiPresentationPlan(args: {
  graphData: GraphData | null | undefined
  saved: PerDocumentUiState
}): SavedDocumentUiPresentationPlan {
  return {
    shouldPreferFrontmatterFlowLanding: isFrontmatterFlowGraph(args.graphData) && !((args.saved.canvasRenderMode ?? '2d') === '2d' && isDataViewCanvas2dRenderer(args.saved.canvas2dRenderer)),
    modeState: buildSavedDocumentUiModeState(args.saved),
  }
}
