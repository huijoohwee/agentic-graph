import { buildAndSetFlowNativeScene } from '@/components/FlowCanvas/buildNativeScene'
import { readFlowConfig } from '@/components/FlowCanvas/config'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import {
  FLOW_EDGE_SOURCE_PORT_KEY,
  FLOW_EDGE_TARGET_PORT_KEY,
  buildImplicitFlowEdgePortKey,
} from '@/lib/graph/flowPorts'
import { mergeWorkspaceEntriesIntoSourceFiles, resolveWorkspaceSourcePathKey } from '@/features/workspace-fs/syncToSourceFiles'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { buildRichMediaPanelOverlayState, buildRichMediaPanelPreviewSpec } from '@/lib/render/richMediaSsot'
import {
  AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER,
  AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
  AGENTICGRAPH_SUPERAGENT_INTEGRATION_EDGE_TYPE,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
  AGENTICGRAPH_SUPERAGENT_PROVIDER_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID,
  AGENTICGRAPH_SUPERAGENT_RICH_MEDIA_OUTPUT_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_EDGE_TYPE,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_TYPE,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_EDGE_TYPE,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_IDS,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_TYPE,
  AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_ID,
  AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_TYPE,
  AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID,
  AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_EDGE_TYPES,
  AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES,
  AGENTICGRAPH_SUPERAGENT_TASK_LEVELS,
} from '@/features/agent-ready/mainPanelSuperAgentIntegrationContract'
import { inspectSharedDocumentStructure } from '@/features/agent-ready/sharedDocumentStructureInspection.mjs'
import { SWARM_PREDICTION_SCHEMA_VERSION } from '@/features/swarm-prediction/swarmPredictionEngine'
import {
  FLOW_SWARM_PREDICTION_FORM_ID,
  FLOW_SWARM_PREDICTION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { readResearchAgentDemoFixture } from './helpers/researchAgentDemoFixture'

export async function testResearchAgentDemoIngestsParsesAndBuildsFlowScene() {
  const demoFixture = readResearchAgentDemoFixture()
  const demoText = demoFixture.text
  if (/(^|\n)## KGC Reading Layer\b/.test(demoText)) {
    throw new Error('expected KGC reading layer to live in frontmatter node properties, not a parallel body section')
  }
  if (/(^|\n)@(?:node|edge):/.test(demoText)) {
    throw new Error('expected research demo body to avoid parallel @node/@edge reading layer sigils')
  }
  const workspacePath = demoFixture.workspacePath
  const sourcePath = resolveWorkspaceSourcePathKey(workspacePath)
  if (sourcePath !== demoFixture.sourceFile) {
    throw new Error(`expected docs mirror source path, got ${sourcePath}`)
  }

  const sourceFiles = mergeWorkspaceEntriesIntoSourceFiles({
    existing: [],
    workspaceEntries: [{
      kind: 'file',
      path: workspacePath,
      parentPath: '/docs',
      name: demoFixture.basename,
      text: demoText,
      updatedAtMs: 1,
    }],
    sourcesByPath: {},
    workspaceDocsOnly: true,
    workspaceSourceRootPaths: ['/docs'],
  })
  const sourceFile = sourceFiles.find(entry => String(entry.source?.path || '') === sourcePath) || null
  if (!sourceFile) throw new Error('expected research agent demo to be visible through docs-mirror Source Files ingestion')
  if (sourceFile.enabled !== false) {
    throw new Error('expected docs-mirror Source Files ingestion to stay passive until selected, not force-enable a project-specific demo')
  }
  if (String(sourceFile.text || '') !== demoText) {
    throw new Error('expected docs-mirror Source Files ingestion to preserve research demo text')
  }

  const parsed = await loadGraphDataFromTextViaParser(demoFixture.basename, demoText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  if (!parsed?.graphData) throw new Error('expected research agent demo parser result')
  if (parsed.parserId !== 'markdown') throw new Error(`expected markdown parser, got ${String(parsed.parserId || '')}`)
  if ((parsed.warnings || []).length > 0) throw new Error(`expected no parser warnings, got ${(parsed.warnings || []).join(' | ')}`)
  if (String(parsed.graphData.context || '') !== 'frontmatter-flow') throw new Error('expected frontmatter-flow graph context')
  const documentStructure = inspectSharedDocumentStructure({
    canonicalPath: demoFixture.sourceFile,
    markdown: demoText,
  })
  const parsedNodeCount = (parsed.graphData.nodes || []).length
  const parsedEdgeCount = (parsed.graphData.edges || []).length
  if (documentStructure.flowNodeCount !== parsedNodeCount) {
    throw new Error(`expected parser node count to match frontmatter flow node count, structure=${documentStructure.flowNodeCount} parsed=${parsedNodeCount}`)
  }
  if (documentStructure.flowConnectionCount !== parsedEdgeCount) {
    throw new Error(`expected parser edge count to match frontmatter flow edge count, structure=${documentStructure.flowConnectionCount} parsed=${parsedEdgeCount}`)
  }

  const meta = (parsed.graphData.metadata || {}) as Record<string, unknown>
  if (String(meta.kind || '') !== 'frontmatter-flow') throw new Error('expected frontmatter-flow graph metadata')
  const frontmatterMeta = (meta.frontmatterMeta || {}) as Record<string, unknown>
  if (String(frontmatterMeta.demo_status || '') !== 'dev-source capability demo; no Prod or Cloudflare deploy claim') {
    throw new Error('expected demo deploy status to survive frontmatter parsing')
  }
  if (frontmatterMeta.deployed_api_claim !== false) {
    throw new Error('expected demo to preserve deployed_api_claim=false')
  }
  const researchDemo = (frontmatterMeta.research_thesis_demo || {}) as Record<string, unknown>
  if (!String(researchDemo.run_id || '').startsWith('kgra_run_')) {
    throw new Error(`expected semantic research run id, got ${String(researchDemo.run_id || '')}`)
  }
  const superAgentDemo = (frontmatterMeta.superagent_harness_demo || {}) as Record<string, unknown>
  const mainPanelIntegrationsDemo = (frontmatterMeta.main_panel_integrations_demo || {}) as Record<string, unknown>
  if (String(mainPanelIntegrationsDemo.schema_version || '') !== 'agenticgraph-mainpanel-superagent-integrations-demo/v1') {
    throw new Error(`expected MainPanel SuperAgent integrations demo metadata, got ${JSON.stringify(mainPanelIntegrationsDemo)}`)
  }
  if (String(mainPanelIntegrationsDemo.source_file || '') !== demoFixture.sourceFile) {
    throw new Error(`expected workspace-relative research demo source file, got ${String(mainPanelIntegrationsDemo.source_file || '')}`)
  }
  const mainPanelEntries = new Set(Array.isArray(mainPanelIntegrationsDemo.main_panel_entries) ? mainPanelIntegrationsDemo.main_panel_entries.map(String) : [])
  for (const entryTab of AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS) {
    if (!mainPanelEntries.has(entryTab)) {
      throw new Error(`expected MainPanel entry metadata to include ${entryTab}, got ${JSON.stringify([...mainPanelEntries])}`)
    }
  }
  if (String(mainPanelIntegrationsDemo.integration_open_tab || '') !== 'chat') {
    throw new Error(`expected MainPanel Integrations/MCP -> chat routing metadata, got ${JSON.stringify(mainPanelIntegrationsDemo)}`)
  }
  if (String(mainPanelIntegrationsDemo.canvas_2d_renderer || '') !== AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER) {
    throw new Error(`expected MainPanel demo to target Storyboard rendering, got ${String(mainPanelIntegrationsDemo.canvas_2d_renderer || '')}`)
  }
  const providerIds = new Set(Array.isArray(mainPanelIntegrationsDemo.provider_ids) ? mainPanelIntegrationsDemo.provider_ids.map(String) : [])
  for (const providerId of AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS) {
    if (!providerIds.has(providerId)) {
      throw new Error(`expected MainPanel demo provider coverage to include ${providerId}, got ${JSON.stringify([...providerIds])}`)
    }
  }
  const superAgentCapabilities = new Set(Array.isArray(superAgentDemo.task_capabilities) ? superAgentDemo.task_capabilities.map(String) : [])
  for (const capability of AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES) {
    if (!superAgentCapabilities.has(capability)) {
      throw new Error(`expected SuperAgent demo capability ${capability}, got ${JSON.stringify([...superAgentCapabilities])}`)
    }
  }
  const superAgentLevels = new Set(Array.isArray(superAgentDemo.task_levels) ? superAgentDemo.task_levels.map(String) : [])
  for (const level of AGENTICGRAPH_SUPERAGENT_TASK_LEVELS) {
    if (!superAgentLevels.has(level)) {
      throw new Error(`expected SuperAgent demo task level ${level}, got ${JSON.stringify([...superAgentLevels])}`)
    }
  }
  const swarmPredictionDemo = (frontmatterMeta.swarm_prediction_demo || {}) as Record<string, unknown>
  if (String(swarmPredictionDemo.schema_version || '') !== SWARM_PREDICTION_SCHEMA_VERSION) {
    throw new Error(`expected swarm prediction demo metadata, got ${JSON.stringify(swarmPredictionDemo)}`)
  }
  if (String(swarmPredictionDemo.source_node_id || '') !== AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID) {
    throw new Error(`expected swarm prediction source node id, got ${String(swarmPredictionDemo.source_node_id || '')}`)
  }
  if (String(swarmPredictionDemo.mode || '') !== 'offline-deterministic-bounded') {
    throw new Error(`expected deterministic bounded swarm mode, got ${String(swarmPredictionDemo.mode || '')}`)
  }
  if (swarmPredictionDemo.active_graph_mutated !== false) {
    throw new Error('expected swarm prediction demo to remain review-gated without active graph mutation')
  }
  const swarmDemoOutputs = (swarmPredictionDemo.outputs || {}) as Record<string, unknown>
  for (const [outputKey, expectedTarget] of Object.entries({
    text: `${AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[0]}.output`,
    image: `${AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[1]}.imageUrl`,
    chart: `${AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[2]}.outputSrcDoc`,
    event_log: `${AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID}.eventLogJson`,
    metrics: `${AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID}.metricsJson`,
  })) {
    if (String(swarmDemoOutputs[outputKey] || '') !== expectedTarget) {
      throw new Error(`expected swarm output ${outputKey} -> ${expectedTarget}, got ${JSON.stringify(swarmDemoOutputs)}`)
    }
  }
  const externalInspiration = Array.isArray(frontmatterMeta.external_inspiration)
    ? frontmatterMeta.external_inspiration as Record<string, unknown>[]
    : []
  const swarmInspiration = externalInspiration.find(entry => String(entry.name || '') === '666ghj/MiroFish') || null
  if (!swarmInspiration) throw new Error('expected MiroFish to remain an explicit conceptual-only inspiration boundary')
  const swarmCopyPolicy = String(swarmInspiration.copy_policy || '')
  for (const requiredPolicyToken of ['forbid copied code', 'copied prompts', 'copied fixtures', 'copied architecture']) {
    if (!swarmCopyPolicy.includes(requiredPolicyToken)) {
      throw new Error(`expected swarm copy policy to include ${requiredPolicyToken}, got ${swarmCopyPolicy}`)
    }
  }

  const requireNode = (id: string, expectedType: string) => {
    const node = (parsed.graphData?.nodes || []).find(candidate => String(candidate.id || '') === id) || null
    if (!node) throw new Error(`expected research demo node ${id}`)
    if (String(node.type || '') !== expectedType) {
      throw new Error(`expected node ${id} type ${expectedType}, got ${String(node.type || '')}`)
    }
    return node
  }
  const requireKgcReadingSummary = (id: string, expectedFragment: string) => {
    const node = (parsed.graphData.nodes || []).find(candidate => String(candidate.id || '') === id) || null
    if (!node) throw new Error(`expected KGC summary owner node ${id}`)
    const props = (node.properties || {}) as Record<string, unknown>
    if (!String(props['kgc:readingSummary'] || '').includes(expectedFragment)) {
      throw new Error(`expected node ${id} to own KGC reading summary in frontmatter properties, got ${JSON.stringify(props)}`)
    }
  }
  for (const providerId of AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS) {
    const nodeId = AGENTICGRAPH_SUPERAGENT_PROVIDER_NODE_IDS[providerId]
    const node = requireNode(nodeId, 'integration')
    const props = (node.properties || {}) as Record<string, unknown>
    if (String(props['integration:providerId'] || '') !== providerId) {
      throw new Error(`expected ${nodeId} to preserve provider id ${providerId}, got ${JSON.stringify(props)}`)
    }
  }
  requireNode(AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID, 'agent')
  requireKgcReadingSummary(AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID, 'swarm simulation task slices')
  const swarmPredictionNode = requireNode(AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID, FLOW_SWARM_PREDICTION_NODE_TYPE_ID)
  const swarmPredictionProps = (swarmPredictionNode.properties || {}) as Record<string, unknown>
  requireKgcReadingSummary(AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID, 'bounded deterministic world simulation')
  if (String(swarmPredictionProps.scenarioTitle || '') !== 'Singapore SME launch thesis world simulation') {
    throw new Error(`expected swarm prediction scenario title, got ${JSON.stringify(swarmPredictionProps)}`)
  }
  if (Number(swarmPredictionProps.predictionScore) <= 0 || Number(swarmPredictionProps.confidenceScore) <= 0) {
    throw new Error(`expected numeric swarm prediction scores, got ${JSON.stringify(swarmPredictionProps)}`)
  }
  if (!String(swarmPredictionProps.output || '').includes('Swarm prediction report')) {
    throw new Error('expected SwarmPrediction node to preserve markdown report output')
  }
  if (!String(swarmPredictionProps.imageUrl || '').startsWith('data:image/svg+xml')) {
    throw new Error('expected SwarmPrediction node to preserve chart image data URL')
  }
  if (!String(swarmPredictionProps.outputSrcDoc || '').includes('Swarm prediction world simulation')) {
    throw new Error('expected SwarmPrediction node to preserve HTML prediction chart')
  }
  if (!String(swarmPredictionProps.eventLogJson || '').includes('forecast_recorded')) {
    throw new Error('expected SwarmPrediction node to preserve replay event log')
  }
  if (!String(swarmPredictionProps.metricsJson || '').includes('"predictionScore"')) {
    throw new Error('expected SwarmPrediction node to preserve metrics JSON')
  }
  const declaredRuntimeSurfaces = new Set(
    Array.isArray(documentStructure.superAgentHarnessDemo?.runtimeSurfaces)
      ? documentStructure.superAgentHarnessDemo.runtimeSurfaces.map(String)
      : [],
  )
  for (const runtimeSurface of AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS) {
    if (!declaredRuntimeSurfaces.has(runtimeSurface)) {
      throw new Error(`expected SuperAgent runtime surface ${runtimeSurface}, got ${JSON.stringify([...declaredRuntimeSurfaces])}`)
    }
    const nodeId = AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS[runtimeSurface]
    const node = requireNode(nodeId, AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_TYPE)
    const props = (node.properties || {}) as Record<string, unknown>
    if (String(props['kgSuperAgent:surfaceKey'] || '') !== runtimeSurface) {
      throw new Error(`expected runtime surface node ${nodeId} to preserve surface key ${runtimeSurface}, got ${JSON.stringify(props)}`)
    }
    const edge = (parsed.graphData.edges || []).find(candidate => (
      String(candidate.type || '') === AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_EDGE_TYPE
      && String(candidate.source || '') === AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID
      && String(candidate.target || '') === nodeId
    )) || null
    if (!edge) {
      throw new Error(`expected typed SuperAgent runtime surface edge from harness to ${nodeId}`)
    }
  }
  for (const subagentId of AGENTICGRAPH_SUPERAGENT_SUBAGENT_IDS) {
    const nodeId = AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS[subagentId]
    const node = requireNode(nodeId, AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_TYPE)
    const props = (node.properties || {}) as Record<string, unknown>
    if (String(props['kgSuperAgent:subagentId'] || '') !== subagentId) {
      throw new Error(`expected subagent node ${nodeId} to preserve subagent id ${subagentId}, got ${JSON.stringify(props)}`)
    }
    const edge = (parsed.graphData.edges || []).find(candidate => (
      String(candidate.type || '') === AGENTICGRAPH_SUPERAGENT_SUBAGENT_EDGE_TYPE
      && String(candidate.source || '') === AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS.subagents
      && String(candidate.target || '') === nodeId
    )) || null
    if (!edge) {
      throw new Error(`expected typed SuperAgent subagent edge from runtime subagents surface to ${nodeId}`)
    }
  }
  if ((parsed.graphData.edges || []).filter(edge => String(edge.type || '') === AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_EDGE_TYPE).length !== AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS.length) {
    throw new Error('expected typed runtime surface edges for every declared SuperAgent runtime surface')
  }
  if ((parsed.graphData.edges || []).filter(edge => String(edge.type || '') === AGENTICGRAPH_SUPERAGENT_SUBAGENT_EDGE_TYPE).length !== AGENTICGRAPH_SUPERAGENT_SUBAGENT_IDS.length) {
    throw new Error('expected typed subagent edges for every declared SuperAgent subagent')
  }
  const swarmSeedEdge = (parsed.graphData.edges || []).find(edge => String(edge.id || '') === AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_ID) || null
  if (!swarmSeedEdge) throw new Error('expected SuperAgent harness to seed swarm prediction world simulation')
  if (
    String(swarmSeedEdge.type || '') !== AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_EDGE_TYPE
    || String(swarmSeedEdge.source || '') !== AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID
    || String(swarmSeedEdge.target || '') !== AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID
  ) {
    throw new Error(`expected typed swarm seed edge from harness to swarm node, got ${JSON.stringify(swarmSeedEdge)}`)
  }
  for (const edgeType of AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_EDGE_TYPES) {
    const matchingEdges = (parsed.graphData.edges || []).filter(edge => (
      String(edge.type || '') === edgeType
      && String(edge.source || '') === AGENTICGRAPH_SUPERAGENT_SWARM_PREDICTION_NODE_ID
    ))
    if (matchingEdges.length !== 1) {
      throw new Error(`expected one typed swarm output edge for ${edgeType}, got ${matchingEdges.length}`)
    }
  }

  const evidenceEdge = (parsed.graphData.edges || []).find(edge => String(edge.id || '') === 'edge_source_market_to_claim') || null
  if (!evidenceEdge) throw new Error('expected source-to-claim evidence edge')
  const evidenceProps = (evidenceEdge.properties || {}) as Record<string, unknown>
  const expectedSourcePort = buildImplicitFlowEdgePortKey({ socketType: 'source_ref_signal', side: 'source' })
  const expectedTargetPort = buildImplicitFlowEdgePortKey({ socketType: 'source_ref_signal', side: 'target' })
  if (String(evidenceProps[FLOW_EDGE_SOURCE_PORT_KEY] || '') !== expectedSourcePort) {
    throw new Error(`expected source-to-claim edge to use implicit source port ${expectedSourcePort}`)
  }
  if (String(evidenceProps[FLOW_EDGE_TARGET_PORT_KEY] || '') !== expectedTargetPort) {
    throw new Error(`expected source-to-claim edge to use implicit target port ${expectedTargetPort}`)
  }

  const readPanelPreview = (id: string) => {
    const node = (parsed.graphData.nodes || []).find(candidate => String(candidate.id || '') === id) || null
    if (!node) throw new Error(`expected Rich Media Panel node ${id}`)
    if (String(node.type || '') !== 'RichMediaPanel') throw new Error(`expected ${id} to be a RichMediaPanel node`)
    const panel = buildRichMediaPanelOverlayState({ node })
    if (!panel) throw new Error(`expected Rich Media Panel state for ${id}`)
    const preview = buildRichMediaPanelPreviewSpec({ node, panel })
    if (!preview) throw new Error(`expected Rich Media Panel preview spec for ${id}`)
    return { node, panel, preview }
  }
  const textPanel = readPanelPreview('panel_text_research_brief')
  requireKgcReadingSummary('panel_text_research_brief', 'staged research brief')
  if (textPanel.panel.activeTab !== 'text' || textPanel.preview.kind !== 'iframe' || !String(textPanel.preview.srcDoc || '').includes('Review brief')) {
    throw new Error('expected text Rich Media Panel to render review brief output through iframe srcDoc')
  }
  const imagePanel = readPanelPreview('panel_image_evidence_map')
  if (imagePanel.panel.activeTab !== 'image' || imagePanel.preview.kind !== 'image' || !String(imagePanel.preview.url || '').startsWith('data:image/svg+xml,')) {
    throw new Error('expected image Rich Media Panel to render inline SVG imageUrl output')
  }
  const chartPanel = readPanelPreview('panel_chart_guardrails')
  if (chartPanel.preview.kind !== 'iframe' || !String(chartPanel.preview.srcDoc || '').includes('Research agent guardrail chart')) {
    throw new Error('expected chart Rich Media Panel to render outputSrcDoc through shared iframe preview')
  }
  const swarmTextPanel = readPanelPreview(AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[0])
  if (swarmTextPanel.panel.activeTab !== 'text' || swarmTextPanel.preview.kind !== 'iframe' || !String(swarmTextPanel.preview.srcDoc || '').includes('Swarm report')) {
    throw new Error('expected swarm text Rich Media Panel to render markdown report output')
  }
  const swarmImagePanel = readPanelPreview(AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[1])
  if (swarmImagePanel.panel.activeTab !== 'image' || swarmImagePanel.preview.kind !== 'image' || !String(swarmImagePanel.preview.url || '').startsWith('data:image/svg+xml')) {
    throw new Error('expected swarm image Rich Media Panel to render world-state SVG image')
  }
  const swarmChartPanel = readPanelPreview(AGENTICGRAPH_SUPERAGENT_SWARM_RICH_MEDIA_OUTPUT_NODE_IDS[2])
  if (swarmChartPanel.preview.kind !== 'iframe' || !String(swarmChartPanel.preview.srcDoc || '').includes('Swarm prediction world simulation')) {
    throw new Error('expected swarm chart Rich Media Panel to render outputSrcDoc through shared iframe preview')
  }
  if ((parsed.graphData.edges || []).filter(edge => String(edge.type || '').startsWith('rich_media_')).length !== AGENTICGRAPH_SUPERAGENT_RICH_MEDIA_OUTPUT_NODE_IDS.length) {
    throw new Error('expected typed rich-media edges for every declared text/image/chart output')
  }
  if ((parsed.graphData.edges || []).filter(edge => String(edge.type || '') === AGENTICGRAPH_SUPERAGENT_INTEGRATION_EDGE_TYPE).length !== AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS.length) {
    throw new Error('expected provider integration edges into the SuperAgent harness')
  }
  if (!(parsed.graphData.edges || []).some(edge => String(edge.id || '') === AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID)) {
    throw new Error('expected SuperAgent harness to route into review before apply')
  }

  const registry = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  if (!Array.isArray(registry) || registry.length < 13) {
    throw new Error('expected frontmatter parser to build widget registry entries for the typed research demo nodes')
  }
  const registryFormIds = new Set(
    registry
      .map(entry => String((entry as Record<string, unknown>)?.formId || ''))
      .filter(Boolean),
  )
  for (const formId of [
    'fm:integration_openai',
    'fm:kgra_superagent_harness',
    'fm:kgra_runtime_message_gateway',
    'fm:kgra_subagent_source_scout',
    'fm:claim_market_need',
    'fm:monitoring_spec',
    'fm:kgc_apply_owner',
    FLOW_SWARM_PREDICTION_FORM_ID,
  ]) {
    if (!registryFormIds.has(formId)) {
      throw new Error(`expected typed research demo registry to include ${formId}`)
    }
  }

  const runtime = { rankdir: 'LR', scene: null, dirty: false } as unknown as {
    rankdir: 'TB' | 'LR'
    scene: unknown
    dirty: boolean
  }
  buildAndSetFlowNativeScene({
    runtime: runtime as never,
    graphData: parsed.graphData,
    positions: null,
    schema: null,
    forbidCircleNodes: false,
    flowConfig: readFlowConfig({ schema: null, rankdir: 'LR' }),
    sceneGroups: [],
    rankdir: 'LR',
    widgetRegistry: registry as never,
  })
  const scene = runtime.scene as { nodes?: unknown[]; edges?: unknown[] } | null
  if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length !== parsedNodeCount) {
    throw new Error(`expected Flow native scene to contain parsed research demo nodes, parsed=${parsedNodeCount} scene=${scene?.nodes?.length || 0}`)
  }
  if (!Array.isArray(scene.edges) || scene.edges.length !== parsedEdgeCount) {
    throw new Error(`expected Flow native scene to contain parsed research demo edges, parsed=${parsedEdgeCount} scene=${scene.edges?.length || 0}`)
  }
}
