import * as d3 from 'd3'
import type { MutableRefObject, RefObject } from 'react'
import {
  freezePendingEdgeAt,
  movePendingEdgeEnd,
  nudgePendingEdgeEnd,
  readPendingLinkPhase,
  readTemporaryEdgeEndpointElement,
  resumeTemporaryEdge,
  type PendingLink,
  type TempLinkSelection,
} from '@/features/edge-creation'
import { calcMouseGraphPosition, isNodePointerTarget } from '@/features/canvas/utils'

type SvgSelection = d3.Selection<SVGSVGElement, unknown, null, undefined>

export const attachGlobalHandlers = (args: {
  svgRef: RefObject<SVGSVGElement>
  svg: SvgSelection
  tempLinkSelRef: MutableRefObject<TempLinkSelection>
  linkDragRef: MutableRefObject<PendingLink | null>
  selectNode: (id: string | null) => void
  enableEditorGestures?: boolean
  onCanvasShiftDoubleClick?: (args: { x: number; y: number; clientX: number; clientY: number }) => void
  hideTemp: () => void
  cancelPending: () => void
}): (() => void) => {
  const { svgRef, svg, tempLinkSelRef, linkDragRef, selectNode, enableEditorGestures, onCanvasShiftDoubleClick, hideTemp, cancelPending } = args
  svg.on('mousemove', (ev: MouseEvent) => {
    if (!tempLinkSelRef.current || !linkDragRef.current) return
    const p = calcMouseGraphPosition(svgRef, ev)
    movePendingEdgeEnd(tempLinkSelRef, linkDragRef, { x: p[0], y: p[1] })
  })

  const freezeFromCanvasActivation = (ev: MouseEvent | PointerEvent) => {
    if (typeof ev.button === 'number' && ev.button !== 0) return
    const pending = linkDragRef.current
    if (!pending || readPendingLinkPhase(pending) === 'temporary') return
    const interactionBackground = typeof Element !== 'undefined'
      && ev.target instanceof Element
      && ev.target.getAttribute('data-kg-layer') === 'interaction-background'
    if (!interactionBackground && isNodePointerTarget(ev.target)) return
    const p = calcMouseGraphPosition(svgRef, ev)
    if (freezePendingEdgeAt(tempLinkSelRef, linkDragRef, { x: p[0], y: p[1] })) return
    hideTemp()
    cancelPending()
  }
  const interactionBackground = svg.select<SVGRectElement>('[data-kg-layer="interaction-background"]')
  svg.on('pointerdown.kgTemporaryEdgeFreeze', freezeFromCanvasActivation)
  interactionBackground.on('pointerdown.kgTemporaryEdgeFreeze', freezeFromCanvasActivation)
  interactionBackground.on('click.kgTemporaryEdgeFreeze', freezeFromCanvasActivation)

  svg.on('click', (ev: MouseEvent) => {
    if (typeof ev.button === 'number' && ev.button !== 0) return
    const pending = linkDragRef.current
    if (pending) {
      if (readPendingLinkPhase(pending) === 'temporary') return
      const p = calcMouseGraphPosition(svgRef, ev)
      if (freezePendingEdgeAt(tempLinkSelRef, linkDragRef, { x: p[0], y: p[1] })) {
        return
      }
      hideTemp()
      cancelPending()
      return
    }
    selectNode(null)
  })
  svg.on('dblclick', (ev: MouseEvent) => {
    const btn = (ev as unknown as { button?: unknown }).button
    if (typeof btn === 'number' && btn !== 0) return
    if (!enableEditorGestures) return
    if (!ev.shiftKey) return
    if (isNodePointerTarget(ev.target as HTMLElement | null)) return
    const p = calcMouseGraphPosition(svgRef, ev)
    if (!p) return
    try {
      onCanvasShiftDoubleClick?.({ x: p[0], y: p[1], clientX: ev.clientX, clientY: ev.clientY })
    } catch {
      void 0
    }
  })
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hideTemp()
      cancelPending()
      return
    }
    if (e.key === 'Enter') {
      const pending = linkDragRef.current
      const end = pending?.end || pending?.start
      if (!end || !freezePendingEdgeAt(tempLinkSelRef, linkDragRef, end)) return
      e.preventDefault()
      return
    }
    const keyboardDelta = e.key === 'ArrowLeft'
      ? { x: -12, y: 0 }
      : e.key === 'ArrowRight'
        ? { x: 12, y: 0 }
        : e.key === 'ArrowUp'
          ? { x: 0, y: -12 }
          : e.key === 'ArrowDown'
            ? { x: 0, y: 12 }
            : null
    if (keyboardDelta && nudgePendingEdgeEnd(tempLinkSelRef, linkDragRef, keyboardDelta)) {
      e.preventDefault()
    }
  }

  const isEventOutsideSvg = (target: unknown): boolean => {
    const svgEl = svgRef.current
    if (!svgEl) return true
    const t = target as Node | null
    if (!t || typeof (svgEl as unknown as { contains?: unknown }).contains !== 'function') return true
    try {
      return !(svgEl as unknown as { contains: (n: Node) => boolean }).contains(t)
    } catch {
      return true
    }
  }

  const onDocClick = (e: MouseEvent) => {
    if (!linkDragRef.current) return
    if (!isEventOutsideSvg(e.target)) return
    hideTemp()
    cancelPending()
  }

  const onWinPointerCancel = (e: PointerEvent) => {
    if (!linkDragRef.current) return
    if (!isEventOutsideSvg(e.target)) return
    hideTemp()
    cancelPending()
  }

  const onWinBlur = () => {
    if (!linkDragRef.current) return
    hideTemp()
    cancelPending()
  }

  const onVisibility = () => {
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        onWinBlur()
      }
    } catch {
      void 0
    }
  }

  const pointerEndOptions: AddEventListenerOptions = { capture: true }
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('click', onDocClick)
  window.addEventListener('pointercancel', onWinPointerCancel, pointerEndOptions)
  window.addEventListener('blur', onWinBlur)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  const resumeFromTemporaryEdge = (event: Event) => {
    if (!resumeTemporaryEdge(tempLinkSelRef, linkDragRef)) return
    try {
      event.preventDefault()
      event.stopPropagation()
    } catch {
      void 0
    }
  }
  const resumeFromTemporaryEdgeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    resumeFromTemporaryEdge(event)
  }
  tempLinkSelRef.current?.on('click.kgTemporaryEdgeResume', resumeFromTemporaryEdge)
  const temporaryEndpoint = readTemporaryEdgeEndpointElement(tempLinkSelRef)
  temporaryEndpoint?.addEventListener('click', resumeFromTemporaryEdge)
  temporaryEndpoint?.addEventListener('keydown', resumeFromTemporaryEdgeKey)

  return () => {
    svg.on('mousemove', null)
    svg.on('pointerdown.kgTemporaryEdgeFreeze', null)
    interactionBackground.on('pointerdown.kgTemporaryEdgeFreeze', null)
    interactionBackground.on('click.kgTemporaryEdgeFreeze', null)
    svg.on('click', null)
    svg.on('dblclick', null)
    window.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('click', onDocClick)
    window.removeEventListener('pointercancel', onWinPointerCancel, pointerEndOptions)
    window.removeEventListener('blur', onWinBlur)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    tempLinkSelRef.current?.on('click.kgTemporaryEdgeResume', null)
    temporaryEndpoint?.removeEventListener('click', resumeFromTemporaryEdge)
    temporaryEndpoint?.removeEventListener('keydown', resumeFromTemporaryEdgeKey)
  }
}
