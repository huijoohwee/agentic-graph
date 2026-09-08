import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '@/hooks/useGraphStore'
import { startMediaDrag, startMediaPointerDrag } from '@/features/command-menu/mediaCatalogShared'
import { FLOW_RICH_MEDIA_PANEL_FORM_ID, FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID, FLOW_STORYBOARD_ELEMENT_FORM_ID, FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID, FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID } from '@/lib/config.storyboard-widget'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import type { GraphData, GraphNode } from '@/lib/graph/types'
import type { MediaDragPayload } from '@/lib/ui/mediaDragPayload'
import CanvasPage from '@/pages/Canvas'

type StoryboardDropSmokeWindow = Window & {
  __kgStoryboardDropSmoke?: {
    baselineReady: boolean
    dropCount: number
    droppedKinds: string[]
    droppedNodeIds: string[]
    graphRichMediaNodeIds: string[]
    lifecycleStage: string
    markdownDocumentName: string
    openWidgetNodeIds: string[]
    selectedNodeId: string
    shiftedNodeIds: string[]
  }
  __kgStoryboardResetDropSmokeBaseline?: () => void
  __kgStoryboardDropSmokeSourceKey?: string
}

type NodePositionSnapshot = {
  x: number
  y: number
  fx: number | null
  fy: number | null
}

const IMAGE_PAYLOAD: MediaDragPayload = {
  kind: 'image',
  label: 'Smoke image',
  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 203"><rect width="360" height="203" rx="24" fill="#0f172a"/><rect x="18" y="18" width="324" height="167" rx="18" fill="#38bdf8"/><text x="180" y="112" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#082f49">Storyboard Smoke Image</text></svg>')}`,
  sourceKey: 'smoke:image',
}

const VIDEO_PAYLOAD: MediaDragPayload = {
  kind: 'video',
  label: 'Smoke video',
  url: 'https://example.com/storyboard-smoke-video.mp4',
  sourceKey: 'smoke:video',
}

const EXISTING_NODE_IDS = ['storyboard-card-alpha', 'storyboard-card-beta', 'existing-rich-media'] as const

type SmokeBaselineSnapshot = {
  positionsByNodeId: Record<string, NodePositionSnapshot>
  richMediaNodeIds: string[]
}

function buildSmokeGraph(): GraphData {
  return {
    context: 'frontmatter-flow',
    type: 'Graph',
    metadata: {
      kind: 'frontmatter-flow',
      baseGraphKind: 'frontmatter-flow',
    },
    nodes: [
      {
        id: 'storyboard-card-alpha',
        type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
        label: 'Storyboard Alpha',
        x: -360,
        y: -120,
        fx: -360,
        fy: -120,
        vx: 0,
        vy: 0,
        properties: {
          title: 'Storyboard Alpha',
          lane: 'Storyboard',
          summary: 'Pinned baseline storyboard card',
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_STORYBOARD_ELEMENT_FORM_ID,
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
        },
      },
      {
        id: 'storyboard-card-beta',
        type: FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
        label: 'Storyboard Beta',
        x: 40,
        y: 140,
        fx: 40,
        fy: 140,
        vx: 0,
        vy: 0,
        properties: {
          title: 'Storyboard Beta',
          lane: 'Storyboard',
          summary: 'Second pinned storyboard card',
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_STORYBOARD_ELEMENT_FORM_ID,
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
        },
      },
      {
        id: 'existing-rich-media',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Existing Rich Media',
        x: 320,
        y: -100,
        fx: 320,
        fy: -100,
        vx: 0,
        vy: 0,
        properties: {
          imageUrl: IMAGE_PAYLOAD.url,
          mediaUrl: IMAGE_PAYLOAD.url,
          mediaKind: 'image',
          media_kind: 'image',
          richMediaActiveTab: 'image',
          output: '',
          outputSrcDoc: '',
          media_interactive: false,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
        },
      },
    ],
    edges: [],
  }
}

function readNodePositionSnapshot(node: GraphNode | null | undefined): NodePositionSnapshot | null {
  if (!node) return null
  if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return null
  return {
    x: node.x,
    y: node.y,
    fx: Number.isFinite(node.fx) ? node.fx : null,
    fy: Number.isFinite(node.fy) ? node.fy : null,
  }
}

function isSameNodePosition(a: NodePositionSnapshot | null | undefined, b: NodePositionSnapshot | null | undefined): boolean {
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.fx === b.fx && a.fy === b.fy
}

function normalizeSmokeNodeId(nodeId: unknown): string {
  const text = String(nodeId || '').trim()
  if (!text) return ''
  const parts = text.split('::').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || text
}

function readDroppedNodeKind(node: GraphNode): string {
  const properties = node.properties && typeof node.properties === 'object' ? node.properties as Record<string, unknown> : {}
  const explicit = String(properties.mediaKind || properties.media_kind || '').trim()
  if (explicit) return explicit
  if (String(properties.imageUrl || '').trim()) return 'image'
  if (String(properties.videoUrl || '').trim()) return 'video'
  if (String(properties.audioUrl || '').trim()) return 'audio'
  return ''
}

function buildSmokeBaselineSnapshot(nodeById: Map<string, GraphNode>): SmokeBaselineSnapshot | null {
  if (!EXISTING_NODE_IDS.every(id => nodeById.has(id))) return null
  const positionsByNodeId: Record<string, NodePositionSnapshot> = {}
  const richMediaNodeIds: string[] = []
  for (const [id, node] of nodeById) {
    if (String(node?.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) richMediaNodeIds.push(normalizeSmokeNodeId(id))
    const snapshot = readNodePositionSnapshot(node)
    if (snapshot) positionsByNodeId[id] = snapshot
  }
  if (Object.keys(positionsByNodeId).length < EXISTING_NODE_IDS.length) return null
  return { positionsByNodeId, richMediaNodeIds }
}

function StoryboardDropDragButton(props: {
  payload: MediaDragPayload
  surface: 'image' | 'video'
  summary: string
}) {
  return (
    <button
      type="button"
      draggable
      data-kg-storyboard-drop-smoke-source={props.surface}
      className="rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] px-4 py-3 text-left shadow-sm transition hover:border-sky-400 hover:bg-slate-50"
      onDragStart={event => startMediaDrag(event, props.payload)}
      onPointerDown={event => startMediaPointerDrag(event, props.payload)}
    >
      <span className="block text-sm font-semibold text-[var(--kg-text)]">{props.payload.label}</span>
      <span className="mt-1 block text-xs text-[var(--kg-text-secondary)]">{props.summary}</span>
    </button>
  )
}

export function StoryboardRichMediaDropSmokePage() {
  const {
    canvas2dRenderer,
    canvasRenderMode,
    graphData,
    graphRevision,
    lifecycleStage,
    markdownDocumentName,
    openWidgetNodeIds,
    selectedNodeId,
  } = useGraphStore(useShallow(state => ({
    canvas2dRenderer: state.canvas2dRenderer,
    canvasRenderMode: state.canvasRenderMode,
    graphData: state.graphData,
    graphRevision: state.graphDataRevision,
    lifecycleStage: String(state.lifecycleStage || '').trim(),
    markdownDocumentName: String(state.markdownDocumentName || '').trim(),
    openWidgetNodeIds: state.openWidgetNodeIds,
    selectedNodeId: String(state.selectedNodeId || '').trim(),
  })))

  const baselineSnapshotRef = React.useRef<SmokeBaselineSnapshot | null>(null)
  const [baselineRevision, setBaselineRevision] = React.useState(0)
  const [baselineProjectionReady, setBaselineProjectionReady] = React.useState(false)
  const initializedRef = React.useRef(false)

  React.useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    const store = useGraphStore.getState()
    const applySmokeBaseline = () => {
      store.setMarkdownDocument(null, null, { autoEnableFrontmatter: false, applyViewPreset: false })
      store.setCanvasRenderMode('2d')
      store.setCanvas2dRenderer('storyboard')
      store.setDocumentSemanticMode('document')
      store.setFrontmatterModeEnabled(true)
      store.setOpenWidgetNodeIds([])
      store.setGraphData(buildSmokeGraph())
      store.setViewPinned(false)
      store.setFitToScreenMode(false)
      store.setZoomToSelectionMode(false)
      store.clearZoomRequest()
    }
    applySmokeBaseline()
  }, [])

  React.useEffect(() => {
    const store = useGraphStore.getState()
    if (canvasRenderMode !== '2d') store.setCanvasRenderMode('2d')
    if (canvas2dRenderer !== 'storyboard') store.setCanvas2dRenderer('storyboard')
  }, [canvas2dRenderer, canvasRenderMode])

  const nodeById = React.useMemo(() => {
    const map = new Map<string, GraphNode>()
    const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
    for (const node of nodes) {
      const id = String(node?.id || '').trim()
      if (!id || map.has(id)) continue
      map.set(id, node)
    }
    return map
  }, [graphData])

  React.useEffect(() => {
    if (baselineSnapshotRef.current) return
    const snapshot = buildSmokeBaselineSnapshot(nodeById)
    if (snapshot) {
      baselineSnapshotRef.current = snapshot
      setBaselineProjectionReady(false)
      setBaselineRevision(revision => revision + 1)
    }
  }, [nodeById])

  React.useEffect(() => {
    if (typeof document === 'undefined') return
    if (!baselineSnapshotRef.current) return
    if (baselineProjectionReady) return
    let cancelled = false
    let rafId = 0
    const check = () => {
      if (cancelled) return
      const shell = Array.from(document.querySelectorAll<HTMLElement>('[data-kg-rich-media-storyboard-widget-overlay-shell="1"][data-node-id="existing-rich-media"]'))
        .find(element => {
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        }) || null
      if (shell) {
        setBaselineProjectionReady(true)
        return
      }
      rafId = window.requestAnimationFrame(check)
    }
    rafId = window.requestAnimationFrame(check)
    return () => {
      cancelled = true
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [baselineProjectionReady, baselineRevision])

  React.useEffect(() => {
    if (!baselineProjectionReady) return
    const viewport = document.querySelector<HTMLElement>('[aria-label="Canvas viewport"]')
    const rect = viewport?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return
    const store = useGraphStore.getState()
    store.setViewPinned(false)
    store.setFitToScreenMode(false)
    store.setZoomToSelectionMode(false)
    store.clearZoomRequest()
    store.requestZoomTransform({ k: 1, x: rect.width / 2, y: rect.height / 2 })
  }, [baselineProjectionReady])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as StoryboardDropSmokeWindow).__kgStoryboardResetDropSmokeBaseline = () => {
      const nodes = Array.isArray(useGraphStore.getState().graphData?.nodes) ? useGraphStore.getState().graphData!.nodes : []
      const latestNodeById = new Map<string, GraphNode>()
      for (const node of nodes) {
        const id = String(node?.id || '').trim()
        if (id && !latestNodeById.has(id)) latestNodeById.set(id, node)
      }
      const snapshot = buildSmokeBaselineSnapshot(latestNodeById)
      if (snapshot) {
        baselineSnapshotRef.current = snapshot
        setBaselineRevision(revision => revision + 1)
      }
    }
    return () => {
      delete (window as StoryboardDropSmokeWindow).__kgStoryboardResetDropSmokeBaseline
    }
  }, [])

  const droppedRichMediaNodes = React.useMemo(() => {
    const baselineSnapshot = baselineSnapshotRef.current
    if (!baselineSnapshot) return []
    const baselineRichMediaIds = new Set(baselineSnapshot.richMediaNodeIds.map(normalizeSmokeNodeId))
    const activeSourceKey = typeof window === 'undefined'
      ? ''
      : String((window as StoryboardDropSmokeWindow).__kgStoryboardDropSmokeSourceKey || '').trim()
    const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
    return nodes.filter(node => {
      if (String(node?.type || '').trim() !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return false
      if (baselineRichMediaIds.has(normalizeSmokeNodeId(node?.id))) return false
      if (!activeSourceKey) return true
      const props = node.properties && typeof node.properties === 'object' ? node.properties as Record<string, unknown> : {}
      return String(props.mediaSourceKey || '').trim() === activeSourceKey
    })
  }, [baselineRevision, graphData])

  const shiftedExistingNodeIds = React.useMemo(() => {
    const shifted: string[] = []
    const baseline = baselineSnapshotRef.current?.positionsByNodeId || {}
    for (const id of Object.keys(baseline)) {
      const before = baseline[id]
      const after = readNodePositionSnapshot(nodeById.get(id))
      if (!before || !after) continue
      if (!isSameNodePosition(before, after)) shifted.push(id)
    }
    return shifted
  }, [baselineRevision, nodeById])

  const droppedKinds = React.useMemo(
    () => droppedRichMediaNodes.map(readDroppedNodeKind).filter(Boolean),
    [droppedRichMediaNodes],
  )
  const droppedNodeIds = React.useMemo(
    () => Array.from(new Set(droppedRichMediaNodes.map(node => String(node.id || '').trim()).filter(Boolean))),
    [droppedRichMediaNodes],
  )

  const smokeState = React.useMemo(() => ({
    baselineReady: !!baselineSnapshotRef.current && baselineProjectionReady,
    dropCount: droppedNodeIds.length,
    droppedKinds,
    droppedNodeIds,
    graphRichMediaNodeIds: Array.from(nodeById.values())
      .filter(node => String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
      .map(node => String(node.id || '').trim()),
    lifecycleStage,
    markdownDocumentName,
    openWidgetNodeIds: Array.isArray(openWidgetNodeIds) ? openWidgetNodeIds.map(id => String(id || '').trim()).filter(Boolean) : [],
    selectedNodeId,
    shiftedNodeIds: shiftedExistingNodeIds,
  }), [baselineProjectionReady, baselineRevision, droppedKinds, droppedNodeIds, lifecycleStage, markdownDocumentName, nodeById, openWidgetNodeIds, selectedNodeId, shiftedExistingNodeIds])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    ;(window as StoryboardDropSmokeWindow).__kgStoryboardDropSmoke = smokeState
  }, [smokeState])

  return (
    <main
      data-kg-storyboard-drop-smoke-page="1"
      className="relative min-h-screen bg-[var(--kg-canvas-bg)] text-[var(--kg-text)]"
      aria-label="Storyboard rich media drop smoke"
    >
      <aside
        className="pointer-events-none fixed left-6 top-6 z-[500] flex w-[22rem] flex-col gap-4"
        aria-label="Storyboard drop smoke controls"
      >
        <section className="pointer-events-auto rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4 shadow-lg backdrop-blur">
          <header className="flex flex-col gap-2">
            <h1 className="text-base font-semibold">Storyboard Rich Media Drop Smoke</h1>
            <p className="text-xs text-[var(--kg-text-secondary)]">
              Dev-only smoke route for dragging image and video payloads onto the shared Storyboard canvas and verifying that existing authored nodes keep their positions.
            </p>
          </header>
        </section>

        <section className="pointer-events-auto rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4 shadow-lg backdrop-blur">
            <h2 className="text-sm font-semibold">Drag Sources</h2>
            <p className="mt-1 text-xs text-[var(--kg-text-secondary)]">
              Drag each semantic button onto the canvas. The smoke verifier expects one image and one video Rich Media panel to be created.
            </p>
            <section className="mt-4 flex flex-col gap-3">
              <StoryboardDropDragButton payload={IMAGE_PAYLOAD} surface="image" summary="Creates an image Rich Media panel." />
              <StoryboardDropDragButton payload={VIDEO_PAYLOAD} surface="video" summary="Creates a video Rich Media panel." />
            </section>
        </section>

        <section className="pointer-events-auto rounded-2xl border border-[var(--kg-border)] bg-[var(--kg-panel-bg)] p-4 shadow-lg backdrop-blur">
            <h2 className="text-sm font-semibold">Runtime Readout</h2>
            <dl className="mt-3 grid gap-2 text-xs">
              <div className="flex items-start justify-between gap-3">
                <dt className="font-semibold">Graph Revision</dt>
                <dd data-kg-storyboard-drop-smoke-graph-revision="1" className="text-[var(--kg-text-secondary)]">{graphRevision}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="font-semibold">Dropped Count</dt>
                <dd data-kg-storyboard-drop-smoke-drop-count="1" className="text-[var(--kg-text-secondary)]">{smokeState.dropCount}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="font-semibold">Dropped Kinds</dt>
                <dd data-kg-storyboard-drop-smoke-drop-kinds="1" className="text-right text-[var(--kg-text-secondary)]">{smokeState.droppedKinds.join(', ') || 'none'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="font-semibold">Dropped Node IDs</dt>
                <dd data-kg-storyboard-drop-smoke-drop-node-ids="1" className="text-right text-[var(--kg-text-secondary)]">{smokeState.droppedNodeIds.join(', ') || 'none'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="font-semibold">Shifted Existing IDs</dt>
                <dd data-kg-storyboard-drop-smoke-shifted="1" className="text-right text-[var(--kg-text-secondary)]">{smokeState.shiftedNodeIds.join(', ') || 'none'}</dd>
              </div>
            </dl>
        </section>
      </aside>

      <CanvasPage bootstrapRuntimesEnabled={false} />
    </main>
  )
}
