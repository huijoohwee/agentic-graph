import { inspectSharedDocumentStructure } from './sharedDocumentStructureInspection.mjs'
import type { LocalEditorWorkspaceSurfaceSnapshot } from './browserLocalSurfaceSnapshots'

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeMarkdown = (value: unknown): string => String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const buildPreview = (text: string, maxLength = 800): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}\n...(truncated)`

export const inspectLocalEditorWorkspaceState = (
  snapshot: (LocalEditorWorkspaceSurfaceSnapshot & { updatedAtMs?: number }) | null,
) => {
  if (!snapshot) {
    return {
      available: false,
      sourceKind: 'browser-local-editor-workspace',
      message: 'Editor Workspace is not currently mounted in the local agentic-graph browser runtime.',
    }
  }
  const liveMarkdownText = normalizeMarkdown(snapshot.liveMarkdownText)
  const persistedMarkdownText = normalizeMarkdown(snapshot.persistedMarkdownText)
  const canonicalPath = normalizeString(snapshot.activeDocumentKey) || 'workspace:/document.md'
  const liveStructure = liveMarkdownText
    ? inspectSharedDocumentStructure({
        canonicalPath,
        markdown: liveMarkdownText,
      })
    : null
  return {
    available: true,
    sourceKind: 'browser-local-editor-workspace',
    activeDocumentKey: canonicalPath,
    workspaceViewMode: snapshot.workspaceViewMode,
    workspaceCanvasPaneOpen: snapshot.workspaceCanvasPaneOpen,
    workspaceEditorOverlayOpen: snapshot.workspaceEditorOverlayOpen,
    layoutMode: snapshot.layoutMode,
    viewerKind: snapshot.viewerKind,
    viewerMode: snapshot.viewerMode,
    isMarkdown: snapshot.isMarkdown,
    isJsonMarkdownEditing: snapshot.isJsonMarkdownEditing,
    paneVisibility: snapshot.paneVisibility,
    splitPaneVisibility: snapshot.splitPaneVisibility,
    draftState: {
      hasUncommittedDraft: snapshot.hasUncommittedDraft,
      liveDraftSource: snapshot.liveDraftSource,
      liveMarkdownLength: liveMarkdownText.length,
      persistedMarkdownLength: persistedMarkdownText.length,
      lineCount: liveStructure?.lineCount ?? 0,
      preview: buildPreview(liveMarkdownText),
    },
    liveStructure,
    updatedAtMs: snapshot.updatedAtMs || null,
  }
}
