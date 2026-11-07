import React from 'react'
import { StaticRichMediaPanelPreview } from '@/components/StaticRichMediaPanelPreview'
import type { DesignCanvasFrameNodeRef, DesignCanvasFrameRect, DesignCanvasWireframePreview } from '@/components/DesignCanvas/types'
import { truncateTextWithEllipsis } from '@/lib/ui/text/labelText'

export function DesignCanvasWireframePreviewLayer(props: {
  enabled: boolean
  renderNodes: DesignCanvasFrameNodeRef[]
  positions: Record<string, DesignCanvasFrameRect>
  panelOnlyNodeIdSet: Set<string> | null
  wireframePreviewById: Map<string, DesignCanvasWireframePreview>
  forwardWheelTo: () => SVGSVGElement | null
  onOverlayPanStart: (args: { pointerId: number; buttons: number }) => void
  onOverlayPan: (args: { pointerId: number; dx: number; dy: number }) => void
  onOverlayPanEnd: (args: { pointerId: number }) => void
}) {
  const {
    enabled,
    renderNodes,
    positions,
    panelOnlyNodeIdSet,
    wireframePreviewById,
    forwardWheelTo,
    onOverlayPanStart,
    onOverlayPan,
    onOverlayPanEnd,
  } = props
  if (!enabled) return null
  return (
    <g data-kg-layer="wireframe-text" style={{ pointerEvents: 'none' }}>
      {renderNodes.map(node => {
        if (panelOnlyNodeIdSet?.has(node.id)) return null
        const position = positions[node.id]
        if (!position) return null
        const preview = wireframePreviewById.get(node.id) || null
        if (!preview) return null
        return (
          <g key={`txt:${node.id}`} transform={`translate(${position.x},${position.y})`}>
            {preview.kind === 'media' ? (
              preview.tag === 'IMG' || preview.tag === 'VIDEO' || preview.tag === 'IFRAME' ? (
                <StaticRichMediaPanelPreview
                  tag={preview.tag}
                  url={preview.src}
                  titleChip={preview.titleChip}
                  innerX={preview.innerX}
                  innerY={preview.innerY}
                  innerW={preview.innerW}
                  innerH={preview.innerH}
                  opacity={0.92}
                  interactive={false}
                  forwardWheelTo={forwardWheelTo}
                  onOverlayPanStart={onOverlayPanStart}
                  onOverlayPan={onOverlayPan}
                  onOverlayPanEnd={onOverlayPanEnd}
                />
              ) : (
                <g opacity={0.92}>
                  <rect
                    x={preview.innerX}
                    y={preview.innerY}
                    width={preview.innerW}
                    height={preview.innerH}
                    rx={6}
                    fill="rgba(0,0,0,0)"
                    stroke="var(--kg-border)"
                    strokeWidth={1}
                    strokeDasharray="5 4"
                  />
                  <rect
                    x={preview.innerX}
                    y={preview.innerY}
                    width={Math.min(preview.innerW, Math.max(64, (preview.titleChip.length + 6) * 6))}
                    height={18}
                    rx={5}
                    fill="var(--kg-panel-bg)"
                    stroke="var(--kg-border)"
                    strokeWidth={1}
                    strokeOpacity={0.7}
                  />
                  <text x={preview.innerX + 10} y={preview.innerY + 13} fill="var(--kg-text-tertiary)" fontSize={12} fontWeight={600}>
                    {preview.titleChip}
                  </text>
                  {preview.tag === 'SVG' ? (
                    <g opacity={0.22}>
                      <path
                        d={`M ${preview.innerX + preview.innerW / 2 - 18} ${preview.innerY + preview.innerH / 2 - 12} Q ${preview.innerX + preview.innerW / 2 - 30} ${preview.innerY + preview.innerH / 2} ${preview.innerX + preview.innerW / 2 - 18} ${preview.innerY + preview.innerH / 2 + 12}`}
                        fill="none"
                        stroke="var(--kg-text-tertiary)"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                      <path
                        d={`M ${preview.innerX + preview.innerW / 2 + 18} ${preview.innerY + preview.innerH / 2 - 12} Q ${preview.innerX + preview.innerW / 2 + 30} ${preview.innerY + preview.innerH / 2} ${preview.innerX + preview.innerW / 2 + 18} ${preview.innerY + preview.innerH / 2 + 12}`}
                        fill="none"
                        stroke="var(--kg-text-tertiary)"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                      <path
                        d={`M ${preview.innerX + preview.innerW / 2 - 4} ${preview.innerY + preview.innerH / 2 + 14} L ${preview.innerX + preview.innerW / 2 + 4} ${preview.innerY + preview.innerH / 2 - 14}`}
                        fill="none"
                        stroke="var(--kg-text-tertiary)"
                        strokeWidth={2}
                        strokeLinecap="round"
                      />
                    </g>
                  ) : null}
                </g>
              )
            ) : (
              <g opacity={0.82}>
                {preview.title ? (
                  <text x={14} y={34} fill="var(--kg-text-tertiary)" fontSize={12} fontWeight={600}>
                    {truncateTextWithEllipsis(preview.title, preview.titleMaxChars)}
                  </text>
                ) : null}
                <text
                  x={preview.x}
                  y={preview.y}
                  fill={preview.fill || 'var(--kg-text-primary)'}
                  fontSize={preview.fontSize}
                  fontWeight={preview.fontWeight}
                  fontFamily={preview.fontFamily}
                  textAnchor={preview.textAnchor}
                >
                  {preview.lines.map((text, index) => (
                    <tspan key={index} x={preview.x} dy={index === 0 ? 0 : preview.lineH}>
                      {text}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
          </g>
        )
      })}
    </g>
  )
}
