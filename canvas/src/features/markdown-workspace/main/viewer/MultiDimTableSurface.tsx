import React from 'react'
import { usePanelTypography } from '@/lib/ui/panelTypography'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import { splitMarkdownLines } from '@/lib/markdown'
import { replaceMarkdownLineRange } from 'grph-shared/markdown/lineEditing'
import { writeWorkspaceSourceTextIfPresent } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import type { MarkdownInlineDraftTextChangeOptions } from '@/features/markdown/ui/MarkdownRendererTypes'
import { sanitizeInvalidDataUrls } from '@/features/markdown-workspace/main/sanitize'
import { MarkdownWorkspaceDerivedViewer, type WorkspaceDataViewSource } from '@/features/markdown-workspace/main/viewer/MarkdownWorkspaceDerivedViewer'
import {
  applyStructuredSourceDataViewReplacement,
} from '@/features/markdown-workspace/main/viewer/sourceStructuredDataViewTable'
import { useCanvasWorkspaceDataViewSource } from './workspaceDataViewCanvasSource'
import { UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME, UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES } from '@/lib/ui/surfaceClasses'

const NOOP_REVEAL_LINE = () => void 0
const NOOP_VIEWER_ROOT_REF = () => void 0

export function MultiDimTableSurface(props: { active?: boolean; ariaLabel?: string; dataViewSource?: WorkspaceDataViewSource }) {
  const active = props.active !== false
  const panelTypography = usePanelTypography()
  const source = useCanvasWorkspaceDataViewSource('multi-dimensional-table.md')
  const [viewerInlineMarkdownDraftText, setViewerInlineMarkdownDraftText] = React.useState<string | null>(null)
  const [viewerInlineViewerText, setViewerInlineViewerText] = React.useState<string | null>(null)
  const activeDocumentPath = source.activeDocumentPath
  const sourceBackedMarkdownText = source.sourceBackedMarkdownText
  const editableMarkdownText = viewerInlineMarkdownDraftText ?? sourceBackedMarkdownText
  const persistedEditableMarkdownText = source.sourceMarkdownText
  const canMutate = !props.dataViewSource && persistedEditableMarkdownText.trim().length > 0
  const markdownText = React.useMemo(() => {
    const editableSource = String(viewerInlineViewerText ?? viewerInlineMarkdownDraftText ?? sourceBackedMarkdownText ?? '')
    if (editableSource.trim()) return sanitizeInvalidDataUrls(editableSource)
    const jsonSource = String(source.jsonSourceDocumentText || '').trim()
    return sanitizeInvalidDataUrls(jsonSource ? source.jsonSourceDocumentText : editableSource)
  }, [source.jsonSourceDocumentText, sourceBackedMarkdownText, viewerInlineMarkdownDraftText, viewerInlineViewerText])

  const commitMarkdownEditText = React.useCallback((nextText: string) => {
    setViewerInlineMarkdownDraftText(null)
    setViewerInlineViewerText(null)
    const normalizedText = String(nextText || '')
    const activePath = source.normalizeActivePath()
    let sourceFilesChanged = false
    const nextSourceFiles = source.sourceFiles.map(file => {
      const sourcePath = source.readSourceFilePath(file)
      if (!activePath || sourcePath !== activePath) return file
      if (String(file?.text || '') === normalizedText) return file
      sourceFilesChanged = true
      const nextFile = { ...file, text: normalizedText, parsedTextHash: '' }
      writeWorkspaceSourceTextIfPresent(nextFile, normalizedText, 'Multi-dimensional Table inline edit')
      return nextFile
    })
    if (sourceFilesChanged) source.setSourceFiles(nextSourceFiles)
    source.setMarkdownDocument(activePath || source.markdownDocumentName, normalizedText, { applyViewPreset: false })
  }, [source])

  const handleInsertLineAfter = React.useCallback((afterLine: number) => {
    if (!canMutate) return
    const line = Math.max(1, Math.floor(afterLine))
    const lines = splitMarkdownLines(editableMarkdownText)
    const idx = Math.min(lines.length, line)
    commitMarkdownEditText([...lines.slice(0, idx), '', ...lines.slice(idx)].join('\n'))
  }, [canMutate, commitMarkdownEditText, editableMarkdownText])

  const handleReorderLineBlock = React.useCallback((
    source: { startLine: number; endLine: number },
    target: { startLine: number; endLine: number },
    position: 'before' | 'after',
  ) => {
    if (!canMutate) return
    const srcStart = Math.max(1, Math.floor(source.startLine))
    const srcEnd = Math.max(srcStart, Math.floor(source.endLine))
    const tgtStart = Math.max(1, Math.floor(target.startLine))
    const tgtEnd = Math.max(tgtStart, Math.floor(target.endLine))
    if (srcStart === tgtStart && srcEnd === tgtEnd) return
    const lines = splitMarkdownLines(editableMarkdownText)
    if (srcStart > lines.length) return
    const safeSrcEnd = Math.min(lines.length, srcEnd)
    const srcChunk = lines.slice(srcStart - 1, safeSrcEnd)
    const rest = [...lines.slice(0, srcStart - 1), ...lines.slice(safeSrcEnd)]
    const insertionLine = position === 'before' ? tgtStart : tgtEnd + 1
    const insertionIndex = Math.max(0, Math.min(rest.length, insertionLine - 1))
    commitMarkdownEditText([...rest.slice(0, insertionIndex), ...srcChunk, ...rest.slice(insertionIndex)].join('\n'))
  }, [canMutate, commitMarkdownEditText, editableMarkdownText])

  const handleReplaceLineRange = React.useCallback((args: { startLine: number; endLine: number; replacementLines: string[] }) => {
    if (!canMutate) return
    const startLine = Math.max(1, Math.floor(args.startLine || 1))
    const endLine = Math.max(startLine, Math.floor(args.endLine || startLine))
    const replacementLines = Array.isArray(args.replacementLines) ? args.replacementLines : []
    const structuredNext = applyStructuredSourceDataViewReplacement({
      sourceText: persistedEditableMarkdownText,
      projection: source.sourceStructuredProjection,
      startLine,
      endLine,
      replacementLines,
    })
    if (structuredNext != null && structuredNext !== persistedEditableMarkdownText) {
      commitMarkdownEditText(structuredNext)
      return
    }
    const next = replaceMarkdownLineRange({
      markdownText: persistedEditableMarkdownText,
      startLine,
      endLine,
      replacementLines,
    })
    if (next === persistedEditableMarkdownText) return
    commitMarkdownEditText(next)
  }, [canMutate, commitMarkdownEditText, persistedEditableMarkdownText, source.sourceStructuredProjection])

  const handleInlineEditStateChange = React.useCallback((activeEditing: boolean) => {
    if (!activeEditing) {
      setViewerInlineMarkdownDraftText(null)
      setViewerInlineViewerText(null)
    }
  }, [])

  const handleInlineDraftTextChange = React.useCallback((nextText: string, options?: MarkdownInlineDraftTextChangeOptions) => {
    setViewerInlineMarkdownDraftText(prev => (prev === nextText ? prev : nextText))
    if (options?.reflectInViewer === false) return
    setViewerInlineViewerText(prev => (prev === nextText ? prev : nextText))
  }, [])

  if (!active) return null

  return (
    <section className={`${UI_VIEW_EDIT_SURFACE_AREA_CLASS_NAME} ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.text.primary}`} aria-label={props.ariaLabel || 'Multi-dimensional Table'} {...UI_VIEW_EDIT_SURFACE_DATA_ATTRIBUTES}>
      <MarkdownWorkspaceDerivedViewer
        viewerKind="markdown"
        viewerMode="multiDimTable"
        dataViewSource={props.dataViewSource}
        markdownText={props.dataViewSource ? '' : markdownText}
        title={props.dataViewSource?.label ?? source.title}
        activeDocumentPath={props.dataViewSource ? null : activeDocumentPath}
        markdownWordWrap={true}
        markdownTextHighlight={false}
        uiPanelTextFontClass={panelTypography.fontClass}
        uiPanelMonospaceTextClass={panelTypography.monospaceTextClass}
        disableViewerMutations={!canMutate}
        onInsertLineAfter={handleInsertLineAfter}
        onReorderLineBlock={handleReorderLineBlock}
        onReplaceLineRange={handleReplaceLineRange}
        onRevealLineInEditor={NOOP_REVEAL_LINE}
        onInlineEditStateChange={handleInlineEditStateChange}
        onInlineDraftTextChange={handleInlineDraftTextChange}
        onViewerRootRef={NOOP_VIEWER_ROOT_REF}
      />
    </section>
  )
}
