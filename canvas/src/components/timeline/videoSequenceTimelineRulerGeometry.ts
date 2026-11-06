import type { VideoSequenceTimelineDisplayLane } from './videoSequenceTimeline'

export const VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX = 14

export function resolveVideoSequenceRulerInsetPixelMetrics(width: number): { insetLeftPx: number; widthPx: number } {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0
  const insetLeftPx = Math.min(VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX, safeWidth / 2)
  return {
    insetLeftPx,
    widthPx: Math.max(1, safeWidth - insetLeftPx * 2),
  }
}

export function resolveVideoSequenceRulerInsetLeft(percent: number): string {
  return `calc(${VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX}px + (100% - ${VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX * 2}px) * ${percent / 100})`
}

export function resolveVideoSequenceRulerInsetWidth(percent: number): string {
  return `calc((100% - ${VIDEO_SEQUENCE_RULER_AXIS_EDGE_INSET_PX * 2}px) * ${percent / 100})`
}

/** Resolve a pointer against the same inset axis used by clips, marks and playheads. */
export function resolveVideoSequenceRulerPosition(clientX: number, rectLeft: number, rectWidth: number, duration: number): number {
  if (![clientX, rectLeft, rectWidth, duration].every(Number.isFinite) || rectWidth <= 0 || duration <= 0) return 0
  const metrics = resolveVideoSequenceRulerInsetPixelMetrics(rectWidth)
  return Math.min(1, Math.max(0, (clientX - rectLeft - metrics.insetLeftPx) / metrics.widthPx)) * duration
}

/** Workflow callers can retain one lane or place each source row on its own lane. */
export function resolveWorkflowTimelineLaneId(rowKey: string, splitRows = false): string {
  return splitRows ? `workflow:${rowKey}` : 'workflow'
}
export function resolveWorkflowTimelineLanes(rows: readonly { rowKey: string; label: string }[], splitRows = false): VideoSequenceTimelineDisplayLane[] {
  if (!rows.length) return []
  if (!splitRows) return [{ id: 'workflow', label: 'Workflow', semanticId: 'video' }]
  const seen = new Set<string>()
  return rows.map(row => {
    if (!row.rowKey.trim() || seen.has(row.rowKey)) throw new Error('workflow_timeline_row_identity_invalid')
    seen.add(row.rowKey)
    return { id: resolveWorkflowTimelineLaneId(row.rowKey, true), label: row.label, semanticId: 'video' }
  })
}
