import React from 'react'
import type { WebpageViewMode } from '@/lib/markdown/frontmatter'
import {
  resolveMarkdownWorkspaceInitialPaneVisibility,
  resolveMarkdownWorkspaceDocumentPanePreset,
  type MarkdownWorkspacePaneVisibility,
} from './types'

type UseInitialWorkspacePaneVisibilityArgs = {
  activeDocumentKey?: string
  modelAssetFormat?: 'glb' | 'gltf' | null
  splitPaneVisibility: MarkdownWorkspacePaneVisibility
  webpageUrl?: string | null
  webpageView?: WebpageViewMode | null
  workspaceEditorOverlayOpen: boolean
  workspaceEditorSurfaceActive?: boolean
  setSplitPaneVisibility: React.Dispatch<React.SetStateAction<MarkdownWorkspacePaneVisibility>>
}

export function areMarkdownWorkspacePaneVisibilitiesEqual(
  a: MarkdownWorkspacePaneVisibility,
  b: MarkdownWorkspacePaneVisibility,
): boolean {
  return !!a.python === !!b.python
    && !!a.block === !!b.block
    && a.json === b.json
    && a.markdown === b.markdown
    && a.viewer === b.viewer
    && a.html === b.html
}

const programPaneKey = (documentId: string) => `workspace-program-panes/v1/${encodeURIComponent(documentId)}`
function savedProgramPaneVisibility(documentId: string): MarkdownWorkspacePaneVisibility | null {
  if (!documentId || typeof localStorage === 'undefined') return null
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(programPaneKey(documentId)) || 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const value = parsed as Record<string, unknown>
    if (!['python', 'block', 'json', 'markdown', 'viewer'].every(key => typeof value[key] === 'boolean')) return null
    if (!['python', 'block', 'json', 'markdown', 'viewer'].some(key => value[key] === true)) return null
    return { python: (value.python || value.block) as boolean, block: value.block as boolean, json: value.json as boolean,
      markdown: value.markdown as boolean, viewer: value.viewer as boolean, html: false }
  } catch { return null }
}
function saveProgramPaneVisibility(documentId: string, visibility: MarkdownWorkspacePaneVisibility): void {
  if (!documentId || typeof localStorage === 'undefined') return
  try { localStorage.setItem(programPaneKey(documentId), JSON.stringify({
    python: !!visibility.python, block: !!visibility.block, json: visibility.json,
    markdown: visibility.markdown, viewer: visibility.viewer,
  })) } catch { /* Local preference storage is optional; source editing remains available. */ }
}

export function useInitialWorkspacePaneVisibility(args: UseInitialWorkspacePaneVisibilityArgs) {
  const appliedPresetKeyRef = React.useRef('')
  const previousWebpageViewRef = React.useRef<WebpageViewMode | ''>('')
  const pendingPresetRef = React.useRef<MarkdownWorkspacePaneVisibility | null>(null)
  React.useEffect(() => {
    // Preserve the last applied preset across overlay close/reopen cycles so a
    // user-enabled Viewer pane does not get reset back to markdown-only for the
    // same workspace document.
    const webpageView = args.webpageView || ''
    const documentPanePreset = resolveMarkdownWorkspaceDocumentPanePreset(args.activeDocumentKey || null)
    const requiresDocumentSpecificPreset = !!args.modelAssetFormat || webpageView === 'html' || webpageView === 'json' || !!documentPanePreset
    if (!args.workspaceEditorOverlayOpen && !(args.workspaceEditorSurfaceActive && requiresDocumentSpecificPreset)) return
    const presetKey = [
      args.activeDocumentKey,
      args.modelAssetFormat || '',
      args.webpageUrl || '',
    ].join('\n')
    if (appliedPresetKeyRef.current !== presetKey) {
      appliedPresetKeyRef.current = presetKey
      previousWebpageViewRef.current = webpageView
      const initialVisibility = resolveMarkdownWorkspaceInitialPaneVisibility({
        activeDocumentKey: args.activeDocumentKey,
        modelAssetFormat: args.modelAssetFormat,
        webpageView: args.webpageView || null,
      })
      const nextVisibility = documentPanePreset === 'python'
        ? savedProgramPaneVisibility(args.activeDocumentKey || '') || initialVisibility : initialVisibility
      pendingPresetRef.current = nextVisibility
      if (areMarkdownWorkspacePaneVisibilitiesEqual(args.splitPaneVisibility, nextVisibility)) { pendingPresetRef.current = null; return }
      args.setSplitPaneVisibility(prev => (
        areMarkdownWorkspacePaneVisibilitiesEqual(prev, nextVisibility)
          ? prev
          : nextVisibility
      ))
      return
    }
    if (pendingPresetRef.current) {
      if (areMarkdownWorkspacePaneVisibilitiesEqual(args.splitPaneVisibility, pendingPresetRef.current)) pendingPresetRef.current = null
      return
    }
    if (documentPanePreset === 'python') saveProgramPaneVisibility(args.activeDocumentKey || '', args.splitPaneVisibility)
    if (previousWebpageViewRef.current === webpageView) return
    previousWebpageViewRef.current = webpageView
    if (webpageView !== 'html') {
      if (!args.splitPaneVisibility.html) return
      args.setSplitPaneVisibility(prev => (prev.html ? { ...prev, html: false } : prev))
      return
    }
    if (args.splitPaneVisibility.viewer && args.splitPaneVisibility.html) return
    args.setSplitPaneVisibility(prev => (prev.viewer && prev.html ? prev : { ...prev, viewer: true, html: true }))
  }, [
    args.activeDocumentKey,
    args.modelAssetFormat,
    args.setSplitPaneVisibility,
    args.splitPaneVisibility.python,
    args.splitPaneVisibility.block,
    args.splitPaneVisibility.html,
    args.splitPaneVisibility.json,
    args.splitPaneVisibility.markdown,
    args.splitPaneVisibility.viewer,
    args.webpageUrl,
    args.webpageView,
    args.workspaceEditorOverlayOpen,
    args.workspaceEditorSurfaceActive,
  ])
}
