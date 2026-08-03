import React from 'react'
import { createPortal } from 'react-dom'

import { CanvasPerformanceReadoutOverlay } from '@/features/canvas/CanvasPerformanceReadoutOverlay'
import { useGraphStore } from '@/hooks/useGraphStore'
import { setPipelinePerfEnabled } from '@/lib/pipelinePerf'
import type { PipelinePerfDetail } from '@/lib/pipelinePerf'
import { UI_THEME_TOKENS } from '@/lib/ui/theme-tokens'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { uiSelectedRowStateClassName } from 'grph-shared/ui/selectedRowClasses'

type PerfStageEntry = { key: string; label: string; durationMs: number }

export function CanvasPerformancePanel() {
  const [perfOpen, setPerfOpen] = React.useState(false)
  const [rafFps, setRafFps] = React.useState(0)
  const [stateUps, setStateUps] = React.useState(0)
  const [lastLayoutInitMs, setLastLayoutInitMs] = React.useState<number | null>(null)
  const [recentPerfStages, setRecentPerfStages] = React.useState<PerfStageEntry[]>([])
  const automationPerfEnabled = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('kgAutomationPerf') === '1'
  }, [])
  const perfEnabled = perfOpen || automationPerfEnabled

  React.useEffect(() => {
    setPipelinePerfEnabled(perfEnabled)
  }, [perfEnabled])

  React.useEffect(() => {
    if (!perfEnabled) return
    let raf = 0
    let frameCount = 0
    let lastTs = performance.now()
    const loop = (ts: number) => {
      frameCount += 1
      if (ts - lastTs >= 1000) {
        setRafFps(frameCount)
        frameCount = 0
        lastTs = ts
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [perfEnabled])

  React.useEffect(() => {
    if (!perfEnabled) return
    let zoomUpdates = 0
    let layoutUpdates = 0
    const unsubZoom = useGraphStore.subscribe(s => s.zoomState, () => {
      zoomUpdates += 1
    })
    const unsubLayout = useGraphStore.subscribe(s => s.layoutPositionCacheByMode, () => {
      layoutUpdates += 1
    })
    const timer = window.setInterval(() => {
      setStateUps(zoomUpdates + layoutUpdates)
      zoomUpdates = 0
      layoutUpdates = 0
    }, 1000)
    return () => {
      unsubZoom()
      unsubLayout()
      window.clearInterval(timer)
    }
  }, [perfEnabled])

  React.useEffect(() => {
    if (!perfEnabled) return
    const handler = (ev: Event) => {
      const e = ev as CustomEvent<PipelinePerfDetail>
      const d = e.detail
      if (!d) return
      if (d.name === 'render' && d.stage === 'layout:init') {
        setLastLayoutInitMs(Math.round(d.durationMs * 10) / 10)
      }
      if (d.name === 'render' && (d.stage.startsWith('graphRoot:') || d.stage.startsWith('scene:') || d.stage.startsWith('presentation:'))) {
        const label = d.stage.replace(/^graphRoot:/, 'root:').replace(/^presentation:/, 'present:')
        const durationMs = Math.round(d.durationMs * 10) / 10
        setRecentPerfStages(prev => {
          const next = [{ key: d.stage, label, durationMs }, ...prev.filter(entry => entry.key !== d.stage)]
          return next.slice(0, 6)
        })
      }
    }
    window.addEventListener('kg-pipeline-perf', handler as EventListener)
    return () => {
      window.removeEventListener('kg-pipeline-perf', handler as EventListener)
    }
  }, [perfEnabled])

  const automationPerfLines = React.useMemo(() => {
    if (!perfEnabled) return []
    const lines = [
      `render_updates_per_sec=${rafFps}`,
      `state_updates_per_sec=${stateUps}`,
      `last_layout_init_ms=${lastLayoutInitMs == null ? '-' : lastLayoutInitMs}`,
    ]
    for (let i = 0; i < recentPerfStages.length; i += 1) {
      const entry = recentPerfStages[i]!
      lines.push(`stage.${entry.label.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()}=${entry.durationMs}`)
    }
    return lines
  }, [lastLayoutInitMs, perfEnabled, rafFps, recentPerfStages, stateUps])

  return (
    <>
      <CollapsibleSection title="Performance" defaultCollapsed={false} stickyHeader={false}>
        <section className="mt-2 space-y-2">
          <button
            type="button"
            className={`w-full rounded-md px-2 py-1.5 text-xs transition ${perfOpen ? uiSelectedRowStateClassName(true) : `border ${UI_THEME_TOKENS.input.border} ${UI_THEME_TOKENS.button.text} ${UI_THEME_TOKENS.button.hoverBg}`}`}
            onClick={() => setPerfOpen(v => !v)}
          >
            {perfEnabled ? 'Hide Perf Overlay' : 'Show Perf Overlay'}
          </button>
          {perfEnabled ? (
            <section className={`rounded-md border p-2 text-xs ${UI_THEME_TOKENS.panel.bg} ${UI_THEME_TOKENS.input.border}`}>
              <section className={`flex items-center justify-between ${UI_THEME_TOKENS.text.secondary}`}>
                <span>Render updates/sec</span>
                <span className="font-mono">{rafFps}</span>
              </section>
              <section className={`mt-1 flex items-center justify-between ${UI_THEME_TOKENS.text.secondary}`}>
                <span>State updates/sec</span>
                <span className="font-mono">{stateUps}</span>
              </section>
              <section className={`mt-1 flex items-center justify-between ${UI_THEME_TOKENS.text.secondary}`}>
                <span>Last layout init (ms)</span>
                <span className="font-mono">{lastLayoutInitMs == null ? '-' : lastLayoutInitMs}</span>
              </section>
              {recentPerfStages.length > 0 ? (
                <section className="mt-2 space-y-1">
                  {recentPerfStages.map(entry => (
                    <section key={entry.key} className={`flex items-center justify-between ${UI_THEME_TOKENS.text.secondary}`}>
                      <span>{entry.label}</span>
                      <span className="font-mono">{entry.durationMs}</span>
                    </section>
                  ))}
                </section>
              ) : null}
            </section>
          ) : null}
        </section>
      </CollapsibleSection>
      {perfOpen && typeof document !== 'undefined' && document.body
        ? createPortal(
            <CanvasPerformanceReadoutOverlay lines={automationPerfLines} />,
            document.body,
          )
        : null}
    </>
  )
}
