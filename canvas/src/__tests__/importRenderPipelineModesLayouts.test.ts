import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { computeEffectiveFrontmatterMode } from '@/lib/graph/frontmatterMode'
import { filterGraphToFrontmatterMermaid } from '@/lib/graph/layerDerivation'
import { deriveKeywordGraphFromText } from '@/features/semantic-mode/keywordGraph'
import { mergeKeywordGraphWithSourceNodes } from '@/hooks/useActiveGraphData'
import { deriveSceneDisplayGraph, deriveSceneGroups } from '@/lib/scene/sceneDerivation'
import { buildDagreLayout, buildFastGridLayout } from '@/components/FlowCanvas/layout'
import { computeLayoutDatasetKey, determineLayoutPositions } from '@/components/GraphCanvas/layout/positioning'
import { useGraphStore } from '@/hooks/useGraphStore'
import { deriveGraphDataForActiveView } from '@/hooks/useActiveGraphData'
import { readMarkdownSlideDemo, resolveMarkdownSlideDemoDocumentPath } from '@/tests/lib/markdownSlideDemo'
import { fibSphere } from '@/lib/three/positions.impl'
import { computePositions3d } from '@/lib/three/positions.impl'
import { projectPositionsToSphereShell } from '@/features/three/sphereConstraint'
import { computeFlowHandlesByNode, ensureFlowHandlesHaveDefaults } from '@/components/FlowCanvas/handles'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/components/StoryboardWidgetCanvas/storyboardWidgetCanvasShared'
import { togglePortHandlesEnabledInSchema, shouldInjectDefaultFlowHandles } from '@/lib/graph/portHandlesBehavior'
import { FLOW_EDGE_SOURCE_PORT_KEY, FLOW_EDGE_TARGET_PORT_KEY } from '@/lib/graph/flowPorts'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { getNodeMediaSpec } from '@/lib/canvas/graph-elements/mediaSpec'
import { buildRichMediaPanelOverlayState, resolveRichMediaPanelRenderNode } from '@/lib/render/richMediaPanelState'
import { resolveRepoTestDataPath } from '@/tests/lib/repoTestData'
import { listDisplayRichMediaOverlayNodes } from '@/lib/render/richMediaSsot'
import type { GraphNode } from '@/lib/graph/types'
import { resolveDocsSsotFixturePath } from '@/tests/lib/docsSsotFixture'

const readSlideDemoOrFallback = (): { nameForParse: string; text: string; documentPath: string } => {
  const docPath = resolveMarkdownSlideDemoDocumentPath() || 'data/test-data/md-demo-00.md'
  const text = readMarkdownSlideDemo()
  if (text && text.trim()) {
    return { nameForParse: docPath, text, documentPath: docPath }
  }
  const fallback = ['---', 'mermaid: |', '  graph LR', '    A --> B', '---', '', '# Title', '', '- A', '- B', ''].join('\n')
  return { nameForParse: docPath, text: fallback, documentPath: docPath }
}

const readComputingFlowRfSamplePath = (): string => {
  const envPath = typeof process.env.AG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_RF_SAMPLE_PATH === 'string'
    ? process.env.AG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_RF_SAMPLE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveRepoTestDataPath('markdown-syntax-computing-flow-rf-sample.md')
}

const readComputingFlowSamplePath = (): string => {
  const envPath = typeof process.env.AG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_SAMPLE_PATH === 'string'
    ? process.env.AG_TEST_MARKDOWN_SYNTAX_COMPUTING_FLOW_SAMPLE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveRepoTestDataPath('markdown-syntax-computing-flow-sample.md')
}

const readKgcPipelinePrdTadPath = (): string => {
  const envPath = typeof process.env.AG_TEST_KGC_PIPELINE_PRD_TAD_PATH === 'string'
    ? process.env.AG_TEST_KGC_PIPELINE_PRD_TAD_PATH.trim()
    : ''
  if (envPath) return envPath
  return path.resolve(process.cwd(), '..', '..', '..', 'huijoohwee.github.io', 'docs', 'kgc-ai-pipeline-prd-tad.md')
}

const readAgenticGraphVideoDemoPath = (): string => {
  const envPath = typeof process.env.AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_PATH === 'string'
    ? process.env.AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_PATH.trim()
    : ''
  if (envPath) return envPath
  return resolveDocsSsotFixturePath('agentic-graph-video-demo.md')
}

const readAgenticGraphVideoDemoSeededPath = (): string => {
  const envPath = typeof process.env.AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_SEEDED_PATH === 'string'
    ? process.env.AG_TEST_DOCS_SSOT_VALIDATION_FIXTURE_SEEDED_PATH.trim()
    : ''
  return envPath
}

const toSimpleFlowGraph = (graphData: { nodes?: unknown; edges?: unknown }) => {
  const nodes = Array.isArray(graphData.nodes) ? (graphData.nodes as Array<{ id?: unknown }>) : []
  const edges = Array.isArray(graphData.edges)
    ? (graphData.edges as Array<{ id?: unknown; source?: unknown; target?: unknown }>)
    : []
  const flowNodes = nodes
    .map(n => ({ id: String(n?.id ?? '').trim() }))
    .filter(n => n.id)
    .slice(0, 300)
  const nodeIdSet = new Set(flowNodes.map(n => n.id))
  const flowEdges = edges
    .map(e => ({
      id: String(e?.id ?? '').trim() || `${String(e?.source ?? '')}->${String(e?.target ?? '')}`,
      source: String(e?.source ?? '').trim(),
      target: String(e?.target ?? '').trim(),
    }))
    .filter(e => e.source && e.target && nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
    .slice(0, 600)
  return { flowNodes, flowEdges }
}

export const testImportRenderPipelineAcrossModesAndLayouts = async () => {
  useGraphStore.getState().resetAll()

  const { nameForParse, text, documentPath } = readSlideDemoOrFallback()
  const res = await loadGraphDataFromTextViaParser(nameForParse, text, { applyToStore: true })
  if (!res?.graphData) throw new Error('expected graphData from import')
  if ((res.graphData.nodes || []).length === 0 && (res.graphData.edges || []).length === 0) {
    throw new Error('expected import to yield non-empty graph')
  }

  const afterImport = useGraphStore.getState()
  if (afterImport.markdownDocumentName !== documentPath) {
    throw new Error(`expected markdownDocumentName to be set by import, got ${String(afterImport.markdownDocumentName || '')}`)
  }
  if (afterImport.markdownDocumentText !== text) {
    throw new Error('expected markdownDocumentText to be set by import')
  }
  afterImport.setDocumentSemanticMode('document')
  afterImport.setFrontmatterModeEnabled(true)

  const baseGraph = useGraphStore.getState().graphData
  if (!baseGraph) throw new Error('expected store.graphData after import')

  const effectiveFrontmatter = computeEffectiveFrontmatterMode({
    graphData: baseGraph,
    frontmatterModeEnabled: useGraphStore.getState().frontmatterModeEnabled,
    documentSemanticMode: useGraphStore.getState().documentSemanticMode,
  })

  const frontmatterGraph = effectiveFrontmatter ? filterGraphToFrontmatterMermaid(baseGraph) : baseGraph
  const display = deriveSceneDisplayGraph({ graphData: frontmatterGraph })
  if (!display) throw new Error('expected scene display derivation to succeed')
  if (display.displayNodes.length === 0) throw new Error('expected display nodes after import')

  const schema = useGraphStore.getState().schema
  const groups = deriveSceneGroups({
    graphData: frontmatterGraph,
    graphDataRevision: useGraphStore.getState().graphDataRevision,
    schema,
    documentSemanticMode: useGraphStore.getState().documentSemanticMode,
    frontmatterModeEnabled: !!effectiveFrontmatter,
  })
  if (!groups) throw new Error('expected group derivation to succeed')
  if (!groups.key.trim()) throw new Error('expected group derivation cache key')

  const { flowNodes, flowEdges } = toSimpleFlowGraph(display.displayGraphData)
  if (flowNodes.length === 0) throw new Error('expected flow nodes for layout')
  const dagre = buildDagreLayout({ nodes: flowNodes, edges: flowEdges, rankdir: 'TB' })
  const grid = buildFastGridLayout({ nodes: flowNodes })
  if (Object.keys(dagre).length === 0 && Object.keys(grid).length === 0) {
    throw new Error('expected at least one 2d layout to yield positions')
  }

  const datasetKey = computeLayoutDatasetKey({
    graphData: frontmatterGraph,
    graphDataRevision: useGraphStore.getState().graphDataRevision,
  })
  const layout = determineLayoutPositions({
    datasetKey,
    mode: 'force',
    frontmatterMode: !!effectiveFrontmatter,
    semanticMode: useGraphStore.getState().documentSemanticMode,
    renderMode: '2d',
    renderVariant: 'd3',
    prevViewKey: null,
    prevDatasetKey: null,
    prevMode: null,
    prevFrontmatterMode: null,
    prevSemanticMode: null,
    prevRenderMode: null,
    prevRenderVariant: null,
    prevLayoutVariant: null,
    nodes: display.displayNodes,
    layoutPositionCacheByMode: useGraphStore.getState().layoutPositionCacheByMode,
  })
  if (!layout.cacheKey.trim()) throw new Error('expected layout cache key')

  useGraphStore.getState().setDocumentSemanticMode('keyword')
  const keywordText = text.length > 10_000 ? text.slice(0, 10_000) : text
  const keyword = deriveKeywordGraphFromText({ documentId: `doc:${documentPath}`, documentText: keywordText }).graph
  const keywordMerged = mergeKeywordGraphWithSourceNodes({
    baseGraphData: baseGraph,
    keywordGraph: keyword,
    sourceId: `doc:${documentPath}`,
  })
  if ((keywordMerged.nodes || []).length === 0) throw new Error('expected keyword mode graph nodes')

  const keywordDatasetKey = computeLayoutDatasetKey({
    graphData: keywordMerged,
    graphDataRevision: useGraphStore.getState().graphDataRevision,
  })
  if (!keywordDatasetKey.trim()) throw new Error('expected keyword dataset key')

  const handlesByNode = computeFlowHandlesByNode({
    nodes: (keywordMerged.nodes || []).slice(0, 40) as unknown as Array<{ id: unknown; type?: unknown; properties?: unknown }>,
    edges: (keywordMerged.edges || []).slice(0, 80) as unknown as Array<{ id: unknown; source: unknown; target: unknown; properties?: unknown }>,
    widgetRegistry: null,
  })
  const anyHandles = Object.values(handlesByNode)[0]
  if (anyHandles) {
    const ensured = ensureFlowHandlesHaveDefaults(anyHandles)
    if (ensured.in.length === 0 || ensured.out.length === 0) throw new Error('expected flow handle defaults')
  }

  const portToggled = togglePortHandlesEnabledInSchema(schema)
  if (!portToggled.changed) throw new Error('expected port handles schema toggle to report changed')
  const inject = shouldInjectDefaultFlowHandles(portToggled.schema)
  if (typeof inject !== 'boolean') throw new Error('expected port handles inject predicate')
}

export const testImportRenderPipelineFrontmatterFlowRfSampleInfiniteCanvas = async () => {
  useGraphStore.getState().resetAll()
  const samplePath = readComputingFlowRfSamplePath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from rf sample import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context from rf sample import')

  const activeGraph = deriveGraphDataForActiveView({
    graphData: parsed.graphData,
    frontmatterModeEnabled: true,
    multiDimTableModeEnabled: false,
    documentSemanticMode: 'document',
    documentStructureBaselineLock: false,
    collapsedGroupIds: [],
  })
  if ((activeGraph.nodes || []).length < 7) throw new Error('expected active frontmatter-flow nodes for Infinite Canvas')
  if ((activeGraph.edges || []).length < 6) throw new Error('expected active frontmatter-flow edges for Infinite Canvas')

  const display = deriveSceneDisplayGraph({ graphData: activeGraph })
  if (!display) throw new Error('expected display graph derivation for Infinite Canvas')
  if (display.displayNodes.length < 7) throw new Error('expected display nodes for Infinite Canvas')
  if (display.displayEdges.length < 6) throw new Error('expected display edges for Infinite Canvas')

  const schema = useGraphStore.getState().schema
  const groups = deriveSceneGroups({
    graphData: activeGraph,
    graphDataRevision: 1,
    schema,
    documentSemanticMode: 'document',
    frontmatterModeEnabled: true,
  })
  if (!groups?.key.trim()) throw new Error('expected groups derivation key for Infinite Canvas')

  const datasetKey = computeLayoutDatasetKey({ graphData: activeGraph, graphDataRevision: 1 })
  const layout = determineLayoutPositions({
    datasetKey,
    mode: 'force',
    frontmatterMode: true,
    semanticMode: 'document',
    renderMode: '2d',
    renderVariant: 'd3',
    prevViewKey: null,
    prevDatasetKey: null,
    prevMode: null,
    prevFrontmatterMode: null,
    prevSemanticMode: null,
    prevRenderMode: null,
    prevRenderVariant: null,
    prevLayoutVariant: null,
    nodes: display.displayNodes,
    layoutPositionCacheByMode: useGraphStore.getState().layoutPositionCacheByMode,
  })
  if (!layout.cacheKey.trim()) throw new Error('expected layout cache key for Infinite Canvas')
}

export const testImportRenderPipelineFrontmatterFlowSampleInfiniteCanvas = async () => {
  useGraphStore.getState().resetAll()
  const samplePath = readComputingFlowSamplePath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from computing-flow sample import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context from computing-flow sample import')

  const activeGraph = deriveGraphDataForActiveView({
    graphData: parsed.graphData,
    frontmatterModeEnabled: true,
    multiDimTableModeEnabled: false,
    documentSemanticMode: 'document',
    documentStructureBaselineLock: false,
    collapsedGroupIds: [],
  })
  const expectedNodeIds = ['n-winners', 'n-config', 'n-scrape', 'n-filter', 'n-score', 'n-route', 'n-gallery', 'n-flagged', 'n-gauge']
  const activeNodeIds = new Set((activeGraph.nodes || []).map(n => String(n.id || '').trim()).filter(Boolean))
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    if (!activeNodeIds.has(expectedNodeIds[i])) {
      throw new Error(`expected active graph to include flow node ${expectedNodeIds[i]}`)
    }
  }
  const activeFlowEdges = (activeGraph.edges || []).filter(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    return !!String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') && !!String(props[FLOW_EDGE_TARGET_PORT_KEY] || '')
  })
  if (activeFlowEdges.length !== 11) throw new Error(`expected 11 active handle-linked flow edges for Infinite Canvas, got ${activeFlowEdges.length}`)

  const display = deriveSceneDisplayGraph({ graphData: activeGraph })
  if (!display) throw new Error('expected display graph derivation for Infinite Canvas computing-flow sample')
  const displayNodeIds = new Set(display.displayNodes.map(n => String(n.id || '').trim()).filter(Boolean))
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    if (!displayNodeIds.has(expectedNodeIds[i])) {
      throw new Error(`expected display graph to include flow node ${expectedNodeIds[i]}`)
    }
  }
  const displayFlowEdges = display.displayEdges.filter(e => {
    const props = (e.properties || {}) as Record<string, unknown>
    return !!String(props[FLOW_EDGE_SOURCE_PORT_KEY] || '') && !!String(props[FLOW_EDGE_TARGET_PORT_KEY] || '')
  })
  if (displayFlowEdges.length !== 11) throw new Error(`expected 11 display handle-linked flow edges for Infinite Canvas, got ${displayFlowEdges.length}`)

  const schema = useGraphStore.getState().schema
  const groups = deriveSceneGroups({
    graphData: activeGraph,
    graphDataRevision: 1,
    schema,
    documentSemanticMode: 'document',
    frontmatterModeEnabled: true,
  })
  if (!groups?.key.trim()) throw new Error('expected groups derivation key for Infinite Canvas computing-flow sample')

  const datasetKey = computeLayoutDatasetKey({ graphData: activeGraph, graphDataRevision: 1 })
  const layout = determineLayoutPositions({
    datasetKey,
    mode: 'force',
    frontmatterMode: true,
    semanticMode: 'document',
    renderMode: '2d',
    renderVariant: 'd3',
    prevViewKey: null,
    prevDatasetKey: null,
    prevMode: null,
    prevFrontmatterMode: null,
    prevSemanticMode: null,
    prevRenderMode: null,
    prevRenderVariant: null,
    prevLayoutVariant: null,
    nodes: display.displayNodes,
    layoutPositionCacheByMode: useGraphStore.getState().layoutPositionCacheByMode,
  })
  if (!layout.cacheKey.trim()) throw new Error('expected layout cache key for Infinite Canvas computing-flow sample')
}

export const testImportRenderPipelineAgenticGraphVideoDemoStoryboardWidgetDocumentModes = async () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  const samplePath = readAgenticGraphVideoDemoPath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from agentic-graph video demo import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') {
    throw new Error('expected frontmatter-flow context from agentic-graph video demo import')
  }
  const store = useGraphStore.getState()
  if (store.canvasRenderMode !== '2d') throw new Error(`expected 2d render mode, got ${String(store.canvasRenderMode)}`)
  if (store.canvas2dRenderer !== 'storyboard') throw new Error(`expected storyboard renderer, got ${String(store.canvas2dRenderer)}`)
  if (store.documentSemanticMode !== 'document') throw new Error(`expected document semantic mode, got ${String(store.documentSemanticMode)}`)
  if (store.frontmatterModeEnabled !== true) throw new Error('expected frontmatter mode enabled')
  if (store.multiDimTableModeEnabled !== false) throw new Error('expected multi-dimensional table mode disabled')

  const activeGraph = deriveGraphDataForActiveView({
    graphData: parsed.graphData,
    frontmatterModeEnabled: store.frontmatterModeEnabled,
    multiDimTableModeEnabled: store.multiDimTableModeEnabled,
    documentSemanticMode: store.documentSemanticMode,
    documentStructureBaselineLock: store.documentStructureBaselineLock === true,
    collapsedGroupIds: [],
  })
  if ((activeGraph.nodes || []).length === 0) throw new Error('expected active video demo graph nodes')

  const display = deriveSceneDisplayGraph({ graphData: activeGraph })
  if (!display) throw new Error('expected video demo display graph derivation')
  if (display.displayNodes.length === 0) throw new Error('expected video demo display nodes')
  const hasRichMedia = display.displayNodes.some(node => {
    const text = JSON.stringify({ label: node.label, type: node.type, properties: node.properties || {}, metadata: node.metadata || {} }).toLowerCase()
    return text.includes('video') || text.includes('image')
  })
  if (!hasRichMedia) throw new Error('expected video demo display graph to include rich media nodes')

  const nodes = (activeGraph.nodes || []) as GraphNode[]
  const registryRaw = ((activeGraph.metadata || {}) as Record<string, unknown>).flowWidgetRegistry
  const widgetRegistry = Array.isArray(registryRaw) ? registryRaw as Parameters<typeof computeFlowConnectedValuesBySchemaPath>[0]['registry'] : []
  const richMediaPanelNodes = nodes.filter(node => String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  if (richMediaPanelNodes.length === 0) throw new Error('expected video demo to include Rich Media Panel widget nodes')
  const overlayEditorNodeIds = deriveFrontmatterFlowOverlayNodeIds(activeGraph)
  const richMediaPanelNodeIds = new Set(richMediaPanelNodes.map(node => String(node.id || '').trim()).filter(Boolean))
  const overlayEditorRichMediaIds = overlayEditorNodeIds.filter(id => richMediaPanelNodeIds.has(id))
  if (overlayEditorRichMediaIds.length !== richMediaPanelNodeIds.size) {
    throw new Error(`expected storyboard widget overlays to include all rich media panel nodes, got ${overlayEditorRichMediaIds.join(', ')}`)
  }
  const targetNodeIds = new Set(richMediaPanelNodes.map(node => String(node.id || '').trim()).filter(Boolean))
  const connectedValuesA = computeFlowConnectedValuesBySchemaPath({ graphData: activeGraph, registry: widgetRegistry, targetNodeIds })
  const connectedValuesB = computeFlowConnectedValuesBySchemaPath({ graphData: activeGraph, registry: widgetRegistry, targetNodeIds })
  if (connectedValuesA !== connectedValuesB) throw new Error('expected connected widget value cache reuse for video demo Rich Media Panels')
  const storyboardWidgetRichMediaOverlays = listDisplayRichMediaOverlayNodes({
    renderMediaAsNodes: false,
    canvas2dRenderer: 'storyboard',
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    nodes,
    poolMax: 24,
    excludeNodeIdSet: new Set(overlayEditorNodeIds),
    connectedValuesByNodeId: connectedValuesA,
  })
  const leakedWidgetOwnedIds = storyboardWidgetRichMediaOverlays
    .map(node => String(node.id || '').trim())
    .filter(id => richMediaPanelNodeIds.has(id))
  if (leakedWidgetOwnedIds.length > 0) {
    throw new Error(`expected flow canvas rich media overlay pool to exclude widget-owned panel nodes, got ${leakedWidgetOwnedIds.join(', ')}`)
  }

  const mediaKinds = new Set<string>()
  const panelKindsById = new Map<string, string>()
  const panelTabsById = new Map<string, string>()
  for (let i = 0; i < richMediaPanelNodes.length; i += 1) {
    const panelNode = richMediaPanelNodes[i]
    const id = String(panelNode.id || '').trim()
    const connectedValuesBySchemaPath = id ? connectedValuesA.get(id) : undefined
    const panel = buildRichMediaPanelOverlayState({ node: panelNode, connectedValuesBySchemaPath })
    if (!panel) throw new Error(`expected Rich Media Panel overlay state for ${id || 'unknown panel'}`)
    panelTabsById.set(id, String(panel.activeTab || ''))
    const renderNodeA = resolveRichMediaPanelRenderNode({ node: panelNode, connectedValuesBySchemaPath })
    const renderNodeB = resolveRichMediaPanelRenderNode({ node: panelNode, connectedValuesBySchemaPath })
    if (renderNodeA !== renderNodeB) throw new Error(`expected cached Rich Media Panel render node for ${id || 'unknown panel'}`)
    const spec = getNodeMediaSpec(renderNodeA)
    if (spec) {
      const kind = String(spec.kind || '')
      mediaKinds.add(kind)
      panelKindsById.set(id, kind)
    }
  }
  if (panelTabsById.get('p-text-script') !== 'text') throw new Error('expected agentic-graph video demo text panel to preserve explicit text tab')
  if (panelTabsById.get('p-img-scene') !== 'image') throw new Error('expected agentic-graph video demo image panel to preserve explicit image tab')
  if (panelTabsById.get('p-video-scene') !== 'video') throw new Error('expected agentic-graph video demo video panel to preserve explicit video tab')
  if (panelTabsById.get('db-shot-S01-image-panel') !== 'image') throw new Error('expected derived shot image panel to preserve explicit image tab')
  if (panelTabsById.get('db-shot-S01-video-panel') !== 'video') throw new Error('expected derived shot video panel to preserve explicit video tab')
  if (panelKindsById.get('p-img-scene') !== 'image') throw new Error(`expected agentic-graph video demo image panel media spec=image, got ${String(panelKindsById.get('p-img-scene') || '<none>')}`)
  if (panelKindsById.get('p-video-scene') !== 'video') throw new Error(`expected agentic-graph video demo video panel media spec=video, got ${String(panelKindsById.get('p-video-scene') || '<none>')}`)
  const graphText = JSON.stringify({ nodes: activeGraph.nodes || [], edges: activeGraph.edges || [] }).toLowerCase()
  if (!graphText.includes('text') && !mediaKinds.has('iframe')) throw new Error('expected video demo text widget/render path')
  if (!graphText.includes('image') && !mediaKinds.has('image')) throw new Error('expected video demo image widget/render path')
  if (!graphText.includes('video') && !mediaKinds.has('video')) throw new Error('expected video demo video widget/render path')
}

export const testImportRenderPipelineAgenticGraphVideoDemoSeededVisualPayloads = async () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  const samplePath = readAgenticGraphVideoDemoSeededPath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from seeded agentic-graph video demo import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') {
    throw new Error('expected frontmatter-flow context from seeded agentic-graph video demo import')
  }

  const store = useGraphStore.getState()
  const activeGraph = deriveGraphDataForActiveView({
    graphData: parsed.graphData,
    frontmatterModeEnabled: store.frontmatterModeEnabled,
    multiDimTableModeEnabled: store.multiDimTableModeEnabled,
    documentSemanticMode: store.documentSemanticMode,
    documentStructureBaselineLock: store.documentStructureBaselineLock === true,
    collapsedGroupIds: [],
  })
  const nodes = (activeGraph.nodes || []) as GraphNode[]
  const nodeById = new Map(nodes.map(node => [String(node.id || '').trim(), node] as const))
  const seededImagePanel = nodeById.get('p-img-scene') || null
  const seededVideoPanel = nodeById.get('p-video-scene') || null
  if (!seededImagePanel || !seededVideoPanel) throw new Error('expected seeded visual demo to include top-level image/video panels')

  const imageSpec = getNodeMediaSpec(seededImagePanel)
  const videoSpec = getNodeMediaSpec(seededVideoPanel)
  if (!imageSpec || imageSpec.kind !== 'image' || !String(imageSpec.url || '').includes('Example.jpg')) {
    throw new Error(`expected seeded visual demo image panel to resolve concrete image media, got ${JSON.stringify(imageSpec || null)}`)
  }
  if (!videoSpec || videoSpec.kind !== 'video' || !String(videoSpec.url || '').includes('flower.mp4')) {
    throw new Error(`expected seeded visual demo video panel to resolve concrete video media, got ${JSON.stringify(videoSpec || null)}`)
  }

  const registryRaw = ((activeGraph.metadata || {}) as Record<string, unknown>).flowWidgetRegistry
  const widgetRegistry = Array.isArray(registryRaw) ? registryRaw as Parameters<typeof computeFlowConnectedValuesBySchemaPath>[0]['registry'] : []
  const richMediaPanelNodes = nodes.filter(node => String(node.type || '').trim() === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  const targetNodeIds = new Set(richMediaPanelNodes.map(node => String(node.id || '').trim()).filter(Boolean))
  const connectedValuesByNodeId = computeFlowConnectedValuesBySchemaPath({ graphData: activeGraph, registry: widgetRegistry, targetNodeIds })
  const overlays = listDisplayRichMediaOverlayNodes({
    renderMediaAsNodes: false,
    canvas2dRenderer: 'storyboard',
    frontmatterModeEnabled: true,
    documentSemanticMode: 'document',
    nodes,
    poolMax: 24,
    connectedValuesByNodeId,
  })
  const overlayKinds = new Set(overlays.map(node => String(node.kind || '')))
  if (!overlayKinds.has('image')) throw new Error('expected seeded visual demo overlay pool to include an image panel')
  if (!overlayKinds.has('video')) throw new Error('expected seeded visual demo overlay pool to include a video panel')
  const seededImageOverlay = overlays.find(node => node.id === 'p-img-scene') || null
  const seededVideoOverlay = overlays.find(node => node.id === 'p-video-scene') || null
  if (!seededImageOverlay || !String(seededImageOverlay.url || '').includes('Example.jpg')) {
    throw new Error('expected seeded visual demo image overlay to keep the concrete image url')
  }
  if (!seededVideoOverlay || !String(seededVideoOverlay.url || '').includes('flower.mp4')) {
    throw new Error('expected seeded visual demo video overlay to keep the concrete video url')
  }
}

export const testImportRenderPipelineKgcPipelinePrdTadAutoAppliesStoryboardWidgetDocumentModes = async () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('d3')
  useGraphStore.getState().setDocumentSemanticMode('keyword')
  useGraphStore.getState().setFrontmatterModeEnabled(false)
  useGraphStore.getState().setMultiDimTableModeEnabled(true)

  const samplePath = readKgcPipelinePrdTadPath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from KGC pipeline PRD/TAD import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') {
    throw new Error('expected frontmatter-flow context from KGC pipeline PRD/TAD import')
  }
  const store = useGraphStore.getState()
  if (store.canvasRenderMode !== '2d') throw new Error(`expected 2d render mode, got ${String(store.canvasRenderMode)}`)
  if (store.canvas2dRenderer !== 'storyboard') throw new Error(`expected storyboard renderer, got ${String(store.canvas2dRenderer)}`)
  if (store.documentSemanticMode !== 'document') throw new Error(`expected document semantic mode, got ${String(store.documentSemanticMode)}`)
  if (store.frontmatterModeEnabled !== true) throw new Error('expected frontmatter mode enabled')
  if (store.multiDimTableModeEnabled !== false) throw new Error('expected multi-dimensional table mode disabled')
}

export const testImportRenderPipelineFrontmatterFlowSampleThreeModeBlockLayout = async () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  const samplePath = readComputingFlowSamplePath()
  if (!fs.existsSync(samplePath)) return
  const text = fs.readFileSync(samplePath, 'utf8')
  const parsed = await loadGraphDataFromTextViaParser(samplePath, text, { applyToStore: true, syncMarkdownDocument: false })
  if (!parsed?.graphData) throw new Error('expected graphData from computing-flow sample import')
  if (String(parsed.graphData.context || '').trim() !== 'frontmatter-flow') throw new Error('expected frontmatter-flow context from computing-flow sample import')

  const expectedNodeIds = ['n-winners', 'n-config', 'n-scrape', 'n-filter', 'n-score', 'n-route', 'n-gallery', 'n-flagged', 'n-gauge']
  const activeGraph = deriveGraphDataForActiveView({
    graphData: parsed.graphData,
    frontmatterModeEnabled: true,
    multiDimTableModeEnabled: false,
    documentSemanticMode: 'document',
    documentStructureBaselineLock: false,
    collapsedGroupIds: [],
  })
  const activeNodeIds = new Set((activeGraph.nodes || []).map(n => String(n.id || '').trim()).filter(Boolean))
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    if (!activeNodeIds.has(expectedNodeIds[i])) throw new Error(`expected active graph to include flow node ${expectedNodeIds[i]}`)
  }

  const schema = useGraphStore.getState().schema || ({} as any)
  useGraphStore.getState().setSchema({
    ...schema,
    layout: { ...(schema.layout || {}), mode: 'block' as const },
    three: {
      ...(schema.three || {}),
      sphereRadius: 140,
      seed: 42,
      minSpacing: 10,
    },
  } as any)
  useGraphStore.getState().setCanvas3dMode('3d')
  useGraphStore.getState().setCanvasRenderMode('3d')
  if (useGraphStore.getState().canvasRenderMode !== '3d') {
    throw new Error(`expected block layout to allow canvasRenderMode=3d, got ${String(useGraphStore.getState().canvasRenderMode)}`)
  }

  const pos = computePositions3d((activeGraph.nodes || []) as unknown as GraphNode[], useGraphStore.getState().schema as any, {
    edges: (activeGraph.edges || []) as any,
  })
  let minZ = Infinity
  let maxZ = -Infinity
  let count = 0
  for (let i = 0; i < expectedNodeIds.length; i += 1) {
    const id = expectedNodeIds[i]!
    const p = pos[id]
    if (!p) throw new Error(`expected 3d position for node ${id}`)
    const z = p[2]
    if (!(typeof z === 'number' && Number.isFinite(z))) throw new Error(`expected finite z for node ${id}`)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    count += 1
  }
  if (count < 2) throw new Error('expected multiple 3d seed positions')
  if (!(maxZ - minZ > 1e-3)) throw new Error(`expected non-planar 3d positions for computing-flow sample, got z span=${maxZ - minZ}`)
}

export const testImportRenderPipelineRadialLayoutForces2d = () => {
  useGraphStore.getState().resetAll()
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('flow')
  const schema = useGraphStore.getState().schema
  const next = { ...schema, layout: { ...(schema.layout || {}), mode: 'radial' as const } }
  useGraphStore.getState().setSchema(next)
  const mode = useGraphStore.getState().canvasRenderMode
  if (mode !== '2d') {
    throw new Error(`expected radial layout to force canvasRenderMode=2d, got ${String(mode)}`)
  }
  const renderer = useGraphStore.getState().canvas2dRenderer
  if (renderer !== 'd3') {
    throw new Error(`expected radial layout to force canvas2dRenderer=d3, got ${String(renderer)}`)
  }

  useGraphStore.getState().resetAll()
  useGraphStore.getState().setDocumentStructureBaselineLock(false)
  useGraphStore.getState().setCanvasRenderMode('3d')
  useGraphStore.getState().setCanvas2dRenderer('storyboard')
  const storyboardSchema = useGraphStore.getState().schema
  useGraphStore.getState().setSchema({
    ...storyboardSchema,
    layout: { ...(storyboardSchema.layout || {}), mode: 'radial' as const },
  })
  const storyboardMode = useGraphStore.getState().canvasRenderMode
  if (storyboardMode !== '2d') {
    throw new Error(`expected radial layout to keep Storyboard on the 2D canvas surface, got ${String(storyboardMode)}`)
  }
  const storyboardRenderer = useGraphStore.getState().canvas2dRenderer
  if (storyboardRenderer !== 'storyboard') {
    throw new Error(`expected radial layout to preserve Storyboard renderer, got ${String(storyboardRenderer)}`)
  }
}

export const testImportRenderPipelineThreeFibSphereStable = () => {
  const pts = fibSphere(50, 120, 42, 10)
  if (pts.length !== 50) throw new Error(`expected 50 points, got ${pts.length}`)
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i] || [0, 0, 0]
    for (let j = 0; j < 3; j += 1) {
      const v = p[j] as number
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('expected finite fibSphere coordinate')
    }
  }
}

export const testImportRenderPipelineThreeSeedNotPlanar = () => {
  const nodes: GraphNode[] = []
  const seed2d: Record<string, { x: number; y: number }> = {}
  for (let i = 0; i < 80; i += 1) {
    const id = `n${i}`
    nodes.push({ id, type: 'Node', label: id, x: 0, y: 0, properties: {} } as unknown as GraphNode)
    seed2d[id] = { x: (i % 10) * 12, y: Math.floor(i / 10) * 12 }
  }
  const schema = { three: { sphereRadius: 120, seed: 42, minSpacing: 10 } } as any
  const pos = computePositions3d(nodes, schema, { seed2dPositions: seed2d })
  let minZ = Infinity
  let maxZ = -Infinity
  let count = 0
  for (let i = 0; i < nodes.length; i += 1) {
    const p = pos[nodes[i].id]
    if (!p) continue
    const z = p[2]
    if (!(typeof z === 'number' && Number.isFinite(z))) continue
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
    count += 1
  }
  if (count < 2) throw new Error('expected multiple 3d seed positions')
  if (!(maxZ - minZ > 1e-3)) {
    throw new Error(`expected non-planar 3d seed (z span), got span=${maxZ - minZ}`)
  }
}

export const testImportRenderPipelineThreeSphereConstraintProjects = () => {
  const n = 60
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const pz = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const vz = new Float32Array(n)
  const targetRByIndex = new Float32Array(n)
  for (let i = 0; i < n; i += 1) {
    px[i] = (i - n / 2) * 3.1
    py[i] = ((i * 7) % n - n / 2) * 2.7
    pz[i] = ((i * 13) % n - n / 2) * 2.3
    vx[i] = ((i * 3) % 9) - 4
    vy[i] = ((i * 5) % 9) - 4
    vz[i] = ((i * 7) % 9) - 4
    targetRByIndex[i] = 140
  }
  projectPositionsToSphereShell({ px, py, pz, vx, vy, vz, targetRByIndex })
  for (let i = 0; i < n; i += 1) {
    const r = Math.sqrt(px[i] * px[i] + py[i] * py[i] + pz[i] * pz[i])
    if (!Number.isFinite(r)) throw new Error('expected finite projected radius')
    if (Math.abs(r - 140) > 1e-2) throw new Error(`expected projected radius≈140, got ${r}`)
    const inv = r > 1e-6 ? 1 / r : 0
    const nx = px[i] * inv
    const ny = py[i] * inv
    const nz = pz[i] * inv
    const vr = vx[i] * nx + vy[i] * ny + vz[i] * nz
    if (Math.abs(vr) > 1e-3) throw new Error(`expected tangential velocity after projection, got vr=${vr}`)
  }
}

export const testForbidHardcodedMarkdownSlideDemoAbsolutePath = () => {
  const tail = ['sandbox', 'demo', 'markdown-slide-demo.md'].join('/')
  const forbiddenPrefixes = [
    `/Users/`,
    `/home/`,
    `C:/Users/`,
  ]
  const here = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(here, '..')
  const stack: string[] = [root]
  while (stack.length) {
    const dir = stack.pop()!
    let entries: string[] = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (!name) continue
      const p = path.join(dir, name)
      let st: fs.Stats | null = null
      try {
        st = fs.statSync(p)
      } catch {
        st = null
      }
      if (!st) continue
      if (st.isDirectory()) {
        if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'build') continue
        stack.push(p)
        continue
      }
      if (!st.isFile()) continue
      const lower = name.toLowerCase()
      if (!(lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.md'))) continue
      let text = ''
      try {
        text = fs.readFileSync(p, 'utf8')
      } catch {
        text = ''
      }
      for (const prefix of forbiddenPrefixes) {
        if (text.includes(`${prefix}${tail}`)) {
          throw new Error(`forbidden hardcoded path found in ${p}`)
        }
      }
    }
  }
}
