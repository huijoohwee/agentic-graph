import React from 'react'
import { useSequenceDocument } from './useSequenceDocument'
import { sequenceNativeSvg } from './sequenceNativeSvg'
import { sequenceTopologySvg } from './sequenceTopologySvg'
import { bindSequenceSvg, createSequenceSvgPlayback } from './sequenceSvgBinding'
import { renderMermaidWithRuntime } from '@/lib/mermaid/mermaidRuntime'
import { postprocessMermaidSvg } from '@/lib/mermaid/mermaidSvg'
import { useSvgSurfaceZoomRuntime } from '@/components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { isSpacePanHeld } from '@/lib/canvas/space-pan'
import { SequenceCanvasGrid } from './SequenceCanvasGrid'
import { CanvasViewContainer } from '@/components/CanvasViewContainer'
import { bindSequenceCanvasInteractions } from './sequenceCanvasInteractions'
import { constrainSequenceParticipantPosition, type SequenceParticipantPoint } from './sequenceCanvasLayout'
import { readCanvasAspectRatioMode, resolveCanvasAspectRatioSize } from '@/lib/canvas/canvasAspectRatioDisplayControls'
import { useActiveGraphRenderData } from '@/hooks/useActiveGraphData'
import { useTimelineTransportPlayback } from '@/components/timeline/timelineTransport'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { Canvas2dRendererId } from '@/lib/config.render'
import { useRootThemeMode } from '@/features/panels/views/preview-panel/ui/mermaidConfig'
import './SequenceFlow.css'

const EMPTY_POSITIONS: Record<string, SequenceParticipantPoint> = Object.freeze({})

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
  const schema = useGraphStore(state => state.schema)
  const aspectMode = readCanvasAspectRatioMode(useGraphStore(state => state.strybldrStoryboardCardAspectMode))
  const arrangementKey = `${model.key}:${mermaid}:${layout}:${aspectMode}`
  const [arrangement, setArrangement] = React.useState<{key: string; positions: Record<string, SequenceParticipantPoint>}>({ key: '', positions: EMPTY_POSITIONS })
  const positions = arrangement.key === arrangementKey ? arrangement.positions : EMPTY_POSITIONS
  const [arranging, setArranging] = React.useState(false)
  const interactionsRef = React.useRef<ReturnType<typeof bindSequenceCanvasInteractions> | null>(null)
  const focusParticipantRef = React.useRef<string | null>(null)
  const renderPositions = mermaid ? EMPTY_POSITIONS : positions
  const card = React.useMemo(() => resolveCanvasAspectRatioSize({ defaultWidth: 192, mode: aspectMode }), [aspectMode])
  React.useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const svgKey = `${model.key}:${mermaid}:${mermaidTheme}:${layout}:${aspectMode}`
  const renderKey = `${svgKey}:${JSON.stringify(renderPositions)}`
  React.useEffect(() => {
    if (!active || !model.code || model.diagnostics.length) return
    let disposed = false
    const lifetime = new AbortController()
    setRendered({ key: renderKey, svg: '', error: '' })
    const run = async () => {
      try {
        const svg = mermaid
          ? postprocessMermaidSvg((await renderMermaidWithRuntime({ renderId: `sequence${renderId}`, code: model.code, config: { theme: mermaidTheme, securityLevel: 'strict', startOnLoad: false, sequence: { width: card.width, height: card.height } }, signal: lifetime.signal })).svg)
          : { svg: layout === 'connections' ? sequenceTopologySvg(model, { aspectMode, positions: renderPositions }) : sequenceNativeSvg(model, { aspectMode, positions: renderPositions }), error: null }
        if (svg.error) throw new Error(svg.error)
        if (!disposed) setRendered({ key: renderKey, svg: svg.svg, error: '' })
      } catch (error) {
        if (!disposed) setRendered({ key: renderKey, svg: '', error: error instanceof Error ? error.message : 'Sequence render failed' })
      }
    }
    void run()
    return () => { disposed = true; lifetime.abort() }
  }, [active, renderKey, model, mermaid, renderId, mermaidTheme, layout, aspectMode, card, renderPositions])
  const svg = rendered.key === renderKey ? rendered.svg : ''
  React.useLayoutEffect(() => {
    if (!svg || !hostRef.current) return
    try { bindSequenceSvg(hostRef.current, model, mermaid) }
    catch (error) { setRendered({ key: renderKey, svg: '', error: error instanceof Error ? error.message : 'Sequence binding failed' }) }
  }, [svg, model, mermaid, renderKey])
  useSvgSurfaceZoomRuntime({ active, rootRef, svgHostRef: hostRef, svgMarkup: svg, rendererId,
    graphData, graphDataRevision: sequence.revision, svgSurfaceKey: svgKey })
  React.useLayoutEffect(() => {
    if (!active || !svg || !hostRef.current) return
    const host = hostRef.current
    let interactions: ReturnType<typeof bindSequenceCanvasInteractions>
    try { interactions = bindSequenceCanvasInteractions({ host, model, mermaid, layout,
      schema: () => useGraphStore.getState().schema, positions,
      canArrange: () => useGraphStore.getState().canvasPointerMode2d !== 'pan' && !isSpacePanHeld(),
      constrain: mermaid ? undefined : (id, point) => constrainSequenceParticipantPosition(model, layout, id, point, { aspectMode, positions }),
      onInteractionChange: value => {
        if (value) { transport.setTransportPlaying(false); playbackRef.current?.dispose(); playbackRef.current = null }
        setArranging(value)
      },
      onCommit: (id, point) => {
        focusParticipantRef.current = id
        setArrangement(previous => ({ key: arrangementKey, positions: { ...(previous.key === arrangementKey ? previous.positions : EMPTY_POSITIONS), [id]: point } }))
      },
      onError: error => setRendered({ key: renderKey, svg: '', error: error instanceof Error ? error.message : String(error) }),
    }) } catch (error) {
      setRendered({ key: renderKey, svg: '', error: error instanceof Error ? error.message : 'Sequence arrangement failed' })
      return
    }
    interactionsRef.current = interactions
    const id = focusParticipantRef.current
    if (id) {
      host.querySelector<SVGElement>(`[data-sequence-participant="${CSS.escape(id)}"][tabindex]`)?.focus()
      focusParticipantRef.current = null
    }
    return () => { interactions.dispose(); if (interactionsRef.current === interactions) interactionsRef.current = null }
  }, [active, svg, model, mermaid, layout, positions, aspectMode, arrangementKey, renderKey, transport.setTransportPlaying])
  React.useEffect(() => { interactionsRef.current?.refresh() }, [schema])
  React.useLayoutEffect(() => {
    if (!svg || !hostRef.current || arranging) return
    try {
      const playback = createSequenceSvgPlayback(hostRef.current, events)
      playbackRef.current = playback
      return () => { playback.dispose(); if (playbackRef.current === playback) playbackRef.current = null }
    } catch (error) { setRendered({ key: renderKey, svg: '', error: error instanceof Error ? error.message : 'Sequence binding failed' }) }
  }, [svg, events, renderKey, positions, arranging])
  React.useEffect(() => {
    playbackRef.current?.update(current, transport.playbackPosition, reducedMotion)
  }, [current, svg, events, transport.playbackPosition, reducedMotion, positions, arranging])
  useTimelineTransportPlayback({ active: active && !arranging && Boolean(svg) && !model.diagnostics.length && duration > 0, playing: transport.playing,
    documentKey, position: transport.playbackPosition, max: duration, playbackRate: transport.playbackRate,
    unitsPerMs: 1, onPositionChange: transport.setTransportPlaybackPosition,
    onPlaybackEnd: () => transport.setTransportPlaying(false) })
  React.useEffect(() => {
    if (!active) return
    useGraphStore.getState().setFloatingPanelView('sequence')
  }, [active])
  React.useEffect(() => {
    if (active && rendered.key === renderKey && rendered.error && transport.playing) transport.setTransportPlaying(false)
  }, [active, rendered, renderKey, transport])
  const select = (target: EventTarget | null) => {
    const id = target instanceof Element ? target.closest('[data-sequence-event]')?.getAttribute('data-sequence-event') : null
    if (id) sequence.selectEvent(id)
  }
  return <div className="sequence-flow sequence-canvas" aria-label={mermaid ? 'Sequence Diagram (Mermaid)' : 'Sequence Diagram'}>
    <CanvasViewContainer sizing="inset" overlay><div className="sequence-canvas-chrome"><div className="sequence-canvas-header"><div className="sequence-canvas-status" role="status"><span className="sequence-canvas-eyebrow">Authored rehearsal · {model.participants.length} participants · {model.events.length} events</span><span className="sequence-canvas-current">{model.diagnostics.length ? 'Sequence source needs correction' : `${transport.playing ? 'Playing' : 'Paused'}${current ? ` · ${current.ordinal}. ${current.label}` : ''}`}</span></div>
    <div className="sequence-layout-controls" role="group" aria-label="Sequence layout">{!mermaid && <><button aria-pressed={layout === 'connections'} onClick={() => setLayout('connections')}>Connections</button><button aria-pressed={layout === 'lifelines'} onClick={() => setLayout('lifelines')}>Lifelines</button></>}<button disabled={!Object.keys(positions).length} onClick={() => setArrangement({ key: arrangementKey, positions: EMPTY_POSITIONS })}>Reset arrangement</button></div>
    </div>
    {model.diagnostics.map((d, index) => <p key={index} role="alert">Line {d.line}: {d.message}</p>)}
    {rendered.key === renderKey && rendered.error && <p role="alert">{rendered.error}</p>}
    </div></CanvasViewContainer>
    <div ref={rootRef} className="sequence-canvas-viewport"><SequenceCanvasGrid rootRef={rootRef} hostRef={hostRef} svg={svg} /><div ref={hostRef} className="sequence-svg-host" data-notation-theme={mermaid ? mermaidTheme : undefined} onClick={event => select(event.target)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(event.target) } }} dangerouslySetInnerHTML={{ __html: svg }} /></div>
  </div>
}
