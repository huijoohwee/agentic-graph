import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useGraphStore } from '@/hooks/useGraphStore'
import {
  ResponsiveControlInput,
  ResponsiveControlRow,
} from '@/lib/ui/responsiveControlRows'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'

const FRAME_W = 320
const FRAME_H = 240

type FrameRect = { x: number; y: number; w: number; h: number }

const normId = (v: unknown): string => String(v || '').trim()

const clampSizeW = (v: number) => Math.max(24, v)
const clampSizeH = (v: number) => Math.max(18, v)

function deriveRect(args: {
  base: { x: number; y: number; w: number; h: number }
  posOverride?: { x: number; y: number } | null
  sizeOverride?: { w: number; h: number } | null
}): FrameRect {
  const size = args.sizeOverride
  const w = size && Number.isFinite(size.w) ? clampSizeW(size.w) : args.base.w
  const h = size && Number.isFinite(size.h) ? clampSizeH(size.h) : args.base.h
  const pos = args.posOverride
  if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y, w, h }
  return { x: args.base.x, y: args.base.y, w, h }
}

function readUniformNumber(values: number[]): number | null {
  if (values.length === 0) return null
  const first = values[0]
  if (first == null || !Number.isFinite(first)) return null
  for (let i = 1; i < values.length; i += 1) {
    const v = values[i]
    if (v == null || !Number.isFinite(v)) return null
    if (Math.abs(v - first) > 1e-6) return null
  }
  return first
}

function NumberFieldRow(props: {
  label: string
  value: string
  placeholder?: string
  onChange: (next: string) => void
  onSubmit: () => void
}) {
  return (
    <ResponsiveControlRow label={props.label}>
      <ResponsiveControlInput
        type="number"
        value={props.value}
        placeholder={props.placeholder}
        onChange={e => props.onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') props.onSubmit()
        }}
        className="text-right"
      />
    </ResponsiveControlRow>
  )
}

export default function DesignInspectorPanel({ active }: { active: boolean }) {
  const {
    selectedNodeIds,
    selectedNodeId,
    graphData,
    designRendererGraphNodesById,
    designFramePosById,
    designFrameSizeById,
    commitDesignFrameRectHistory,
  } = useGraphStore(
    useShallow(s => ({
      selectedNodeIds: Array.isArray(s.selectedNodeIds) ? s.selectedNodeIds : [],
      selectedNodeId: s.selectedNodeId,
      graphData: s.graphData,
      designRendererGraphNodesById: s.designRendererGraphNodesById,
      designFramePosById: s.designFramePosById,
      designFrameSizeById: s.designFrameSizeById,
      commitDesignFrameRectHistory: s.commitDesignFrameRectHistory,
    })),
  )

  const selectedIds = React.useMemo(() => {
    const ids = selectedNodeIds.map(normId).filter(Boolean)
    if (ids.length > 0) return Array.from(new Set(ids))
    const single = normId(selectedNodeId)
    return single ? [single] : []
  }, [selectedNodeId, selectedNodeIds])

  const rectById = React.useMemo(() => {
    const out: Record<string, FrameRect> = {}
    if (!active) return out

    const byIdFromGraphData = new Map<string, unknown>()
    const nodes = (graphData && typeof graphData === 'object' ? (graphData as { nodes?: unknown }).nodes : null) as unknown
    if (Array.isArray(nodes)) {
      for (let i = 0; i < nodes.length; i += 1) {
        const n = nodes[i] as { id?: unknown }
        const id = normId(n?.id)
        if (id) byIdFromGraphData.set(id, n)
      }
    }

    for (let i = 0; i < selectedIds.length; i += 1) {
      const id = selectedIds[i]!
      const preferred = designRendererGraphNodesById?.[id] as unknown
      const fallback = byIdFromGraphData.get(id)
      const node = (preferred && typeof preferred === 'object') ? preferred : fallback
      if (!node || typeof node !== 'object') continue

      const record = node as { x?: unknown; y?: unknown; properties?: unknown }
      const props = (record.properties && typeof record.properties === 'object' ? record.properties : {}) as Record<string, unknown>
      const baseW = typeof props['visual:width'] === 'number' ? (props['visual:width'] as number) : FRAME_W
      const baseH = typeof props['visual:height'] === 'number' ? (props['visual:height'] as number) : FRAME_H
      const cx = typeof record.x === 'number' && Number.isFinite(record.x) ? (record.x as number) : 0
      const cy = typeof record.y === 'number' && Number.isFinite(record.y) ? (record.y as number) : 0
      const base = { x: cx - baseW / 2, y: cy - baseH / 2, w: baseW, h: baseH }
      out[id] = deriveRect({
        base,
        posOverride: (designFramePosById && typeof designFramePosById === 'object' ? (designFramePosById as Record<string, { x: number; y: number }>)[id] : null) || null,
        sizeOverride: (designFrameSizeById && typeof designFrameSizeById === 'object' ? (designFrameSizeById as Record<string, { w: number; h: number }>)[id] : null) || null,
      })
    }
    return out
  }, [active, designFramePosById, designFrameSizeById, designRendererGraphNodesById, graphData, selectedIds])

  const uniform = React.useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    const ws: number[] = []
    const hs: number[] = []
    for (let i = 0; i < selectedIds.length; i += 1) {
      const r = rectById[selectedIds[i]!]!
      if (!r) continue
      xs.push(r.x)
      ys.push(r.y)
      ws.push(r.w)
      hs.push(r.h)
    }
    return {
      x: readUniformNumber(xs),
      y: readUniformNumber(ys),
      w: readUniformNumber(ws),
      h: readUniformNumber(hs),
    }
  }, [rectById, selectedIds])

  const selectionKey = React.useMemo(() => selectedIds.join('|'), [selectedIds])

  const [xText, setXText] = React.useState('')
  const [yText, setYText] = React.useState('')
  const [wText, setWText] = React.useState('')
  const [hText, setHText] = React.useState('')

  React.useEffect(() => {
    setXText(uniform.x != null ? String(Math.round(uniform.x * 100) / 100) : '')
    setYText(uniform.y != null ? String(Math.round(uniform.y * 100) / 100) : '')
    setWText(uniform.w != null ? String(Math.round(uniform.w * 100) / 100) : '')
    setHText(uniform.h != null ? String(Math.round(uniform.h * 100) / 100) : '')
  }, [selectionKey, uniform.h, uniform.w, uniform.x, uniform.y])

  const apply = React.useCallback(() => {
    if (!active) return
    if (selectedIds.length === 0) return
    const framePosPatch: Record<string, { x: number; y: number }> = {}
    const frameSizePatch: Record<string, { w: number; h: number }> = {}

    const parseOrNull = (raw: string): number | null => {
      const t = String(raw || '').trim()
      if (!t) return null
      const v = Number.parseFloat(t)
      return Number.isFinite(v) ? v : null
    }

    const xNext = parseOrNull(xText)
    const yNext = parseOrNull(yText)
    const wNext = parseOrNull(wText)
    const hNext = parseOrNull(hText)

    for (let i = 0; i < selectedIds.length; i += 1) {
      const id = selectedIds[i]!
      const cur = rectById[id]
      if (!cur) continue
      const nextX = xNext != null ? xNext : cur.x
      const nextY = yNext != null ? yNext : cur.y
      const nextW = wNext != null ? clampSizeW(wNext) : cur.w
      const nextH = hNext != null ? clampSizeH(hNext) : cur.h

      if (Math.abs(nextX - cur.x) > 1e-6 || Math.abs(nextY - cur.y) > 1e-6) framePosPatch[id] = { x: nextX, y: nextY }
      if (Math.abs(nextW - cur.w) > 1e-6 || Math.abs(nextH - cur.h) > 1e-6) frameSizePatch[id] = { w: nextW, h: nextH }
    }

    if (Object.keys(framePosPatch).length === 0 && Object.keys(frameSizePatch).length === 0) return

    commitDesignFrameRectHistory({
      label: 'Inspector',
      framePosPatch: Object.keys(framePosPatch).length > 0 ? framePosPatch : undefined,
      frameSizePatch: Object.keys(frameSizePatch).length > 0 ? frameSizePatch : undefined,
    })
  }, [active, commitDesignFrameRectHistory, hText, rectById, selectedIds, wText, xText, yText])

  const anySelected = selectedIds.length > 0
  const anyRect = anySelected && selectedIds.some(id => !!rectById[id])

  if (!active) {
    return <section className={`px-3 py-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Inspector is available in Design renderer.</section>
  }

  if (!anySelected) {
    return <section className={`px-3 py-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Select one or more frames to inspect.</section>
  }

  if (!anyRect) {
    return <section className={`px-3 py-2 text-xs ${UI_THEME_TOKENS.text.secondary}`}>Inspector requires selectable Design frames.</section>
  }

  const mixed = '—'
  return (
    <section className="space-y-2 px-3 py-2" aria-label="Design style inspector">
      <header className="flex items-center justify-between gap-2">
        <section className={`text-xs font-semibold ${UI_THEME_TOKENS.text.primary}`}>Style</section>
        <section className={`font-mono text-xs ${UI_THEME_TOKENS.text.tertiary}`}>
          {selectedIds.length} selected
        </section>
      </header>
      <section className={`rounded border p-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`} aria-label="Position">
        <header className={`mb-2 text-xs font-semibold ${UI_THEME_TOKENS.text.tertiary}`}>Position</header>
        <NumberFieldRow label="X" value={xText} placeholder={uniform.x == null ? mixed : undefined} onChange={setXText} onSubmit={apply} />
        <NumberFieldRow label="Y" value={yText} placeholder={uniform.y == null ? mixed : undefined} onChange={setYText} onSubmit={apply} />
      </section>
      <section className={`rounded border p-2 ${UI_THEME_TOKENS.panel.border} ${UI_THEME_TOKENS.panel.bg}`} aria-label="Size">
        <header className={`mb-2 text-xs font-semibold ${UI_THEME_TOKENS.text.tertiary}`}>Size</header>
        <NumberFieldRow label="W" value={wText} placeholder={uniform.w == null ? mixed : undefined} onChange={setWText} onSubmit={apply} />
        <NumberFieldRow label="H" value={hText} placeholder={uniform.h == null ? mixed : undefined} onChange={setHText} onSubmit={apply} />
      </section>
      <section className="pt-1 flex justify-end">
        <button
          type="button"
          className={`App-toolbar__btn text-xs border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.hoverBg} ${UI_THEME_TOKENS.text.primary}`}
          onClick={apply}
        >
          Apply
        </button>
      </section>
    </section>
  )
}
