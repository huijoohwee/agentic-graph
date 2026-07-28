import React from 'react'

import {
  STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT,
  STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'

export type TextSelectionProvenanceHighlightInput = {
  edgeId: string
  text: string
  startLine: number
  endLine: number
}

export type TextSelectionProvenanceHighlightRect = {
  id: string
  edgeId: string
  left: number
  top: number
  width: number
  height: number
}

type TextPoint = {
  node: Text
  offset: number
}

type NormalizedDomIndex = {
  text: string
  points: TextPoint[]
}

const MAX_PROVENANCE_HIGHLIGHT_RECTS = 300
const EMPTY_PROVENANCE_HIGHLIGHT_INPUTS: ReadonlyArray<TextSelectionProvenanceHighlightInput> = []

const normalizeText = (value: unknown): string =>
  String(value || '').replace(/\s+/g, ' ').trim()

const readLine = (element: Element, attribute: 'data-start-line' | 'data-end-line'): number | null => {
  const parsed = Number(element.getAttribute(attribute))
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : null
}

const overlapsLineRange = (
  element: Element,
  selection: TextSelectionProvenanceHighlightInput,
): boolean => {
  const start = readLine(element, 'data-start-line')
  if (start === null) return false
  const end = readLine(element, 'data-end-line') ?? start
  return end >= selection.startLine && start <= selection.endLine
}

const isIgnoredElement = (element: Element | null): boolean => {
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') return true
  if (tagName === 'textarea' || tagName === 'input' || tagName === 'select' || tagName === 'button') return true
  if (element.getAttribute('aria-hidden') === 'true') return true
  if (element.getAttribute('contenteditable') === 'true') return true
  if (element.hasAttribute('data-kg-selection-match-overlay')) return true
  if (element.hasAttribute('data-kg-selection-provenance-overlay')) return true
  return false
}

const collectEligibleTextNodes = (
  root: HTMLElement,
  selection: TextSelectionProvenanceHighlightInput,
): Array<{ node: Text; lineHost: Element }> => {
  const document = root.ownerDocument
  const view = document.defaultView
  const walker = document.createTreeWalker(root, view?.NodeFilter?.SHOW_TEXT ?? 4)
  const textNodeType = view?.Node?.TEXT_NODE ?? 3
  const out: Array<{ node: Text; lineHost: Element }> = []
  let current = walker.nextNode()
  while (current) {
    if (current.nodeType === textNodeType) {
      const node = current as Text
      const lineHost = node.parentElement?.closest('[data-start-line]') || null
      if (lineHost && root.contains(lineHost) && overlapsLineRange(lineHost, selection)) {
        let ignored = false
        let element = node.parentElement
        while (element && element !== root) {
          if (isIgnoredElement(element)) {
            ignored = true
            break
          }
          element = element.parentElement
        }
        if (!ignored && String(node.nodeValue || '')) out.push({ node, lineHost })
      }
    }
    current = walker.nextNode()
  }
  return out
}

const buildNormalizedDomIndex = (
  entries: ReadonlyArray<{ node: Text; lineHost: Element }>,
): NormalizedDomIndex => {
  let text = ''
  const points: TextPoint[] = []
  let pendingSpace: TextPoint | null = null
  let previousLineHost: Element | null = null
  for (const entry of entries) {
    const nodeText = String(entry.node.nodeValue || '')
    if (previousLineHost && previousLineHost !== entry.lineHost && text.length > 0 && !pendingSpace) {
      pendingSpace = {
        node: points[points.length - 1]?.node || entry.node,
        offset: (points[points.length - 1]?.offset ?? 0) + 1,
      }
    }
    for (let offset = 0; offset < nodeText.length; offset += 1) {
      const char = nodeText[offset] || ''
      if (/\s/.test(char)) {
        if (text.length > 0 && !pendingSpace) pendingSpace = { node: entry.node, offset }
        continue
      }
      if (pendingSpace && text.length > 0) {
        text += ' '
        points.push(pendingSpace)
        pendingSpace = null
      }
      text += char
      points.push({ node: entry.node, offset })
    }
    previousLineHost = entry.lineHost
  }
  return { text, points }
}

const buildRange = (
  root: HTMLElement,
  index: NormalizedDomIndex,
  start: number,
  end: number,
): Range | null => {
  const first = index.points[start]
  const last = index.points[end - 1]
  if (!first || !last) return null
  try {
    const range = root.ownerDocument.createRange()
    range.setStart(first.node, Math.min(first.offset, String(first.node.nodeValue || '').length))
    range.setEnd(last.node, Math.min(last.offset + 1, String(last.node.nodeValue || '').length))
    return range.collapsed ? null : range
  } catch {
    return null
  }
}

export const revealTextSelectionProvenanceMatch = (args: {
  root: HTMLElement
  selection: TextSelectionProvenanceHighlightInput
}): HTMLElement | null => {
  const text = normalizeText(args.selection.text)
  if (!text) return null
  const index = buildNormalizedDomIndex(collectEligibleTextNodes(args.root, args.selection))
  const start = index.text.indexOf(text)
  if (start < 0) return null
  const point = index.points[start]
  const element = point?.node.parentElement
  if (!element) return null
  element.scrollIntoView?.({ block: 'center', inline: 'nearest' })
  return element
}

const readRootScale = (root: HTMLElement, rootRect: DOMRect): { x: number; y: number } => ({
  x: root.clientWidth > 0 && rootRect.width > 0 ? rootRect.width / root.clientWidth : 1,
  y: root.clientHeight > 0 && rootRect.height > 0 ? rootRect.height / root.clientHeight : 1,
})

export const collectTextSelectionProvenanceHighlightRects = (args: {
  root: HTMLElement
  selections: ReadonlyArray<TextSelectionProvenanceHighlightInput>
  maxRects?: number
}): TextSelectionProvenanceHighlightRect[] => {
  const rootRect = args.root.getBoundingClientRect()
  const scale = readRootScale(args.root, rootRect)
  const maxRects = Math.max(1, args.maxRects || MAX_PROVENANCE_HIGHLIGHT_RECTS)
  const out: TextSelectionProvenanceHighlightRect[] = []
  for (const selection of args.selections) {
    const edgeId = String(selection.edgeId || '').trim()
    const text = normalizeText(selection.text)
    if (!edgeId || !text) continue
    const index = buildNormalizedDomIndex(collectEligibleTextNodes(args.root, selection))
    let from = 0
    let matchIndex = 0
    while (out.length < maxRects) {
      const start = index.text.indexOf(text, from)
      if (start < 0) break
      const end = start + text.length
      from = Math.max(end, start + 1)
      const range = buildRange(args.root, index, start, end)
      if (!range) continue
      let rectIndex = 0
      for (const rect of Array.from(range.getClientRects())) {
        if (out.length >= maxRects) break
        if (!(rect.width > 0 && rect.height > 0)) continue
        const left = (rect.left - rootRect.left) / scale.x + args.root.scrollLeft - args.root.clientLeft
        const top = (rect.top - rootRect.top) / scale.y + args.root.scrollTop - args.root.clientTop
        out.push({
          id: `${edgeId}:${matchIndex}:${rectIndex}:${Math.round(left)}:${Math.round(top)}`,
          edgeId,
          left,
          top,
          width: rect.width / scale.x,
          height: rect.height / scale.y,
        })
        rectIndex += 1
      }
      matchIndex += 1
    }
  }
  return out
}

const buildSignature = (rects: ReadonlyArray<TextSelectionProvenanceHighlightRect>): string =>
  rects.map(rect => (
    `${rect.id}:${Math.round(rect.width)}:${Math.round(rect.height)}`
  )).join('|')

export const useTextSelectionProvenanceHighlights = (args: {
  rootRef: React.RefObject<HTMLElement | null>
  selections?: ReadonlyArray<TextSelectionProvenanceHighlightInput>
  resetKey?: string
}): TextSelectionProvenanceHighlightRect[] => {
  const selections = args.selections || EMPTY_PROVENANCE_HIGHLIGHT_INPUTS
  const selectionSignature = selections.map(selection => (
    `${selection.edgeId}:${selection.startLine}:${selection.endLine}:${selection.text}`
  )).join('|')
  const [rects, setRects] = React.useState<TextSelectionProvenanceHighlightRect[]>([])
  const signatureRef = React.useRef('')

  React.useLayoutEffect(() => {
    let frame = 0
    let disposed = false
    const sync = () => {
      frame = 0
      if (disposed) return
      const root = args.rootRef.current
      const next = root && selections.length > 0
        ? collectTextSelectionProvenanceHighlightRects({ root, selections })
        : []
      const signature = buildSignature(next)
      if (signature === signatureRef.current) return
      signatureRef.current = signature
      setRects(next)
    }
    const schedule = () => {
      if (disposed || frame) return
      frame = window.requestAnimationFrame(sync)
    }
    const root = args.rootRef.current
    const resizeObserver = typeof ResizeObserver === 'function' && root
      ? new ResizeObserver(schedule)
      : null
    resizeObserver?.observe(root!)
    schedule()
    root?.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
    window.addEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
    return () => {
      disposed = true
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      root?.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
      window.removeEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
    }
  }, [args.resetKey, args.rootRef, selectionSignature, selections])

  return rects
}
