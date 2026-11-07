import React from 'react'
import { InlineMediaCommandThumbnail } from '@/lib/command-menu/InlineMediaCommandThumbnail'
import type { InlineMediaKind } from '@/lib/command-menu/inlineCommandMenuCatalog'
import { collectFloatingPanelChatMediaTokens } from '@/lib/ui/textareaMediaTokens'
import { splitInvocationTokenSegments, type InvocationTokenKind } from '@/lib/markdown/invocationTokens'
import { buildAgenticOsInvocationChipAttrs } from '@/features/agentic-os/agenticOsInvocationChips'
import {
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME,
  CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME,
} from '@/lib/cards/cardMarkdownPreviewUtils'
import { collectTextareaInvocationSourceBindings } from '@/lib/ui/textareaInvocationSourceBindings'
import { renderTextareaInvocationProjectionMetricText, renderTextareaInvocationVisibleTokenText } from '@/lib/ui/textareaInvocationProjectionRender'
import { UI_INLINE_CHIP_SHELL_15CH_CLASSNAME } from '@/lib/ui/textLayout'
import {
  normalizeMediaProjectionUrlKey,
  projectTextareaInvocationMediaToken,
  readMediaAttachmentLabel,
  readTextareaInvocationMediaDisplayLabelFromLabel,
  sourceContainsTextareaInvocationMediaReference,
  TEXTAREA_INVOCATION_MEDIA_BOUNDARY,
  type TextareaInvocationMediaAttachment,
  type TextareaInvocationProjectedMediaChip,
} from '@/lib/ui/textareaInvocationProjectionMedia'
import {
  readComposerInvocationChipClassName,
  readComposerInvocationSourceTitle,
} from '@/lib/ui/textareaInvocationProjectionInvocation'

export { readTextareaInvocationProjectionTextClassName } from '@/lib/ui/textareaInvocationProjectionLayout'
export {
  collectTextareaInvocationMediaAttachmentCandidateChips,
  readTextareaInvocationMediaReferenceKey,
  TEXTAREA_INVOCATION_MEDIA_BOUNDARY,
  type TextareaInvocationMediaAttachment,
  type TextareaInvocationProjectedMediaChip,
} from '@/lib/ui/textareaInvocationProjectionMedia'

type ChatComposerTextPart = { kind: 'text'; text: string }
type TextareaInvocationProjectionOptions = {
  mediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
  projectInvocationTokens?: boolean
}
type ChatComposerMediaPart = {
  kind: 'media'
  raw: string
  mediaKind: InlineMediaKind
  label: string
  sourceUrl?: string
  thumbnailUrl?: string
  virtual?: boolean
  prefixBoundary?: boolean
}
type ChatComposerSourceBindingPart = { kind: 'source-binding'; raw: string; label: string; sourceUrl: string }
type ChatComposerMediaProjectionPart = ChatComposerTextPart | ChatComposerMediaPart | ChatComposerSourceBindingPart
type ChatComposerInvocationMetricKind = InvocationTokenKind
type ChatComposerInvocationMetricPart = { kind: 'invocation'; tokenKind: ChatComposerInvocationMetricKind; text: string; displayText: string }
type ChatComposerDisplayPart =
  | (ChatComposerTextPart & { displayText: string })
  | (ChatComposerMediaPart & { displayText: string })
  | (ChatComposerSourceBindingPart & { displayText: string })
type ChatComposerOverlayPart = ChatComposerDisplayPart | ChatComposerInvocationMetricPart
type TextareaInvocationProjectionSelectionRange = { start: number; end: number }
type TextareaInvocationProjectedCaret = {
  offset: number
  partIndex: number
}

export const FLOATING_PANEL_CHAT_COMPOSER_PROJECTED_LAYOUT_CLASS_NAME =
  'kg-floating-chat-composer-projected leading-6 [--kg-multiline-text-input-editor-height:6.75rem] [--kg-multiline-text-input-editor-min-height:6.75rem]'
export const TEXTAREA_INVOCATION_PROJECTED_LAYOUT_CLASS_NAME = 'kg-floating-chat-composer-projected'
const FLOATING_PANEL_CHAT_COMPOSER_VISIBLE_INVOCATION_CHIP_CLASS_NAME =
  'absolute left-0 top-1/2 w-full max-w-full -translate-y-1/2 !border-0 !px-0 shadow-[inset_0_0_0_1px_var(--kg-border)]'
const FLOATING_PANEL_CHAT_COMPOSER_INVOCATION_METRIC_CLASS_NAME =
  `relative inline-block overflow-hidden align-baseline [--kg-inline-chip-shell-extra:0px] ${UI_INLINE_CHIP_SHELL_15CH_CLASSNAME}`
const TEXTAREA_INVOCATION_OVERLAY_BASE_CLASS_NAME =
  'pointer-events-none absolute inset-0 z-10 overflow-hidden whitespace-pre-wrap break-words'

function readMediaProjectionDedupeKey(part: Pick<ChatComposerMediaPart, 'label' | 'mediaKind' | 'raw' | 'sourceUrl' | 'thumbnailUrl'>): string {
  const sourceKey = normalizeMediaProjectionUrlKey(part.sourceUrl || part.thumbnailUrl || part.raw)
  if (sourceKey) return `${part.mediaKind}:${sourceKey}`
  return `${part.mediaKind}:label:${String(part.label || '').trim().toLowerCase()}`
}

function appendTextareaInvocationMediaAttachments(
  parts: ChatComposerMediaProjectionPart[],
  attachments: readonly TextareaInvocationMediaAttachment[] | null | undefined,
  source: string,
): void {
  if (!attachments?.length) return
  const seen = new Set(parts.flatMap(part => part.kind === 'media' ? [readMediaProjectionDedupeKey(part)] : []))
  for (const attachment of attachments) {
    const sourceUrl = String(attachment.sourceUrl || '').trim()
    if (!sourceUrl) continue
    if (sourceContainsTextareaInvocationMediaReference(source, attachment)) continue
    const label = readMediaAttachmentLabel(attachment)
    const lastPart = parts[parts.length - 1]
    const mediaPart: ChatComposerMediaPart = {
      kind: 'media',
      raw: '',
      mediaKind: attachment.mediaKind,
      label,
      sourceUrl,
      thumbnailUrl: String(attachment.thumbnailUrl || '').trim() || undefined,
      virtual: true,
      prefixBoundary: parts.length > 0 && !(lastPart?.kind === 'text' && /\s$/.test(lastPart.text)),
    }
    const dedupeKey = readMediaProjectionDedupeKey(mediaPart)
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    parts.push(mediaPart)
  }
}

export function buildFloatingPanelChatComposerMediaParts(
  text: string,
  options: TextareaInvocationProjectionOptions = {},
): { hasMedia: boolean; parts: ChatComposerMediaProjectionPart[] } {
  const source = String(text || '')
  const matches = [
    ...collectFloatingPanelChatMediaTokens(source).map(match => ({
        ...projectTextareaInvocationMediaToken(match, options.mediaAttachments),
        end: match.index + match.raw.length,
        projectionKind: 'media' as const,
      })),
    ...collectTextareaInvocationSourceBindings(source).map(match => ({ ...match, projectionKind: 'source-binding' as const })),
  ].sort((a, b) => a.index - b.index || a.end - b.end)
  const parts: ChatComposerMediaProjectionPart[] = []
  let cursor = 0
  for (const match of matches) {
    if (match.index < cursor) continue
    if (match.index > cursor) parts.push({ kind: 'text', text: source.slice(cursor, match.index) })
    parts.push(match.projectionKind === 'media'
      ? { kind: 'media', raw: match.raw, mediaKind: match.mediaKind, label: match.label, sourceUrl: match.sourceUrl, thumbnailUrl: match.thumbnailUrl }
      : { kind: 'source-binding', raw: match.raw, label: match.label, sourceUrl: match.sourceUrl })
    cursor = match.end
  }
  if (cursor < source.length) parts.push({ kind: 'text', text: source.slice(cursor) })
  appendTextareaInvocationMediaAttachments(parts, options.mediaAttachments, source)
  return { hasMedia: parts.some(part => part.kind === 'media'), parts: parts.length ? parts : [{ kind: 'text', text: source }] }
}

function shouldAddMediaDisplayBoundary(parts: ChatComposerMediaProjectionPart[], index: number): boolean {
  const next = parts[index + 1]
  return !next || (next.kind === 'text' && next.text.length > 0 && !/^\s/.test(next.text))
}

function readMediaDisplayText(parts: ChatComposerMediaProjectionPart[], index: number): string {
  const part = parts[index]
  if (!part || part.kind !== 'media') return ''
  const label = readMediaDisplayLabel(part)
  const prefix = part.prefixBoundary ? TEXTAREA_INVOCATION_MEDIA_BOUNDARY : ''
  return shouldAddMediaDisplayBoundary(parts, index) ? `${prefix}${label}${TEXTAREA_INVOCATION_MEDIA_BOUNDARY}` : `${prefix}${label}`
}

function readMediaDisplayLabel(part: ChatComposerMediaPart): string {
  return readTextareaInvocationMediaDisplayLabelFromLabel(part.label)
}

function buildFloatingPanelChatComposerDisplayParts(
  text: string,
  options: TextareaInvocationProjectionOptions = {},
): { hasMedia: boolean; hasSourceBinding: boolean; parts: ChatComposerDisplayPart[] } {
  const projection = buildFloatingPanelChatComposerMediaParts(text, options)
  return {
    hasMedia: projection.hasMedia,
    hasSourceBinding: projection.parts.some(part => part.kind === 'source-binding'),
    parts: projection.parts.map((part, index) => part.kind === 'media'
      ? { ...part, displayText: readMediaDisplayText(projection.parts, index) }
      : part.kind === 'source-binding' ? { ...part, displayText: `@${part.label}` }
      : { ...part, displayText: part.text }),
  }
}

export function buildFloatingPanelChatComposerOverlayParts(
  text: string,
  options: TextareaInvocationProjectionOptions = {},
): { hasMedia: boolean; hasOverlay: boolean; parts: ChatComposerOverlayPart[] } {
  const projection = buildFloatingPanelChatComposerDisplayParts(text, options)
  const projectInvocationTokens = options.projectInvocationTokens !== false
  const parts = projection.parts.flatMap(part => (projectInvocationTokens && part.kind === 'text')
    ? splitComposerInvocationMetricParts(part.text)
    : [part])
  const hasInvocationChips = parts.some(part => part.kind === 'invocation')
  return {
    hasMedia: projection.hasMedia,
    hasOverlay: projection.hasMedia || projection.hasSourceBinding || hasInvocationChips,
    parts,
  }
}

function shouldProjectComposerInvocationMetric(tokenKind: InvocationTokenKind): tokenKind is ChatComposerInvocationMetricKind {
  return tokenKind === 'slash' || tokenKind === 'keyword' || tokenKind === 'binding'
}

function splitComposerInvocationMetricParts(text: string): ChatComposerOverlayPart[] {
  const segments = splitInvocationTokenSegments(text)
  return segments.map(segment => {
    if (segment.kind === 'text') return { kind: 'text', text: segment.value, displayText: segment.value }
    if (!shouldProjectComposerInvocationMetric(segment.tokenKind)) return { kind: 'text', text: segment.value, displayText: segment.value }
    return {
      kind: 'invocation',
      tokenKind: segment.tokenKind,
      text: segment.value,
      displayText: segment.value,
    }
  })
}

export function buildFloatingPanelChatComposerDisplayText(
  text: string,
  options: TextareaInvocationProjectionOptions = {},
): string {
  return buildFloatingPanelChatComposerDisplayParts(text, options).parts.map(part => part.displayText).join('')
}

export function collectTextareaInvocationProjectedMediaChips(
  text: string,
  options: TextareaInvocationProjectionOptions = {},
): TextareaInvocationProjectedMediaChip[] {
  return buildFloatingPanelChatComposerDisplayParts(text, options).parts.flatMap(part => part.kind === 'media'
    ? [{
      mediaKind: part.mediaKind,
      label: part.label,
      displayLabel: readMediaDisplayLabel(part),
      sourceUrl: part.sourceUrl,
      thumbnailUrl: part.thumbnailUrl,
      virtual: part.virtual === true,
    }]
    : [])
}

export function resolveFloatingPanelChatComposerRawText(
  displayText: string,
  previousRawText: string,
  options: TextareaInvocationProjectionOptions = {},
): string {
  const projection = buildFloatingPanelChatComposerDisplayParts(previousRawText, options)
  if (!projection.hasMedia && !projection.hasSourceBinding) return displayText
  const previousDisplayText = projection.parts.map(part => part.displayText).join('')
  if (displayText === previousDisplayText) return previousRawText
  let stableCursor = 0
  let stableRawText = ''
  let stableProjection = true
  for (const part of projection.parts) {
    if (part.kind === 'text') continue
    const displayLabel = part.kind === 'media' ? readMediaDisplayLabel(part) : part.displayText
    const fullIndex = displayText.indexOf(part.displayText, stableCursor)
    const labelIndex = fullIndex >= 0 ? -1 : displayText.indexOf(displayLabel, stableCursor)
    if (fullIndex < 0 && labelIndex < 0) {
      stableProjection = false
      break
    }
    const index = fullIndex >= 0 ? fullIndex : labelIndex
    const displayEnd = fullIndex >= 0 ? fullIndex + part.displayText.length : labelIndex + displayLabel.length
    stableRawText += displayText.slice(stableCursor, index)
    if (part.kind === 'source-binding' || !part.virtual) stableRawText += part.raw
    stableCursor = displayEnd
    if (part.kind === 'media' && part.displayText.endsWith(TEXTAREA_INVOCATION_MEDIA_BOUNDARY) && displayText[stableCursor] === TEXTAREA_INVOCATION_MEDIA_BOUNDARY) {
      if (!part.virtual) stableRawText += TEXTAREA_INVOCATION_MEDIA_BOUNDARY
      stableCursor += TEXTAREA_INVOCATION_MEDIA_BOUNDARY.length
    } else if (part.kind === 'media' && fullIndex >= 0 && part.displayText.endsWith(TEXTAREA_INVOCATION_MEDIA_BOUNDARY) && !part.virtual) {
      stableRawText += TEXTAREA_INVOCATION_MEDIA_BOUNDARY
    }
  }
  if (stableProjection) return stableRawText + displayText.slice(stableCursor)
  let prefixLength = 0
  const sharedLength = Math.min(displayText.length, previousDisplayText.length)
  while (prefixLength < sharedLength && displayText[prefixLength] === previousDisplayText[prefixLength]) prefixLength += 1
  let nextSuffixStart = displayText.length
  let previousSuffixStart = previousDisplayText.length
  while (nextSuffixStart > prefixLength && previousSuffixStart > prefixLength && displayText[nextSuffixStart - 1] === previousDisplayText[previousSuffixStart - 1]) {
    nextSuffixStart -= 1
    previousSuffixStart -= 1
  }
  const rawStart = mapFloatingPanelChatComposerDisplayIndexToRawIndex(previousRawText, prefixLength, options)
  const rawEnd = mapFloatingPanelChatComposerDisplayIndexToRawIndex(previousRawText, previousSuffixStart, options)
  return `${previousRawText.slice(0, rawStart)}${displayText.slice(prefixLength, nextSuffixStart)}${previousRawText.slice(rawEnd)}`
}

export function mapFloatingPanelChatComposerRawIndexToDisplayIndex(
  text: string,
  rawIndex: number,
  options: TextareaInvocationProjectionOptions = {},
): number {
  const projection = buildFloatingPanelChatComposerDisplayParts(text, options)
  let rawCursor = 0
  let displayCursor = 0
  for (const part of projection.parts) {
    const rawLength = part.kind === 'text' ? part.text.length : part.raw.length
    const displayLength = part.displayText.length
    if (rawIndex <= rawCursor + rawLength) {
      if (part.kind !== 'text') return displayCursor + displayLength
      return displayCursor + Math.max(0, rawIndex - rawCursor)
    }
    rawCursor += rawLength
    displayCursor += displayLength
  }
  return displayCursor
}

export function mapFloatingPanelChatComposerDisplayIndexToRawIndex(
  text: string,
  displayIndex: number,
  options: TextareaInvocationProjectionOptions = {},
): number {
  const projection = buildFloatingPanelChatComposerDisplayParts(text, options)
  let rawCursor = 0
  let displayCursor = 0
  for (const part of projection.parts) {
    const rawLength = part.kind === 'text' ? part.text.length : part.raw.length
    const displayLength = part.displayText.length
    if (displayIndex <= displayCursor + displayLength) {
      if (part.kind !== 'text') return rawCursor + rawLength
      return rawCursor + Math.max(0, displayIndex - displayCursor)
    }
    rawCursor += rawLength
    displayCursor += displayLength
  }
  return rawCursor
}

function readComposerOverlayPartDisplayText(part: ChatComposerOverlayPart): string {
  return part.kind === 'text' ? part.text : part.displayText
}

function readComposerMediaSource(part: ChatComposerMediaPart): string {
  return [
    `${part.label} - ${part.mediaKind}`,
    `Source: ${part.sourceUrl || part.raw}`,
  ].join('\n')
}

function renderComposerInvocationChipWithCaret(part: ChatComposerInvocationMetricPart, key: string, caretOffset: number | null): React.ReactNode {
  const className = readComposerInvocationChipClassName(part)
  const sourceTitle = readComposerInvocationSourceTitle(part)
  const agenticAttrs = buildAgenticOsInvocationChipAttrs(part.text) || {}
  const metricAttrs = {
    'data-kg-chat-input-invocation-kind': part.tokenKind,
    'data-kg-chat-input-invocation-metric': 'preserve',
    'data-kg-chat-input-invocation-token': part.text,
  }
  const chipAttrs = {
    ...agenticAttrs,
    'data-kg-chat-input-invocation-chip': part.tokenKind,
    'data-kg-chat-input-invocation-kind': part.tokenKind,
    'data-kg-chat-input-invocation-source': sourceTitle,
    'data-kg-chat-input-invocation-token': part.text,
  }
  const children = renderTextareaInvocationVisibleTokenText(part.displayText)
  return (
    <span
      key={key}
      className={FLOATING_PANEL_CHAT_COMPOSER_INVOCATION_METRIC_CLASS_NAME}
      {...metricAttrs}
    >
      {renderTextareaInvocationProjectionMetricText({
        caretKind: part.tokenKind,
        caretOffset,
        caretToken: part.text,
        className: 'whitespace-pre text-transparent',
        displayText: part.displayText,
      })}
      <span
        aria-label={sourceTitle}
        className={`${className} ${FLOATING_PANEL_CHAT_COMPOSER_VISIBLE_INVOCATION_CHIP_CLASS_NAME}`}
        title={sourceTitle}
        data-kg-card-inline-keyword-pill="1"
        {...chipAttrs}
      >
        {children}
      </span>
    </span>
  )
}

function renderComposerSourceBindingChipWithCaret(part: ChatComposerSourceBindingPart & { displayText: string }, key: string, caretOffset: number | null): React.ReactNode {
  const sourceTitle = `${part.displayText}\nSource: ${part.sourceUrl}`
  return (
    <span key={key} className={FLOATING_PANEL_CHAT_COMPOSER_INVOCATION_METRIC_CLASS_NAME} data-kg-chat-input-source-binding-metric="preserve">
      {renderTextareaInvocationProjectionMetricText({
        caretKind: 'source-binding', caretOffset, caretToken: part.displayText,
        className: 'whitespace-pre text-transparent', displayText: part.displayText,
      })}
      <span
        aria-label={sourceTitle}
        className={`${readComposerInvocationChipClassName({ text: part.displayText })} ${FLOATING_PANEL_CHAT_COMPOSER_VISIBLE_INVOCATION_CHIP_CLASS_NAME}`}
        title={sourceTitle}
        data-kg-card-inline-keyword-pill="1"
        data-kg-chat-input-source-binding-chip="1"
        data-kg-chat-input-source-binding-source={part.sourceUrl}
        data-kg-chat-input-source-binding-token={part.displayText}
      >
        {renderTextareaInvocationVisibleTokenText(part.displayText)}
      </span>
    </span>
  )
}

function mapFloatingPanelChatComposerOverlayDisplayIndexToRawIndex(
  text: string,
  displayIndex: number,
  options: TextareaInvocationProjectionOptions = {},
): number {
  const projection = buildFloatingPanelChatComposerOverlayParts(text, options)
  let rawCursor = 0
  let displayCursor = 0
  for (const part of projection.parts) {
    const rawLength = part.kind === 'media' || part.kind === 'source-binding' ? part.raw.length : readComposerOverlayPartDisplayText(part).length
    const displayLength = readComposerOverlayPartDisplayText(part).length
    if (displayIndex <= displayCursor + displayLength) {
      if (part.kind === 'media' || part.kind === 'source-binding') return rawCursor + rawLength
      return rawCursor + Math.max(0, displayIndex - displayCursor)
    }
    rawCursor += rawLength
    displayCursor += displayLength
  }
  return rawCursor
}

export function isFloatingPanelChatComposerProjectedCaretInsideChip(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  options: TextareaInvocationProjectionOptions = {},
): boolean {
  return readFloatingPanelChatComposerProjectedCaret(text, { start: selectionStart, end: selectionEnd }, options) != null
}

export function resolveFloatingPanelChatComposerProjectedCaretEnd(
  text: string,
  displayCursor: number,
  options: TextareaInvocationProjectionOptions = {},
): number | null {
  const projection = buildFloatingPanelChatComposerOverlayParts(text, options)
  let partStart = 0
  for (const part of projection.parts) {
    const partEnd = partStart + readComposerOverlayPartDisplayText(part).length
    const isChip = part.kind === 'media' || part.kind === 'source-binding' || part.kind === 'invocation'
    if (isChip && displayCursor > partStart && displayCursor < partEnd) return partEnd
    partStart = partEnd
  }
  return null
}

function readFloatingPanelChatComposerProjectedCaret(
  text: string,
  selectionRange?: TextareaInvocationProjectionSelectionRange | null,
  options: TextareaInvocationProjectionOptions = {},
): TextareaInvocationProjectedCaret | null {
  if (!selectionRange || selectionRange.start !== selectionRange.end) return null
  const projection = buildFloatingPanelChatComposerOverlayParts(text, options)
  if (!projection.hasOverlay) return null
  const displayText = projection.parts.map(readComposerOverlayPartDisplayText).join('')
  const cursor = Math.max(0, Math.min(displayText.length, Number.isFinite(selectionRange.start) ? Math.floor(selectionRange.start) : displayText.length))
  let displayCursor = 0
  for (const [partIndex, part] of projection.parts.entries()) {
    const displayPartText = readComposerOverlayPartDisplayText(part)
    const displayEnd = displayCursor + displayPartText.length
    const isProjectedChip = part.kind === 'media' || part.kind === 'source-binding' || part.kind === 'invocation'
    if (isProjectedChip && cursor >= displayCursor && cursor <= displayEnd) {
      return { partIndex, offset: cursor - displayCursor }
    }
    if (isProjectedChip && cursor > displayEnd && cursor <= displayEnd + 1 && /^\s*$/.test(displayText.slice(displayEnd, cursor))) {
      return { partIndex, offset: displayPartText.length }
    }
    displayCursor = displayEnd
  }
  return null
}

export function deleteFloatingPanelChatComposerProjectedTokenDisplayRange(args: {
  text: string
  selectionStart: number
  selectionEnd: number
  direction: 'backward' | 'forward'
  mediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
}): { text: string; cursor: number } | null {
  const text = String(args.text || '')
  const projection = buildFloatingPanelChatComposerOverlayParts(text, { mediaAttachments: args.mediaAttachments })
  if (!projection.hasOverlay) return null
  const displayText = projection.parts.map(readComposerOverlayPartDisplayText).join('')
  const rawSelectionStart = Number.isFinite(args.selectionStart) ? Math.floor(args.selectionStart) : displayText.length
  const rawSelectionEnd = Number.isFinite(args.selectionEnd) ? Math.floor(args.selectionEnd) : rawSelectionStart
  const selectionStart = Math.max(0, Math.min(displayText.length, rawSelectionStart))
  const selectionEnd = Math.max(selectionStart, Math.min(displayText.length, rawSelectionEnd))
  const rangeStart = selectionStart === selectionEnd
    ? args.direction === 'backward'
      ? Math.max(0, selectionStart - 1)
      : selectionStart
    : selectionStart
  const rangeEnd = selectionStart === selectionEnd
    ? args.direction === 'backward'
      ? selectionStart
      : Math.min(displayText.length, selectionEnd + 1)
    : selectionEnd
  if (rangeStart === rangeEnd) return null
  const mappedRangeStart = mapFloatingPanelChatComposerOverlayDisplayIndexToRawIndex(text, rangeStart, { mediaAttachments: args.mediaAttachments })
  const mappedRangeEnd = mapFloatingPanelChatComposerOverlayDisplayIndexToRawIndex(text, rangeEnd, { mediaAttachments: args.mediaAttachments })
  let rawCursor = 0
  let displayCursor = 0
  for (const part of projection.parts) {
    const displayPartText = readComposerOverlayPartDisplayText(part)
    const rawLength = part.kind === 'media' || part.kind === 'source-binding' ? part.raw.length : displayPartText.length
    const displayLength = displayPartText.length
    const rawStart = rawCursor
    const rawEnd = rawCursor + rawLength
    const displayStart = displayCursor
    const displayEnd = displayCursor + displayLength
    rawCursor = rawEnd
    displayCursor = displayEnd
    if (part.kind === 'text' || part.kind === 'invocation' || (part.kind === 'media' && part.virtual)) continue
    const intersectsToken = rangeStart < displayEnd && rangeEnd > displayStart
    const deletesWhitespaceAfterToken = selectionStart === selectionEnd && args.direction === 'backward' && rangeStart === displayEnd && /\s/.test(displayText.slice(rangeStart, rangeEnd))
    const deletesWhitespaceBeforeToken = selectionStart === selectionEnd && args.direction === 'forward' && rangeEnd === displayStart && /\s/.test(displayText.slice(rangeStart, rangeEnd))
    if (!intersectsToken && !deletesWhitespaceAfterToken && !deletesWhitespaceBeforeToken) continue
    const deleteRawStart = Math.min(rawStart, mappedRangeStart)
    const deleteRawEnd = Math.max(rawEnd, mappedRangeEnd)
    return {
      text: `${text.slice(0, deleteRawStart)}${text.slice(deleteRawEnd)}`,
      cursor: displayStart,
    }
  }
  return null
}

export function FloatingPanelChatComposerMediaOverlay(props: {
  input: string
  uiPanelTextFontClass: string
  overlayChromeClassName?: string
  mediaAttachments?: readonly TextareaInvocationMediaAttachment[] | null
  projectInvocationTokens?: boolean
  projectedLayoutClassName?: string
  projectedSelectionRange?: TextareaInvocationProjectionSelectionRange | null
  showProjectedCaret?: boolean
  overlayRef?: React.Ref<HTMLElement>
}) {
  const projection = React.useMemo(
    () => buildFloatingPanelChatComposerOverlayParts(props.input, {
      mediaAttachments: props.mediaAttachments,
      projectInvocationTokens: props.projectInvocationTokens,
    }),
    [props.input, props.mediaAttachments, props.projectInvocationTokens],
  )
  if (!projection.hasOverlay) return null
  const overlayChromeClassName = props.overlayChromeClassName ?? 'px-2 py-1'
  const projectedLayoutClassName = props.projectedLayoutClassName ?? FLOATING_PANEL_CHAT_COMPOSER_PROJECTED_LAYOUT_CLASS_NAME
  const projectedCaret = props.showProjectedCaret
    ? readFloatingPanelChatComposerProjectedCaret(props.input, props.projectedSelectionRange, {
      mediaAttachments: props.mediaAttachments,
      projectInvocationTokens: props.projectInvocationTokens,
    })
    : null
  return (
    <section
      aria-hidden="true"
      ref={props.overlayRef}
      className={[
        TEXTAREA_INVOCATION_OVERLAY_BASE_CLASS_NAME,
        overlayChromeClassName,
        props.uiPanelTextFontClass,
        projectedLayoutClassName,
      ].filter(Boolean).join(' ')}
      data-kg-chat-input-overlay="1"
      data-kg-chat-input-media-overlay={projection.hasMedia ? '1' : undefined}
    >
      {projection.parts.map((part, index) => part.kind === 'media' ? (
          <span
            key={`media-${index}`}
            className="relative inline-block max-w-full align-baseline text-transparent"
            data-kg-chat-input-media-metric="preserve"
            data-kg-chat-input-media-token={readMediaDisplayLabel(part)}
          >
            {renderTextareaInvocationProjectionMetricText({
              caretKind: 'media',
              caretOffset: projectedCaret?.partIndex === index ? projectedCaret.offset : null,
              caretToken: readMediaDisplayLabel(part),
              className: 'whitespace-pre',
              displayText: part.displayText,
            })}
            <span
              className={`pointer-events-none absolute left-0 top-1/2 w-full max-w-full -translate-y-1/2 cursor-text overflow-hidden bg-[color:var(--kg-panel-bg)] shadow-none ${CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_PILL_CLASS_NAME} !mr-0 align-baseline`}
              data-kg-chat-input-media-chip="1"
              data-kg-chat-input-media-source={part.sourceUrl || part.raw}
              title={readComposerMediaSource(part)}
            >
              <InlineMediaCommandThumbnail kind={part.mediaKind} thumbnailUrl={part.thumbnailUrl} variant="inline" />
              <span className={CARD_MARKDOWN_PREVIEW_INLINE_MEDIA_LABEL_CLASS_NAME}>{readMediaDisplayLabel(part)}</span>
            </span>
          </span>
      ) : part.kind === 'invocation'
        ? renderComposerInvocationChipWithCaret(part, `invocation-${index}`, projectedCaret?.partIndex === index ? projectedCaret.offset : null)
        : part.kind === 'source-binding'
          ? renderComposerSourceBindingChipWithCaret(part, `source-binding-${index}`, projectedCaret?.partIndex === index ? projectedCaret.offset : null)
        : <React.Fragment key={`text-${index}`}>{part.text}</React.Fragment>)}
    </section>
  )
}
