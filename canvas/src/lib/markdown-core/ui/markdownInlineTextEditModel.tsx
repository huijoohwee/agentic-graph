import type React from 'react'
import { pendingViewerSelections, scheduleMarkdownInlineSelectionFrame } from './markdownInlineSelectionFrame'
import { getMarkdownItFastHtml } from '@/features/markdown/markdownIt'
import { normalizeEscapedInlineMediaMarkdown } from '@/features/markdown/ui/inlineMediaMarkdown'
import {
  INLINE_MEDIA_EDIT_TOKEN_SELECTOR,
  INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR,
  INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR,
  INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_SELECTOR,
  getInlineMediaEditorMarkdownSelectionOffsets,
  readInlineMarkdownEditTokenMarkdown,
  readInlineMediaEditorMarkdownText,
  rewriteRenderedInlineMediaForEditorHtml,
} from '@/lib/markdown-core/ui/markdownBlockContainerCore.inlineMediaEditHtml'
import { readFastInlineMarkdownDraft } from '@/lib/markdown-core/ui/markdownBlockContainerCore.inlineDraftSerialization'
import {
  applyMarkdownContentEditableSelection,
  readMarkdownContentEditableCaretRangeFromPoint,
  type MarkdownContentEditablePoint,
} from '@/lib/markdown-core/ui/markdownContentEditableSurface'
import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  normalizeCardInlineMediaSoftLineBreaks,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { readCardInlineTextProjectedMediaChipPresentation } from '@/lib/cards/cardInlineTextProjectedMediaChipPresentation'
import {
  INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME,
  readInlineMediaCommandThumbnailClassName,
} from '@/lib/command-menu/InlineMediaCommandThumbnail'
import { sourceContainsInlineMediaUrl } from '@/lib/command-menu/inlineMediaUrlIdentity'
import {
  collectTextareaInvocationMediaAttachmentCandidateChips,
  readTextareaInvocationMediaReferenceKey,
  TEXTAREA_INVOCATION_MEDIA_BOUNDARY,
  type TextareaInvocationMediaAttachment,
  type TextareaInvocationProjectedMediaChip,
} from '@/lib/ui/textareaInvocationProjection'

const CARD_INLINE_TEXT_VIEWER_VIRTUAL_MEDIA_CHIP_ATTRIBUTE = 'data-kg-card-inline-wysiwyg-virtual-media-chip'
const CARD_INLINE_TEXT_VIEWER_MEDIA_MARKDOWN_ATTRIBUTE = 'data-kg-card-inline-wysiwyg-media-markdown'
const CARD_INLINE_TEXT_ATOMIC_MEDIA_TOKEN_SELECTOR = [
  `[${CARD_INLINE_TEXT_VIEWER_VIRTUAL_MEDIA_CHIP_ATTRIBUTE}="1"]`,
  INLINE_MEDIA_EDIT_TOKEN_SELECTOR,
  '[data-kg-inline-source-binding-edit-token="1"]',
].join(',')

type MarkdownInlineTextMediaChipMatch = {
  chip: TextareaInvocationProjectedMediaChip
  chipIndex: number
  label: string
  start: number
  end: number
}
type MarkdownInlineTextEditSegment =
  | { kind: 'text'; value: string }
  | {
    kind: 'media'
    chip: TextareaInvocationProjectedMediaChip
    markdown: string | null
    prefixGap: boolean
  }

export function deleteMarkdownInlineTextAtomicMediaToken(args: {
  root: HTMLElement | null
  value: string
  selection: { start: number; end: number }
  direction: 'backward' | 'forward'
}): { value: string; cursor: number } | null {
  if (!args.root) return null
  const value = String(args.value || '').replace(/\r/g, '')
  const selectionStart = Math.max(0, Math.min(value.length, Math.min(args.selection.start, args.selection.end)))
  const selectionEnd = Math.max(selectionStart, Math.min(value.length, Math.max(args.selection.start, args.selection.end)))
  const tokens = Array.from(args.root.querySelectorAll(CARD_INLINE_TEXT_ATOMIC_MEDIA_TOKEN_SELECTOR))
  let searchFrom = 0
  for (const token of tokens) {
    const markdown = String(
      token.getAttribute(CARD_INLINE_TEXT_VIEWER_MEDIA_MARKDOWN_ATTRIBUTE)
      || readInlineMarkdownEditTokenMarkdown(token),
    ).replace(/\r/g, '').trim()
    if (!markdown) continue
    const tokenStart = value.indexOf(markdown, searchFrom)
    if (tokenStart < 0) continue
    const tokenEnd = tokenStart + markdown.length
    searchFrom = tokenEnd
    if (selectionStart !== selectionEnd) {
      if (selectionStart >= tokenEnd || selectionEnd <= tokenStart) continue
      return {
        value: `${value.slice(0, Math.min(selectionStart, tokenStart))}${value.slice(Math.max(selectionEnd, tokenEnd))}`,
        cursor: Math.min(selectionStart, tokenStart),
      }
    }
    if (args.direction === 'backward') {
      const gap = value.slice(tokenEnd, selectionStart)
      if (tokenEnd <= selectionStart && gap.length <= 1 && /^\s*$/.test(gap)) {
        return {
          value: `${value.slice(0, tokenStart)}${value.slice(selectionStart)}`,
          cursor: tokenStart,
        }
      }
      const gapBeforeTrailingToken = value.slice(selectionStart, tokenStart)
      if (
        tokenStart >= selectionStart
        && gapBeforeTrailingToken.length <= 1
        && /^\s*$/.test(gapBeforeTrailingToken)
        && /^\s*$/.test(value.slice(tokenEnd))
      ) {
        return {
          value: `${value.slice(0, selectionStart)}${value.slice(tokenEnd)}`,
          cursor: selectionStart,
        }
      }
      continue
    }
    const gap = value.slice(selectionStart, tokenStart)
    if (tokenStart < selectionStart || gap.length > 1 || !/^\s*$/.test(gap)) continue
    return {
      value: `${value.slice(0, selectionStart)}${value.slice(tokenEnd)}`,
      cursor: selectionStart,
    }
  }
  return null
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeHtmlAttr = (value: unknown): string =>
  escapeHtml(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function readProjectedMediaChipLabels(chip: TextareaInvocationProjectedMediaChip): string[] {
  const labels = new Set<string>()
  const displayLabel = String(chip.displayLabel || '').trim()
  if (displayLabel) labels.add(displayLabel)
  const label = String(chip.label || '').trim()
  if (label) labels.add(label.startsWith('@') ? label : `@${label}`)
  return Array.from(labels).sort((a, b) => b.length - a.length)
}

const isProjectedMediaLabelStartBoundary = (value: string, index: number): boolean =>
  index <= 0 || /[\s([{]/.test(value[index - 1] || '')

const isProjectedMediaLabelEndBoundary = (value: string, index: number): boolean =>
  index >= value.length || /[\s.,;:!?)}\]]/.test(value[index] || '')

function findExactProjectedMediaChipMatch(args: {
  source: string
  cursor: number
  chips: readonly TextareaInvocationProjectedMediaChip[]
}): MarkdownInlineTextMediaChipMatch | null {
  let best: MarkdownInlineTextMediaChipMatch | null = null
  args.chips.forEach((chip, chipIndex) => {
    readProjectedMediaChipLabels(chip).forEach(label => {
      let searchIndex = args.cursor
      for (;;) {
        const start = args.source.indexOf(label, searchIndex)
        if (start < 0) break
        const end = start + label.length
        if (isProjectedMediaLabelStartBoundary(args.source, start) && isProjectedMediaLabelEndBoundary(args.source, end)) {
          if (
            !best
            || start < best.start
            || (start === best.start && label.length > best.label.length)
          ) {
            best = { chip, chipIndex, label, start, end }
          }
          break
        }
        searchIndex = start + 1
      }
    })
  })
  return best
}

function findKeyedProjectedMediaChipMatch(args: {
  source: string
  cursor: number
  chips: readonly TextareaInvocationProjectedMediaChip[]
}): MarkdownInlineTextMediaChipMatch | null {
  const chipKeys = args.chips.map(chip => new Set(
    readProjectedMediaChipLabels(chip)
      .map(readTextareaInvocationMediaReferenceKey)
      .filter(key => key.length >= 8),
  ))
  if (!chipKeys.some(keys => keys.size > 0)) return null
  const tokenPattern = /@[\p{L}\p{N}_][\p{L}\p{N}_.-]*[\p{L}\p{N}]/gu
  tokenPattern.lastIndex = Math.max(0, args.cursor)
  for (;;) {
    const match = tokenPattern.exec(args.source)
    if (!match) return null
    const label = String(match[0] || '')
    const start = match.index
    const end = start + label.length
    if (!isProjectedMediaLabelStartBoundary(args.source, start) || !isProjectedMediaLabelEndBoundary(args.source, end)) continue
    const key = readTextareaInvocationMediaReferenceKey(label)
    const chipIndex = chipKeys.findIndex(keys => keys.has(key))
    if (chipIndex < 0) continue
    const chip = args.chips[chipIndex]
    if (!chip) continue
    return { chip, chipIndex, label, start, end }
  }
}

export function findProjectedMediaChipMatch(args: {
  source: string
  cursor: number
  chips: readonly TextareaInvocationProjectedMediaChip[]
}): MarkdownInlineTextMediaChipMatch | null {
  const exact = findExactProjectedMediaChipMatch(args)
  const keyed = findKeyedProjectedMediaChipMatch(args)
  if (!exact) return keyed
  if (!keyed) return exact
  if (exact.start < keyed.start) return exact
  if (keyed.start < exact.start) return keyed
  return exact.label.length >= keyed.label.length ? exact : keyed
}

function buildMarkdownInlineTextEditSegments(args: {
  value: string
  projectedMediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
  appendMissingProjectedMediaKeys?: ReadonlySet<string> | null
}): MarkdownInlineTextEditSegment[] {
  const source = String(args.value || '').replace(/\r/g, '')
  const virtualChips = collectTextareaInvocationMediaAttachmentCandidateChips(args.projectedMediaAttachments)
  if (!virtualChips.length) return [{ kind: 'text', value: source }]
  const segments: MarkdownInlineTextEditSegment[] = []
  const matchedChipIndexes = new Set<number>()
  let cursor = 0
  for (;;) {
    const match = findProjectedMediaChipMatch({ source, cursor, chips: virtualChips })
    if (!match) break
    if (match.start > cursor) segments.push({ kind: 'text', value: source.slice(cursor, match.start) })
    segments.push({
      kind: 'media',
      chip: match.chip,
      markdown: match.label,
      prefixGap: false,
    })
    matchedChipIndexes.add(match.chipIndex)
    cursor = match.end
  }
  if (cursor < source.length) segments.push({ kind: 'text', value: source.slice(cursor) })
  virtualChips.forEach((chip, chipIndex) => {
    if (matchedChipIndexes.has(chipIndex)) return
    const key = readTextareaInvocationMediaReferenceKey(chip.displayLabel || chip.label)
    if (args.appendMissingProjectedMediaKeys && !args.appendMissingProjectedMediaKeys.has(key)) return
    segments.push({
      kind: 'media',
      chip,
      markdown: null,
      prefixGap: segments.length > 0,
    })
  })
  return segments.length ? segments : [{ kind: 'text', value: source }]
}

function normalizeVirtualMediaDraftSpacing(value: string): string {
  return String(value ?? '').replace(/\r/g, '')
}

function buildVirtualMediaChipHtml(args: {
  label: string
  markdown?: string | null
  mediaKind: string
  prefixGap: boolean
  sourceUrl?: string
  thumbnailUrl?: string
}): string {
  const presentation = readCardInlineTextProjectedMediaChipPresentation({
    displayLabel: args.label,
    mediaKind: args.mediaKind as TextareaInvocationProjectedMediaChip['mediaKind'],
    sourceUrl: args.sourceUrl,
    thumbnailUrl: args.thumbnailUrl,
  })
  const className = presentation.className
  const markdown = String(args.markdown || '').trim()
  const thumbnailClassName = readInlineMediaCommandThumbnailClassName({
    hasThumbnail: !!presentation.thumbnailUrl,
    kind: args.mediaKind as TextareaInvocationProjectedMediaChip['mediaKind'],
    variant: 'inline',
  })
  const thumbnailHtml = presentation.thumbnailUrl
    ? `<img src="${escapeHtmlAttr(presentation.thumbnailUrl)}" alt="" class="${escapeHtmlAttr(INLINE_MEDIA_COMMAND_THUMBNAIL_IMAGE_CLASS_NAME)}" loading="lazy" decoding="async" draggable="false"/>`
    : ''
  return [
    args.prefixGap ? escapeHtml(TEXTAREA_INVOCATION_MEDIA_BOUNDARY) : '',
    `<span class="${escapeHtmlAttr(className)}"`,
    ` ${CARD_INLINE_TEXT_VIEWER_VIRTUAL_MEDIA_CHIP_ATTRIBUTE}="1"`,
    markdown ? ` ${CARD_INLINE_TEXT_VIEWER_MEDIA_MARKDOWN_ATTRIBUTE}="${escapeHtmlAttr(markdown)}"` : ` ${INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_ATTR}="1"`,
    ' contenteditable="false"',
    ` title="${escapeHtmlAttr(presentation.title)}">`,
    `<span aria-label="${escapeHtmlAttr(presentation.mediaLabel)}" class="inline-flex" data-kg-card-inline-display-media-thumbnail="1" data-kg-card-inline-wysiwyg-media-thumbnail="1">`,
    `<span class="${escapeHtmlAttr(thumbnailClassName)}" aria-label="${escapeHtmlAttr(presentation.mediaLabel)}" data-kg-inline-command-thumbnail="${escapeHtmlAttr(args.mediaKind)}" role="img">${thumbnailHtml}</span>`,
    '</span>',
    `<span class="${escapeHtmlAttr(CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME)}">${escapeHtml(args.label)}</span>`,
    '</span>',
  ].join('')
}

export function buildMarkdownInlineTextEditHtml(args: {
  value: string
  inlineChipDensity?: 'regular' | 'compact'
  projectedMediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
  appendMissingProjectedMediaKeys?: ReadonlySet<string> | null
}): string {
  const markdownIt = getMarkdownItFastHtml()
  const renderTextSegment = (value: string): string => normalizeEscapedInlineMediaMarkdown(value)
    .split(/\n/g)
    .map((line, index) => `${index > 0 ? '<br/>' : ''}${line ? markdownIt.renderInline(line) : ''}`)
    .join('')
  const value = args.inlineChipDensity === 'compact'
    ? normalizeCardInlineMediaSoftLineBreaks(args.value).replace(/^\n+|\n+$/g, '')
    : args.value
  return buildMarkdownInlineTextEditSegments({ ...args, value })
    .map(segment => segment.kind === 'text'
      ? rewriteRenderedInlineMediaForEditorHtml(renderTextSegment(segment.value))
      : buildVirtualMediaChipHtml({
        label: segment.chip.displayLabel,
        markdown: segment.markdown,
        mediaKind: segment.chip.mediaKind,
        prefixGap: segment.prefixGap,
        sourceUrl: segment.chip.sourceUrl,
        thumbnailUrl: segment.chip.thumbnailUrl,
      }))
    .join('')
}

export function readMarkdownInlineTextEditDraft(
  root: HTMLElement | null,
): string {
  if (!root) return ''
  const workingRoot = root.cloneNode(true) as HTMLElement
  const virtualChips = Array.from(workingRoot.querySelectorAll(`[${CARD_INLINE_TEXT_VIEWER_VIRTUAL_MEDIA_CHIP_ATTRIBUTE}="1"]`))
  virtualChips.forEach(node => {
    const markdown = String(node.getAttribute(CARD_INLINE_TEXT_VIEWER_MEDIA_MARKDOWN_ATTRIBUTE) || '').trim()
    if (!markdown) {
      const previous = node.previousSibling
      if (previous?.nodeType === 3 && String(previous.nodeValue || '').endsWith(TEXTAREA_INVOCATION_MEDIA_BOUNDARY)) {
        previous.nodeValue = String(previous.nodeValue || '').slice(0, -TEXTAREA_INVOCATION_MEDIA_BOUNDARY.length)
      }
    }
    node.replaceWith(workingRoot.ownerDocument.createTextNode(markdown))
  })
  const markdown = readFastInlineMarkdownDraft(workingRoot, 'inline')
  const draft = String(markdown ?? readInlineMediaEditorMarkdownText(workingRoot) ?? '').replace(/\r/g, '')
  return virtualChips.length ? normalizeVirtualMediaDraftSpacing(draft) : draft
}

type MarkdownInlineTextSelectionBoundary = {
  node: Node
  offset: number
}

function readElementChildBoundary(element: Element, child: Node, after: boolean): MarkdownInlineTextSelectionBoundary {
  const parent = child.parentNode || element
  return {
    node: parent,
    offset: Math.max(0, Array.from(parent.childNodes as NodeListOf<Node>).indexOf(child) + (after ? 1 : 0)),
  }
}

function readTokenMarkdownLength(element: Element): number {
  const projectedMediaMarkdown = String(element.getAttribute(CARD_INLINE_TEXT_VIEWER_MEDIA_MARKDOWN_ATTRIBUTE) || '').trim()
  if (projectedMediaMarkdown) return projectedMediaMarkdown.length
  if (element.matches(INLINE_MARKDOWN_EDIT_TOKEN_SELECTOR)) {
    return readInlineMarkdownEditTokenMarkdown(element).length
  }
  return 0
}

function isZeroLengthTokenElement(element: Element): boolean {
  return element.matches(INLINE_MARKDOWN_ZERO_LENGTH_TOKEN_SELECTOR)
}

function findSelectionBoundary(root: HTMLElement, targetOffset: number): MarkdownInlineTextSelectionBoundary {
  const target = Math.max(0, targetOffset)
  const ownerNode = root.ownerDocument.defaultView?.Node
  const textNodeType = ownerNode?.TEXT_NODE ?? 3
  const elementNodeType = ownerNode?.ELEMENT_NODE ?? 1
  let markdownOffset = 0
  let fallback: MarkdownInlineTextSelectionBoundary = { node: root, offset: root.childNodes.length }
  const visit = (node: Node): MarkdownInlineTextSelectionBoundary | null => {
    if (node.nodeType === textNodeType) {
      const text = String(node.nodeValue || '').replace(/\r/g, '')
      const nextOffset = markdownOffset + text.length
      if (target <= nextOffset) {
        return { node, offset: Math.max(0, Math.min(text.length, target - markdownOffset)) }
      }
      markdownOffset = nextOffset
      fallback = { node, offset: text.length }
      return null
    }
    if (node.nodeType !== elementNodeType) return null
    const element = node as HTMLElement
    const tag = String(element.tagName || '').toLowerCase()
    if (isZeroLengthTokenElement(element)) {
      if (target <= markdownOffset) return readElementChildBoundary(root, element, false)
      fallback = readElementChildBoundary(root, element, true)
      return null
    }
    const tokenLength = readTokenMarkdownLength(element)
    if (tokenLength > 0) {
      const nextOffset = markdownOffset + tokenLength
      if (target <= markdownOffset) return readElementChildBoundary(root, element, false)
      if (target <= nextOffset) return readElementChildBoundary(root, element, true)
      markdownOffset = nextOffset
      fallback = readElementChildBoundary(root, element, true)
      return null
    }
    if (tag === 'br') {
      const nextOffset = markdownOffset + 1
      if (target <= nextOffset) return readElementChildBoundary(root, element, true)
      markdownOffset = nextOffset
      fallback = readElementChildBoundary(root, element, true)
      return null
    }
    for (const child of Array.from(element.childNodes)) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  for (const child of Array.from(root.childNodes)) {
    const found = visit(child)
    if (found) return found
  }
  return fallback
}

export function focusMarkdownInlineTextSelectionSoon(
  editorRef: React.RefObject<HTMLElement | null>,
  start: number,
  end: number = start,
) {
  const pendingRoot = editorRef.current
  const pendingSelection = {
    start: Math.max(0, start),
    end: Math.max(0, end),
  }
  if (pendingRoot) pendingViewerSelections.set(pendingRoot, pendingSelection)
  scheduleMarkdownInlineSelectionFrame(editorRef, () => {
    const root = editorRef.current
    if (!root) return
    const range = root.ownerDocument.createRange()
    const startBoundary = findSelectionBoundary(root, pendingSelection.start)
    const endBoundary = findSelectionBoundary(root, pendingSelection.end)
    range.setStart(startBoundary.node, startBoundary.offset)
    range.setEnd(endBoundary.node, endBoundary.offset)
    applyMarkdownContentEditableSelection(root, range)
  })
}

export function focusMarkdownInlineTextSelectionAtPointSoon(
  editorRef: React.RefObject<HTMLElement | null>,
  point: MarkdownContentEditablePoint,
  fallbackStart: number,
  fallbackEnd: number = fallbackStart,
  onApplied?: () => void,
) {
  scheduleMarkdownInlineSelectionFrame(editorRef, () => {
    const root = editorRef.current
    if (!root) return
    const rangeAtPoint = readMarkdownContentEditableCaretRangeFromPoint(root, point).range
    const range = rangeAtPoint || root.ownerDocument.createRange()
    if (!rangeAtPoint) {
      const startBoundary = findSelectionBoundary(root, Math.max(0, fallbackStart))
      const endBoundary = findSelectionBoundary(root, Math.max(0, fallbackEnd))
      range.setStart(startBoundary.node, startBoundary.offset)
      range.setEnd(endBoundary.node, endBoundary.offset)
    } else {
      range.collapse(true)
    }
    applyMarkdownContentEditableSelection(root, range)
    onApplied?.()
  })
}

