import React from 'react'
import { collectKeywordEvidence, KEYWORD_TEXT_LIMIT } from '@/lib/semantic-mode/keywordEvidence'

export type TextSelectionMatchHighlightRect = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export type TextSelectionMatchQuery = {
  text: string
  searchText: string
  range: Range
  textStartOffset?: number | null
  textEndOffset?: number | null
}

const MIN_SELECTION_MATCH_CHARS = 2
const MAX_SELECTION_MATCH_CHARS = 160
const MAX_SELECTION_MATCH_RECTS = 300

type TextSegment = {
  node: Text
  start: number
  end: number
  text: string
}

type NormalizedTextIndex = {
  text: string
  rawOffsets: number[]
}

export const normalizeSelectionMatchText = (raw: string): string =>
  String(raw || '').replace(/\s+/g, ' ').trim()

const buildNormalizedTextIndex = (segments: TextSegment[]): NormalizedTextIndex => {
  let text = ''
  const rawOffsets: number[] = []
  let pendingSpaceOffset: number | null = null

  for (const segment of segments) {
    const segmentText = String(segment.text || '')
    for (let i = 0; i < segmentText.length; i += 1) {
      const rawOffset = segment.start + i
      const char = segmentText[i] || ''
      if (/\s/.test(char)) {
        if (text.length > 0 && pendingSpaceOffset === null) {
          pendingSpaceOffset = rawOffset
        }
        continue
      }
      if (pendingSpaceOffset !== null && text.length > 0) {
        text += ' '
        rawOffsets.push(pendingSpaceOffset)
        pendingSpaceOffset = null
      }
      text += char
      rawOffsets.push(rawOffset)
    }
  }

  return { text, rawOffsets }
}

const readRawRangeForNormalizedMatch = (
  index: NormalizedTextIndex,
  startOffset: number,
  endOffset: number,
): { start: number; end: number } | null => {
  if (startOffset < 0 || endOffset <= startOffset) return null
  const rawStart = index.rawOffsets[startOffset]
  const rawLast = index.rawOffsets[endOffset - 1]
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawLast)) return null
  return { start: rawStart, end: rawLast + 1 }
}

const isSelectionMatchIgnoredElement = (el: Element | null): boolean => {
  if (!el) return false
  const tagName = el.tagName.toLowerCase()
  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') return true
  if (tagName === 'textarea' || tagName === 'input' || tagName === 'select' || tagName === 'button') return true
  if (el.getAttribute('aria-hidden') === 'true') return true
  if (el.getAttribute('contenteditable') === 'true') return true
  if (el.hasAttribute('data-kg-selection-match-ignore')) return true
  if (el.hasAttribute('data-kg-selection-match-overlay')) return true
  return false
}

const shouldSkipTextNode = (node: Text, root: HTMLElement): boolean => {
  const text = String(node.nodeValue || '')
  if (!text) return true
  let el = node.parentElement
  while (el && el !== root) {
    if (isSelectionMatchIgnoredElement(el)) return true
    el = el.parentElement
  }
  return false
}

const collectTextSegments = (root: HTMLElement, phrase = false): TextSegment[] => {
  const doc = root.ownerDocument
  if (!doc?.createTreeWalker) return []
  const view = doc.defaultView
  const showText = view?.NodeFilter?.SHOW_TEXT ?? 4
  const textNodeType = view?.Node?.TEXT_NODE ?? 3
  const walker = doc.createTreeWalker(root, showText)
  const segments: TextSegment[] = []
  let cursor = 0
  // One lookahead character lets the shared matcher reject a word cut by its scan cap.
  let previousBlock: Element | null = null
  let current = walker.nextNode()
  while (current && (!phrase || cursor < KEYWORD_TEXT_LIMIT + 1)) {
    if (current.nodeType === textNodeType) {
      const node = current as Text
      if (!shouldSkipTextNode(node, root)) {
        const block = node.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,pre,div,section') ?? null
        if (phrase && segments.length && block !== previousBlock) cursor++
        previousBlock = block
        if (phrase && cursor >= KEYWORD_TEXT_LIMIT + 1) break
        const text = String(node.nodeValue || '').slice(0, phrase ? KEYWORD_TEXT_LIMIT + 1 - cursor : undefined)
        segments.push({ node, start: cursor, end: cursor + text.length, text })
        cursor += text.length
      }
    }
    current = walker.nextNode()
  }
  return segments
}

const findSegmentForOffset = (segments: TextSegment[], offset: number, endOffset: boolean): TextSegment | null => {
  for (const segment of segments) {
    if (endOffset) {
      if (offset > segment.start && offset <= segment.end) return segment
    } else if (offset >= segment.start && offset < segment.end) {
      return segment
    }
  }
  return null
}

const readTextOffsetForDomPoint = (segments: TextSegment[], node: Node, offset: number): number | null => {
  if (node.nodeType !== (node.ownerDocument?.defaultView?.Node?.TEXT_NODE ?? 3)) return null
  const segment = segments.find(item => item.node === node)
  if (!segment) return null
  const boundedOffset = Math.max(0, Math.min(String(segment.text || '').length, offset))
  return segment.start + boundedOffset
}

const readRangeTextOffsets = (
  segments: TextSegment[],
  range: Range,
): { start: number; end: number } | null => {
  const start = readTextOffsetForDomPoint(segments, range.startContainer, range.startOffset)
  const end = readTextOffsetForDomPoint(segments, range.endContainer, range.endOffset)
  if (start === null || end === null || end <= start) return null
  return { start, end }
}

const isRangeInsideRoot = (root: HTMLElement, range: Range): boolean => {
  const start = range.startContainer
  const end = range.endContainer
  return root.contains(start) && root.contains(end)
}

const compareDomPoints = (
  doc: Document,
  aNode: Node,
  aOffset: number,
  bNode: Node,
  bOffset: number,
): number => {
  try {
    const rangeCtor = doc.defaultView?.Range
    const startToStart = rangeCtor?.START_TO_START ?? 0
    const aRange = doc.createRange()
    const bRange = doc.createRange()
    aRange.setStart(aNode, aOffset)
    aRange.collapse(true)
    bRange.setStart(bNode, bOffset)
    bRange.collapse(true)
    return aRange.compareBoundaryPoints(startToStart, bRange)
  } catch {
    return 0
  }
}

const rangesIntersect = (a: Range, b: Range): boolean => {
  try {
    const doc = a.startContainer.ownerDocument
    const aStartsBeforeBEnds = compareDomPoints(doc, a.startContainer, a.startOffset, b.endContainer, b.endOffset) < 0
    const bStartsBeforeAEnds = compareDomPoints(doc, b.startContainer, b.startOffset, a.endContainer, a.endOffset) < 0
    return aStartsBeforeBEnds && bStartsBeforeAEnds
  } catch {
    return false
  }
}

const buildRangeForMatch = (
  root: HTMLElement,
  segments: TextSegment[],
  startOffset: number,
  endOffset: number,
): Range | null => {
  const startSegment = findSegmentForOffset(segments, startOffset, false)
  const endSegment = findSegmentForOffset(segments, endOffset, true)
  if (!startSegment || !endSegment) return null
  const range = root.ownerDocument.createRange()
  range.setStart(startSegment.node, startOffset - startSegment.start)
  range.setEnd(endSegment.node, endOffset - endSegment.start)
  return range
}

export const readSelectionMatchQuery = (
  root: HTMLElement | null,
  selection: Selection | null | undefined,
): TextSelectionMatchQuery | null => {
  if (!root || !selection || selection.isCollapsed || selection.rangeCount <= 0) return null
  const rawText = typeof selection.toString === 'function' ? selection.toString() : ''
  const searchText = String(rawText || '').trim()
  const text = normalizeSelectionMatchText(rawText)
  if (text.length < MIN_SELECTION_MATCH_CHARS || text.length > MAX_SELECTION_MATCH_CHARS) return null
  let range: Range | null = null
  try {
    range = selection.getRangeAt(0)
  } catch {
    range = null
  }
  if (!range || range.collapsed || !isRangeInsideRoot(root, range)) return null
  const rangeOffsets = readRangeTextOffsets(collectTextSegments(root), range)
  return {
    text,
    searchText,
    range,
    textStartOffset: rangeOffsets?.start ?? null,
    textEndOffset: rangeOffsets?.end ?? null,
  }
}

/** Range geometry can extend beyond a truncated label even when its glyphs are hidden. */
const clipPhraseRect = (root: HTMLElement, range: Range, rect: DOMRect) => {
  let left = rect.left, right = rect.right, top = rect.top, bottom = rect.bottom
  for (let parent = range.startContainer.parentElement; parent && parent !== root; parent = parent.parentElement) {
    const style = root.ownerDocument.defaultView?.getComputedStyle(parent)
    if (!style) continue
    const clipsX = /hidden|clip|auto|scroll/.test(style.overflowX || style.overflow)
    const clipsY = /hidden|clip|auto|scroll/.test(style.overflowY || style.overflow)
    if (!clipsX && !clipsY) continue
    const bounds = parent.getBoundingClientRect()
    if (clipsX) {
      if (style.textOverflow === 'ellipsis' && (left < bounds.left || right > bounds.right)) return null
      left = Math.max(left, bounds.left); right = Math.min(right, bounds.right)
    }
    if (clipsY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom) }
    if (right <= left || bottom <= top) return null
  }
  return { left, top, width: right - left, height: bottom - top }
}

export const collectTextSelectionMatchHighlightRects = (args: {
  root: HTMLElement
  query?: TextSelectionMatchQuery | null
  phrase?: { text: string; locale: string } | null
  maxRects?: number
}): TextSelectionMatchHighlightRect[] => {
  const { root, query, phrase } = args
  if (!query && !phrase) return []
  const maxRects = Math.min(MAX_SELECTION_MATCH_RECTS, Math.max(1, args.maxRects || MAX_SELECTION_MATCH_RECTS))
  const segments = collectTextSegments(root, !!phrase)
  if (!segments.length) return []
  const searchText = query?.text ?? ''
  const source = phrase ? { text: '', rawOffsets: [] } : buildNormalizedTextIndex(segments)
  const phraseMatches: Array<{ start: number; end: number }> = []
  if (phrase) {
    const text = segments.map((segment, index) => `${index && segment.start > segments[index - 1]!.end ? '\n' : ''}${segment.text}`).join('')
    try {
      collectKeywordEvidence(text, [phrase.text], phrase.locale, (start, end) => {
        if (phraseMatches.length < maxRects) phraseMatches.push({ start, end })
      })
    } catch { return [] }
  }
  const sourceText = source.text
  if (!phrase && (!sourceText || sourceText.length < searchText.length)) return []
  const rootRect = root.getBoundingClientRect()
  const out: TextSelectionMatchHighlightRect[] = []
  let searchFrom = 0
  let matchIndex = 0
  while (out.length < maxRects) {
    let rawRange = phrase ? phraseMatches[matchIndex] : undefined
    if (!phrase) {
      const matchStart = sourceText.indexOf(searchText, searchFrom)
      if (matchStart < 0) break
      const matchEnd = matchStart + searchText.length
      searchFrom = Math.max(matchEnd, matchStart + 1)
      rawRange = readRawRangeForNormalizedMatch(source, matchStart, matchEnd) ?? undefined
    }
    if (!rawRange) break
    matchIndex++
    const matchRange = buildRangeForMatch(root, segments, rawRange.start, rawRange.end)
    if (!matchRange) continue
    if (!phrase && query && rangesIntersect(matchRange, query.range)) continue
    let rectIndex = 0
    const rects = Array.from(matchRange.getClientRects())
    for (const rawRect of rects) {
      const rect = phrase ? clipPhraseRect(root, matchRange, rawRect) : rawRect
      if (!rect) continue
      if (out.length >= maxRects) break
      if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) continue
      if (rect.width <= 0 || rect.height <= 0) continue
      const left = rect.left - rootRect.left + root.scrollLeft - root.clientLeft
      const top = rect.top - rootRect.top + root.scrollTop - root.clientTop
      out.push({
        id: `${matchIndex}:${rectIndex}:${Math.round(left)}:${Math.round(top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`,
        left,
        top,
        width: rect.width,
        height: rect.height,
      })
      rectIndex += 1
    }
  }
  return out
}

const buildHighlightSignature = (query: { text: string } | null, rects: TextSelectionMatchHighlightRect[]): string => {
  if (!query || rects.length <= 0) return ''
  return [
    query.text,
    rects
      .map(rect => `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}`)
      .join(','),
  ].join('|')
}

const scheduleNativeSelectionRestore = (
  root: HTMLElement,
  query: TextSelectionMatchQuery,
  canRestore?: () => boolean,
): void => {
  const doc = root.ownerDocument
  const win = doc.defaultView
  if (!win) return
  let clonedRange: Range | null = null
  try {
    clonedRange = query.range.cloneRange()
  } catch {
    clonedRange = null
  }
  const restore = () => {
    if (canRestore && !canRestore()) return
    if (!root.isConnected) return
    const selection = win.getSelection?.()
    if (!selection) return
    const currentText = normalizeSelectionMatchText(selection.toString?.() || '')
    if (currentText === query.text) return
    if (currentText) return
    const anchorNode = selection.anchorNode
    const focusNode = selection.focusNode
    if (
      (anchorNode && anchorNode.isConnected && !root.contains(anchorNode)) ||
      (focusNode && focusNode.isConnected && !root.contains(focusNode))
    ) return
    let restoreRange: Range | null = null
    if (clonedRange && isRangeInsideRoot(root, clonedRange)) {
      restoreRange = clonedRange
    } else if (
      typeof query.textStartOffset === 'number' &&
      Number.isFinite(query.textStartOffset) &&
      typeof query.textEndOffset === 'number' &&
      Number.isFinite(query.textEndOffset) &&
      query.textEndOffset > query.textStartOffset
    ) {
      restoreRange = buildRangeForMatch(root, collectTextSegments(root), query.textStartOffset, query.textEndOffset)
    }
    if (!restoreRange || restoreRange.collapsed) return
    try {
      selection.removeAllRanges()
      selection.addRange(restoreRange)
    } catch {
      void 0
    }
  }
  const scheduleFrame = typeof win.requestAnimationFrame === 'function'
    ? win.requestAnimationFrame.bind(win)
    : (cb: FrameRequestCallback) => win.setTimeout(() => cb(Date.now()), 0)
  scheduleFrame(() => scheduleFrame(restore))
}

export const useTextSelectionMatchHighlights = (args: {
  rootRef: React.RefObject<HTMLElement | null>
  resetKey?: string
  enabled?: boolean
  phrase?: { text: string; locale: string } | null
}): TextSelectionMatchHighlightRect[] => {
  const { rootRef, resetKey, enabled = true, phrase } = args
  const [state, setState] = React.useState<{ signature: string; rects: TextSelectionMatchHighlightRect[] }>({
    signature: '',
    rects: [],
  })
  const stateSignatureRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!enabled) {
      stateSignatureRef.current = ''
      setState(prev => (prev.signature ? { signature: '', rects: [] } : prev))
      return
    }
    let rafId = 0
    let timerId = 0
    let disposed = false
    let pointerSelecting = false
    let restoreGeneration = 0
    const invalidateRestore = () => {
      restoreGeneration += 1
    }
    const clearScheduled = () => {
      if (rafId) {
        window.cancelAnimationFrame?.(rafId)
        rafId = 0
      }
      if (timerId) {
        window.clearTimeout(timerId)
        timerId = 0
      }
    }
    const sync = () => {
      if (disposed) return
      const root = rootRef.current
      const selection = typeof window !== 'undefined' ? window.getSelection?.() : null
      const query = phrase ? null : readSelectionMatchQuery(root, selection)
      const rects = root && (query || phrase) ? collectTextSelectionMatchHighlightRects({ root, query, phrase }) : []
      const signature = buildHighlightSignature(phrase || query, rects)
      if (signature === stateSignatureRef.current) return
      if (!query || rects.length <= 0) invalidateRestore()
      stateSignatureRef.current = signature
      setState({ signature, rects })
      if (root && query && rects.length > 0) {
        const restoreToken = ++restoreGeneration
        scheduleNativeSelectionRestore(root, query, () => restoreToken === restoreGeneration && !pointerSelecting)
      }
    }
    const schedule = (allowDuringPointerSelection = false) => {
      if (pointerSelecting && !allowDuringPointerSelection) return
      if (disposed || rafId || timerId) return
      if (typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(() => {
          rafId = 0
          sync()
        })
        return
      }
      timerId = window.setTimeout(() => {
        timerId = 0
        sync()
      }, 0)
    }
    const scheduleFromSelectionChange = () => {
      const selection = typeof window !== 'undefined' ? window.getSelection?.() : null
      const selectionText = normalizeSelectionMatchText(selection?.toString?.() || '')
      if (!selection || selection.isCollapsed || !selectionText) invalidateRestore()
      schedule(false)
    }
    const scheduleFromCommittedInput = () => schedule(true)
    const beginPointerSelection = (event: MouseEvent | PointerEvent) => {
      if (typeof event.button === 'number' && event.button !== 0) return
      pointerSelecting = true
      invalidateRestore()
      clearScheduled()
    }
    const finishPointerSelection = () => {
      if (!pointerSelecting) {
        scheduleFromCommittedInput()
        return
      }
      pointerSelecting = false
      scheduleFromCommittedInput()
    }
    schedule()
    document.addEventListener('selectionchange', scheduleFromSelectionChange)
    window.addEventListener('resize', scheduleFromCommittedInput)
    const root = rootRef.current
    root?.addEventListener('pointerdown', beginPointerSelection)
    root?.addEventListener('mousedown', beginPointerSelection)
    document.addEventListener('pointerup', finishPointerSelection)
    document.addEventListener('mouseup', finishPointerSelection)
    root?.addEventListener('keyup', scheduleFromCommittedInput)
    const resizeObserver = phrase && window.ResizeObserver ? new window.ResizeObserver(scheduleFromCommittedInput) : null
    if (root) resizeObserver?.observe(root)
    const observer = phrase && window.MutationObserver ? new window.MutationObserver(records => {
      if (records.some(record => !(record.target.nodeType === 1 ? record.target as Element : record.target.parentElement)?.closest('[data-kg-selection-match-overlay]'))) scheduleFromCommittedInput()
    }) : null
    if (root) observer?.observe(root, { childList: true, subtree: true, characterData: true })
    root?.addEventListener('load', scheduleFromCommittedInput, true)
    root?.addEventListener('scroll', scheduleFromCommittedInput, true)
    return () => {
      disposed = true
      resizeObserver?.disconnect()
      observer?.disconnect()
      root?.removeEventListener('load', scheduleFromCommittedInput, true)
      root?.removeEventListener('scroll', scheduleFromCommittedInput, true)
      clearScheduled()
      invalidateRestore()
      document.removeEventListener('selectionchange', scheduleFromSelectionChange)
      window.removeEventListener('resize', scheduleFromCommittedInput)
      root?.removeEventListener('pointerdown', beginPointerSelection)
      root?.removeEventListener('mousedown', beginPointerSelection)
      document.removeEventListener('pointerup', finishPointerSelection)
      document.removeEventListener('mouseup', finishPointerSelection)
      root?.removeEventListener('keyup', scheduleFromCommittedInput)
      stateSignatureRef.current = null
    }
  }, [enabled, resetKey, rootRef, phrase?.text, phrase?.locale])

  return state.rects
}
