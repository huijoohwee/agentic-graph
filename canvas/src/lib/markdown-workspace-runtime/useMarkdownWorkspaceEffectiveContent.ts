import React from 'react'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { normalizeWorkspacePath } from '@/features/workspace-fs/path'
import type { MarkdownWorkspaceLayoutMode } from '@/features/markdown-explorer/workspaceUi'
import { isMarkdownPath, languageForPath } from '@/features/markdown-workspace/markdownWorkspaceUtils'
import { matchesMarkdownDocumentPath } from 'grph-shared/markdown/documentPath'
import { useGraphStore } from '@/hooks/useGraphStore'
import { shouldRejectMarkdownDocumentPayload } from '@/lib/markdown/markdownDocumentPayloadGuards'

type WebpageWorkspaceMeta = {
  url?: unknown
  view?: string | null
} | null

export function resolveLiveWorkspaceStreamingText(args: {
  activePath: WorkspacePath | null
  streamingPath: WorkspacePath | null
  streamingText: string | null | undefined
  userEditedActiveText: boolean
  programmaticStreamingOverride?: boolean
}): string {
  if (args.userEditedActiveText === true && args.programmaticStreamingOverride !== true) return ''
  const activePath = normalizeWorkspacePath(String(args.activePath || '').trim())
  const streamingPath = normalizeWorkspacePath(String(args.streamingPath || '').trim())
  if (!activePath || !streamingPath || activePath !== streamingPath) return ''
  const text = String(args.streamingText || '')
  return shouldRejectMarkdownDocumentPayload(text) ? '' : text
}

export function resolveLiveWorkspaceStreamingTailFollowKey(args: {
  activePath: WorkspacePath | null
  streamingText: string | null | undefined
}): string | null {
  const text = String(args.streamingText || '')
  if (!text) return null
  const activePath = normalizeWorkspacePath(String(args.activePath || '').trim())
  if (!activePath) return null
  return `${activePath}:${text.length}:${text.slice(-120)}`
}

export function useMarkdownWorkspaceEffectiveContent(args: {
  activePath: WorkspacePath | null
  activeDocumentKey: string
  activeEntryKind: WorkspaceEntry['kind'] | null
  activeText: string
  activeTextRef: React.MutableRefObject<string>
  setActiveText: React.Dispatch<React.SetStateAction<string>>
  markdownDocumentName: string
  markdownDocumentText: string
  layoutMode: MarkdownWorkspaceLayoutMode
  contentMode: 'document' | 'widget'
  widgetFormat: 'json' | 'markdown'
  widgetEditorText: string
  widgetViewerText: string
  pdfWorkspaceViewerTextOverride: string | null
  webpageWorkspaceMeta: WebpageWorkspaceMeta
  webpageWorkspaceEditorTextOverride: string | null
  webpageWorkspaceViewerTextOverride: string | null
  userEditedActiveTextRef: React.MutableRefObject<boolean>
}) {
  const {
    activePath,
    activeDocumentKey,
    activeEntryKind,
    activeText,
    activeTextRef,
    setActiveText,
    markdownDocumentName,
    markdownDocumentText,
    layoutMode,
    contentMode,
    widgetFormat,
    widgetEditorText,
    widgetViewerText,
    pdfWorkspaceViewerTextOverride,
    webpageWorkspaceMeta,
    webpageWorkspaceEditorTextOverride,
    webpageWorkspaceViewerTextOverride,
    userEditedActiveTextRef,
  } = args
  const chatWorkspaceStreamingPath = useGraphStore(s => s.chatWorkspaceStreamingPath || null)
  const chatWorkspaceStreamingText = useGraphStore(s => s.chatWorkspaceStreamingText || null)
  const webpageEditorMode = webpageWorkspaceMeta?.view === 'json' ? 'json' : null
  const editorUri = activePath
    ? `inmemory://workspace/${encodeURIComponent(activeDocumentKey || 'document')}${webpageEditorMode ? `?mode=${webpageEditorMode}` : ''}`
    : 'inmemory://model/empty'
  const editorLanguage = activePath ? webpageEditorMode || languageForPath(activePath) : 'markdown'
  const isMatchingMarkdownDocument = React.useMemo(() => {
    const docKey = String(activeDocumentKey || '').trim()
    const markdownName = String(markdownDocumentName || '').trim()
    if (!docKey || !markdownName) return false
    if (!isMarkdownPath(String(activePath || docKey))) return false
    return matchesMarkdownDocumentPath(docKey, markdownName)
  }, [activeDocumentKey, activePath, markdownDocumentName])
  const rawCanonicalMarkdownText = typeof markdownDocumentText === 'string' ? markdownDocumentText : ''
  const canonicalMarkdownText = shouldRejectMarkdownDocumentPayload(rawCanonicalMarkdownText) ? '' : rawCanonicalMarkdownText
  const visibleActiveText = shouldRejectMarkdownDocumentPayload(activeText) ? '' : activeText
  const shouldSyncProgrammaticActiveText = (
    contentMode !== 'widget'
    && isMatchingMarkdownDocument
    && !!canonicalMarkdownText
    && !userEditedActiveTextRef.current
    && activeText !== canonicalMarkdownText
  )

  React.useEffect(() => {
    if (!shouldSyncProgrammaticActiveText) return
    userEditedActiveTextRef.current = false
    setActiveText(prev => (prev === canonicalMarkdownText ? prev : canonicalMarkdownText))
  }, [canonicalMarkdownText, setActiveText, shouldSyncProgrammaticActiveText, userEditedActiveTextRef])

  React.useLayoutEffect(() => {
    if (!shouldRejectMarkdownDocumentPayload(activeText)) return
    userEditedActiveTextRef.current = false
    setActiveText(prev => (shouldRejectMarkdownDocumentPayload(prev) ? '' : prev))
  }, [activeText, setActiveText, userEditedActiveTextRef])

  const liveWorkspaceStreamingText = React.useMemo(
    () =>
      resolveLiveWorkspaceStreamingText({
        activePath,
        streamingPath: chatWorkspaceStreamingPath,
        streamingText: chatWorkspaceStreamingText,
        userEditedActiveText: userEditedActiveTextRef.current,
        programmaticStreamingOverride: true,
      }),
    [activePath, chatWorkspaceStreamingPath, chatWorkspaceStreamingText, userEditedActiveTextRef],
  )
  const liveWorkspaceStreamingTailFollowKey = React.useMemo(
    () =>
      resolveLiveWorkspaceStreamingTailFollowKey({
        activePath,
        streamingText: liveWorkspaceStreamingText,
      }),
    [activePath, liveWorkspaceStreamingText],
  )

  const effectiveActiveText = React.useMemo(() => {
    if (contentMode === 'widget') return widgetEditorText
    if (liveWorkspaceStreamingText) return liveWorkspaceStreamingText
    if (shouldSyncProgrammaticActiveText) return canonicalMarkdownText
    if (visibleActiveText) return visibleActiveText
    if (isMatchingMarkdownDocument && canonicalMarkdownText) {
      return canonicalMarkdownText
    }
    return visibleActiveText
  }, [canonicalMarkdownText, contentMode, isMatchingMarkdownDocument, liveWorkspaceStreamingText, shouldSyncProgrammaticActiveText, visibleActiveText, widgetEditorText])

  const effectiveSetActiveText = React.useCallback(
    (next: string) => {
      if (contentMode === 'widget') return
      const nextText = shouldRejectMarkdownDocumentPayload(next) ? '' : next
      activeTextRef.current = nextText
      userEditedActiveTextRef.current = true
      setActiveText(nextText)
    },
    [activeTextRef, contentMode, setActiveText, userEditedActiveTextRef],
  )

  const effectiveViewerTextOverride = contentMode === 'widget' && widgetFormat === 'json' ? widgetViewerText : null
  const combinedViewerTextOverride =
    liveWorkspaceStreamingText || effectiveViewerTextOverride || pdfWorkspaceViewerTextOverride || webpageWorkspaceViewerTextOverride
  const webpageDerivedReadOnlyActive = contentMode !== 'widget' && !!(webpageWorkspaceMeta?.url && webpageWorkspaceMeta?.view === 'json')
  const effectiveEditorTextOverride = contentMode === 'widget' ? null : (liveWorkspaceStreamingText || webpageWorkspaceEditorTextOverride)
  const effectiveIsEditing =
    contentMode !== 'widget' &&
    (layoutMode === 'editor' || layoutMode === 'split') &&
    !webpageDerivedReadOnlyActive
  const effectiveIsMarkdown =
    contentMode !== 'widget' &&
    isMarkdownPath(String(activePath || '')) &&
    !(webpageWorkspaceMeta && webpageWorkspaceMeta.view !== 'markdown')
  const saveEnabled = effectiveIsEditing && activeEntryKind === 'file' && !!activeDocumentKey
  const disableEditorMutations =
    !!liveWorkspaceStreamingText ||
    webpageDerivedReadOnlyActive ||
    (webpageWorkspaceMeta?.view === 'json' && typeof effectiveEditorTextOverride === 'string')

  return {
    webpageEditorMode,
    editorUri,
    editorLanguage,
    effectiveActiveText,
    effectiveSetActiveText,
    combinedViewerTextOverride,
    webpageDerivedReadOnlyActive,
    effectiveEditorTextOverride,
    effectiveIsEditing,
    effectiveIsMarkdown,
    saveEnabled,
    disableEditorMutations,
    disableViewerMutations: contentMode === 'widget',
    liveWorkspaceStreamingTailFollowKey,
  }
}
