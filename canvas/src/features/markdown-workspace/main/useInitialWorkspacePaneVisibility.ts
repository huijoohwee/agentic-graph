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
    && a.json === b.json
    && a.markdown === b.markdown
    && a.viewer === b.viewer
    && a.html === b.html
}

export function useInitialWorkspacePaneVisibility(args: UseInitialWorkspacePaneVisibilityArgs) {
  const appliedPresetKeyRef = React.useRef('')
  const previousWebpageViewRef = React.useRef<WebpageViewMode | ''>('')
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
      const nextVisibility = resolveMarkdownWorkspaceInitialPaneVisibility({
        activeDocumentKey: args.activeDocumentKey,
        modelAssetFormat: args.modelAssetFormat,
        webpageView: args.webpageView || null,
      })
      if (areMarkdownWorkspacePaneVisibilitiesEqual(args.splitPaneVisibility, nextVisibility)) return
      args.setSplitPaneVisibility(prev => (
        areMarkdownWorkspacePaneVisibilitiesEqual(prev, nextVisibility)
          ? prev
          : nextVisibility
      ))
      return
    }
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
