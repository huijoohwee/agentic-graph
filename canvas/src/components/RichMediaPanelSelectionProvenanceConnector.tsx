import React from 'react'

import {
  STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT,
  STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT,
} from '@/lib/canvas/storyboard-widget-overlay-proxy'
import {
  buildSelectionProvenanceConnectorPath,
  type SelectionProvenanceConnectorGeometry,
} from '@/lib/ui/selectionProvenanceConnectorGeometry'
import {
  useTextSelectionProvenanceHighlights,
  type TextSelectionProvenanceHighlightInput,
} from '@/lib/ui/textSelectionProvenanceHighlights'
import {
  buildSemanticTextHighlightOverlayStyle,
  getSemanticHighlightSurfaceAttributes,
  getSemanticHighlightSurfaceClassName,
  SEMANTIC_HIGHLIGHT_SURFACES,
} from '@/lib/ui/semanticHighlight'

export type RichMediaSelectionProvenanceConnectorInput = TextSelectionProvenanceHighlightInput & {
  sourcePortKey: string
}

const toLocalPoint = (
  root: HTMLElement,
  rootRect: DOMRect,
  clientX: number,
  clientY: number,
): { x: number; y: number } => {
  const scaleX = root.offsetWidth > 0 && rootRect.width > 0 ? rootRect.width / root.offsetWidth : 1
  const scaleY = root.offsetHeight > 0 && rootRect.height > 0 ? rootRect.height / root.offsetHeight : 1
  return {
    x: (clientX - rootRect.left) / scaleX,
    y: (clientY - rootRect.top) / scaleY,
  }
}

const readConnectorGeometry = (args: {
  root: HTMLElement
  selections: ReadonlyArray<RichMediaSelectionProvenanceConnectorInput>
}): SelectionProvenanceConnectorGeometry[] => {
  const sourceCard = args.root.closest<HTMLElement>('[data-node-id]')
  if (!sourceCard) return []
  const rootRect = args.root.getBoundingClientRect()
  const handles = Array.from(
    sourceCard.querySelectorAll<HTMLElement>('[data-kg-port-handle="1"][data-kg-port-dir="out"]'),
  )
  const geometries: SelectionProvenanceConnectorGeometry[] = []
  for (const selection of args.selections) {
    const edgeId = String(selection.edgeId || '').trim()
    if (!edgeId) continue
    const highlights = Array.from(
      args.root.querySelectorAll<HTMLElement>('[data-kg-selection-provenance-highlight="1"]'),
    ).filter(element => element.dataset.kgSelectionProvenanceEdgeId === edgeId)
    if (highlights.length <= 0) continue
    const handle = handles.find(element => (
      element.dataset.kgPortKey === selection.sourcePortKey
    )) || handles[0]
    if (!handle) continue
    const handleSurface = handle.querySelector<HTMLElement>('[aria-hidden="true"]') || handle
    const handleRect = handleSurface.getBoundingClientRect()
    const highlightRects = highlights.map(element => element.getBoundingClientRect())
    const union = highlightRects.reduce((current, rect) => ({
      left: Math.min(current.left, rect.left),
      right: Math.max(current.right, rect.right),
      top: Math.min(current.top, rect.top),
      bottom: Math.max(current.bottom, rect.bottom),
    }), {
      left: highlightRects[0]!.left,
      right: highlightRects[0]!.right,
      top: highlightRects[0]!.top,
      bottom: highlightRects[0]!.bottom,
    })
    const handleClientX = handleRect.left + handleRect.width / 2
    const handleClientY = handleRect.top + handleRect.height / 2
    const highlightCenterX = (union.left + union.right) / 2
    const highlightClientX = handleClientX >= highlightCenterX ? union.right : union.left
    const highlightClientY = (union.top + union.bottom) / 2
    const source = toLocalPoint(args.root, rootRect, highlightClientX, highlightClientY)
    const target = toLocalPoint(args.root, rootRect, handleClientX, handleClientY)
    geometries.push({
      edgeId,
      path: buildSelectionProvenanceConnectorPath({ source, target }),
      sourceX: source.x,
      sourceY: source.y,
    })
  }
  return geometries
}

const geometrySignature = (
  geometries: ReadonlyArray<SelectionProvenanceConnectorGeometry>,
): string => geometries.map(geometry => (
  `${geometry.edgeId}:${geometry.path}:${geometry.sourceX}:${geometry.sourceY}`
)).join('|')

export function RichMediaPanelSelectionProvenanceConnector(props: {
  rootRef: React.RefObject<HTMLElement | null>
  selections: ReadonlyArray<RichMediaSelectionProvenanceConnectorInput>
}) {
  const highlightRects = useTextSelectionProvenanceHighlights({
    rootRef: props.rootRef,
    selections: props.selections,
  })
  const selectionSignature = props.selections.map(selection => (
    `${selection.edgeId}:${selection.sourcePortKey}:${selection.startLine}:${selection.endLine}:${selection.text}`
  )).join('|')
  const [geometries, setGeometries] = React.useState<SelectionProvenanceConnectorGeometry[]>([])
  const signatureRef = React.useRef('')

  React.useLayoutEffect(() => {
    let frame = 0
    let disposed = false
    const sync = () => {
      frame = 0
      if (disposed) return
      const root = props.rootRef.current
      const next = root ? readConnectorGeometry({ root, selections: props.selections }) : []
      const signature = geometrySignature(next)
      if (signature === signatureRef.current) return
      signatureRef.current = signature
      setGeometries(next)
    }
    const schedule = () => {
      if (disposed || frame) return
      frame = window.requestAnimationFrame(sync)
    }
    const root = props.rootRef.current
    const resizeObserver = typeof ResizeObserver === 'function' && root
      ? new ResizeObserver(schedule)
      : null
    const mutationObserver = typeof MutationObserver === 'function' && root
      ? new MutationObserver(schedule)
      : null
    resizeObserver?.observe(root!)
    mutationObserver?.observe(root!, { childList: true, subtree: true })
    schedule()
    root?.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    window.addEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
    window.addEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
    return () => {
      disposed = true
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      root?.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.removeEventListener(STORYBOARD_WIDGET_INTERACTION_FRAME_EVENT, schedule)
      window.removeEventListener(STORYBOARD_WIDGET_GEOMETRY_COMMITTED_EVENT, schedule)
    }
  }, [props.rootRef, props.selections, selectionSignature])

  return (
    <>
      <section
        aria-hidden="true"
        className="pointer-events-none select-none absolute inset-0 z-10 overflow-visible"
        data-kg-selection-provenance-overlay="true"
        {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.provenanceSelection)}
      >
        {highlightRects.map(rect => (
          <span
            key={rect.id}
            className={`absolute select-none ${getSemanticHighlightSurfaceClassName(SEMANTIC_HIGHLIGHT_SURFACES.provenanceSelection)}`}
            data-kg-selection-provenance-highlight="1"
            data-kg-selection-provenance-edge-id={rect.edgeId}
            {...getSemanticHighlightSurfaceAttributes(SEMANTIC_HIGHLIGHT_SURFACES.provenanceSelection)}
            style={{
              ...buildSemanticTextHighlightOverlayStyle(rect),
              background: 'var(--kg-provenance-selection-bg, rgba(37, 99, 235, 0.24))',
              boxShadow: '0 0 0 1px rgba(37, 99, 235, 0.10), 0 1px 3px rgba(30, 64, 175, 0.10)',
              opacity: 0.78,
            }}
          />
        ))}
      </section>
      {geometries.length > 0 ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible"
          data-kg-selection-provenance-connector-overlay="1"
        >
          {geometries.map(geometry => (
            <g key={geometry.edgeId} data-kg-selection-provenance-connector-edge-id={geometry.edgeId}>
              <path
                d={geometry.path}
                fill="none"
                stroke="rgba(37, 99, 235, 0.52)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle
                cx={geometry.sourceX}
                cy={geometry.sourceY}
                r="2.5"
                fill="rgba(37, 99, 235, 0.58)"
              />
            </g>
          ))}
        </svg>
      ) : null}
    </>
  )
}
