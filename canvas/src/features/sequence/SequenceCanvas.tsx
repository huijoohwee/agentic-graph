import React from 'react'
import { useSequenceDocument } from './useSequenceDocument'
import { sequenceNativeSvg } from './sequenceNativeSvg'
import { sequenceTopologySvg } from './sequenceTopologySvg'
import { bindSequenceSvg, createSequenceSvgPlayback } from './sequenceSvgBinding'
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
  const playbackRef = React.useRef<ReturnType<typeof createSequenceSvgPlayback> | null>(null)
  const [reducedMotion, setReducedMotion] = React.useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const renderId = React.useId().replace(/[^a-zA-Z0-9]/g, '')
  const rootTheme = useRootThemeMode()
  const mermaidTheme = sequence.mermaidTheme || (rootTheme === 'dark' ? 'dark' : 'default')
  const [rendered, setRendered] = React.useState({ key: '', svg: '', error: '' })
  const [layout, setLayout] = React.useState<'connections' | 'lifelines'>('connections')
  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
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
  React.useLayoutEffect(() => {
    if (!svg || !hostRef.current) return
    try {
      const playback = createSequenceSvgPlayback(hostRef.current, events)
      playbackRef.current = playback
      return () => { playback.dispose(); if (playbackRef.current === playback) playbackRef.current = null }
    } catch (error) { setRendered({ key: svgKey, svg: '', error: error instanceof Error ? error.message : 'Sequence binding failed' }) }
  }, [svg, events, svgKey])
  React.useEffect(() => {
    playbackRef.current?.update(current, transport.playbackPosition, reducedMotion)
  }, [current, svg, events, transport.playbackPosition, reducedMotion])
  useSvgSurfaceZoomRuntime({ active, rootRef, svgHostRef: hostRef, svgMarkup: svg, rendererId,
    graphData, graphDataRevision: sequence.revision, svgSurfaceKey: svgKey })
  useTimelineTransportPlayback({ active: active && Boolean(svg) && !model.diagnostics.length && duration > 0, playing: transport.playing,
    documentKey, position: transport.playbackPosition, max: duration, playbackRate: transport.playbackRate,
    unitsPerMs: 1, onPositionChange: transport.setTransportPlaybackPosition,
    onPlaybackEnd: () => transport.setTransportPlaying(false) })
  React.useEffect(() => {
    if (!active) return
    useGraphStore.getState().setFloatingPanelView('sequence')
  }, [active])
  React.useEffect(() => {
    if (active && rendered.key === svgKey && rendered.error && transport.playing) transport.setTransportPlaying(false)
  }, [active, rendered, svgKey, transport])
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
    <div ref={hostRef} className="sequence-svg-host" data-notation-theme={mermaid ? mermaidTheme : undefined} onClick={event => select(event.target)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event.target) } }} dangerouslySetInnerHTML={{ __html: svg }} />
  </div>
}
