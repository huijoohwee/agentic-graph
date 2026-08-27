import fs from 'node:fs'

import { buildAndSetFlowNativeScene } from '@/components/FlowCanvas/buildNativeScene'
import { applyFrontmatterFlowImportModes } from '@/features/parsers/frontmatterFlowImportMode'
import { readFlowConfig } from '@/components/FlowCanvas/config'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { useGraphStore } from '@/hooks/useGraphStore'
import { deriveGraphDataForActiveView } from '@/hooks/useActiveGraphData'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { readFrontmatterFlowRenderSettings } from '@/lib/graph/frontmatterFlowSettings'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { readGlobalEdgeType } from '@/lib/graph/edgeTypes'

const readTemplatePath = (): string => {
  const v = process.env.AG_TEST_VIDEO_SCRIPT_TEMPLATE_PATH
  return typeof v === 'string' ? v.trim() : ''
}

export function testVideoScriptTemplateFileFrontmatterFlowGraphFidelity() {
  const templatePath = readTemplatePath()
  if (!templatePath) return
  if (!fs.existsSync(templatePath)) return
  const md = fs.readFileSync(templatePath, 'utf8')
  const res = tryParseMarkdownFrontmatterFlowGraph('video-script-template.md', md)
  if (!res) throw new Error('expected frontmatter flow parse result for video-script-template.md')

  const g = res.graphData
  const meta = (g.metadata || {}) as Record<string, unknown>
  if (String(meta.kind || '') !== 'frontmatter-flow') throw new Error('expected frontmatter-flow metadata kind')
  const flowRenderSettings = readFrontmatterFlowRenderSettings(g)
  if (!flowRenderSettings) throw new Error('expected frontmatter-flow render settings on video script template')
  if (flowRenderSettings.edgeType !== 'bezier') {
    throw new Error(`expected video script template edge type bezier, got ${flowRenderSettings.edgeType}`)
  }

  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]

  if ((g.nodes || []).length !== 6) throw new Error('expected 6 nodes from video script template flow block')
  if ((g.edges || []).length !== 5) throw new Error('expected 5 edges from video script template flow block')

  const eVideoRef = (g.edges || []).find(e => String(e.id || '') === 'e-scene-to-video-ref') || null
  if (!eVideoRef) throw new Error('expected edge e-scene-to-video-ref')
  const eVideoRefProps = (eVideoRef.properties || {}) as Record<string, unknown>
  if (eVideoRefProps[FLOW_EDGE_SOURCE_PORT_KEY] !== 'imageUrl') throw new Error('expected e-scene-to-video-ref source port imageUrl')
  if (eVideoRefProps[FLOW_EDGE_TARGET_PORT_KEY] !== 'reference_image') throw new Error('expected e-scene-to-video-ref target port reference_image')

  const positions: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < g.nodes.length; i += 1) {
    const node = g.nodes[i]
    const id = String(node.id || '').trim()
    if (!id) continue
    if (typeof node.x === 'number' && Number.isFinite(node.x) && typeof node.y === 'number' && Number.isFinite(node.y)) {
      positions[id] = { x: node.x, y: node.y }
    }
  }

  const runtime = { rankdir: 'LR', scene: null, dirty: false } as unknown as {
    rankdir: 'TB' | 'LR'
    scene: unknown
    dirty: boolean
  }
  buildAndSetFlowNativeScene({
    runtime: runtime as never,
    graphData: g,
    positions,
    schema: null,
    forbidCircleNodes: false,
    flowConfig: readFlowConfig({ schema: null, rankdir: 'LR' }),
    sceneGroups: [],
    rankdir: 'LR',
    widgetRegistry: (Array.isArray(registry) ? registry : []) as never,
  })

  const scene = runtime.scene as {
    nodes?: Array<{ id?: unknown; handles?: { in: Array<{ id?: unknown }>; out: Array<{ id?: unknown }> } }>
    edges?: Array<{ id?: unknown; source?: unknown; target?: unknown; outHandleId?: unknown; inHandleId?: unknown }>
  } | null
  if (!scene || !Array.isArray(scene.edges) || scene.edges.length !== 5) throw new Error('expected 5 built scene edges for video script template')
  const sceneNodeById = new Map((scene.nodes || []).map(n => [String(n.id || ''), n]))
  for (let i = 0; i < scene.edges.length; i += 1) {
    const edge = scene.edges[i]
    const source = sceneNodeById.get(String(edge.source || '')) || null
    const target = sceneNodeById.get(String(edge.target || '')) || null
    if (!source || !target) throw new Error(`expected scene edge endpoints to exist for ${String(edge.id || '')}`)
    const outHandleId = String(edge.outHandleId || '')
    const inHandleId = String(edge.inHandleId || '')
    const sourceHasHandle = Array.isArray(source.handles?.out) && source.handles!.out.some(h => String(h.id || '') === outHandleId)
    const targetHasHandle = Array.isArray(target.handles?.in) && target.handles!.in.some(h => String(h.id || '') === inHandleId)
    if (!sourceHasHandle) throw new Error(`expected source handle ${outHandleId} on ${String(edge.source || '')}`)
    if (!targetHasHandle) throw new Error(`expected target handle ${inHandleId} on ${String(edge.target || '')}`)
  }

  const activeFrontmatterGraph = deriveGraphDataForActiveView({
    graphData: g,
    frontmatterModeEnabled: true,
    multiDimTableModeEnabled: false,
    documentSemanticMode: 'document',
    documentStructureBaselineLock: false,
    collapsedGroupIds: [],
  })
  if ((activeFrontmatterGraph.nodes || []).length !== 6) throw new Error('expected active frontmatter view to preserve 6 flow nodes for video script template')
  if ((activeFrontmatterGraph.edges || []).length !== 5) throw new Error('expected active frontmatter view to preserve 5 flow edges for video script template')

  useGraphStore.getState().resetAll()
  applyFrontmatterFlowImportModes(g)
  if (readGlobalEdgeType(useGraphStore.getState().schema) !== 'bezier') {
    throw new Error('expected video script template landing to sync bezier edge type into schema SSOT')
  }
}

export function testFlowNativeSceneKeepsEdgesVisibleForObjectFormEndpoints() {
  const graphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'w-text-script', type: 'TextGeneration', label: 'Text', properties: {} },
      { id: 'p-text-script', type: 'TextOutput', label: 'Output', properties: {} },
    ],
    edges: [
      {
        id: 'e-object-endpoints',
        source: { id: 'w-text-script' },
        target: { id: 'p-text-script' },
        label: 'script',
        properties: {},
      },
    ],
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { direction: 'LR', edgeType: 'bezier' },
    },
  } as const

  const runtime = { rankdir: 'LR', scene: null, dirty: false } as unknown as {
    rankdir: 'TB' | 'LR'
    scene: unknown
    dirty: boolean
  }
  buildAndSetFlowNativeScene({
    runtime: runtime as never,
    graphData: graphData as never,
    positions: {
      'w-text-script': { x: 0, y: 0 },
      'p-text-script': { x: 240, y: 0 },
    },
    schema: null,
    forbidCircleNodes: false,
    flowConfig: readFlowConfig({ schema: null, rankdir: 'LR' }),
    sceneGroups: [],
    rankdir: 'LR',
    widgetRegistry: [],
  })

  const scene = runtime.scene as { edges?: Array<{ id?: unknown; source?: unknown; target?: unknown }> } | null
  if (!scene || !Array.isArray(scene.edges) || scene.edges.length !== 1) {
    throw new Error('expected object-form endpoint edge to remain visible in flow native scene')
  }
  const edge = scene.edges[0] || null
  if (!edge) throw new Error('expected flow native scene edge')
  if (String(edge.source || '') !== 'w-text-script') throw new Error('expected object-form source endpoint to resolve to node id')
  if (String(edge.target || '') !== 'p-text-script') throw new Error('expected object-form target endpoint to resolve to node id')
}
