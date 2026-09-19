import React from 'react'
import { RichMediaPanelResizeHandle, beginRichMediaPanelResizeDrag } from '@/components/RichMediaPanelResizeHandle'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readSnapGridConfigFromSchema, snapScalarToGrid } from '@/lib/canvas/gridSnap'
import { useDashboardWidgets, updateDashboardWidget } from './dashboardWidgetConfiguration'

/** Same pointer lifecycle, corner handle and grid owner as other canvas cards. */
export function useDashboardWidgetSize(id: string | undefined, frame: React.RefObject<HTMLElement>, enabled: boolean) {
  const config = useDashboardWidgets(), schema = useGraphStore(state => state.schema)
  const settings = id ? config.document.widgets[id] : undefined
  const [draft, setDraft] = React.useState<{ width: number; height: number } | null>(null)
  const aspect = settings?.aspectRatio ?? '16:9'
  const grid = readSnapGridConfigFromSchema(schema)
  const commit = (size: { width: number; height: number }) => {
    if (!id) return
    void updateDashboardWidget(id, { aspectRatio: 'custom', ...size }).finally(() => setDraft(null)).catch(() => undefined)
  }
  const constrain = (size: { width: number; height: number }) => ({
    width: Math.max(120, Math.min(4096, snapScalarToGrid(size.width, grid))),
    height: Math.max(120, Math.min(4096, snapScalarToGrid(size.height, grid))),
  })
  const style: React.CSSProperties | undefined = !id ? undefined : draft || aspect === 'custom'
    ? { width: draft?.width ?? settings?.width ?? '100%', height: draft?.height ?? settings?.height ?? 360, maxWidth: '100%' }
    : { width: '100%', aspectRatio: aspect === '9:16' ? '9 / 16' : '16 / 9', height: 'auto', minHeight: 120 }
  const handle = !id || !enabled || aspect !== 'custom' ? null : <span onKeyDown={event => {
    if (!event.key.startsWith('Arrow')) return
    const rect = frame.current?.getBoundingClientRect(); if (!rect) return
    event.preventDefault(); event.stopPropagation()
    const step = grid.enabled ? grid.x : event.shiftKey ? 20 : 10
    commit(constrain({ width: rect.width + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
      height: rect.height + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }))
  }}><RichMediaPanelResizeHandle placement="panel" onPointerDown={event => {
    const rect = frame.current?.getBoundingClientRect(); if (!rect) return
    let next = { width: rect.width, height: rect.height }
    beginRichMediaPanelResizeDrag({ event,
      onResize: ({ dx, dy }) => { next = constrain({ width: rect.width + dx, height: rect.height + dy }); setDraft(next) },
      onResizeEnd: () => commit(next) })
  }} /></span>
  return { style, handle, aspect }
}
