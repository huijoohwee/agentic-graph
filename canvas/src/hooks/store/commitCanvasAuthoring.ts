import type { GraphData } from '@/lib/graph/types'
import type { GraphState } from './types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { hashText } from '@/features/parsers/hash'
import { buildUpdatedSourceFileParsedGraphState } from '@/features/source-files/sourceFileParsedState'
import { withGraphDataRevision } from './graphDataSliceUtils'
import { writeActiveMarkdownDocumentTextIfPresent } from './graph-data-slice/graphDataFrontmatterFlowSync'
import { persistGraphDataToLocalStorage } from './graphDataPersistence'
import { cancelScheduledHistoryCommit, readActiveSourceFileSnapshot, snapshotHistory } from './historySlice'

export function commitCanvasAuthoring(
  turn: NonNullable<GraphState['canvasAuthoringTurn']>,
  text: string,
  graph: GraphData,
  label: string,
) {
  const { getState, setState } = useGraphStore
  const state = getState()
  if (
    state.canvasAuthoringTurn !== turn ||
    state.markdownDocumentName !== turn.documentKey ||
    hashText(state.markdownDocumentText ?? '') !== turn.sourceDigest
  ) return false

  const originalGraph = state.graphData ?? { type: 'Graph', nodes: [], edges: [] }
  const before = snapshotHistory(state, originalGraph, 'Before canvas edit')
  const revision = state.graphDataRevision + 1
  const graphData = withGraphDataRevision(graph, revision)
  const activeSource = readActiveSourceFileSnapshot(state.sourceFiles, turn.documentKey)
  const sourceFiles = state.sourceFiles.map(file => file !== activeSource ? file : {
    ...file,
    ...buildUpdatedSourceFileParsedGraphState({ previousParsedState: file, graphData }),
    text,
    parsedTextHash: hashText(text),
  })
  const change = {
    graphData,
    graphDataRevision: revision,
    graphContentRevision: state.graphContentRevision + 1,
    sourceFiles,
    markdownDocumentText: text,
    markdownDocumentApplyRevision: state.markdownDocumentApplyRevision + 1,
    docLocationRevision: state.docLocationRevision + 1,
    markdownTokens: null,
    markdownTokensKey: null,
    markdownTokensPath: null,
    markdownTokensMeta: null,
    markdownTokensStartLineOffset: null,
    graphValidationStatus: null,
    graphValidationTimestamp: null,
  }
  const nextState = { ...state, ...change, history: before, historyIndex: before.length - 1 }
  const history = snapshotHistory(nextState, graphData, label)
  cancelScheduledHistoryCommit()
  setState({ ...change, canvasAuthoringTurn: null, history, historyIndex: history.length - 1 })
  persistGraphDataToLocalStorage(graphData)
  if (turn.documentKey) {
    void writeActiveMarkdownDocumentTextIfPresent({ state: nextState, sourceFiles, text, label }).then(saved => {
      const current = getState()
      if (!saved && current.markdownDocumentText === text && current.markdownDocumentName === turn.documentKey) {
        current.pushUiToast({
          id: 'canvas-authoring-save',
          kind: 'warning',
          message: 'Diagram is editable in this session. Save a local copy to keep the changes.',
        })
      }
    })
  }
  return history[history.length - 1]!
}
