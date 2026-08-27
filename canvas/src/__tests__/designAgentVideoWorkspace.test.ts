import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildDesignAgentVideoArtifact, DESIGN_AGENT_VIDEO_SCHEMA } from '@/features/design/designAgentVideoSpec'
import { HTML_VIDEO_ENGINE_IDS } from '@/features/html-video-renderer'
import { FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import type { GraphData } from '@/lib/graph/types'

const sampleDesignGraph = (): GraphData => ({
  type: 'agenticgraph',
  nodes: [
    {
      id: 'hero-card',
      type: 'DesignFrame',
      label: 'Hero Card',
      x: 120,
      y: 80,
      properties: {
        'visual:label': 'Hero Card',
        'visual:fill': '#f8fafc',
        'visual:stroke': '#0f766e',
        'visual:width': 320,
        'visual:height': 180,
        'visual:borderRadius': 18,
      },
    },
    {
      id: 'cta-button',
      type: 'DesignComponent',
      label: 'CTA Button',
      x: 480,
      y: 240,
      properties: {
        'visual:fill': '#ccfbf1',
        'visual:stroke': '#115e59',
        'visual:width': 180,
        'visual:height': 64,
      },
    },
  ],
  edges: [],
})

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

export function testDesignAgentVideoArtifactBuildsSemanticHtmlVideoSpecFromGraph() {
  const artifact = buildDesignAgentVideoArtifact({
    graphData: sampleDesignGraph(),
    graphRevision: 7,
    selectedNodeIds: ['hero-card'],
  })
  if (artifact.schema !== DESIGN_AGENT_VIDEO_SCHEMA) throw new Error('expected design agent video schema')
  if (artifact.renderSpec.engineHint !== HTML_VIDEO_ENGINE_IDS.canvas2d) throw new Error('expected explicit canvas-2d engine hint')
  if (artifact.flowNode.type !== FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID) throw new Error('expected HTML video renderer flow node')
  if (artifact.manifest.layerCount !== 1 || artifact.manifest.selectedLayerCount !== 1) throw new Error('expected selected graph scope')
  if (artifact.manifest.timelineTracks.length !== 1 || artifact.manifest.timelineTracks[0]?.trackIndex !== 0) {
    throw new Error('expected source-derived seekable timeline tracks')
  }
  if (artifact.manifest.workspaceFiles.length < 4 || artifact.manifest.workspaceFiles[0]?.path !== 'agent-design-video/index.html') {
    throw new Error('expected neutral virtual workspace file manifest')
  }
  if (artifact.manifest.compositions[0]?.sourceLayerId !== 'hero-card' || artifact.manifest.assets[0]?.sourceLayerId !== 'hero-card') {
    throw new Error('expected composition and asset manifests to stay source-derived')
  }
  if (artifact.manifest.timelineLanes[0]?.tracks[0]?.id !== 'hero-card') {
    throw new Error('expected timeline lanes to wrap source-derived tracks')
  }
  if (artifact.manifest.timelineTicks.length < 2 || artifact.manifest.timelineTicks[0]?.label !== '0s') {
    throw new Error('expected deterministic design timeline ticks')
  }

  for (const semanticTag of ['<section', '<header', '<h1', '<ol', '<li', '<article', '<footer']) {
    if (!artifact.renderSpec.html.includes(semanticTag)) throw new Error(`expected semantic HTML tag ${semanticTag}`)
  }
  for (const requiredHtml of ['data-composition-id="agenticgraph-design-agent-video"', 'data-start="0.000"', 'data-duration=', 'data-track-index="0"']) {
    if (!artifact.renderSpec.html.includes(requiredHtml)) throw new Error(`expected seekable composition marker ${requiredHtml}`)
  }
  for (const requiredCss of ['--kg-render-time-s', '--kg-layer-start', '--kg-layer-duration-inv', '.kg-design-video-layer', 'opacity: clamp']) {
    if (!String(artifact.renderSpec.css || '').includes(requiredCss)) throw new Error(`expected deterministic motion CSS ${requiredCss}`)
  }
  const dataJson = JSON.parse(String(artifact.flowNode.properties?.data_json || '{}'))
  if (
    dataJson.schema !== DESIGN_AGENT_VIDEO_SCHEMA ||
    dataJson.layers?.[0]?.id !== 'hero-card' ||
    dataJson.timelineTracks?.[0]?.id !== 'hero-card' ||
    dataJson.timelineTicks?.[0]?.label !== '0s' ||
    dataJson.workspaceFiles?.[0]?.path !== 'agent-design-video/index.html' ||
    dataJson.compositions?.[0]?.sourceLayerId !== 'hero-card' ||
    dataJson.assets?.[0]?.sourceLayerId !== 'hero-card'
  ) {
    throw new Error('expected flow node data_json to preserve source-derived agent workspace data')
  }
}

export function testDesignAgentVideoSourceContractsAvoidCopiedDesignEnginesAndFallbackRenderers() {
  const sourceText = read('src/features/design/designAgentVideoSpec.ts')
  const overviewText = read('src/features/design/DesignEditorOverviewPanel.tsx')
  const bottomTimelineText = read('src/features/design/DesignTimelineBottomPanelView.tsx')
  const canvasViewportText = read('src/components/CanvasViewport.tsx')
  const bottomPanelShellText = read('src/features/strybldr/StrybldrTimelineBottomPanel.tsx')
  const videoPanelText = read('src/features/design/DesignAgentVideoPanel.tsx')
  const floatingPanelText = read('src/features/design/DesignFloatingPanelView.tsx')

  for (const forbidden of ['github.com/nexu-io/open-design', 'framer.com/projects', 'open-design', '@hyperframes/', 'hyperframes.dev/session', 'DEFAULT_ENGINE', 'fallbackEngine']) {
    if (sourceText.includes(forbidden)) throw new Error(`design video bridge must not embed ${forbidden}`)
  }
  if (!sourceText.includes("buildScopedGraphSemanticKey('design-agent-video'")) {
    throw new Error('expected design video bridge to use shared semantic key helper')
  }
  if (!sourceText.includes('summarizeDesignTokens({ graphData')) {
    throw new Error('expected design video bridge to reuse shared design token summary owner')
  }
  if (!videoPanelText.includes('createHtmlVideoEngineRegistryFromRuntimeConfig()')) {
    throw new Error('expected Design overview to read runtime-registered HTML video engines')
  }
  if (!videoPanelText.includes('runHtmlVideoFlowNode({')) {
    throw new Error('expected Design overview to reuse the existing HTML video flow runner')
  }
  if (!videoPanelText.includes('<video') || !videoPanelText.includes('video/mp4')) {
    throw new Error('expected Design overview to expose generated MP4 preview state')
  }
  if (!videoPanelText.includes('Design video timeline tracks') || !videoPanelText.includes('track.startMs')) {
    throw new Error('expected Design video panel to expose the staged seekable timeline plan')
  }
  for (const requiredPanelContract of ['Agent video workspace', 'Design video workspace files', 'Design video compositions', 'Design video assets', 'Timeline lanes']) {
    if (!videoPanelText.includes(requiredPanelContract)) {
      throw new Error(`expected Design video panel to expose ${requiredPanelContract}`)
    }
  }
  if (!bottomTimelineText.includes('Design video timeline bottom panel') || !bottomTimelineText.includes('data-kg-design-video-timeline-track')) {
    throw new Error('expected Design BottomPanel Timeline support to expose source-derived video tracks')
  }
  if (!canvasViewportText.includes("canvas2dRenderer === 'design'") || !canvasViewportText.includes("'designTimeline'")) {
    throw new Error('expected CanvasViewport to route Design + Timeline bottom tab to Design timeline view')
  }
  if (!bottomPanelShellText.includes("view === 'designTimeline'") || !bottomPanelShellText.includes('DesignTimelineBottomPanelViewLazy')) {
    throw new Error('expected shared bottom panel shell to host the Design timeline view')
  }
  if (!overviewText.includes('DesignAgentVideoPanel') || !floatingPanelText.includes("id: 'video'")) {
    throw new Error('expected Design video panel to be reachable from overview and the FloatingPanel workspace tabs')
  }
}
