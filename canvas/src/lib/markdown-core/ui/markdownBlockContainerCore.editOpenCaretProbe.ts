import React from 'react'
import { ensureWordSelectionInRoot, expandSelectionSegmentAt, findFirstSelectableSegment } from './markdownBlockContainerCore.interaction'
import { reportMarkdownEditParityProbe } from './markdownEditParityProbe'
import { readMarkdownContentEditableCaretRangeFromPoint } from './markdownContentEditableSurface'

export const useMarkdownBlockContainerEditOpenCaretProbe = (args: {
  editable: boolean
  typographySelector: string
  editCaptureLayoutSpacing: boolean
  editStripLinePrefix: boolean
  editStripLinePrefixSpacingSanitize: boolean
  probe: (name: string, data?: Record<string, unknown>) => void
  resolveEditLineRangeOnOpen?: (eventTarget: HTMLElement | null) => { startLine: number; endLine: number } | null
  resolveEditMinHeightOnOpen?: (eventTarget: HTMLElement | null, currentTarget: HTMLElement) => number | null
  setSessionEditLineRange: React.Dispatch<React.SetStateAction<{ startLine: number; endLine: number } | null>>
  setEditing: React.Dispatch<React.SetStateAction<boolean>>
  editTypographySnapshotRef: React.MutableRefObject<React.CSSProperties | null>
  editSpacingSnapshotRef: React.MutableRefObject<React.CSSProperties | null>
  parityProbeSnapshotRef: React.MutableRefObject<{ source: HTMLElement; sourceMetrics: Record<string, string> } | null>
  editSessionIdRef: React.MutableRefObject<number>
  editOpenBlurGuardUntilRef: React.MutableRefObject<number>
  editMinHeightPxRef: React.MutableRefObject<number>
  lastPointerRef: React.MutableRefObject<{ x: number; y: number } | null>
  lastPointerTargetRef: React.MutableRefObject<Node | null>
  lastPointerSelectionModeRef: React.MutableRefObject<'caret' | 'word'>
  editorRef: React.RefObject<HTMLElement | null>
  editStartLine: number
  editEndLine: number
}) => {
  const openEditor = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    args.probe('openEditor.invoke', { detail: event.detail })
    if (!args.editable) {
      args.probe('openEditor.skip', { reason: 'not-editable' })
      return
    }
    const target = event.target as HTMLElement | null
    if (target?.closest('button,input,select,textarea,[contenteditable="true"]')) {
      args.probe('openEditor.skip', { reason: 'interactive-target' })
      return
    }
    try {
      const baseNode = target && event.currentTarget.contains(target) ? target : event.currentTarget
      const typographySource =
        baseNode.closest(args.typographySelector) as HTMLElement | null
      const sourceSurface = typographySource || event.currentTarget
      const computed = window.getComputedStyle(sourceSurface)
      args.editTypographySnapshotRef.current = {
        fontFamily: computed.fontFamily || undefined,
        fontSize: computed.fontSize || undefined,
        fontWeight: computed.fontWeight || undefined,
        fontStyle: computed.fontStyle || undefined,
        lineHeight: computed.lineHeight || undefined,
        letterSpacing: computed.letterSpacing || undefined,
        color: computed.color || undefined,
      }
      const spacingSnapshot = args.editCaptureLayoutSpacing
        ? {
            textAlign: (computed.textAlign || undefined) as React.CSSProperties['textAlign'],
            wordSpacing: computed.wordSpacing || undefined,
            whiteSpace: computed.whiteSpace || undefined,
            tabSize: computed.tabSize || undefined,
            textIndent: computed.textIndent || undefined,
            paddingTop: computed.paddingTop || undefined,
            paddingRight: computed.paddingRight || undefined,
            paddingBottom: computed.paddingBottom || undefined,
            paddingLeft: computed.paddingLeft || undefined,
            marginTop: computed.marginTop || undefined,
            marginRight: computed.marginRight || undefined,
            marginBottom: computed.marginBottom || undefined,
            marginLeft: computed.marginLeft || undefined,
            borderTopWidth: computed.borderTopWidth || undefined,
            borderRightWidth: computed.borderRightWidth || undefined,
            borderBottomWidth: computed.borderBottomWidth || undefined,
            borderLeftWidth: computed.borderLeftWidth || undefined,
            borderTopStyle: (computed.borderTopStyle || undefined) as React.CSSProperties['borderTopStyle'],
            borderRightStyle: (computed.borderRightStyle || undefined) as React.CSSProperties['borderRightStyle'],
            borderBottomStyle: (computed.borderBottomStyle || undefined) as React.CSSProperties['borderBottomStyle'],
            borderLeftStyle: (computed.borderLeftStyle || undefined) as React.CSSProperties['borderLeftStyle'],
            borderTopColor: computed.borderTopColor || undefined,
            borderRightColor: computed.borderRightColor || undefined,
            borderBottomColor: computed.borderBottomColor || undefined,
            borderLeftColor: computed.borderLeftColor || undefined,
            borderRadius: computed.borderRadius || undefined,
            boxSizing: computed.boxSizing || undefined,
            backgroundColor: computed.backgroundColor || undefined,
            caretColor: computed.caretColor || undefined,
          } as React.CSSProperties
        : null
      const editStripLinePrefix = args.editStripLinePrefix
      if (spacingSnapshot && editStripLinePrefix && args.editStripLinePrefixSpacingSanitize) {
        spacingSnapshot.textIndent = undefined
        spacingSnapshot.paddingTop = undefined
        spacingSnapshot.paddingLeft = undefined
        spacingSnapshot.paddingBottom = undefined
        spacingSnapshot.marginTop = undefined
        spacingSnapshot.paddingRight = undefined
        spacingSnapshot.marginBottom = undefined
        spacingSnapshot.marginLeft = undefined
        spacingSnapshot.marginRight = undefined
        spacingSnapshot.borderTopWidth = undefined
        spacingSnapshot.borderLeftWidth = undefined
        spacingSnapshot.borderBottomWidth = undefined
        spacingSnapshot.borderRightWidth = undefined
        spacingSnapshot.borderTopStyle = undefined
        spacingSnapshot.borderLeftStyle = undefined
        spacingSnapshot.borderBottomStyle = undefined
        spacingSnapshot.borderRightStyle = undefined
        spacingSnapshot.borderTopColor = undefined
        spacingSnapshot.borderLeftColor = undefined
        spacingSnapshot.borderBottomColor = undefined
        spacingSnapshot.borderRightColor = undefined
        spacingSnapshot.borderRadius = undefined
        spacingSnapshot.backgroundColor = undefined
      }
      args.editSpacingSnapshotRef.current = spacingSnapshot
      const probeKeys: Array<keyof CSSStyleDeclaration> = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'lineHeight',
        'letterSpacing',
        'color',
        'textAlign',
        'wordSpacing',
        'whiteSpace',
        'tabSize',
        'textIndent',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderTopStyle',
        'borderRightStyle',
        'borderBottomStyle',
        'borderLeftStyle',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'borderRadius',
        'boxSizing',
        'backgroundColor',
        'caretColor',
      ]
      const sourceMetrics = Object.fromEntries(
        probeKeys.map(key => [String(key), String(computed[key] || '')]),
      )
      args.parityProbeSnapshotRef.current = {
        source: sourceSurface,
        sourceMetrics,
      }
    } catch {
      args.editTypographySnapshotRef.current = null
      args.editSpacingSnapshotRef.current = null
      args.parityProbeSnapshotRef.current = null
    }
    const resolvedRange = args.resolveEditLineRangeOnOpen?.(target ?? null) ?? null
    args.setSessionEditLineRange(resolvedRange)
    args.lastPointerRef.current = { x: event.clientX, y: event.clientY }
    args.lastPointerTargetRef.current = event.target instanceof Node ? event.target : null
    args.lastPointerSelectionModeRef.current = event.detail >= 2 ? 'word' : 'caret'
    try {
      const resolvedH = args.resolveEditMinHeightOnOpen?.(target ?? null, event.currentTarget)
      const h = Number.isFinite(resolvedH as number)
        ? Number(resolvedH)
        : event.currentTarget.getBoundingClientRect().height
      args.editMinHeightPxRef.current = Number.isFinite(h) ? Math.max(0, h) : 0
    } catch {
      args.editMinHeightPxRef.current = 0
    }
    args.editSessionIdRef.current += 1
    args.editOpenBlurGuardUntilRef.current = Date.now() + 160
    if (event.detail < 2) {
      event.preventDefault()
      event.stopPropagation()
    }
    args.setEditing(prev => (prev ? prev : true))
    args.probe('openEditor.setEditing', { sessionId: args.editSessionIdRef.current, selectionMode: args.lastPointerSelectionModeRef.current })
  }, [args])

  const emitParityProbe = React.useCallback(() => {
    const probe = args.parityProbeSnapshotRef.current
    const editor = args.editorRef.current
    if (!probe || !editor) return
    const probeEnabled = (() => {
      try {
        const w = window as unknown as { __AG_EDIT_PARITY_PROBE__?: boolean }
        if (w.__AG_EDIT_PARITY_PROBE__ === true) return true
        const query = new URLSearchParams(window.location.search || '')
        return query.get('kgEditParityProbe') === '1'
      } catch {
        return false
      }
    })()
    if (!probeEnabled) return
    try {
      const read = probe.sourceMetrics
      const edit = window.getComputedStyle(editor)
      const keys: Array<keyof CSSStyleDeclaration> = [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'lineHeight',
        'letterSpacing',
        'color',
        'textAlign',
        'wordSpacing',
        'whiteSpace',
        'tabSize',
        'textIndent',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'marginTop',
        'marginRight',
        'marginBottom',
        'marginLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderTopStyle',
        'borderRightStyle',
        'borderBottomStyle',
        'borderLeftStyle',
        'borderTopColor',
        'borderRightColor',
        'borderBottomColor',
        'borderLeftColor',
        'borderRadius',
        'boxSizing',
        'backgroundColor',
        'caretColor',
      ]
      const mismatches = keys
        .map(key => ({ key: String(key), read: String(read[String(key)] || ''), edit: String(edit[String(key)] || '') }))
        .filter(row => row.read !== row.edit)
      const payload = {
        startLine: args.editStartLine,
        endLine: args.editEndLine,
        mismatches,
      }
      reportMarkdownEditParityProbe(payload)
    } catch {
      void 0
    }
  }, [args])

  const placeCaretFromClientPoint = React.useCallback(() => {
    const point = args.lastPointerRef.current
    if (!point) return
    const root = args.editorRef.current
    if (!root) return
    const pointCaret = readMarkdownContentEditableCaretRangeFromPoint(root, point)
    const range = pointCaret.range
    const hasPointCaretApi = pointCaret.supported
    const buildApproximateRangeInRoot = (): Range | null => {
      const text = String(root.textContent || '')
      if (!text) return null
      const rootRect = root.getBoundingClientRect()
      const style = window.getComputedStyle(root)
      const parsePx = (value: string): number => {
        const n = Number.parseFloat(String(value || '').replace('px', ''))
        return Number.isFinite(n) ? n : 0
      }
      const lineHeightRaw = Number.parseFloat(String(style.lineHeight || '').replace('px', ''))
      const fontSize = Number.parseFloat(String(style.fontSize || '').replace('px', ''))
      const lineHeight = Number.isFinite(lineHeightRaw) && lineHeightRaw > 0
        ? lineHeightRaw
        : (Number.isFinite(fontSize) && fontSize > 0 ? fontSize * 1.5 : 16)
      const paddingLeft = parsePx(style.paddingLeft)
      const paddingTop = parsePx(style.paddingTop)
      const horizontal = Math.max(0, point.x - rootRect.left - paddingLeft)
      const vertical = Math.max(0, point.y - rootRect.top - paddingTop)
      const lines = text.split('\n')
      const maxLineIndex = Math.max(0, lines.length - 1)
      const lineIndex = Math.max(0, Math.min(maxLineIndex, Math.floor(vertical / Math.max(1, lineHeight))))
      const probe = document.createElement('span')
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.pointerEvents = 'none'
      probe.style.whiteSpace = 'pre'
      probe.style.fontFamily = style.fontFamily
      probe.style.fontSize = style.fontSize
      probe.style.fontWeight = style.fontWeight
      probe.style.letterSpacing = style.letterSpacing
      probe.textContent = 'M'
      document.body.appendChild(probe)
      const charWidth = Math.max(1, probe.getBoundingClientRect().width || parsePx(style.fontSize) * 0.6 || 8)
      probe.remove()
      const line = String(lines[lineIndex] || '')
      const column = Math.max(0, Math.min(line.length, Math.round(horizontal / charWidth)))
      const offsetBase = lines.slice(0, lineIndex).reduce((sum, row) => sum + row.length + 1, 0)
      const globalOffset = Math.max(0, Math.min(text.length, offsetBase + column))
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let remaining = globalOffset
      let current = walker.nextNode() as Text | null
      while (current) {
        const len = String(current.nodeValue || '').length
        if (remaining <= len) {
          const rr = document.createRange()
          rr.setStart(current, Math.max(0, Math.min(len, remaining)))
          rr.collapse(true)
          return rr
        }
        remaining -= len
        current = walker.nextNode() as Text | null
      }
      const fallbackNode = root.lastChild
      if (fallbackNode && fallbackNode.nodeType === Node.TEXT_NODE) {
        const rr = document.createRange()
        const lastText = fallbackNode as Text
        rr.setStart(lastText, String(lastText.nodeValue || '').length)
        rr.collapse(true)
        return rr
      }
      return null
    }
    const buildLocalFallbackRange = (): Range | null => {
      const pointerTarget = args.lastPointerTargetRef.current
      const resolveLocalTextNode = (): Text | null => {
        if (!pointerTarget) return null
        if (pointerTarget.nodeType === Node.TEXT_NODE) {
          const textNode = pointerTarget as Text
          return root.contains(textNode.parentNode) ? textNode : null
        }
        const el =
          pointerTarget.nodeType === Node.ELEMENT_NODE
            ? (pointerTarget as Element)
            : pointerTarget.parentElement
        if (!el || !root.contains(el)) return null
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let current = walker.nextNode() as Text | null
        while (current) {
          if (String(current.nodeValue || '').trim()) return current
          current = walker.nextNode() as Text | null
        }
        return null
      }
      const localText = resolveLocalTextNode()
      if (!localText) return null
      const segment = findFirstSelectableSegment(String(localText.nodeValue || ''))
      if (!segment) return null
      const fallback = document.createRange()
      fallback.setStart(localText, segment.start)
      fallback.setEnd(localText, segment.end)
      return fallback
    }
    if (!range) {
      if (args.lastPointerSelectionModeRef.current === 'word') {
        const selFallback = typeof window !== 'undefined' ? window.getSelection() : null
        const fallback = buildLocalFallbackRange()
        if (selFallback && fallback) {
          try {
            selFallback.removeAllRanges()
            selFallback.addRange(fallback)
          } catch {
            void 0
          }
        } else if (!hasPointCaretApi) {
          ensureWordSelectionInRoot(root)
        }
      }
      const approx = buildApproximateRangeInRoot()
      if (approx) {
        const selApprox = typeof window !== 'undefined' ? window.getSelection() : null
        if (selApprox) {
          try {
            selApprox.removeAllRanges()
            selApprox.addRange(approx)
          } catch {
            void 0
          }
        }
      }
      return
    }
    const container = range.startContainer
    const node = container.nodeType === Node.ELEMENT_NODE ? (container as Element) : container.parentElement
    if (!node || !root.contains(node)) {
      const fallback = buildLocalFallbackRange() || buildApproximateRangeInRoot()
      if (!fallback) return
      const selFallback = typeof window !== 'undefined' ? window.getSelection() : null
      if (!selFallback) return
      try {
        selFallback.removeAllRanges()
        selFallback.addRange(fallback)
      } catch {
        void 0
      }
      return
    }
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (!sel) return
    const hasStableSelectionInRoot = (() => {
      if (sel.rangeCount <= 0) return false
      try {
        const rr = sel.getRangeAt(0)
        if (rr.collapsed) return false
        const cc = rr.commonAncestorContainer
        const nn = cc.nodeType === Node.ELEMENT_NODE ? (cc as Element) : cc.parentElement
        if (!nn || !root.contains(nn)) return false
        return String(sel.toString() || '').trim().length > 0
      } catch {
        return false
      }
    })()
    if (args.lastPointerSelectionModeRef.current === 'word' && hasStableSelectionInRoot) {
      args.lastPointerSelectionModeRef.current = 'caret'
      return
    }
    try {
      const wantsWordSelection = args.lastPointerSelectionModeRef.current === 'word'
      if (
        wantsWordSelection &&
        (range.startContainer.nodeType === Node.TEXT_NODE || range.startContainer.nodeType === Node.ELEMENT_NODE)
      ) {
        const resolveTextNodeForWordSelection = (): Text | null => {
          if (range.startContainer.nodeType === Node.TEXT_NODE) return range.startContainer as Text
          const containerEl = range.startContainer as Element
          const fromChild = (() => {
            const idx = Math.max(0, Math.min(containerEl.childNodes.length - 1, range.startOffset))
            const direct = containerEl.childNodes[idx] || containerEl.childNodes[idx - 1] || null
            if (!direct) return null
            if (direct.nodeType === Node.TEXT_NODE) return direct as Text
            const walker = document.createTreeWalker(direct, NodeFilter.SHOW_TEXT)
            const first = walker.nextNode()
            return first && first.nodeType === Node.TEXT_NODE ? first as Text : null
          })()
          if (fromChild) return fromChild
          return null
        }
        const node = resolveTextNodeForWordSelection()
        if (!node) {
          const fallback = buildLocalFallbackRange()
          if (fallback) {
            sel.removeAllRanges()
            sel.addRange(fallback)
          } else {
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
          }
          args.lastPointerSelectionModeRef.current = 'caret'
          return
        }
        if (range.startContainer !== node) {
          try {
            range.setStart(node, 0)
            range.collapse(true)
          } catch {
            void 0
          }
        }
        const text = String(node.nodeValue || '')
        if (text.length > 0) {
          const segment = expandSelectionSegmentAt(text, range.startOffset)
          if (segment) {
            range.setStart(node, segment.start)
            range.setEnd(node, segment.end)
          } else {
            range.collapse(true)
          }
        } else {
          range.collapse(true)
        }
      } else {
        range.collapse(true)
      }
      sel.removeAllRanges()
      sel.addRange(range)
      if (wantsWordSelection && !String(sel.toString() || '').trim()) {
        const fallback = buildLocalFallbackRange()
        if (fallback) {
          sel.removeAllRanges()
          sel.addRange(fallback)
        } else if (!hasPointCaretApi) {
          ensureWordSelectionInRoot(root)
        }
      }
      args.lastPointerSelectionModeRef.current = 'caret'
    } catch {
      void 0
    }
  }, [args])

  return {
    openEditor,
    emitParityProbe,
    placeCaretFromClientPoint,
  }
}
