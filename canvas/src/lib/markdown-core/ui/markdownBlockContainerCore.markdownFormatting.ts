import React from 'react'
import { applyMarkdownFormatAction, type MarkdownFormatAction } from 'grph-shared/markdown/formatting'
import { areReplacementLinesNoop } from '@/features/markdown/ui/markdownEditParitySsot'
import { buildMarkdownSigil, parseMarkdownSigil, unwrapDefaultHighlight } from '@/features/markdown/ui/markdownSigil'
import {
  buildAgenticOsDictionaryInvocationMarkdown,
  buildAgenticOsDocBindingInvocationMarkdown,
  buildAgenticOsDocInvocationMarkdown,
  buildAgenticOsDocSemanticInvocationMarkdown,
  findAgenticOsDictionaryInvocationByActionId,
  findAgenticOsDocInvocationByActionId,
} from '@/features/agentic-os/agenticOsDocInvocations'
import { toggleHeadingAcrossLines } from './markdownBlockContainerCore.toolbar'
import {
  computeFloatingMenuPosition,
  getRangeRectSafe,
  readLiveSelectionSnapshot,
  type LiveSelectionSnapshot,
} from './markdownBlockContainerCore.interaction'

export const useMarkdownBlockContainerMarkdownFormatting = (args: {
  editorPresentation: 'markdown' | 'html'
  editable: boolean
  editStartLine: number
  editEndLine: number
  sourceLines?: string[]
  onReplaceLineRange?: (args: { startLine: number; endLine: number; replacementLines: string[] }) => void
  getDraft: () => string
  getSelectionOffsets: () => { startOffset: number; endOffset: number } | null
  setDraftToDom: (nextText: string, selection?: { startOffset: number; endOffset: number }) => void
  buildReplacementLinesFromDraft: (draft: string) => string[]
  resolveTurnIntoFormatAction: (next: string) => MarkdownFormatAction | 'codeBlock' | null
  readEditorPlainText: () => string
  readCurrentMarkdownDraft: () => Promise<string>
  editorRef: React.RefObject<HTMLElement | null>
  setEditing: (next: boolean) => void
  setSessionEditLineRange: (next: { startLine: number; endLine: number } | null) => void
  setLinkPopover: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number; href: string }>>
  setInlineSelectionToolbar: React.Dispatch<React.SetStateAction<{ show: boolean; leftPx: number; topPx: number }>>
  linkRangeRef: React.MutableRefObject<Range | null>
  liveSelectionSnapshotRef: React.MutableRefObject<LiveSelectionSnapshot | null>
  readSelectionOffsetsForFormatting: () => { startOffset: number; endOffset: number } | null
  execInline: (cmd: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'removeFormat') => void
  insertHtmlAroundSelection: (payload: { leftHtml: string; rightHtml: string }) => void
  applyDefaultHighlightToHtmlSelection: () => void
  applyUnderlineToHtmlSelection: () => void
  clearHtmlFormattingSelection: () => void
  applySigilToHtmlSelection: (payload: { color?: string; background?: string }) => void
  restoreCachedHtmlSelection: () => void
}) => {
  const applySerializedDraftMutation = React.useCallback((
    mutate: (ctx: {
      draft: string
      selection: { startOffset: number; endOffset: number } | null
    }) => { nextText: string; nextSelection?: { startOffset: number; endOffset: number } } | null,
  ) => {
    void (async () => {
      const draft = await args.readCurrentMarkdownDraft()
      const selection = args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
      const result = mutate({ draft, selection })
      if (!result) return
      args.setDraftToDom(result.nextText, result.nextSelection)
      queueMicrotask(() => args.editorRef.current?.focus())
    })()
  }, [args])

  const applyHtmlStructuralMutation = React.useCallback((
    mutate: (ctx: {
      draft: string
      selection: { startOffset: number; endOffset: number } | null
    }) => string | null,
  ) => {
    if (!args.editable || !args.onReplaceLineRange) return
    void (async () => {
      const draft = await args.readCurrentMarkdownDraft()
      const selection = args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
      const nextText = mutate({ draft, selection })
      if (typeof nextText !== 'string' || nextText === draft) return
      const replacementLines = args.buildReplacementLinesFromDraft(nextText)
      if (areReplacementLinesNoop({ sourceLines: args.sourceLines, startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })) {
        args.setEditing(false)
        args.setSessionEditLineRange(null)
        return
      }
      args.onReplaceLineRange({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })
      args.setEditing(false)
      args.setSessionEditLineRange(null)
    })()
  }, [args])

  const applyDraftAction = React.useCallback((action: MarkdownFormatAction) => {
    if (args.editorPresentation === 'html') {
      if (action === 'bold') args.execInline('bold')
      if (action === 'italic') args.execInline('italic')
      if (action === 'strike') args.execInline('strikeThrough')
      if (action === 'inlineCode') args.insertHtmlAroundSelection({ leftHtml: '<code>', rightHtml: '</code>' })
      if (action === 'link') {
        const root = args.editorRef.current
        if (!root) return
        const sel = typeof window !== 'undefined' ? window.getSelection() : null
        const snapshot = readLiveSelectionSnapshot({ root, selection: sel })
        args.liveSelectionSnapshotRef.current = snapshot
        if (snapshot?.range) args.linkRangeRef.current = snapshot.range.cloneRange()
        const rect = snapshot?.rect || (sel && sel.rangeCount > 0 ? getRangeRectSafe(sel.getRangeAt(0)) : null)
        const { leftPx, topPx } = computeFloatingMenuPosition({ rangeRect: rect, root })
        args.setLinkPopover({ show: true, leftPx, topPx, href: '' })
        args.setInlineSelectionToolbar(prev => (prev.show ? { ...prev, show: false } : prev))
      }
      return
    }
    const selection = args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
    const startOffset = selection?.startOffset ?? 0
    const endOffset = selection?.endOffset ?? 0
    const result = applyMarkdownFormatAction({
      text: args.getDraft(),
      selection: { startOffset, endOffset },
      action,
    })
    args.setDraftToDom(result.nextText, result.nextSelection)
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const applyWrap = React.useCallback((left: string, right: string) => {
    if (args.editorPresentation === 'html') {
      if (left === '<u>' && right === '</u>') {
        args.restoreCachedHtmlSelection()
        args.applyUnderlineToHtmlSelection()
        return
      }
      if (left === '==' && right === '==') {
        args.restoreCachedHtmlSelection()
        args.applyDefaultHighlightToHtmlSelection()
        return
      }
      if (left === '<!-- ' && right === ' -->') {
        args.restoreCachedHtmlSelection()
        applyHtmlStructuralMutation(({ draft, selection }) => {
          const startOffset = selection?.startOffset ?? 0
          const endOffset = selection?.endOffset ?? 0
          const a = Math.max(0, Math.min(draft.length, startOffset))
          const b = Math.max(0, Math.min(draft.length, endOffset))
          const start = Math.min(a, b)
          const end = Math.max(a, b)
          const selected = draft.slice(start, end)
          if (!selected) return null
          return `${draft.slice(0, start)}<!-- ${selected} -->${draft.slice(end)}`
        })
        return
      }
      applySerializedDraftMutation(({ draft, selection }) => {
        const startOffset = selection?.startOffset ?? 0
        const endOffset = selection?.endOffset ?? 0
        const a = Math.max(0, Math.min(draft.length, startOffset))
        const b = Math.max(0, Math.min(draft.length, endOffset))
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        const selected = draft.slice(start, end)
        const nextText = `${draft.slice(0, start)}${left}${selected}${right}${draft.slice(end)}`
        const nextStart = start + left.length
        return {
          nextText,
          nextSelection: { startOffset: nextStart, endOffset: nextStart + selected.length },
        }
      })
      return
    }
    const current = args.getDraft()
    const selection = args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
    const startOffset = selection?.startOffset ?? 0
    const endOffset = selection?.endOffset ?? 0
    const a = Math.max(0, Math.min(current.length, startOffset))
    const b = Math.max(0, Math.min(current.length, endOffset))
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    const selected = current.slice(start, end)
    const nextText = `${current.slice(0, start)}${left}${selected}${right}${current.slice(end)}`
    const nextStart = start + left.length
    const nextEnd = nextStart + selected.length
    args.setDraftToDom(nextText, { startOffset: nextStart, endOffset: nextEnd })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [applyHtmlStructuralMutation, applySerializedDraftMutation, args])

  const applyTurnInto = React.useCallback((next: string, triggerSelection?: { startOffset: number; endOffset: number } | null) => {
    const dictionaryInvocation = findAgenticOsDictionaryInvocationByActionId(next)
    if (dictionaryInvocation) {
      const current = args.getDraft()
      const selection = triggerSelection || args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
      const startOffset = selection?.startOffset ?? current.length
      const endOffset = selection?.endOffset ?? startOffset
      const a = Math.max(0, Math.min(current.length, startOffset))
      const b = Math.max(0, Math.min(current.length, endOffset))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      const lineStartIdx = current.lastIndexOf('\n', Math.max(0, end) - 1) + 1
      const preceding = current.slice(lineStartIdx, Math.max(lineStartIdx, end))
      const triggerMatch = /[\/#@][A-Za-z0-9_.-]{0,96}$/.exec(preceding)
      const rangeStart = start !== end ? start : triggerMatch ? end - triggerMatch[0].length : end
      const replacement = buildAgenticOsDictionaryInvocationMarkdown(dictionaryInvocation)
      const nextText = `${current.slice(0, rangeStart)}${replacement}${current.slice(end)}`
      const cursor = rangeStart + replacement.length
      args.setDraftToDom(nextText, { startOffset: cursor, endOffset: cursor })
      queueMicrotask(() => args.editorRef.current?.focus())
      return
    }
    const docInvocation = findAgenticOsDocInvocationByActionId(next)
    if (docInvocation) {
      const current = args.getDraft()
      const selection = triggerSelection || args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
      const startOffset = selection?.startOffset ?? current.length
      const endOffset = selection?.endOffset ?? startOffset
      const a = Math.max(0, Math.min(current.length, startOffset))
      const b = Math.max(0, Math.min(current.length, endOffset))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      const lineStartIdx = current.lastIndexOf('\n', Math.max(0, end) - 1) + 1
      const preceding = current.slice(lineStartIdx, Math.max(lineStartIdx, end))
      const triggerMatch = /[\/#@][A-Za-z0-9_.-]{0,96}$/.exec(preceding)
      const rangeStart = start !== end ? start : triggerMatch ? end - triggerMatch[0].length : end
      const triggerPrefix = triggerMatch?.[0]?.[0] || '/'
      const replacement = triggerPrefix === '#'
        ? buildAgenticOsDocSemanticInvocationMarkdown(docInvocation)
        : triggerPrefix === '@'
        ? buildAgenticOsDocBindingInvocationMarkdown(docInvocation)
        : buildAgenticOsDocInvocationMarkdown(docInvocation)
      const nextText = `${current.slice(0, rangeStart)}${replacement}${current.slice(end)}`
      const cursor = rangeStart + replacement.length
      args.setDraftToDom(nextText, { startOffset: cursor, endOffset: cursor })
      queueMicrotask(() => args.editorRef.current?.focus())
      return
    }
    const applyInlineMediaInsert = (kind: 'image' | 'video') => {
      const current = args.getDraft()
      const selection = args.readSelectionOffsetsForFormatting() || args.getSelectionOffsets()
      const startOffset = selection?.startOffset ?? 0
      const endOffset = selection?.endOffset ?? 0
      const a = Math.max(0, Math.min(current.length, startOffset))
      const b = Math.max(0, Math.min(current.length, endOffset))
      const start = Math.min(a, b)
      const end = Math.max(a, b)
      const selected = current.slice(start, end).trim()
      const replacement = kind === 'image'
        ? `![${selected || 'Image alt'}](image-url)`
        : `<video src="${selected || 'video-url'}" controls></video>`
      const nextText = `${current.slice(0, start)}${replacement}${current.slice(end)}`
      const cursor = start + replacement.length
      args.setDraftToDom(nextText, { startOffset: cursor, endOffset: cursor })
      queueMicrotask(() => args.editorRef.current?.focus())
    }
    if (next === 'image' || next === 'video') {
      applyInlineMediaInsert(next)
      return
    }
    const applyTransformAndCommit = (action: MarkdownFormatAction | 'codeBlock' | 'heading1' | 'heading3') => {
      if (!args.editable || !args.onReplaceLineRange) return
      const root = args.editorRef.current
      const currentText = root ? args.readEditorPlainText() : args.getDraft()
      const nextText = (() => {
        if (action === 'codeBlock') {
          const lines = String(currentText || '').split(/\r?\n/)
          return ['```', ...lines, '```'].join('\n')
        }
        if (action === 'heading1' || action === 'heading3') return toggleHeadingAcrossLines({ text: String(currentText || ''), level: action === 'heading1' ? 1 : 3 })
        const res = applyMarkdownFormatAction({
          text: String(currentText || ''),
          selection: { startOffset: 0, endOffset: String(currentText || '').length },
          action,
        })
        return res.nextText
      })()
      const replacementLines = args.buildReplacementLinesFromDraft(nextText)
      if (areReplacementLinesNoop({ sourceLines: args.sourceLines, startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })) {
        args.setEditing(false)
        args.setSessionEditLineRange(null)
        return
      }
      args.onReplaceLineRange({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })
      args.setEditing(false)
      args.setSessionEditLineRange(null)
    }
    if (next === 'none') return
    const action = args.resolveTurnIntoFormatAction(next)
    if (action === 'heading2') {
      if (args.editorPresentation === 'html') return applyTransformAndCommit('heading2')
      return applyDraftAction('heading2')
    }
    if (action === 'bulletList') {
      if (args.editorPresentation === 'html') return applyTransformAndCommit('bulletList')
      return applyDraftAction('bulletList')
    }
    if (action === 'numberedList') {
      if (args.editorPresentation === 'html') return applyTransformAndCommit('numberedList')
      return applyDraftAction('numberedList')
    }
    if (action === 'blockquote') {
      if (args.editorPresentation === 'html') return applyTransformAndCommit('blockquote')
      return applyDraftAction('blockquote')
    }
    if (action === 'codeBlock') {
      if (args.editorPresentation === 'html') return applyTransformAndCommit('codeBlock')
      const lines = String(args.getDraft() || '').split(/\r?\n/)
      args.setDraftToDom(['```', ...lines, '```'].join('\n'))
      queueMicrotask(() => args.editorRef.current?.focus())
    }
  }, [applyDraftAction, args])

  const applyAlign = React.useCallback((next: string) => {
    if (next === 'none') return
    if (next === 'left') {
      const current = args.getDraft()
      const nextText = current.replace(/^<section align="(center|right|left)">\n?([\s\S]*?)\n?<\/div>$/i, '$2')
      args.setDraftToDom(nextText)
      queueMicrotask(() => args.editorRef.current?.focus())
      return
    }
    args.setDraftToDom(`<section align="${next}">\n${args.getDraft()}\n</section>`)
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const applyToggleHeading = React.useCallback((level: 1 | 2 | 3) => {
    if (args.editorPresentation === 'html') {
      if (!args.editable || !args.onReplaceLineRange) return
      const root = args.editorRef.current
      const currentText = root ? args.readEditorPlainText() : args.getDraft()
      const nextText = toggleHeadingAcrossLines({ text: String(currentText || ''), level })
      const replacementLines = args.buildReplacementLinesFromDraft(nextText)
      if (areReplacementLinesNoop({ sourceLines: args.sourceLines, startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })) {
        args.setEditing(false)
        args.setSessionEditLineRange(null)
        return
      }
      args.onReplaceLineRange({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines })
      args.setEditing(false)
      args.setSessionEditLineRange(null)
      return
    }
    const selection = args.getSelectionOffsets()
    const startOffset = selection?.startOffset ?? 0
    const endOffset = selection?.endOffset ?? 0
    const text = args.getDraft()
    const hashes = '#'.repeat(level) + ' '
    const a = Math.max(0, Math.min(text.length, startOffset))
    const b = Math.max(0, Math.min(text.length, endOffset))
    const startLineIdx = (() => { const i = text.lastIndexOf('\n', a - 1); return i < 0 ? 0 : i + 1 })()
    const endLineIdx = (() => { const i = text.indexOf('\n', b); return i < 0 ? text.length : i })()
    const block = text.slice(startLineIdx, endLineIdx)
    const lines = block.split('\n')
    const allHave = lines.every(l => !l.trim() || l.startsWith(hashes))
    const nextLines = lines.map(l => {
      if (!l.trim()) return l
      if (allHave) return l.startsWith(hashes) ? l.slice(hashes.length) : l
      return l.replace(/^#{1,6}\s+/, hashes).startsWith(hashes) ? l.replace(/^#{1,6}\s+/, hashes) : `${hashes}${l}`
    })
    const nextBlock = nextLines.join('\n')
    const nextText = text.slice(0, startLineIdx) + nextBlock + text.slice(endLineIdx)
    const delta = nextBlock.length - block.length
    args.setDraftToDom(nextText, { startOffset, endOffset: endOffset + delta })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const applyColor = React.useCallback((color: string) => {
    if (args.editorPresentation === 'html') {
      args.restoreCachedHtmlSelection()
      args.applySigilToHtmlSelection({ color })
      return
    }
    const sel = args.readSelectionOffsetsForFormatting()
    const startOffset = sel?.startOffset ?? 0
    const endOffset = sel?.endOffset ?? 0
    if (startOffset === endOffset) return
    const text = args.getDraft()
    const start = Math.min(startOffset, endOffset)
    const end = Math.max(startOffset, endOffset)
    const selected = text.slice(start, end)
    const unwrapped = unwrapDefaultHighlight(selected)
    const parsed = parseMarkdownSigil(unwrapped.text)
    const nextSelected = buildMarkdownSigil({ text: parsed ? parsed.text : unwrapped.text, color, background: parsed?.background ?? null })
    const wrappedSelected = unwrapped.wrapped ? `==${nextSelected}==` : nextSelected
    const nextText = `${text.slice(0, start)}${wrappedSelected}${text.slice(end)}`
    const nextStart = start + (unwrapped.wrapped ? 2 : 0)
    args.setDraftToDom(nextText, { startOffset: nextStart, endOffset: nextStart + nextSelected.length })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const applyHighlightColor = React.useCallback((color: string) => {
    if (args.editorPresentation === 'html') {
      args.restoreCachedHtmlSelection()
      args.applySigilToHtmlSelection({ background: color })
      return
    }
    const sel = args.readSelectionOffsetsForFormatting()
    const startOffset = sel?.startOffset ?? 0
    const endOffset = sel?.endOffset ?? 0
    if (startOffset === endOffset) return
    const text = args.getDraft()
    const start = Math.min(startOffset, endOffset)
    const end = Math.max(startOffset, endOffset)
    const selected = text.slice(start, end)
    const unwrapped = unwrapDefaultHighlight(selected)
    const parsed = parseMarkdownSigil(unwrapped.text)
    const nextSelected = buildMarkdownSigil({ text: parsed ? parsed.text : unwrapped.text, color: parsed?.color ?? null, background: color })
    const wrappedSelected = unwrapped.wrapped ? `==${nextSelected}==` : nextSelected
    const nextText = `${text.slice(0, start)}${wrappedSelected}${text.slice(end)}`
    const nextStart = start + (unwrapped.wrapped ? 2 : 0)
    args.setDraftToDom(nextText, { startOffset: nextStart, endOffset: nextStart + nextSelected.length })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const applyChecklist = React.useCallback(() => {
    if (args.editorPresentation === 'html') {
      args.restoreCachedHtmlSelection()
      applyHtmlStructuralMutation(({ draft, selection }) => {
        const startOffset = selection?.startOffset ?? 0
        const endOffset = selection?.endOffset ?? 0
        const start = Math.min(startOffset, endOffset)
        const end = Math.max(startOffset, endOffset)
        const lineStart = (() => { const idx = draft.lastIndexOf('\n', start - 1); return idx < 0 ? 0 : idx + 1 })()
        const lineEnd = (() => { const idx = draft.indexOf('\n', end); return idx < 0 ? draft.length : idx })()
        const block = draft.slice(lineStart, lineEnd)
        const lines = block.split('\n')
        const allChecklist = lines.every(line => !line.trim() || /^- \[( |x|X)\] /.test(line))
        const nextLines = lines.map(line => !line.trim() ? line : allChecklist ? line.replace(/^- \[( |x|X)\] /, '') : (/^- /.test(line) ? line.replace(/^- /, '- [ ] ') : `- [ ] ${line}`))
        const nextBlock = nextLines.join('\n')
        return `${draft.slice(0, lineStart)}${nextBlock}${draft.slice(lineEnd)}`
      })
      return
    }
    const selection = args.getSelectionOffsets()
    const startOffset = selection?.startOffset ?? 0
    const endOffset = selection?.endOffset ?? 0
    const text = args.getDraft()
    const start = Math.min(startOffset, endOffset)
    const end = Math.max(startOffset, endOffset)
    const lineStart = (() => { const idx = text.lastIndexOf('\n', start - 1); return idx < 0 ? 0 : idx + 1 })()
    const lineEnd = (() => { const idx = text.indexOf('\n', end); return idx < 0 ? text.length : idx })()
    const block = text.slice(lineStart, lineEnd)
    const lines = block.split('\n')
    const allChecklist = lines.every(line => !line.trim() || /^- \[( |x|X)\] /.test(line))
    const nextLines = lines.map(line => !line.trim() ? line : allChecklist ? line.replace(/^- \[( |x|X)\] /, '') : (/^- /.test(line) ? line.replace(/^- /, '- [ ] ') : `- [ ] ${line}`))
    const nextBlock = nextLines.join('\n')
    const nextText = `${text.slice(0, lineStart)}${nextBlock}${text.slice(lineEnd)}`
    args.setDraftToDom(nextText, { startOffset, endOffset: endOffset + (nextBlock.length - block.length) })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [applyHtmlStructuralMutation, args])

  const applyDivider = React.useCallback(() => {
    if (args.editorPresentation === 'html') {
      args.restoreCachedHtmlSelection()
      applyHtmlStructuralMutation(({ draft, selection }) => {
        const startOffset = selection?.startOffset ?? 0
        const lineEnd = (() => { const idx = draft.indexOf('\n', startOffset); return idx < 0 ? draft.length : idx })()
        const insert = `${lineEnd > 0 && draft[lineEnd - 1] !== '\n' ? '\n' : ''}\n---\n`
        return `${draft.slice(0, lineEnd)}${insert}${draft.slice(lineEnd)}`
      })
      return
    }
    const selection = args.getSelectionOffsets()
    const startOffset = selection?.startOffset ?? 0
    const text = args.getDraft()
    const lineEnd = (() => { const idx = text.indexOf('\n', startOffset); return idx < 0 ? text.length : idx })()
    const insert = `${lineEnd > 0 && text[lineEnd - 1] !== '\n' ? '\n' : ''}\n---\n`
    const nextText = `${text.slice(0, lineEnd)}${insert}${text.slice(lineEnd)}`
    const cursor = lineEnd + insert.length
    args.setDraftToDom(nextText, { startOffset: cursor, endOffset: cursor })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [applyHtmlStructuralMutation, args])

  const applyClearFormatting = React.useCallback(() => {
    if (args.editorPresentation === 'html') {
      args.clearHtmlFormattingSelection()
      return
    }
    const sel = args.getSelectionOffsets()
    const startOffset = sel?.startOffset ?? 0
    const endOffset = sel?.endOffset ?? 0
    if (startOffset === endOffset) return
    const text = args.getDraft()
    const start = Math.min(startOffset, endOffset)
    const end = Math.max(startOffset, endOffset)
    let selected = text.slice(start, end)
    selected = selected.replace(/^\*\*([\s\S]*?)\*\*$/g, '$1').replace(/^\*([\s\S]*?)\*$/g, '$1').replace(/^~~([\s\S]*?)~~$/g, '$1').replace(/^`([\s\S]*?)`$/g, '$1')
    selected = selected.replace(/^`(#[0-9a-fA-F]{6})?(\|?bg#[0-9a-fA-F]{6})?:(.+)`$/g, '$3').replace(/^==`(#[0-9a-fA-F]{6})?(\|?bg#[0-9a-fA-F]{6})?:(.+)`==$/g, '$3').replace(/^==([\s\S]*?)==$/g, '$1')
    selected = selected.replace(/^<u>([\s\S]*?)<\/u>$/gi, '$1').replace(/^<mark>([\s\S]*?)<\/mark>$/gi, '$1').replace(/^<span[^>]*>([\s\S]*?)<\/span>$/gi, '$1').replace(/^\[([\s\S]*?)\]\((?:[^)]*)\)$/g, '$1')
    args.setDraftToDom(`${text.slice(0, start)}${selected}${text.slice(end)}`, { startOffset: start, endOffset: start + selected.length })
    queueMicrotask(() => args.editorRef.current?.focus())
  }, [args])

  const handleDuplicate = React.useCallback(() => {
    if (!args.editable || !args.onReplaceLineRange) return
    if (args.editorPresentation === 'html') {
      void (async () => {
        const draft = await args.readCurrentMarkdownDraft()
        const replacementLines = args.buildReplacementLinesFromDraft(draft || '')
        args.onReplaceLineRange?.({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines: [...replacementLines, ...replacementLines] })
        args.setEditing(false)
        args.setSessionEditLineRange(null)
      })()
      return
    }
    const replacementLines = args.buildReplacementLinesFromDraft(args.getDraft() || '')
    args.onReplaceLineRange({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines: [...replacementLines, ...replacementLines] })
    args.setEditing(false)
    args.setSessionEditLineRange(null)
  }, [args])

  const handleDelete = React.useCallback(() => {
    if (!args.editable || !args.onReplaceLineRange) return
    args.onReplaceLineRange({ startLine: args.editStartLine, endLine: args.editEndLine, replacementLines: [] })
    args.setEditing(false)
    args.setSessionEditLineRange(null)
  }, [args])

  return {
    applyDraftAction,
    applyWrap,
    applyTurnInto,
    applyAlign,
    applyToggleHeading,
    applyColor,
    applyHighlightColor,
    applyChecklist,
    applyDivider,
    applyClearFormatting,
    handleDuplicate,
    handleDelete,
  }
}
