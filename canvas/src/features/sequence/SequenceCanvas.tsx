import React from 'react'
import { useSequenceDocument } from './useSequenceDocument'
import { sequenceNativeSvg } from './sequenceNativeSvg'
import { sequenceTopologySvg } from './sequenceTopologySvg'
import { sequenceEventState } from './sequencePresentation'
import { bindSequenceSvg } from './sequenceSvgBinding'
import { renderMermaidWithRuntime } from '@/lib/mermaid/mermaidRuntime'
import { postprocessMermaidSvg } from '@/lib/mermaid/mermaidSvg'
import { useSvgSurfaceZoomRuntime } from '@/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useTimelineTransportPlayback } from '@/components/timeline/timelineTransport'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { useRootThemeMode } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import './SequenceFlow.css'

export function SequenceCanvas({ active, rendererId, mermaid = false }: { active: boolean; rendererId: Canvas2dRendererId; mermaid?: boolean }) {
  const sequence = useSequenceDocument()
  const { model, events, duration, current, transport, documentKey } = sequence
  const graphData = useActiveGraphRenderData(active)
  const rootRef = React.useRef<HTMLDivElement>(null), hostRef = React.useRef<HTMLDivElement>(null)
  const renderId = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const rootTheme = useRootThemeMode()
  const mermaidTheme = sequence.mermaidTheme || (rootTheme === 'dark' ? 'dark' : 'default')
  const [rendered, setRendered] = React.useState({ key: '', svg: '', error: '' })
  const [layout, setLayout] = React.useState<'connections' | 'lifelines'>('connections')
  const svgKey = `${model.key}:${mermaid}:${mermaidTheme}:${layout}`
  React.useEffect(() => {
    if (!active || !model.code || model.diagnostics.length) return
    let disposed = false
    const lifetime = new AbortController()
    setRendered({ key: svgKey, svg: '', error: '' })
    const run = async () => {
      try {
        const svg = mermaid
          ? postprocessMermaidSvg((await renderMermaidWithRuntime({ renderId: `sequence${renderId}`, code: model.code, config: { theme: mermaidTheme, securityLevel: 'strict', startOnLoad: false }, signal: lifetime.signal })).svg)
          : { svg: layout === 'connections' ? sequenceTopologySvg(model) : sequenceNativeSvg(model), error: null }
        if (svg.error) throw new Error(svg.error)
        if (!disposed) setRendered({ key: svgKey, svg: svg.svg, error: '' })
      } catch (error) {
        if (!disposed) setRendered({ key: svgKey, svg: '', error: error instanceof Error ? error.message : 'Sequence render failed' })
      }
    }
    void run()
    return () => { disposed = true; lifetime.abort() }
  }, [active, svgKey, model, mermaid, renderId, mermaidTheme, layout])
  const svg = rendered.key === svgKey ? rendered.svg : ''
  React.useLayoutEffect(() => {
    if (!svg || !hostRef.current) return
    try { bindSequenceSvg(hostRef.current, model, mermaid) }
    catch (error) { setRendered({ key: svgKey, svg: '', error: error instanceof Error ? error.message : 'Sequence binding failed' }) }
  }, [svg, model, mermaid, svgKey])
  React.useEffect(() => {
    hostRef.current?.querySelector('[data-sequence-pulse]')?.remove()
    for (const participant of hostRef.current?.querySelectorAll('[data-sequence-participant]') || []) {
      const id = participant.getAttribute('data-sequence-participant')
      participant.setAttribute('data-sequence-current', String(id === current?.from || id === current?.to))
    }
    for (const element of hostRef.current?.querySelectorAll('[data-sequence-event]') || []) {
      const id = element.getAttribute('data-sequence-event')
      const event = events.find(entry => entry.id === id)
      const state = sequenceEventState(event, transport.playbackPosition)
      element.setAttribute('data-sequence-current', String(id === current?.id))
      element.setAttribute('data-sequence-state', state)
      if (id !== current?.id || state !== 'active' || !event?.durationMs || window.matchMedia('(prefers-reduced-motion: reduce)').matches) continue
      const path = element.querySelector<SVGGeometryElement>('.sequence-message')
      if (!path?.getTotalLength) continue
      const point = path.getPointAtLength(path.getTotalLength() * Math.min(1, Math.max(0, (transport.playbackPosition - event.startMs) / event.durationMs)))
      const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      pulse.setAttribute('data-sequence-pulse', 'true'); pulse.setAttribute('cx', String(point.x)); pulse.setAttribute('cy', String(point.y)); pulse.setAttribute('r', '5'); pulse.setAttribute('fill', 'var(--kg-canvas-accent)'); pulse.setAttribute('pointer-events', 'none')
      element.append(pulse)
    }
  }, [current?.id, svg, events, transport.playbackPosition])
  useSvgSurfaceZoomRuntime({ active, rootRef, svgHostRef: hostRef, svgMarkup: svg, rendererId,
    graphData, graphDataRevision: sequence.revision, svgSurfaceKey: svgKey })
  useTimelineTransportPlayback({ active: active && !model.diagnostics.length, playing: transport.playing,
    documentKey, position: transport.playbackPosition, max: duration, playbackRate: transport.playbackRate,
    unitsPerMs: 1, onPositionChange: transport.setTransportPlaybackPosition,
    onPlaybackEnd: () => transport.setTransportPlaying(false) })
  React.useEffect(() => {
    if (!active) return
    useGraphStore.getState().setFloatingPanelView('sequence')
  }, [active])
  const select = (target: EventTarget | null) => {
    const id = target instanceof Element ? target.closest('[data-sequence-event]')?.getAttribute('data-sequence-event') : null
    if (id) sequence.selectEvent(id)
  }
  return <div ref={rootRef} className="sequence-flow sequence-canvas" aria-label={mermaid ? 'Sequence Diagram (Mermaid)' : 'Sequence Diagram'}>
    <div className="sequence-canvas-header"><div className="sequence-canvas-status" role="status">{model.diagnostics.length ? 'Sequence source needs correction' : `Authored rehearsal · ${model.events.length} events · ${transport.playing ? 'Playing' : 'Paused'}${current ? ` · ${current.label}` : ''}`}</div>
    {!mermaid && <div className="sequence-layout-controls" role="group" aria-label="Sequence layout"><button aria-pressed={layout === 'connections'} onClick={() => setLayout('connections')}>Connections</button><button aria-pressed={layout === 'lifelines'} onClick={() => setLayout('lifelines')}>Lifelines</button></div>}
    </div>
    {model.diagnostics.map((d, index) => <p key={index} role="alert">Line {d.line}: {d.message}</p>)}
    {rendered.key === svgKey && rendered.error && <p role="alert">{rendered.error}</p>}
    <div ref={hostRef} className="sequence-svg-host" onClick={event => select(event.target)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event.target) } }} dangerouslySetInnerHTML={{ __html: svg }} />
  </div>
}
