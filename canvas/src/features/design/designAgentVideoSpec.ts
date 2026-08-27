import { HTML_VIDEO_ENGINE_IDS, type RenderSpec } from '@/features/html-video-renderer'
import { FLOW_HTML_VIDEO_RENDERER_NODE_LABEL, FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { buildScopedGraphSemanticKey } from '@/lib/graph/semanticKey'
import type { GraphData, GraphNode, JSONValue } from '@/lib/graph/types'
import { summarizeDesignTokens, type DesignTokenSummary } from './designTokenSummary'

export const DESIGN_AGENT_VIDEO_SCHEMA = 'agenticgraph-design-agent-video/v1' as const

const MAX_VIDEO_LAYERS = 12
const VIDEO_WIDTH = 1280
const VIDEO_HEIGHT = 720
const VIDEO_DURATION_MS = 1800
const VIDEO_FPS = 12
const TRACK_STAGGER_MS = 120
const TRACK_DURATION_MS = 960
const AGENT_WORKSPACE_ROOT = 'agent-design-video'

type DesignVideoLayerBase = {
  id: string
  label: string
  type: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  radius: number
  opacity: number
}

type DesignVideoLayer = DesignVideoLayerBase & {
  trackIndex: number
  startMs: number
  durationMs: number
}

export type DesignAgentVideoTimelineTrack = Pick<
  DesignVideoLayer,
  'id' | 'label' | 'type' | 'trackIndex' | 'startMs' | 'durationMs'
>

export type DesignAgentVideoWorkspaceFile = {
  path: string
  kind: 'html' | 'css' | 'json'
  role: 'composition' | 'style' | 'data' | 'manifest'
}

export type DesignAgentVideoComposition = {
  id: string
  label: string
  sourceLayerId: string
  startMs: number
  durationMs: number
  trackIndex: number
}

export type DesignAgentVideoAsset = {
  id: string
  label: string
  kind: 'design-layer'
  sourceLayerId: string
}

export type DesignAgentVideoTimelineLane = {
  id: string
  label: string
  kind: 'composition' | 'audio'
  tracks: DesignAgentVideoTimelineTrack[]
}

export type DesignAgentVideoTimelineTick = {
  label: string
  timeMs: number
  percent: number
}

export type DesignAgentVideoArtifact = {
  schema: typeof DESIGN_AGENT_VIDEO_SCHEMA
  semanticKey: string
  renderSpec: RenderSpec
  flowNode: GraphNode
  manifest: {
    schema: typeof DESIGN_AGENT_VIDEO_SCHEMA
    semanticKey: string
    layerCount: number
    selectedLayerCount: number
    workspaceFiles: DesignAgentVideoWorkspaceFile[]
    compositions: DesignAgentVideoComposition[]
    assets: DesignAgentVideoAsset[]
    timelineTracks: DesignAgentVideoTimelineTrack[]
    timelineLanes: DesignAgentVideoTimelineLane[]
    timelineTicks: DesignAgentVideoTimelineTick[]
    tokenSummary: DesignTokenSummary
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
)

const readString = (value: unknown): string => String(value ?? '').trim()

const readFiniteNumber = (value: unknown, fallback: number): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
)

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const escapeHtml = (value: unknown): string => readString(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const escapeCssToken = (value: unknown, fallback: string): string => {
  const text = readString(value)
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text
  if (/^(rgb|rgba|hsl|hsla)\([0-9.,%/ a-z-]+\)$/i.test(text)) return text
  if (/^var\(--[-a-z0-9]+\)$/i.test(text)) return text
  return fallback
}

const readNodeProperties = (node: GraphNode): Record<string, JSONValue> => (
  isRecord(node.properties) ? node.properties as Record<string, JSONValue> : {}
)

const readNodeLabel = (node: GraphNode): string => {
  const props = readNodeProperties(node)
  return (
    readString(props['visual:label']) ||
    readString(props.title) ||
    readString(props.name) ||
    readString(node.label) ||
    readString(node.id) ||
    'Layer'
  )
}

const selectedIdSet = (ids: readonly unknown[] | undefined): Set<string> => {
  const set = new Set<string>()
  if (!Array.isArray(ids)) return set
  for (let i = 0; i < ids.length; i += 1) {
    const id = readString(ids[i])
    if (id) set.add(id)
  }
  return set
}

const nodeSortKey = (node: GraphNode): string => {
  const props = readNodeProperties(node)
  const yIndex = readFiniteNumber(props['visual:yIndex'], Number.POSITIVE_INFINITY)
  const xIndex = readFiniteNumber(props['visual:xIndex'], Number.POSITIVE_INFINITY)
  const y = readFiniteNumber((node as GraphNode & { y?: number }).y, 0)
  const x = readFiniteNumber((node as GraphNode & { x?: number }).x, 0)
  return [
    Number.isFinite(yIndex) ? yIndex : y,
    Number.isFinite(xIndex) ? xIndex : x,
    readString(node.id),
  ].join(':')
}

const selectDesignVideoNodes = (graphData: GraphData | null, selectedNodeIds?: readonly unknown[]): GraphNode[] => {
  const nodes = Array.isArray(graphData?.nodes) ? graphData.nodes : []
  const selected = selectedIdSet(selectedNodeIds)
  const scoped = selected.size > 0
    ? nodes.filter(node => selected.has(readString(node.id)))
    : nodes
  return scoped
    .filter(node => readString(node.id))
    .sort((left, right) => nodeSortKey(left).localeCompare(nodeSortKey(right)))
    .slice(0, MAX_VIDEO_LAYERS)
}

const normalizeBounds = (nodes: readonly GraphNode[]): DesignVideoLayerBase[] => {
  const raw = nodes.map((node, index) => {
    const props = readNodeProperties(node)
    const width = clamp(readFiniteNumber(props['visual:width'], 180), 48, 520)
    const height = clamp(readFiniteNumber(props['visual:height'], 96), 32, 320)
    return {
      id: readString(node.id),
      label: readNodeLabel(node),
      type: readString(node.type) || 'Node',
      x: readFiniteNumber((node as GraphNode & { x?: number }).x, (index % 4) * 220),
      y: readFiniteNumber((node as GraphNode & { y?: number }).y, Math.floor(index / 4) * 150),
      width,
      height,
      fill: escapeCssToken(props['visual:fill'], '#ffffff'),
      stroke: escapeCssToken(props['visual:stroke'], '#64748b'),
      radius: clamp(readFiniteNumber(props['visual:borderRadius'], 10), 0, 64),
      opacity: clamp(readFiniteNumber(props['visual:opacity'], 1), 0.16, 1),
    }
  })
  if (raw.length === 0) return []

  const minX = Math.min(...raw.map(layer => layer.x - layer.width / 2))
  const minY = Math.min(...raw.map(layer => layer.y - layer.height / 2))
  const maxX = Math.max(...raw.map(layer => layer.x + layer.width / 2))
  const maxY = Math.max(...raw.map(layer => layer.y + layer.height / 2))
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const scale = Math.min(1.4, Math.max(0.35, Math.min((VIDEO_WIDTH - 220) / spanX, (VIDEO_HEIGHT - 220) / spanY)))
  const offsetX = (VIDEO_WIDTH - spanX * scale) / 2
  const offsetY = (VIDEO_HEIGHT - spanY * scale) / 2

  return raw.map(layer => ({
    ...layer,
    x: Math.round(offsetX + (layer.x - layer.width / 2 - minX) * scale),
    y: Math.round(offsetY + (layer.y - layer.height / 2 - minY) * scale),
    width: Math.round(layer.width * scale),
    height: Math.round(layer.height * scale),
    radius: Math.round(layer.radius * scale),
  }))
}

const buildTimelineTracks = (layers: readonly DesignVideoLayer[]): DesignAgentVideoTimelineTrack[] => (
  layers.map(layer => ({
    id: layer.id,
    label: layer.label,
    type: layer.type,
    trackIndex: layer.trackIndex,
    startMs: layer.startMs,
    durationMs: layer.durationMs,
  }))
)

const buildWorkspaceFiles = (): DesignAgentVideoWorkspaceFile[] => [
  { path: `${AGENT_WORKSPACE_ROOT}/index.html`, kind: 'html', role: 'composition' },
  { path: `${AGENT_WORKSPACE_ROOT}/styles.css`, kind: 'css', role: 'style' },
  { path: `${AGENT_WORKSPACE_ROOT}/data.json`, kind: 'json', role: 'data' },
  { path: `${AGENT_WORKSPACE_ROOT}/manifest.json`, kind: 'json', role: 'manifest' },
]

const buildCompositions = (layers: readonly DesignVideoLayer[]): DesignAgentVideoComposition[] => (
  layers.map(layer => ({
    id: `composition:${layer.id}`,
    label: layer.label,
    sourceLayerId: layer.id,
    startMs: layer.startMs,
    durationMs: layer.durationMs,
    trackIndex: layer.trackIndex,
  }))
)

const buildAssets = (layers: readonly DesignVideoLayer[]): DesignAgentVideoAsset[] => (
  layers.map(layer => ({
    id: `asset:${layer.id}`,
    label: layer.label,
    kind: 'design-layer',
    sourceLayerId: layer.id,
  }))
)

const buildTimelineLanes = (tracks: readonly DesignAgentVideoTimelineTrack[]): DesignAgentVideoTimelineLane[] => [
  {
    id: 'lane:composition',
    label: 'Compositions',
    kind: 'composition',
    tracks: [...tracks],
  },
]

const buildTimelineTicks = (): DesignAgentVideoTimelineTick[] => {
  const tickCount = 4
  return Array.from({ length: tickCount }, (_, index) => {
    const timeMs = Math.round((VIDEO_DURATION_MS / (tickCount - 1)) * index)
    return {
      label: `${(timeMs / 1000).toFixed(index === 0 ? 0 : 1)}s`,
      timeMs,
      percent: VIDEO_DURATION_MS > 0 ? (timeMs / VIDEO_DURATION_MS) * 100 : 0,
    }
  })
}

const buildHtml = (layers: readonly DesignVideoLayer[]): string => {
  const items = layers.map((layer, index) => `
        <li class="kg-design-video-layer" data-start="${(layer.startMs / 1000).toFixed(3)}" data-duration="${(layer.durationMs / 1000).toFixed(3)}" data-track-index="${layer.trackIndex}" style="--kg-layer-x:${layer.x}px;--kg-layer-y:${layer.y}px;--kg-layer-w:${layer.width}px;--kg-layer-h:${layer.height}px;--kg-layer-fill:${layer.fill};--kg-layer-stroke:${layer.stroke};--kg-layer-radius:${layer.radius}px;--kg-layer-opacity:${layer.opacity};--kg-layer-start:${(layer.startMs / 1000).toFixed(3)};--kg-layer-duration-inv:${(1000 / Math.max(1, layer.durationMs)).toFixed(4)};--kg-layer-track:${layer.trackIndex};">
          <article>
            <header>
              <strong>${escapeHtml(layer.label)}</strong>
              <span>${escapeHtml(layer.type)}</span>
            </header>
          </article>
        </li>`).join('')

  return `
    <section class="kg-design-video-stage" data-composition-id="agenticgraph-design-agent-video" data-start="0" data-duration="${(VIDEO_DURATION_MS / 1000).toFixed(3)}" data-width="${VIDEO_WIDTH}" data-height="${VIDEO_HEIGHT}" aria-label="Agent native design video stage">
      <header class="kg-design-video-header">
        <p>2D Renderer: Design</p>
        <h1>Agent-native design workspace</h1>
      </header>
      <ol class="kg-design-video-layers" aria-label="Rendered design layers">${items}
      </ol>
      <footer class="kg-design-video-footer">HTML + CSS + data -> MP4</footer>
    </section>`
}

const buildCss = (): string => `
.kg-design-video-stage {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  color: #0f172a;
  background: #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.kg-design-video-header,
.kg-design-video-footer {
  position: absolute;
  left: 52px;
  right: 52px;
  z-index: 2;
}
.kg-design-video-header {
  top: 34px;
}
.kg-design-video-header p,
.kg-design-video-footer {
  margin: 0;
  color: #475569;
  font-size: 18px;
  line-height: 1.2;
}
.kg-design-video-header h1 {
  margin: 8px 0 0;
  color: #020617;
  font-size: 38px;
  line-height: 1.05;
  letter-spacing: 0;
}
.kg-design-video-footer {
  bottom: 34px;
  font-weight: 650;
}
.kg-design-video-layers {
  position: absolute;
  inset: 118px 52px 86px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.kg-design-video-layer {
  position: absolute;
  left: var(--kg-layer-x);
  top: var(--kg-layer-y);
  width: var(--kg-layer-w);
  height: var(--kg-layer-h);
  opacity: clamp(0.16, calc((var(--kg-render-time-s) - var(--kg-layer-start)) * var(--kg-layer-duration-inv)), var(--kg-layer-opacity));
  transform: translateY(clamp(0px, calc(22px - (var(--kg-render-time-s) - var(--kg-layer-start)) * 28px), 22px));
}
.kg-design-video-layer article {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 14px 16px;
  overflow: hidden;
  border: 2px solid var(--kg-layer-stroke);
  border-radius: var(--kg-layer-radius);
  background: var(--kg-layer-fill);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
}
.kg-design-video-layer header {
  display: grid;
  gap: 6px;
}
.kg-design-video-layer strong,
.kg-design-video-layer span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kg-design-video-layer strong {
  font-size: 17px;
  line-height: 1.2;
}
.kg-design-video-layer span {
  color: #475569;
  font-size: 12px;
  line-height: 1.2;
  text-transform: uppercase;
}
`

export function buildDesignAgentVideoArtifact(args: {
  graphData?: GraphData | null
  graphRevision?: number | null
  selectedNodeIds?: readonly unknown[]
  title?: string
}): DesignAgentVideoArtifact {
  const graphData = args.graphData || null
  const nodes = selectDesignVideoNodes(graphData, args.selectedNodeIds)
  const layers = normalizeBounds(nodes).map((layer, index) => ({
    ...layer,
    trackIndex: index,
    startMs: Math.min(VIDEO_DURATION_MS - 240, index * TRACK_STAGGER_MS),
    durationMs: Math.max(240, Math.min(TRACK_DURATION_MS, VIDEO_DURATION_MS - index * TRACK_STAGGER_MS)),
  }))
  const timelineTracks = buildTimelineTracks(layers)
  const workspaceFiles = buildWorkspaceFiles()
  const compositions = buildCompositions(layers)
  const assets = buildAssets(layers)
  const timelineLanes = buildTimelineLanes(timelineTracks)
  const timelineTicks = buildTimelineTicks()
  const tokenSummary = summarizeDesignTokens({ graphData, graphRevision: args.graphRevision, maxEntries: 8 })
  const semanticKey = buildScopedGraphSemanticKey('design-agent-video', {
    graphData,
    graphRevision: args.graphRevision,
    graphSemanticKey: [
      tokenSummary.semanticKey,
      Array.from(selectedIdSet(args.selectedNodeIds)).sort().join(','),
      layers.map(layer => layer.id).join(','),
    ].filter(Boolean).join(':'),
  })
  const renderSpec: RenderSpec = {
    html: buildHtml(layers),
    css: buildCss(),
    data: {
      schema: DESIGN_AGENT_VIDEO_SCHEMA,
      semanticKey,
      composition: {
        id: 'agenticgraph-design-agent-video',
        durationMs: VIDEO_DURATION_MS,
        fps: VIDEO_FPS,
        width: VIDEO_WIDTH,
        height: VIDEO_HEIGHT,
      },
      workspaceFiles,
      compositions,
      assets,
      timelineTracks,
      timelineLanes,
      timelineTicks,
      layers,
      tokenSummary,
    },
    durationMs: VIDEO_DURATION_MS,
    fps: VIDEO_FPS,
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    engineHint: HTML_VIDEO_ENGINE_IDS.canvas2d,
  }
  const flowNode: GraphNode = {
    id: semanticKey,
    type: FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
    label: args.title || FLOW_HTML_VIDEO_RENDERER_NODE_LABEL,
    properties: {
      html: renderSpec.html as JSONValue,
      css: renderSpec.css as JSONValue,
      data_json: JSON.stringify(renderSpec.data) as JSONValue,
      duration_ms: renderSpec.durationMs as JSONValue,
      fps: renderSpec.fps as JSONValue,
      width: renderSpec.width as JSONValue,
      height: renderSpec.height as JSONValue,
      engine_hint: renderSpec.engineHint as JSONValue,
    },
  }

  return {
    schema: DESIGN_AGENT_VIDEO_SCHEMA,
    semanticKey,
    renderSpec,
    flowNode,
    manifest: {
      schema: DESIGN_AGENT_VIDEO_SCHEMA,
      semanticKey,
      layerCount: layers.length,
      selectedLayerCount: selectedIdSet(args.selectedNodeIds).size,
      workspaceFiles,
      compositions,
      assets,
      timelineTracks,
      timelineLanes,
      timelineTicks,
      tokenSummary,
    },
  }
}
