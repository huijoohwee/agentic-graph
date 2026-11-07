import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import { isWorkspaceCameraInitializationBlocked, type WorkspaceGraphMutationState } from './workspaceTableSsot'

type EditorSource = { path: string; text: string; settled: boolean }
let readEditorSource: (() => EditorSource | null) | null = null

/** The mounted editor owns draft readiness; panel edits never clear its mutation fence. */
export function registerWorkspaceSceneMetadataEditor(reader: () => EditorSource | null): () => void {
  readEditorSource = reader
  return () => { if (readEditorSource === reader) readEditorSource = null }
}

export function canAuthorWorkspaceSceneMetadata(
  state: WorkspaceGraphMutationState & { markdownDocumentName: string | null; markdownDocumentText: string | null },
  updates: Record<string, unknown>,
): boolean {
  if (state.workspaceViewMode !== 'editor' || isWorkspaceCameraInitializationBlocked(state)) return false
  const keys = Object.keys(updates)
  if (!keys.length || keys.some(key => key !== 'kgXrMotionReference' && key !== 'kgXrPhysicsWorld' && key !== 'kgSpatialWorkspaceReview')) return false
  const source = readEditorSource?.()
  return Boolean(source?.settled && state.markdownDocumentName && state.markdownDocumentText
    && normalizeWorkspacePath(source.path) === normalizeWorkspacePath(state.markdownDocumentName)
    && source.text === state.markdownDocumentText)
}
