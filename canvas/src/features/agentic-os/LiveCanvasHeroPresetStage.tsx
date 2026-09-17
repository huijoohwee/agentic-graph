import React from 'react'
import type { SourceFile } from '@/hooks/store/types'
import type { LiveCanvasHeroSource } from '@/features/canvas/use-agentic-graph-live-canvas-hero'
import { LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, readLiveCanvasHeroSourceSelection } from '@/features/canvas/liveCanvasHeroSourceSelection'
import { AGENTIC_OS_XR_IFRAME_ALLOW } from '@/features/canvas/canvasEmbedIframeMarkup'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LiveCanvasHero } from '@/components/LiveCanvasHero'
import { buildLiveCanvasHeroPresetDemo, type LiveCanvasHeroPresetSelection } from './liveCanvasHeroPresetDemo'
import { loadLiveCanvasHeroDemo, type LiveCanvasHeroDemo } from './liveCanvasHeroDemoSource'
import { resolveCanonicalStartupCanvasEmbedRuntimeUrl } from '@/features/canvas/canvasEmbedPresets'

const FlowCanvas = React.lazy(() => import('@/components/FlowCanvas').then(module => ({
  default: function PresetCanvas(props: React.ComponentProps<typeof module.default>) {
    const requestZoom = useGraphStore(state => state.requestZoom)
    React.useEffect(() => {
      let second = 0
      const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => requestZoom('fit', { intent: 'fitToView' })) })
      return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
    }, [props.graphDataOverride, props.graphDataRevisionOverride, requestZoom])
    return <module.default {...props} />
  },
})))
const AgenticOsMissionControl = React.lazy(() => import('@/features/agent-ready/AgenticOsMissionControl'))
const preserveWorkspace = () => undefined

export function LiveCanvasHeroPresetStage(props: {
  source: LiveCanvasHeroSource
  sourceFiles: readonly SourceFile[]
  visible: boolean
  onEnter: () => void
}) {
  const [selection, setSelection] = React.useState<LiveCanvasHeroPresetSelection | null>(null)
  const [embedUrl, setEmbedUrl] = React.useState<string | undefined>()
  const [demo, setDemo] = React.useState<LiveCanvasHeroDemo | null>(null)
  const [error, setError] = React.useState('')
  const onPresetChange = React.useCallback((next: LiveCanvasHeroPresetSelection) => {
    setSelection(next)
    setEmbedUrl(undefined)
  }, [])
  React.useEffect(() => {
    let current = true
    setDemo(null)
    setError('')
    if (selection?.id && selection.id !== 'agent-observability') void loadLiveCanvasHeroDemo(selection.id).then(value => {
      if (current) setDemo(value)
    }).catch(reason => { if (current) setError(reason instanceof Error ? reason.message : 'Unable to load this demo.') })
    return () => { current = false }
  }, [selection?.id])
  const selectedDemo = demo?.id === selection?.id ? demo : null
  const backgroundUrl = embedUrl || (selectedDemo?.background === 'xr-physics' ? resolveCanonicalStartupCanvasEmbedRuntimeUrl() : undefined)
  const graph = React.useMemo(() => selection && selectedDemo ? buildLiveCanvasHeroPresetDemo(selection, selectedDemo) : null, [selection, selectedDemo])
  React.useEffect(() => {
    const select = (event: Event) => {
      const source = readLiveCanvasHeroSourceSelection(event)
      if (source) setEmbedUrl(source.embedUrl)
    }
    window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, select)
    return () => window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, select)
  }, [])
  const observation = selection?.id === 'agent-observability'
  if (!props.visible) return null
  return (
    <section className={`absolute inset-0 z-[40] bg-[var(--kg-canvas-bg)] ${observation ? 'flex flex-col' : ''}`} data-kg-live-canvas-hero-viewport-owner={props.visible ? 'true' : undefined}>
      <LiveCanvasHero compact={observation} source={props.source} sourceFiles={props.sourceFiles}
        onPresetChange={onPresetChange} onEnter={props.onEnter} />
      <section
        className={observation ? 'relative min-h-0 w-full flex-1' : `absolute inset-0 ${backgroundUrl ? '' : 'md:left-[48%]'}`}
        data-kg-canvas-viewport-root="1"
        aria-label={backgroundUrl ? 'Shared interactive canvas background' : 'Prompt preset demo'}
        data-kg-live-canvas-hero-background={backgroundUrl ? 'shared-embed' : 'prompt-preset'}
        data-kg-live-canvas-hero-preset={selection?.id}
      >
        {observation ? <React.Suspense fallback={<p role="status">Loading observability…</p>}>
          <AgenticOsMissionControl preview onOpenWorkspace={props.onEnter} />
        </React.Suspense> : backgroundUrl ? (
          <iframe src={backgroundUrl} title={embedUrl ? `Interactive canvas embed for ${props.source.sourcePath}` : 'Physics Playground demo'}
            className="absolute inset-0 h-full w-full border-0 bg-transparent"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            allow={AGENTIC_OS_XR_IFRAME_ALLOW} allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            data-kg-live-canvas-hero-selected-embed="true" />
        ) : graph?.nodes.length ? (
          <React.Suspense fallback={<p role="status">Loading preset demo…</p>}>
            <FlowCanvas active graphDataOverride={graph} mutationSourceGraphDataOverride={null}
              graphDataRevisionOverride={props.visible ? 0 : 1}
              canvas2dRendererOverride="storyboard" flowWidgetStateGraphKeyOverride={`preset-demo:${selection?.id}`}
              allowNodeDragOverride={false} forbidCircleNodes
              onNodeChange={preserveWorkspace} onNodePropertiesChange={preserveWorkspace} onNodeRemove={preserveWorkspace} />
          </React.Suspense>
        ) : <p className="p-6 text-sm text-[var(--kg-text-secondary)]" role={error ? 'alert' : 'status'}>{error || 'Loading preset demo…'}</p>}
        {!backgroundUrl && selection?.id !== 'agent-observability' ? <div className="pointer-events-none absolute right-5 top-5 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-3 py-2 text-xs text-[var(--kg-text-secondary)]">
          Example outputs · No model call
        </div> : null}
      </section>
    </section>
  )
}
