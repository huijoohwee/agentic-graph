export const resolveActiveSelectionRange = (args: {
  root: HTMLElement
  selection: Selection | null
  cachedRange: Range | null
}): Range | null => {
  const { root, selection, cachedRange } = args
  if (selection && selection.rangeCount > 0) {
    const live = selection.getRangeAt(0)
    const container = live.commonAncestorContainer
    const node = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement
    if (!live.collapsed && node && root.contains(node)) return live
  }
  if (!cachedRange || cachedRange.collapsed) return null
  const cachedContainer = cachedRange.commonAncestorContainer
  const cachedNode = cachedContainer.nodeType === Node.ELEMENT_NODE ? (cachedContainer as Element) : cachedContainer.parentElement
  if (!cachedNode || !root.contains(cachedNode)) return null
  return cachedRange
}

export const readSelectionSyncSignature = (args: {
  root: HTMLElement
  selection: Selection | null
}): string | null => {
  const { root, selection } = args
  if (!selection || selection.rangeCount <= 0) return null
  const range = selection.getRangeAt(0)
  if (range.collapsed) return null
  const container = range.commonAncestorContainer
  const node = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement
  if (!node || !root.contains(node)) return null
  const anchorNode = selection.anchorNode
  const focusNode = selection.focusNode
  const anchorParent = anchorNode?.nodeType === Node.ELEMENT_NODE ? (anchorNode as Element) : anchorNode?.parentElement || null
  const focusParent = focusNode?.nodeType === Node.ELEMENT_NODE ? (focusNode as Element) : focusNode?.parentElement || null
  if ((anchorParent && !root.contains(anchorParent)) || (focusParent && !root.contains(focusParent))) return null
  return [
    selection.anchorOffset,
    selection.focusOffset,
    range.startOffset,
    range.endOffset,
    String(selection.toString() || '').length,
  ].join(':')
}

export const hasExpandedSelectionInRoot = (args: {
  root: HTMLElement
  selection: Selection | null
}): boolean => {
  return !!readSelectionSyncSignature(args)
}

export const getRangeRectSafe = (range: Range): DOMRect | null => {
  const anyRange = range as unknown as { getBoundingClientRect?: () => DOMRect }
  if (typeof anyRange.getBoundingClientRect !== 'function') return null
  try {
    return anyRange.getBoundingClientRect()
  } catch {
    return null
  }
}

export type LiveSelectionSnapshot = {
  range: Range
  rect: DOMRect | null
}

export const readLiveSelectionSnapshot = (args: {
  root: HTMLElement
  selection: Selection | null
}): LiveSelectionSnapshot | null => {
  const signature = readSelectionSyncSignature(args)
  if (!signature) return null
  const selection = args.selection
  if (!selection || selection.rangeCount <= 0) return null
  const range = selection.getRangeAt(0)
  return {
    range,
    rect: getRangeRectSafe(range),
  }
}

export const getEditorHostRect = (root: HTMLElement): DOMRect => {
  const host = root.closest('[data-start-line]') as HTMLElement | null
  return host?.getBoundingClientRect() || root.getBoundingClientRect()
}

export const computeFloatingMenuPosition = (args: {
  rangeRect: DOMRect | null
  root: HTMLElement
  gapPx?: number
}): { leftPx: number; topPx: number } => {
  const hostRect = getEditorHostRect(args.root)
  return {
    leftPx: args.rangeRect ? args.rangeRect.left - hostRect.left : 0,
    topPx: args.rangeRect ? args.rangeRect.bottom - hostRect.top + (args.gapPx ?? 6) : 0,
  }
}

export const computeInlineSelectionToolbarPosition = (args: {
  rangeRect: DOMRect | null
  root?: HTMLElement
  hostRect?: DOMRect
}): { leftPx: number; topPx: number } => {
  const hostRect = args.hostRect || (args.root ? getEditorHostRect(args.root) : null)
  if (!hostRect) {
    return { leftPx: 16, topPx: 8 }
  }
  const fallbackLeft = Math.max(16, Math.min(Math.max(0, hostRect.width - 16), 24))
  const fallbackTop = 8
  const rawLeftPx = args.rangeRect ? (args.rangeRect.left + args.rangeRect.width / 2 - hostRect.left) : fallbackLeft
  const maxX = Math.max(0, hostRect.width - 16)
  return {
    leftPx: Math.max(16, Math.min(maxX, rawLeftPx)),
    topPx: args.rangeRect ? (args.rangeRect.top - hostRect.top) : fallbackTop,
  }
}

export const scheduleSelectionSyncBurst = (fn: () => void, frames: number = 2): void => {
  const count = Math.max(1, Math.floor(frames))
  const run = (remaining: number) => {
    fn()
    if (remaining <= 1) return
    window.requestAnimationFrame(() => run(remaining - 1))
  }
  run(count)
}

export const getMarkdownProbeEvents = (): unknown[] => {
  const g = globalThis as unknown as Record<string, unknown>
  const state = g.__KG_MD_PROBE as { events?: unknown[] } | undefined
  return Array.isArray(state?.events) ? state!.events! : []
}

const WORD_CHAR_RE = /[\p{L}\p{N}\p{M}_-]/u
const SEMANTIC_TOKEN_RE = /(?:<!--[\s\S]*?-->|\[\^[^\]\n]+\]|@comment:[^\s`]+|@node:[^\s`]+|@edge:[^\s`]+|@key:[^\n`]+|@ui:[^\n`]+|\$(?:id|url|enum|date|hash):[^\s`]+)/u

export const findFirstSelectableSegment = (text: string): { start: number; end: number } | null => {
  const value = String(text || '')
  if (!value) return null
  const wordMatch = value.match(/[\p{L}\p{N}\p{M}_-]+/u)
  if (wordMatch && typeof wordMatch.index === 'number') {
    return {
      start: wordMatch.index,
      end: wordMatch.index + wordMatch[0].length,
    }
  }
  const nonWhitespaceMatch = value.match(/\S+/u)
  if (nonWhitespaceMatch && typeof nonWhitespaceMatch.index === 'number') {
    return {
      start: nonWhitespaceMatch.index,
      end: nonWhitespaceMatch.index + nonWhitespaceMatch[0].length,
    }
  }
  return null
}

export const expandSelectionSegmentAt = (text: string, cursorOffset: number): { start: number; end: number } | null => {
  const value = String(text || '')
  if (!value) return null
  const maxCursor = Math.max(0, Math.min(value.length - 1, Math.floor(cursorOffset)))
  if (value.length <= 0) return null
  const semanticMatches = value.matchAll(new RegExp(SEMANTIC_TOKEN_RE.source, 'gu'))
  for (const match of semanticMatches) {
    const matchedText = String(match[0] || '')
    const start = typeof match.index === 'number' ? match.index : -1
    if (start < 0 || !matchedText) continue
    const end = start + matchedText.length
    if (maxCursor >= start && maxCursor < end) {
      return { start, end }
    }
  }
  const isWordChar = (ch: string): boolean => WORD_CHAR_RE.test(ch)
  const isSegmentChar = (ch: string): boolean => isWordChar(ch) || !/\s/u.test(ch)
  let cursor = maxCursor
  if (!isSegmentChar(value[cursor] || '') && cursor > 0 && isSegmentChar(value[cursor - 1] || '')) {
    cursor -= 1
  }
  if (!isSegmentChar(value[cursor] || '')) return null
  const resolveGroupType = (): 'word' | 'symbol' => {
    if (isWordChar(value[cursor] || '')) return 'word'
    return 'symbol'
  }
  const groupType = resolveGroupType()
  const matchesGroup = (ch: string): boolean => {
    if (!ch) return false
    if (/\s/u.test(ch)) return false
    if (groupType === 'word') return isWordChar(ch)
    return !isWordChar(ch)
  }
  let start = cursor
  let end = cursor + 1
  while (start > 0 && matchesGroup(value[start - 1] || '')) start -= 1
  while (end < value.length && matchesGroup(value[end] || '')) end += 1
  if (start >= end) return null
  return { start, end }
}

export const ensureWordSelectionInRoot = (root: HTMLElement): boolean => {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null
  if (!sel) return false
  if (sel.rangeCount > 0) {
    const r = sel.getRangeAt(0)
    const c = r.commonAncestorContainer
    const n = c.nodeType === Node.ELEMENT_NODE ? (c as Element) : c.parentElement
    if (n && root.contains(n) && !r.collapsed && String(sel.toString() || '').trim()) return true
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    const txt = String(node.nodeValue || '')
    const segment = findFirstSelectableSegment(txt)
    if (segment) {
      const range = document.createRange()
      range.setStart(node, segment.start)
      range.setEnd(node, segment.end)
      try {
        sel.removeAllRanges()
        sel.addRange(range)
        return true
      } catch {
        return false
      }
    }
    node = walker.nextNode() as Text | null
  }
  return false
}
