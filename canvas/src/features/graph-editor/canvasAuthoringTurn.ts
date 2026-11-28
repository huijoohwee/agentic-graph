import { useGraphStore } from '@/hooks/useGraphStore'
import type { GraphState } from '@/hooks/store/types'
import type { GraphData } from '@/lib/graph/types'
import { normalizeComposedSourcePath, readComposedSourceFilePath } from '@/features/source-files/composedSourceSelection'
import { commitCanvasAuthoring } from '@/hooks/store/commitCanvasAuthoring'
import { hashText } from '@/features/parsers/hash'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { readLocalEditorWorkspaceSurfaceSnapshot } from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { isWorkspaceCameraInitializationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { isWorkspaceAuthoringSourceSettled } from '@/features/workspace-table/workspaceSceneMetadataAuthoring'

export type StagedCanvasEdit = { text: string; graph: GraphData }
const conflict = 'The document or editor draft changed. Review the source and try again.'

function assertWritable(state: GraphState) {
  if (isWorkspaceCameraInitializationBlocked(state)) throw new Error('The canvas is read-only while its source is settling.')
  if (state.markdownDocumentName && !/\.(?:md|markdown)$/i.test(state.markdownDocumentName)) throw new Error('Open a Markdown document to author this canvas.')
  const key = normalizeComposedSourcePath(state.markdownDocumentName)
  const files = key ? state.sourceFiles.filter(file => readComposedSourceFilePath(file) === key) : []
  if (files.length > 1 || (files[0] && files[0].text !== state.markdownDocumentText)) throw new Error(conflict)
  if (readLocalEditorWorkspaceSurfaceSnapshot()?.hasUncommittedDraft ||
      (state.workspaceViewMode === 'editor' && !!state.markdownDocumentName && !isWorkspaceAuthoringSourceSettled(state))) throw new Error(conflict)
}

export async function runCanvasAuthoringTurn(
  initial: GraphState, controller: AbortController, label: string,
  stage: (initial: GraphState, signal: AbortSignal) => Promise<StagedCanvasEdit>,
) {
  const turn = { documentKey: initial.markdownDocumentName, sourceDigest: hashText(initial.markdownDocumentText ?? '') }
  const current = () => {
    const state = useGraphStore.getState()
    return state.markdownDocumentName === turn.documentKey && state.markdownDocumentText === initial.markdownDocumentText
      && state.graphDataRevision === initial.graphDataRevision && state.markdownDocumentApplyRevision === initial.markdownDocumentApplyRevision
      && state.sourceFiles === initial.sourceFiles
  }
  if (!current()) throw new Error(conflict)
  if (controller.signal.aborted) throw new Error('Canvas edit cancelled.')
  if (useGraphStore.getState().canvasAuthoringTurn) throw new Error('A canvas edit is already running.')
  assertWritable(initial)
  const path = useMarkdownExplorerStore.getState().activePath
  const stop = () => controller.abort(new Error(conflict))
  const unsubscribeSource = useGraphStore.subscribe(state => {
    if (state.canvasAuthoringTurn === turn && !current()) stop()
  })
  const unsubscribePath = useMarkdownExplorerStore.subscribe(state => { if (state.activePath !== path) stop() })
  const release = () => {
    if (useGraphStore.getState().canvasAuthoringTurn === turn) useGraphStore.setState({ canvasAuthoringTurn: null })
  }
  let rejectAbort: () => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => { release(); reject(controller.signal.reason ?? new Error('Canvas edit cancelled.')) }
  })
  controller.signal.addEventListener('abort', rejectAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error('Canvas edit timed out.')), 30000)
  try {
    useGraphStore.setState({ canvasAuthoringTurn: turn })
    const staged = await Promise.race([stage(initial, controller.signal), aborted])
    if (!current() || controller.signal.aborted) throw new Error(conflict)
    assertWritable(useGraphStore.getState())
    if (!commitCanvasAuthoring(turn, staged.text, staged.graph, label)) throw new Error(conflict)
    return staged
  } finally {
    clearTimeout(timeout)
    controller.signal.removeEventListener('abort', rejectAbort)
    unsubscribePath()
    unsubscribeSource()
    release()
  }
}
