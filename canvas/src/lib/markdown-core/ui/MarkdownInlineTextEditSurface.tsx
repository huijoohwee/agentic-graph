import React from 'react'
import { pendingViewerSelections } from './markdownInlineSelectionFrame'
import {
  buildMarkdownInlineTextEditHtml,
  deleteMarkdownInlineTextAtomicMediaToken,
  findProjectedMediaChipMatch,
  focusMarkdownInlineTextSelectionAtPointSoon,
  focusMarkdownInlineTextSelectionSoon,
  readMarkdownInlineTextEditDraft,
} from './markdownInlineTextEditModel'
export {
  buildMarkdownInlineTextEditHtml,
  deleteMarkdownInlineTextAtomicMediaToken,
  focusMarkdownInlineTextSelectionAtPointSoon,
  focusMarkdownInlineTextSelectionSoon,
  readMarkdownInlineTextEditDraft,
} from './markdownInlineTextEditModel'
import {
  MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS,
  MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS,
} from '@/features/markdown/ui/markdownEditSurfaceLayout'
import { getInlineMediaEditorMarkdownSelectionOffsets } from './markdownBlockContainerCore.inlineMediaEditHtml'
import { MarkdownContentEditableCore } from './MarkdownContentEditableCore'
import type { MarkdownContentEditablePoint } from './markdownContentEditableSurface'
import { sourceContainsInlineMediaUrl } from '@/lib/command-menu/inlineMediaUrlIdentity'
import {
  collectTextareaInvocationMediaAttachmentCandidateChips,
  readTextareaInvocationMediaReferenceKey,
  type TextareaInvocationMediaAttachment,
} from '@/lib/ui/textareaInvocationProjection'
import { cn } from '@/lib/utils'

export function MarkdownInlineTextEditSurface(props: {
  value: string
  ariaLabel: string
  placeholder: string
  className?: string
  commandMode: unknown
  enableMarkdownCommandMenus?: boolean
  editorRef: React.RefObject<HTMLElement | null>
  inlineChipDensity?: 'regular' | 'compact'
  inputProxyRef: React.RefObject<HTMLTextAreaElement | null>
  initialSelectionPointRef?: React.MutableRefObject<MarkdownContentEditablePoint | null>
  multiline?: boolean
  projectedMediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
  isCommandMenuTarget: (target: EventTarget | null) => boolean
  onCancel: () => void
  onCommit: (nextValue?: string) => void
  onDraftChange: (nextValue: string) => void
  onFocus: () => void
  onSelectionChange?: (selection: { start: number; end: number }) => void
  onOpenCommandMenuForSigilAtSelection: (sigil: '/' | '@' | '#', selection: { start: number; end: number }) => void
  readCommandSigilFromKeyEvent: (event: KeyboardEvent) => '/' | '@' | '#' | null
  readCommandSigilFromInsertedText: (value: string | null | undefined) => '/' | '@' | '#' | null
  cardInlineEditInputAttribute: string
}) {
  const domDirtyRef = React.useRef(false)
  const hasRenderedRef = React.useRef(false)
  const latestDraftRef = React.useRef(String(props.value || '').replace(/\r/g, ''))
  const initialProjectedSourceRef = React.useRef(String(props.value || '').replace(/\r/g, ''))
  const appendMissingProjectedMediaKeys = React.useMemo(() => new Set(
    collectTextareaInvocationMediaAttachmentCandidateChips(props.projectedMediaAttachments)
      .filter(chip => !sourceContainsInlineMediaUrl(initialProjectedSourceRef.current, chip.sourceUrl) && !findProjectedMediaChipMatch({
        source: initialProjectedSourceRef.current, cursor: 0, chips: [chip],
      }))
      .map(chip => readTextareaInvocationMediaReferenceKey(chip.displayLabel || chip.label)),
  ), [props.projectedMediaAttachments])
  const showPlaceholder = !String(props.value || '').trim()

  const readSelection = React.useCallback(() => {
    const root = props.editorRef.current
    const selection = getInlineMediaEditorMarkdownSelectionOffsets(root)
    if (selection) return { start: selection.startOffset, end: selection.endOffset }
    const fallback = readMarkdownInlineTextEditDraft(root).length
    return { start: fallback, end: fallback }
  }, [props.editorRef])

  const syncProxySelection = React.useCallback(() => {
    const input = props.inputProxyRef.current
    if (!input) return
    const offsets = getInlineMediaEditorMarkdownSelectionOffsets(props.editorRef.current)
    if (!offsets) return
    const selection = { start: offsets.startOffset, end: offsets.endOffset }
    props.onSelectionChange?.(selection)
    try {
      input.setSelectionRange(selection.start, selection.end)
    } catch {
      void 0
    }
  }, [props.editorRef, props.inputProxyRef, props.onSelectionChange])

  const publishDraftFromDom = React.useCallback(() => {
    const root = props.editorRef.current
    if (!domDirtyRef.current) {
      const next = latestDraftRef.current
      props.onDraftChange(next)
      syncProxySelection()
      return next
    }
    const next = readMarkdownInlineTextEditDraft(root)
    domDirtyRef.current = false
    latestDraftRef.current = next
    props.onDraftChange(next)
    syncProxySelection()
    return next
  }, [props, syncProxySelection])

  React.useLayoutEffect(() => {
    const root = props.editorRef.current
    if (!root) return
    const value = String(props.value || '').replace(/\r/g, '')
    latestDraftRef.current = value
    const pendingSelection = pendingViewerSelections.get(root)
    const ownerSelection = root.ownerDocument.defaultView?.getSelection()
    const ownsSelection = !!ownerSelection
      && ownerSelection.rangeCount > 0
      && root.contains(ownerSelection.anchorNode)
      && root.contains(ownerSelection.focusNode)
    const selectionBeforeRender = pendingSelection || (ownsSelection ? readSelection() : null)
    const html = buildMarkdownInlineTextEditHtml({
      value,
      inlineChipDensity: props.inlineChipDensity,
      projectedMediaAttachments: props.projectedMediaAttachments,
      appendMissingProjectedMediaKeys,
    })
    const isFirstRender = !hasRenderedRef.current
    const htmlMatches = root.innerHTML === html
    if (!htmlMatches) {
      root.innerHTML = html
    }
    domDirtyRef.current = false
    hasRenderedRef.current = true
    if (htmlMatches && !isFirstRender) return
    const pendingPoint = isFirstRender && !selectionBeforeRender ? props.initialSelectionPointRef?.current || null : null
    if (pendingPoint && props.initialSelectionPointRef) props.initialSelectionPointRef.current = null
    const nextSelection = selectionBeforeRender || (!pendingPoint && isFirstRender ? { start: value.length, end: value.length } : null)
    if (pendingPoint) {
      focusMarkdownInlineTextSelectionAtPointSoon(props.editorRef, pendingPoint, value.length, value.length, syncProxySelection)
    } else if (nextSelection) {
      focusMarkdownInlineTextSelectionSoon(props.editorRef, nextSelection.start, nextSelection.end)
    }
  }, [appendMissingProjectedMediaKeys, props.editorRef, props.inlineChipDensity, props.initialSelectionPointRef, props.projectedMediaAttachments, props.value, readSelection, syncProxySelection])

  return (
    <section className="relative h-full min-h-0 w-full" data-kg-card-inline-viewer-edit-shell="1">
      <MarkdownContentEditableCore
        as="section"
        editorRef={props.editorRef}
        ariaLabel={props.ariaLabel}
        ariaMultiline={props.multiline}
        placeholder={props.placeholder}
        showPlaceholder={showPlaceholder}
        className={cn(
          MARKDOWN_NORMAL_TEXT_EDIT_SURFACE_CLASS,
          MARKDOWN_TEXT_EDIT_SURFACE_MIN_LINE_HEIGHT_CLASS,
          'relative z-10 min-h-0 w-full',
          '[overflow-wrap:anywhere] [caret-color:var(--kg-text-primary)]',
          props.className,
        )}
        data-kg-card-inline-chip-density={props.inlineChipDensity === 'compact' ? 'compact' : undefined}
        data-kg-card-inline-viewer-edit-surface="1"
        {...{ [props.cardInlineEditInputAttribute]: '1' }}
        onBeforeInput={event => {
          const nativeEvent = event.nativeEvent as InputEvent
          if (!props.multiline && (nativeEvent.inputType === 'insertParagraph' || nativeEvent.inputType === 'insertLineBreak')) {
            event.preventDefault()
            props.onCommit(publishDraftFromDom())
            return
          }
          if (props.commandMode || !props.enableMarkdownCommandMenus) return
          if (nativeEvent.inputType !== 'insertText') return
          const sigil = props.readCommandSigilFromInsertedText(nativeEvent.data)
          if (!sigil) return
          event.preventDefault()
          props.onOpenCommandMenuForSigilAtSelection(sigil, readSelection())
        }}
        onInput={() => {
          domDirtyRef.current = true
          publishDraftFromDom()
        }}
        onFocus={() => {
          props.onFocus()
          syncProxySelection()
        }}
        onBlur={event => {
          if (props.isCommandMenuTarget(event.relatedTarget)) return
          if (props.commandMode) return
          props.onCommit(publishDraftFromDom())
        }}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onCancel()
            return
          }
          const sigil = props.enableMarkdownCommandMenus ? props.readCommandSigilFromKeyEvent(event.nativeEvent) : null
          if (sigil) {
            event.preventDefault()
            props.onOpenCommandMenuForSigilAtSelection(sigil, readSelection())
            return
          }
          if (event.key === 'Backspace' || event.key === 'Delete') {
            const deletion = deleteMarkdownInlineTextAtomicMediaToken({
              root: props.editorRef.current,
              value: latestDraftRef.current,
              selection: readSelection(),
              direction: event.key === 'Backspace' ? 'backward' : 'forward',
            })
            if (deletion) {
              event.preventDefault()
              domDirtyRef.current = false
              latestDraftRef.current = deletion.value
              props.onDraftChange(deletion.value)
              focusMarkdownInlineTextSelectionSoon(props.editorRef, deletion.cursor)
              return
            }
          }
          if (event.key === 'Enter' && (!props.multiline || event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            props.onCommit(publishDraftFromDom())
          }
        }}
        onMouseUp={syncProxySelection}
        onKeyUp={syncProxySelection}
      />
      <textarea
        ref={props.inputProxyRef}
        value={props.value}
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        data-kg-card-inline-viewer-edit-command-proxy="1"
      />
    </section>
  )
}
