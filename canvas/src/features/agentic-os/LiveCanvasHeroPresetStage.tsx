import React from 'react'
import type { SourceFile } from '@/hooks/store/types'
import type { LiveCanvasHeroSource } from '@/features/canvas/use-agentic-graph-live-canvas-hero'
import { LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, readLiveCanvasHeroSourceSelection } from '@/features/canvas/liveCanvasHeroSourceSelection'
import { AGENTIC_OS_XR_IFRAME_ALLOW } from '@/features/canvas/canvasEmbedIframeMarkup'
import { useGraphStore } from '@/hooks/useGraphStore'
import { LiveCanvasHero } from '@/components/LiveCanvasHero'
import { buildLiveCanvasHeroPresetDemo, type LiveCanvasHeroPresetSelection } from './liveCanvasHeroPresetDemo'

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
const preserveWorkspace = () => undefined

export function LiveCanvasHeroPresetStage(props: {
  source: LiveCanvasHeroSource
  sourceFiles: readonly SourceFile[]
  visible: boolean
  demoVisible: boolean
  chatOpen: boolean
  onCloseDemo: () => void
  onEnter: () => void
}) {
  const [selection, setSelection] = React.useState<LiveCanvasHeroPresetSelection | null>(null)
  const [embedUrl, setEmbedUrl] = React.useState<string | undefined>()
  const chatWasOpened = React.useRef(false)
  const onPresetChange = React.useCallback((next: LiveCanvasHeroPresetSelection) => {
    setSelection(next)
    setEmbedUrl(undefined)
  }, [])
  const graph = React.useMemo(() => selection ? buildLiveCanvasHeroPresetDemo(selection) : null, [selection])
  React.useEffect(() => {
    const select = (event: Event) => {
      const source = readLiveCanvasHeroSourceSelection(event)
      if (source) setEmbedUrl(source.embedUrl)
    }
    window.addEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, select)
    return () => window.removeEventListener(LIVE_CANVAS_HERO_SOURCE_SELECT_EVENT, select)
  }, [])
  const showing = props.visible || props.demoVisible
  React.useEffect(() => {
    if (!props.demoVisible) { chatWasOpened.current = false; return }
    if (props.chatOpen) chatWasOpened.current = true
    else if (chatWasOpened.current) props.onCloseDemo()
  }, [props.demoVisible, props.chatOpen, props.onCloseDemo])
  if (!showing) return null
  return (
    <section className="absolute inset-0 z-[40] bg-[var(--kg-canvas-bg)]" data-kg-live-canvas-hero-viewport-owner={props.visible ? 'true' : undefined}>
      <section
        className={`absolute inset-0 ${props.visible ? embedUrl ? '' : 'md:left-[48%]' : 'md:right-[25rem]'}`}
        data-kg-canvas-viewport-root="1"
        aria-label={embedUrl ? 'Shared interactive canvas background' : 'Prompt preset demo'}
        data-kg-live-canvas-hero-background={embedUrl ? 'shared-embed' : 'prompt-preset'}
        data-kg-live-canvas-hero-preset={selection?.id}
      >
        {embedUrl ? (
          <iframe src={embedUrl} title={`Interactive canvas embed for ${props.source.sourcePath}`}
            className="absolute inset-0 h-full w-full border-0 bg-transparent"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
            allow={AGENTIC_OS_XR_IFRAME_ALLOW} allowFullScreen referrerPolicy="strict-origin-when-cross-origin"
            data-kg-live-canvas-hero-selected-embed="true" />
        ) : graph?.nodes.length ? (
          <React.Suspense fallback={<p role="status">Loading preset demo…</p>}>
            <FlowCanvas active graphDataOverride={graph} mutationSourceGraphDataOverride={null}
              graphDataRevisionOverride={props.visible ? 0 : 1}
              canvas2dRendererOverride="flow" flowWidgetStateGraphKeyOverride={`preset-demo:${selection?.id}`}
              allowNodeDragOverride={false} forbidCircleNodes
              onNodeChange={preserveWorkspace} onNodePropertiesChange={preserveWorkspace} onNodeRemove={preserveWorkspace} />
          </React.Suspense>
        ) : <p className="p-6 text-sm text-[var(--kg-text-secondary)]" role="status">Choose a prompt to preview it here.</p>}
        {!embedUrl ? <div className="pointer-events-none absolute right-5 top-5 rounded-lg border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-3 py-2 text-xs text-[var(--kg-text-secondary)]">
          Prompt preset demo · No execution
        </div> : null}
        {!props.visible ? <button type="button" onClick={props.onCloseDemo} className="absolute bottom-5 left-5 rounded-lg border bg-[var(--kg-panel-bg)] px-3 py-2 text-sm">Back to workspace</button> : null}
      </section>
      {props.visible ? <LiveCanvasHero source={props.source} sourceFiles={props.sourceFiles} onPresetChange={onPresetChange}
        onEnter={props.onEnter} /> : null}
    </section>
  )
}
