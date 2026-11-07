import React from 'react'
import { subscribeMarkdownPanelMetric } from '@/features/metrics/uiMetrics'
import {
  UI_RESPONSIVE_CANVAS_DIAGNOSTIC_ANCHOR_CLASSNAME,
  UI_RESPONSIVE_CANVAS_DIAGNOSTIC_SCROLL_PANEL_CLASSNAME,
} from '@/lib/ui/responsiveElementClasses'

type MarkdownMetricSample = {
  ts: number
  event: string
  payload: Record<string, unknown>
}

export function CanvasViewportMarkdownMetricsDevOverlay(props: { layout: 'full' | 'pane' }) {
  const [samples, setSamples] = React.useState<MarkdownMetricSample[]>([])
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const anyImportMeta = import.meta as unknown as { env?: { DEV?: boolean } }
    if (!anyImportMeta.env?.DEV) return
    return subscribeMarkdownPanelMetric(detail => {
      const payloadEntries = Object.entries(detail).filter(([k]) => k !== 'event')
      const payload: Record<string, unknown> = {}
      for (const [k, v] of payloadEntries) {
        payload[k] = v
      }
      const sample: MarkdownMetricSample = {
        ts: Date.now(),
        event: detail.event,
        payload,
      }
      setSamples(prev => {
        const next = [sample, ...prev]
        if (next.length > 50) next.length = 50
        return next
      })
    })
  }, [])

  const anyImportMeta = import.meta as unknown as { env?: { DEV?: boolean } }
  if (!anyImportMeta.env?.DEV) return null

  return (
    <aside
      className={`${props.layout === 'pane' ? 'absolute' : 'fixed'} ${UI_RESPONSIVE_CANVAS_DIAGNOSTIC_ANCHOR_CLASSNAME} z-[300] pointer-events-auto`}
      aria-label="Markdown metrics"
    >
      <button
        type="button"
        className="App-toolbar__btn text-xs"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Hide markdown metrics' : 'Show markdown metrics'}
      >
        {open ? 'Hide metrics' : 'Metrics'}
      </button>
      {open ? (
        <section className={`mt-2 ${UI_RESPONSIVE_CANVAS_DIAGNOSTIC_SCROLL_PANEL_CLASSNAME} rounded border border-[color:var(--kg-border)] bg-[color:var(--kg-panel-bg)] p-2 text-xs`}>
          {samples.length === 0 ? (
            <p className="text-[color:var(--kg-text-tertiary)]">No samples yet.</p>
          ) : (
            <ul className="space-y-2">
              {samples.map(s => (
                <li key={s.ts}>
                  <section className="font-mono text-[color:var(--kg-text-secondary)]">
                    {new Date(s.ts).toLocaleTimeString()} {s.event}
                  </section>
                  <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-[color:var(--kg-text-tertiary)]">{JSON.stringify(s.payload, null, 2)}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </aside>
  )
}
