import React from 'react'
import {
  buildMarkdownVariableToken,
  collectMarkdownVariableBrowseRows,
  findMarkdownVariableTokenAtOffset,
} from '@/features/markdown/ui/markdownVariableReferences'
import {
  buildInlineMediaEmbed,
  collectInlineMediaCommandCandidates,
  type InlineMediaCommandCandidate,
} from '@/lib/command-menu/inlineCommandMenuCatalog'
import { mergeInlineMediaCommandCandidates } from '@/lib/command-menu/inlineMediaCommandCandidateMerge'
import { useUploadedMediaInlineCommandCandidates } from '@/lib/command-menu/inlineUploadedMediaCandidates'
import {
  applyCommandMenuMediaNameDraftsToInlineCandidates,
  useCommandMenuMediaNameDrafts,
} from '@/lib/command-menu/commandMenuMediaNameSync'
import {
  getInlineMediaEditorMarkdownSelectionOffsets,
  INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR,
  mapInlineMediaEditorVisibleOffsetsToMarkdownOffsets,
  readInlineMediaEditorMarkdownText,
} from './markdownBlockContainerCore.inlineMediaEditHtml'

export const useMarkdownBlockContainerVariableActions = (args: {
  editable: boolean
  sourceLines?: string[]
  editStartLine: number
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  variableMenu: {
    show: boolean
    query: string
    keyInput: string
    valueInput: string
    fallbackInput: string
    mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete'
  }
  setVariableMenu: React.Dispatch<React.SetStateAction<{
    show: boolean
    leftPx: number
    topPx: number
    query: string
    keyInput: string
    valueInput: string
    fallbackInput: string
    mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete'
  }>>
  setSlashMenuStable: (next: { show: boolean; leftPx: number; topPx: number }) => void
  getDraft: () => string
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  getCommandSelectionOffsets?: () => { startOffset: number; endOffset: number } | null
  setDraftToDom: (nextText: string, selection?: { startOffset: number; endOffset: number }) => void
  setEditing: (next: boolean) => void
  setSessionEditLineRange: (next: { startLine: number; endLine: number } | null) => void
  editorRef: React.RefObject<HTMLElement | null>
}) => {
  const mediaNameDrafts = useCommandMenuMediaNameDrafts()
  const uploadedMediaCommandCandidates = useUploadedMediaInlineCommandCandidates({ enabled: args.variableMenu.show })
  const readCommandDraft = React.useCallback(() => {
    const el = args.editorRef.current
    const hasInlineMarkdownTokens = !!el?.querySelector(INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR)
    const cachedCommandSelection = args.getCommandSelectionOffsets?.()
    const visibleSelection = args.getSelectionOffsets()
    if (el && hasInlineMarkdownTokens) {
      const text = readInlineMediaEditorMarkdownText(el)
      const selection = getInlineMediaEditorMarkdownSelectionOffsets(el)
        || cachedCommandSelection
        || mapInlineMediaEditorVisibleOffsetsToMarkdownOffsets(el, visibleSelection)
      return { text: text || args.getDraft(), selection }
    }
    const text = (() => {
      if (el) {
        const rawText = typeof (el as HTMLElement).innerText === 'string'
          ? (el as HTMLElement).innerText
          : String(el.textContent || '')
        const normalized = rawText.replace(/\r/g, '')
        if (normalized) return normalized
      }
      return args.getDraft()
    })()
    return { text, selection: cachedCommandSelection || visibleSelection }
  }, [args])

  const applyVariableFrontmatterCrud = React.useCallback((mode: 'create' | 'update' | 'delete', keyRaw: string, valueRaw?: string) => {
    if (!args.editable || !args.onReplaceLineRange || !Array.isArray(args.sourceLines)) return false
    const key = String(keyRaw || '').trim()
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(key)) return false
    const value = String(valueRaw || '').trim()
    if ((mode === 'create' || mode === 'update') && !value) return false
    const lines = args.sourceLines.slice()
    const hasFrontmatter = (lines[0] || '').trim() === '---'
    let fmEndIdx = -1
    if (hasFrontmatter) {
      for (let i = 1; i < lines.length; i += 1) {
        if ((lines[i] || '').trim() === '---') {
          fmEndIdx = i
          break
        }
      }
    }
    const quotedValue = `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    const keyEscaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const keyPattern = new RegExp(`^\\s*${keyEscaped}\\s*:`)
    if (hasFrontmatter && fmEndIdx > 0) {
      const fmBody = lines.slice(1, fmEndIdx)
      let replaced = false
      const nextBody = fmBody
        .map((line) => {
          if (!keyPattern.test(line)) return line
          replaced = true
          if (mode === 'delete') return ''
          return `${key}: ${quotedValue}`
        })
        .filter(line => String(line || '').trim().length > 0)
      if ((mode === 'create' || mode === 'update') && !replaced) nextBody.push(`${key}: ${quotedValue}`)
      const frontmatterLines = ['---', ...nextBody, '---']
      args.onReplaceLineRange({ startLine: 1, endLine: fmEndIdx + 1, replacementLines: frontmatterLines })
    } else if (lines.length > 0) {
      if (mode === 'delete') return false
      const frontmatterLines = ['---', `${key}: ${quotedValue}`, '---']
      args.onReplaceLineRange({
        startLine: 1,
        endLine: 1,
        replacementLines: [...frontmatterLines, '', lines[0] || ''],
      })
    } else {
      if (mode === 'delete') return false
      const frontmatterLines = ['---', `${key}: ${quotedValue}`, '---']
      args.onReplaceLineRange({
        startLine: Math.max(1, args.editStartLine),
        endLine: Math.max(1, args.editStartLine),
        replacementLines: [...frontmatterLines, ''],
      })
    }
    args.setVariableMenu(prev => ({ ...prev, show: false, keyInput: key, query: '', mode: 'ref' }))
    args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
    args.setEditing(false)
    args.setSessionEditLineRange(null)
    return true
  }, [args])

  const applyVariableToken = React.useCallback((mode: 'ref' | 'create' | 'update' | 'fallback' | 'delete', forcedKey?: string) => {
    if (mode === 'delete') {
      const keyFromState = String(args.variableMenu.keyInput || args.variableMenu.query || '').trim()
      if (!applyVariableFrontmatterCrud('delete', keyFromState)) return
      return
    }
    if (mode === 'create' || mode === 'update') {
      const keyFromState = String(args.variableMenu.keyInput || args.variableMenu.query || '').trim()
      if (!applyVariableFrontmatterCrud(mode, keyFromState, args.variableMenu.valueInput)) return
      return
    }
    const { text, selection } = readCommandDraft()
    const fallbackOffset = Math.max(0, String(text || '').length)
    const startOffset = selection?.startOffset ?? fallbackOffset
    const endOffset = selection?.endOffset ?? fallbackOffset
    const a = Math.max(0, Math.min(text.length, startOffset))
    const b = Math.max(0, Math.min(text.length, endOffset))
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    const atCaretToken = findMarkdownVariableTokenAtOffset({ text, offset: end })
    const keyFromState = String(forcedKey || args.variableMenu.keyInput || args.variableMenu.query || '').trim()
    const keyFromToken = atCaretToken?.key || ''
    const key = keyFromState || keyFromToken
    let nextToken = buildMarkdownVariableToken({
      mode,
      key,
      value: args.variableMenu.valueInput,
      fallback: args.variableMenu.fallbackInput,
    })
    if (!nextToken && key) {
      nextToken = buildMarkdownVariableToken({ mode: 'ref', key })
    }
    if (!nextToken) return
    const lineStartIdx = text.lastIndexOf('\n', Math.max(0, end) - 1) + 1
    const preceding = text.slice(lineStartIdx, Math.max(lineStartIdx, Math.min(text.length, end)))
    const atQueryMatch = /@([A-Za-z0-9_.-]{0,64})$/.exec(preceding)
    const atQueryStart = atQueryMatch ? end - atQueryMatch[0].length : -1
    const rangeStart = start !== end
      ? start
      : atCaretToken
      ? atCaretToken.start
      : atQueryMatch
      ? atQueryStart
      : end
    const rangeEnd = start !== end
      ? end
      : atCaretToken
      ? atCaretToken.end
      : end
    const nextText = `${text.slice(0, Math.max(0, rangeStart))}${nextToken}${text.slice(Math.max(0, rangeEnd))}`
    const cursor = Math.max(0, rangeStart) + nextToken.length
    args.setDraftToDom(nextText, { startOffset: cursor, endOffset: cursor })
    queueMicrotask(() => {
      const el = args.editorRef.current
      if (!el) return
      const renderedNow = String(el.textContent || '').replace(/\r/g, '')
      if (renderedNow.includes(nextToken)) return
      el.textContent = nextText
    })
    args.setVariableMenu(prev => ({ ...prev, show: false, query: '', keyInput: key, mode: 'ref' }))
    args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [applyVariableFrontmatterCrud, args, readCommandDraft])

  const applyMediaCommandCandidate = React.useCallback((candidate: InlineMediaCommandCandidate) => {
    const { text, selection } = readCommandDraft()
    const fallbackOffset = Math.max(0, String(text || '').length)
    const startOffset = selection?.startOffset ?? fallbackOffset
    const endOffset = selection?.endOffset ?? fallbackOffset
    const a = Math.max(0, Math.min(text.length, startOffset))
    const b = Math.max(0, Math.min(text.length, endOffset))
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    const lineStartIdx = text.lastIndexOf('\n', Math.max(0, end) - 1) + 1
    const preceding = text.slice(lineStartIdx, Math.max(lineStartIdx, Math.min(text.length, end)))
    const atQueryMatch = /@([A-Za-z0-9_.-]{0,96})$/.exec(preceding)
    const atQueryStart = atQueryMatch ? end - atQueryMatch[0].length : -1
    const rangeStart = start !== end ? start : atQueryMatch ? atQueryStart : end
    const rangeEnd = start !== end ? end : end
    const selected = start !== end ? text.slice(start, end) : ''
    const replacement = buildInlineMediaEmbed({
      kind: candidate.kind,
      url: candidate.url,
      thumbnailUrl: candidate.thumbnailUrl,
      label: candidate.label,
      selectedText: selected,
      sourceKey: candidate.sourceKey,
    })
    const nextText = `${text.slice(0, Math.max(0, rangeStart))}${replacement}${text.slice(Math.max(0, rangeEnd))}`
    args.setDraftToDom(nextText)
    args.setVariableMenu(prev => ({ ...prev, show: false, query: '', keyInput: '', mode: 'ref' }))
    args.setSlashMenuStable({ show: false, leftPx: 0, topPx: 0 })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args, readCommandDraft])

  const variableSuggestions = React.useMemo(() => {
    if (!args.variableMenu.show) return []
    const query = String(args.variableMenu.keyInput || args.variableMenu.query || '').trim().toLowerCase()
    const all = collectMarkdownVariableBrowseRows({
      sourceLines: args.sourceLines,
      draftText: args.getDraft(),
    })
    if (!query) return all.slice(0, 8)
    return all.filter(row => row.key.toLowerCase().includes(query)).slice(0, 8)
  }, [args])

  const mediaCommandCandidates = React.useMemo(() => {
    if (!args.variableMenu.show) return []
    const query = String(args.variableMenu.keyInput || args.variableMenu.query || '').trim().toLowerCase()
    const all = applyCommandMenuMediaNameDraftsToInlineCandidates(mergeInlineMediaCommandCandidates([
      ...uploadedMediaCommandCandidates,
      ...collectInlineMediaCommandCandidates({
        sourceLines: args.sourceLines,
        draftText: [args.variableMenu.query, args.getDraft()].filter(Boolean).join("\n"),
      }),
    ]), mediaNameDrafts)
    if (!query) return all.slice(0, 8)
    return all
      .filter(candidate => (
        candidate.label.toLowerCase().includes(query)
        || candidate.url.toLowerCase().includes(query)
        || candidate.sourceKey?.toLowerCase().includes(query)
      ))
      .slice(0, 8)
  }, [args, mediaNameDrafts, uploadedMediaCommandCandidates])

  return {
    applyVariableFrontmatterCrud,
    applyVariableToken,
    applyMediaCommandCandidate,
    mediaCommandCandidates,
    variableSuggestions,
  }
}
