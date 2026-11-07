import React from 'react'
import { StaticRichMediaPanelPreview } from '@/components/StaticRichMediaPanelPreview'
import type {
  DesignCanvasFrameNodeRef,
  DesignCanvasFrameRect,
  DesignCanvasFrameVisual,
  DesignCanvasInlineMediaPreview,
} from '@/components/DesignCanvas/types'

const truncateText = (value: string, maxChars: number): string => {
  const t = String(value || '')
  if (maxChars <= 0) return ''
  if (t.length <= maxChars) return t
  if (maxChars <= 1) return '…'
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`
}

const estimateMaxChars = (widthPx: number, fontSizePx: number): number => {
  const w = Math.max(0, Number.isFinite(widthPx) ? widthPx : 0)
  const fs = Math.max(8, Number.isFinite(fontSizePx) ? fontSizePx : 12)
  return Math.max(0, Math.floor(w / (fs * 0.62)))
}

export function DesignCanvasFrameShellLayer(props: {
  renderNodes: DesignCanvasFrameNodeRef[]
  positions: Record<string, DesignCanvasFrameRect>
  panelOnlyNodeIdSet: Set<string> | null
  frameVisualById: Map<string, DesignCanvasFrameVisual>
  renderMediaAsNodes: boolean
  inlineMediaPreviewById: Map<string, DesignCanvasInlineMediaPreview>
  forwardWheelTo: () => SVGSVGElement | null
  onOverlayPanStart: (args: { pointerId: number; buttons: number }) => void
  onOverlayPan: (args: { pointerId: number; dx: number; dy: number }) => void
  onOverlayPanEnd: (args: { pointerId: number }) => void
  registerFrameEl: (id: string, el: SVGGElement | null) => void
  registerFrameRectEl: (id: string, el: SVGRectElement | null) => void
  registerFrameStatusEl: (id: string, el: SVGPathElement | null) => void
  onFramePointerDown: (id: string, rect: DesignCanvasFrameRect, event: React.PointerEvent<SVGGElement>) => void
  onFramePointerMove: (event: React.PointerEvent<SVGGElement>) => void
  onFramePointerUp: () => void
  onFramePointerCancel: (id: string, rect: DesignCanvasFrameRect) => void
}) {
  const {
    renderNodes,
    positions,
    panelOnlyNodeIdSet,
    frameVisualById,
    renderMediaAsNodes,
    inlineMediaPreviewById,
    forwardWheelTo,
    onOverlayPanStart,
    onOverlayPan,
    onOverlayPanEnd,
    registerFrameEl,
    registerFrameRectEl,
    registerFrameStatusEl,
    onFramePointerDown,
    onFramePointerMove,
    onFramePointerUp,
    onFramePointerCancel,
  } = props

  return (
    <>
      {renderNodes.map(node => {
        if (panelOnlyNodeIdSet?.has(node.id)) return null
        const rect = positions[node.id]
        if (!rect) return null
        const visual = frameVisualById.get(node.id)
        if (!visual) return null
        const preview = !renderMediaAsNodes ? inlineMediaPreviewById.get(node.id) || null : null
        const labelWidth = Math.max(0, rect.w - 24) * 0.66
        const typeWidth = Math.max(0, rect.w - 24) * 0.34
        const labelText = truncateText(node.label, estimateMaxChars(labelWidth, 12))
        const typeText = truncateText(String(node.type || node.id), estimateMaxChars(typeWidth, 10))
        const renderFallbackDecor = visual.showDecor && !preview

        return (
          <g
            key={node.id}
            ref={el => registerFrameEl(node.id, el)}
            transform={`translate(${rect.x},${rect.y})`}
            onPointerDown={event => onFramePointerDown(node.id, rect, event)}
            onPointerMove={onFramePointerMove}
            onPointerUp={onFramePointerUp}
            onPointerCancel={() => onFramePointerCancel(node.id, rect)}
            style={{ cursor: 'pointer' }}
          >
            <rect
              ref={el => registerFrameRectEl(node.id, el)}
              data-kg-frame-rect="1"
              x={0}
              y={0}
              width={rect.w}
              height={rect.h}
              rx={visual.rx}
              fill={visual.fill}
              fillOpacity={visual.rectOpacity}
              stroke={visual.stroke}
              strokeOpacity={visual.strokeOpacity}
              strokeWidth={visual.strokeWidth}
              strokeDasharray={visual.strokeDasharray}
              filter={visual.filter}
            />
            {preview ? (
              <StaticRichMediaPanelPreview
                tag={preview.tag}
                url={preview.url}
                titleChip={preview.titleChip}
                innerX={14}
                innerY={44}
                innerW={Math.max(1, rect.w - 28)}
                innerH={Math.max(1, rect.h - 56)}
                opacity={0.92}
                interactive={false}
                forwardWheelTo={forwardWheelTo}
                onOverlayPanStart={onOverlayPanStart}
                onOverlayPan={onOverlayPan}
                onOverlayPanEnd={onOverlayPanEnd}
              />
            ) : null}
            {renderFallbackDecor ? (
              <path
                ref={el => registerFrameStatusEl(node.id, el)}
                data-kg-frame-status="1"
                d={`M 0 8 Q 0 0 8 0 L ${rect.w - 8} 0 Q ${rect.w} 0 ${rect.w} 8 L ${rect.w} 32 L 0 32 Z`}
                fill="var(--kg-statusbar-bg)"
                opacity={0.5}
              />
            ) : null}
            {renderFallbackDecor ? (
              <g transform="translate(16, 48)" opacity={0.3}>
                <rect width={rect.w - 32} height={12} rx={2} fill="var(--kg-text-tertiary)" />
                <rect y={20} width={(rect.w - 32) * 0.6} height={12} rx={2} fill="var(--kg-text-tertiary)" />
                <rect y={40} width={rect.w - 32} height={rect.h - 100} rx={4} fill="var(--kg-border)" />
              </g>
            ) : null}
            {!renderFallbackDecor && !preview ? (
              <>
                <text x={12} y={22} fill="var(--kg-text-primary)" fontSize={12} fontWeight={600} style={{ pointerEvents: 'none' }}>
                  {labelText}
                </text>
                <text x={rect.w - 12} y={22} textAnchor="end" fill="var(--kg-text-tertiary)" fontSize={12} style={{ pointerEvents: 'none' }}>
                  {typeText}
                </text>
              </>
            ) : null}
          </g>
        )
      })}
    </>
  )
}
