import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { encodePublishedDocShareToken } from '@/features/canvas/canvasDocShareToken.mjs'
import { buildAgenticGraphAgentReadyToolContracts } from '@/features/agent-ready/agenticgraphAgentReadyToolContract.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  installAgenticGraphWebMcpRuntime,
  resetAgenticGraphWebMcpRuntimeForTests,
} from '@/features/agent-ready/webMcpRuntime'
import {
  buildExpectedMockAgentSurfaceInspection,
  createMockResponse,
  MOCK_CANVAS_GRAPH_DATA,
  MOCK_CANVAS_SVG,
  MOCK_SHARED_DOCUMENT_MARKDOWN,
  MOCK_THREE_CAMERA_POSE,
  MOCK_THREE_LAYOUT_POSITIONS,
  publishMockWebMcpLocalSurfaceSnapshots,
} from '@/__tests__/helpers/webMcpRuntimeFixture'
import { buildActive2dZoomViewKey } from '@/lib/canvas/active-2d-zoom-view-key'
import { AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID } from '@/lib/storage/agenticgraphStorageSyncContract'
import { AGENTIC_COMMERCE_MAIN_PANEL_READINESS } from 'grph-shared/payments/agenticCommerceSsot'
import { assertXrScenePhysicsWebMcpLifecycle, testXrSceneMcpContractCatalogSchemasAndCleanRoom } from '@/__tests__/xrSceneMcpContract.test'
import { assertInspectedXrCatalogMatchesNativeLibrary } from '@/__tests__/helpers/xrSceneLibraryAssertions'

type RegisteredTool = {
  name: string
  title?: string; description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  securitySchemes?: Array<Record<string, unknown>>
  annotations?: Record<string, unknown>
  _meta?: Record<string, unknown>
  execute: (input?: Record<string, unknown>) => Promise<unknown>
}

const EXPECTED_WEB_MCP_RUNTIME_CONTRACTS = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
})

const assertWebMcpRuntimeToolParity = (tools: RegisteredTool[], label: string): void => {
  const registeredToolNames = tools.map((tool) => tool.name).sort()
  const expectedToolNames = EXPECTED_WEB_MCP_RUNTIME_CONTRACTS.map((tool) => tool.webName).sort()
  if (registeredToolNames.join('|') !== expectedToolNames.join('|')) {
    throw new Error(
      `expected ${label} tool parity with shared browser contract, got ${registeredToolNames.join(', ')} expected ${expectedToolNames.join(', ')}`,
    )
  }
  if (new Set(registeredToolNames).size !== registeredToolNames.length) {
    throw new Error(`expected ${label} tool names to be unique, got ${registeredToolNames.join(', ')}`)
  }
  for (const contract of EXPECTED_WEB_MCP_RUNTIME_CONTRACTS) {
    const registeredTool = tools.find((tool) => tool.name === contract.webName)
    if (!registeredTool) {
      throw new Error(`expected ${label} to register ${contract.webName}`)
    }
    if (registeredTool.title !== contract.title) {
      throw new Error(`expected ${label} title parity for ${contract.webName}`)
    }
    if (registeredTool.description !== contract.description) {
      throw new Error(`expected ${label} description parity for ${contract.webName}`)
    }
    if (JSON.stringify(registeredTool.inputSchema) !== JSON.stringify(contract.inputSchema)) {
      throw new Error(`expected ${label} inputSchema parity for ${contract.webName}`)
    }
    if (JSON.stringify(registeredTool.outputSchema || null) !== JSON.stringify(contract.outputSchema || null)) {
      throw new Error(`expected ${label} outputSchema parity for ${contract.webName}`)
    }
    if (JSON.stringify(registeredTool.securitySchemes || null) !== JSON.stringify(contract.securitySchemes || null)) {
      throw new Error(`expected ${label} securitySchemes parity for ${contract.webName}`)
    }
    if (JSON.stringify(registeredTool.annotations || null) !== JSON.stringify(contract.annotations || null)) {
      throw new Error(`expected ${label} annotations parity for ${contract.webName}`)
    }
    if (JSON.stringify(registeredTool._meta || null) !== JSON.stringify(contract._meta || null)) {
      throw new Error(`expected ${label} _meta parity for ${contract.webName}`)
    }
  }
}

export async function testWebMcpRuntimeLateBindsAndUsesSameOriginStoragePaths(): Promise<void> {
  testXrSceneMcpContractCatalogSchemasAndCleanRoom()
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const previousFetch = globalThis.fetch
  const { restore } = initJsdomHarness()
  const registeredTools = new Map<string, RegisteredTool>()
  const fetchCalls: string[] = []
  const previousMarkdownDocumentName = useGraphStore.getState().markdownDocumentName
  const previousMarkdownDocumentText = useGraphStore.getState().markdownDocumentText
  const previousMarkdownDocumentSourceUrl = useGraphStore.getState().markdownDocumentSourceUrl
  const previousGraphData = useGraphStore.getState().graphData
  const previousGraphDataRevision = useGraphStore.getState().graphDataRevision
  const previousCanvasRenderMode = useGraphStore.getState().canvasRenderMode
  const previousCanvas2dRenderer = useGraphStore.getState().canvas2dRenderer
  const previousDocumentSemanticMode = useGraphStore.getState().documentSemanticMode
  const previousFrontmatterModeEnabled = useGraphStore.getState().frontmatterModeEnabled
  const previousMultiDimTableModeEnabled = useGraphStore.getState().multiDimTableModeEnabled
  const previousDocumentStructureBaselineLock = useGraphStore.getState().documentStructureBaselineLock
  const previousCollapsedGroupIds = useGraphStore.getState().collapsedGroupIds
  const previousSelectedNodeId = useGraphStore.getState().selectedNodeId
  const previousSelectedEdgeId = useGraphStore.getState().selectedEdgeId
  const previousCanvasSnapshotFns = useGraphStore.getState().canvasSnapshotFns
  const previousThreeCameraSnapshotFns = useGraphStore.getState().threeCameraSnapshotFns
  const previousThreeLayoutSnapshotFns = useGraphStore.getState().threeLayoutSnapshotFns
  const previousCanvas3dMode = useGraphStore.getState().canvas3dMode
  const previousFloatingPanelOpen = useGraphStore.getState().floatingPanelOpen
  const previousFloatingPanelView = useGraphStore.getState().floatingPanelView
  const previousBottomSurfaceTab = useGraphStore.getState().bottomSurfaceTab
  const previousBottomSurfaceCollapsed = useGraphStore.getState().bottomSurfaceCollapsed
  const previousViewPinned = useGraphStore.getState().viewPinned
  const previousFitToScreenMode = useGraphStore.getState().fitToScreenMode
  const previousZoomToSelectionMode = useGraphStore.getState().zoomToSelectionMode
  const previousZoomState = useGraphStore.getState().zoomState
  const previousZoomStateByKey = useGraphStore.getState().zoomStateByKey
  const previousRenderMediaAsNodes = useGraphStore.getState().renderMediaAsNodes
  const previousMediaPanelDensity = useGraphStore.getState().mediaPanelDensity
  const previousSchema = useGraphStore.getState().schema
  const previousDesignRendererWebpageLayoutKey = useGraphStore.getState().designRendererWebpageLayoutKey
  const previousSourceFiles = useGraphStore.getState().sourceFiles
  const previousExplorerActivePath = useMarkdownExplorerStore.getState().activePath

  try {
    delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    resetAgenticGraphWebMcpRuntimeForTests()

    const navigatorObject = window.navigator as Navigator & {
      modelContext?: {
        registerTool?: (tool: RegisteredTool, options?: { signal?: AbortSignal }) => void
      }
    }
    try {
      delete navigatorObject.modelContext
    } catch {
      navigatorObject.modelContext = undefined
    }

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      fetchCalls.push(url)
      return createMockResponse(url)
    }) as typeof fetch

    installAgenticGraphWebMcpRuntime()

    if (String(document.documentElement.dataset.kgWebmcpContext || '') !== 'fallback-readable') throw new Error(`expected fallback-readable runtime state before late modelContext binding, got ${String(document.documentElement.dataset.kgWebmcpContext)}`)
    const fallbackContext = navigatorObject.modelContext as { provideContext?: unknown; registerTool?: unknown } | undefined
    if (typeof fallbackContext?.provideContext !== 'function' || typeof fallbackContext.registerTool !== 'function' || (document as Document & { modelContext?: unknown }).modelContext !== fallbackContext) throw new Error('expected WebMCP fallback to expose scanner-visible API parity on document and navigator')

    navigatorObject.modelContext = {
      registerTool(tool, options) {
        if (!options?.signal) {
          throw new Error(`expected AbortSignal-backed registerTool options for ${tool.name}`)
        }
        registeredTools.set(tool.name, tool)
      },
    }

    if (String(document.documentElement.dataset.kgWebmcpContext || '') !== 'installed') {
      throw new Error(
        `expected installed runtime state after late modelContext binding, got ${String(document.documentElement.dataset.kgWebmcpContext)}`,
      )
    }
    assertWebMcpRuntimeToolParity(Array.from(registeredTools.values()), 'runtime registerTool')
    if (document.documentElement.dataset.kgWebmcpTools !== EXPECTED_WEB_MCP_RUNTIME_CONTRACTS.map((tool) => tool.webName).join(',')) {
      throw new Error(
        `expected runtime data-kg-webmcp-tools to match shared browser contract order, got ${String(document.documentElement.dataset.kgWebmcpTools)}`,
      )
    }

    const listTool = registeredTools.get('agenticgraph.list_source_files')
    const readTool = registeredTools.get('agenticgraph.read_source_file')
    const readSharedTool = registeredTools.get('agenticgraph.read_shared_document')
    const inspectSharedDocumentTool = registeredTools.get('agenticgraph.inspect_shared_document_structure')
    const inspectLocalSettingsChatReadinessTool = registeredTools.get('agenticgraph.inspect_local_settings_chat_readiness')
    const inspectLocalMainPanelTool = registeredTools.get('agenticgraph.inspect_local_mainpanel_state')
    const inspectLocalEditorWorkspaceTool = registeredTools.get('agenticgraph.inspect_local_editor_workspace_state')
    const inspectLocalChatPipelineTool = registeredTools.get('agenticgraph.inspect_local_chat_pipeline_state')
    const inspectLocalPipelineTool = registeredTools.get('agenticgraph.inspect_local_mainpanel_chat_canvas_pipeline')
    const inspectLocalDocumentTool = registeredTools.get('agenticgraph.inspect_local_workspace_document')
    const inspectLocalCanvasTool = registeredTools.get('agenticgraph.inspect_local_canvas_topology')
    const inspectLocalCanvasSnapshotTool = registeredTools.get('agenticgraph.inspect_local_canvas_snapshot')
    const inspectLocal3dCameraPoseTool = registeredTools.get('agenticgraph.inspect_local_3d_camera_pose')
    const inspectLocal3dLayoutPositionsTool = registeredTools.get('agenticgraph.inspect_local_3d_layout_positions')
    const inspectLocalXrSceneAssetsTool = registeredTools.get('agenticgraph.inspect_local_xr_scene_assets')
    const controlLocalXrSceneTool = registeredTools.get('agenticgraph.control_local_xr_scene')
    const inspectLocalCameraTool = registeredTools.get('agenticgraph.inspect_local_camera')
    const controlLocalCameraTool = registeredTools.get('agenticgraph.control_local_camera')
    const inspectLocalAnimationTool = registeredTools.get('agenticgraph.inspect_local_animation')
    const controlLocalAnimationTool = registeredTools.get('agenticgraph.control_local_animation')
    const inspectLocal2dZoomViewportTool = registeredTools.get('agenticgraph.inspect_local_2d_zoom_viewport')
    const inspectLocalSourceFilesSnapshotTool = registeredTools.get('agenticgraph.inspect_local_source_files_snapshot')
    const readLocalRuntimeIdentityTool = registeredTools.get('agenticgraph.read_local_runtime_identity')
    const inspectTool = registeredTools.get('agenticgraph.inspect_agent_surface')
    if (!listTool || !readTool || !readSharedTool || !inspectSharedDocumentTool || !inspectLocalSettingsChatReadinessTool || !inspectLocalMainPanelTool || !inspectLocalEditorWorkspaceTool || !inspectLocalChatPipelineTool || !inspectLocalPipelineTool || !inspectLocalDocumentTool || !inspectLocalCanvasTool || !inspectLocalCanvasSnapshotTool || !inspectLocal3dCameraPoseTool || !inspectLocal3dLayoutPositionsTool || !inspectLocalXrSceneAssetsTool || !controlLocalXrSceneTool || !inspectLocalCameraTool || !controlLocalCameraTool || !inspectLocalAnimationTool || !controlLocalAnimationTool || !inspectLocal2dZoomViewportTool || !inspectLocalSourceFilesSnapshotTool || !readLocalRuntimeIdentityTool || !inspectTool) {
      throw new Error(`expected all WebMCP tools to be registered, got ${Array.from(registeredTools.keys()).join(', ')}`)
    }

    const shareToken = encodePublishedDocShareToken({ canonicalPath: 'docs/shared.md' })
    const zoomViewKey = buildActive2dZoomViewKey({
      canvasRenderMode: '2d',
      canvas2dRenderer: 'd3',
      schema: previousSchema,
      graphData: MOCK_CANVAS_GRAPH_DATA as never,
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      multiDimTableModeEnabled: false,
      documentStructureBaselineLock: false,
      renderMediaAsNodes: false,
      mediaPanelDensity: 'default',
      collapsedGroupIds: ['lane-main'],
      designRendererWebpageLayoutKey: null,
    })
    if (!zoomViewKey) {
      throw new Error('expected a local 2d zoom view key for the runtime test fixture')
    }
    useGraphStore.setState({
      markdownDocumentName: 'workspace:/local/agent-ready.md',
      markdownDocumentText: MOCK_SHARED_DOCUMENT_MARKDOWN,
      markdownDocumentSourceUrl: '/agenticgraph/share/local-only',
      graphData: MOCK_CANVAS_GRAPH_DATA as never,
      graphDataRevision: 7,
      canvasRenderMode: '2d',
      canvas2dRenderer: 'd3',
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      multiDimTableModeEnabled: false,
      documentStructureBaselineLock: false,
      collapsedGroupIds: ['lane-main'],
      selectedNodeId: 'start',
      selectedEdgeId: 'edge-1',
      canvas3dMode: 'xr',
      floatingPanelOpen: false,
      floatingPanelView: 'media',
      viewPinned: true,
      fitToScreenMode: false,
      zoomToSelectionMode: false,
      zoomState: { k: 0.5, x: 0, y: 0, viewportW: 320, viewportH: 180, graphDataRevision: 1 },
      zoomStateByKey: {
        [zoomViewKey]: { k: 1.75, x: 12.5, y: -6.25, viewportW: 960, viewportH: 540, graphDataRevision: 7 },
      },
      renderMediaAsNodes: false,
      mediaPanelDensity: 'default',
      schema: previousSchema,
      designRendererWebpageLayoutKey: null,
      canvasSnapshotFns: {
        '2d': {
          captureSvg: async () => MOCK_CANVAS_SVG,
          capturePng: async () => null,
        },
      },
      threeCameraSnapshotFns: {
        capturePose: () => MOCK_THREE_CAMERA_POSE,
        restorePose: () => void 0,
      },
      threeLayoutSnapshotFns: {
        capturePositions: () => MOCK_THREE_LAYOUT_POSITIONS as never,
      },
      sourceFiles: [
        {
          id: 'remote-doc',
          name: 'Remote Doc',
          text: '# Remote',
          enabled: true,
          status: 'parsed',
          parsedTextHash: 'remote-hash',
          parsedGraphRevision: 3,
          parsedGraphData: { nodes: [], edges: [], metadata: {}, type: 'application/json' } as never,
          source: { kind: 'url', url: 'https://example.com/remote.md' },
        },
        {
          id: 'workspace-doc',
          name: 'Workspace Doc',
          text: MOCK_SHARED_DOCUMENT_MARKDOWN,
          enabled: true,
          status: 'parsed',
          parsedTextHash: 'workspace-hash',
          parsedGraphRevision: 7,
          parsedGraphData: MOCK_CANVAS_GRAPH_DATA as never,
          source: { kind: 'local', path: 'workspace:/docs/agent-ready.md' },
        },
        {
          id: 'workspace-empty',
          name: 'Workspace Empty',
          text: '',
          enabled: false,
          status: 'idle',
          source: { kind: 'local', path: 'workspace:/notes/todo.md' },
        },
      ] as never,
    } as never)
    useMarkdownExplorerStore.setState({ activePath: '/docs/agent-ready.md' })
    publishMockWebMcpLocalSurfaceSnapshots()
    await listTool.execute()
    await readTool.execute({ canonicalPath: 'docs/example.md' })
    await readSharedTool.execute({ shareUrl: `/agenticgraph/share/${shareToken}` })
    const sharedStructure = await inspectSharedDocumentTool.execute({ shareUrl: `/agenticgraph/share/${shareToken}` })
    const localSettingsChatReadiness = await inspectLocalSettingsChatReadinessTool.execute()
    const localMainPanelState = await inspectLocalMainPanelTool.execute()
    const localEditorWorkspaceState = await inspectLocalEditorWorkspaceTool.execute()
    const localChatPipelineState = await inspectLocalChatPipelineTool.execute()
    const localPipelineState = await inspectLocalPipelineTool.execute()
    const localStructure = await inspectLocalDocumentTool.execute()
    const localCanvasTopology = await inspectLocalCanvasTool.execute()
    const localCanvasSnapshot = await inspectLocalCanvasSnapshotTool.execute()
    const localXrSceneAssets = await inspectLocalXrSceneAssetsTool.execute()
    const invalidXrSceneBinding = await controlLocalXrSceneTool.execute({ invocation: '/xr.place @person-adult @vehicle-sedan transition=linear' })
    const invalidXrSceneTransition = await controlLocalXrSceneTool.execute({ invocation: '/xr.place @person-adult transition=teleport' })
    const invalidXrScenePair = await controlLocalXrSceneTool.execute({ invocation: '/xr.stage @neutral-volume foo=bar' })
    const localXrSceneControl = await controlLocalXrSceneTool.execute({ action: 'place', assetId: 'person-adult', transition: 'linear', label: 'MCP CAST' })
    const placedXrSubjectId = String((localXrSceneControl as { subjectId?: unknown }).subjectId || '')
    await assertXrScenePhysicsWebMcpLifecycle({
      control: input => controlLocalXrSceneTool.execute(input),
      inspect: () => inspectLocalXrSceneAssetsTool.execute(),
      subjectId: placedXrSubjectId,
    })
    const localCamera = await inspectLocalCameraTool.execute()
    const localCameraControl = await controlLocalCameraTool.execute({ action: 'frame', targetId: 'camera', angle: 'right-side', level: 'high-angle', shot: 'close-up', sensorId: '65mm', focalLengthMm: 85, focusDistanceMeters: 3.5, aspectRatio: '2.39:1' })
    const localAnimationControl = await controlLocalAnimationTool.execute({ operation: 'apply', trackKind: 'character-motion', presetId: 'dance', targetId: 'start' })
    const localAnimation = await inspectLocalAnimationTool.execute()
    useGraphStore.setState({ canvasRenderMode: '3d' } as never)
    const localThreeCameraPose = await inspectLocal3dCameraPoseTool.execute()
    const localThreeLayoutPositions = await inspectLocal3dLayoutPositionsTool.execute()
    useGraphStore.setState({ canvasRenderMode: '2d' } as never)
    const local2dZoomViewport = await inspectLocal2dZoomViewportTool.execute()
    const localSourceFilesSnapshot = await inspectLocalSourceFilesSnapshotTool.execute()
    const localRuntimeIdentity = await readLocalRuntimeIdentityTool.execute()
    const inspection = await inspectTool.execute()

    if (!fetchCalls.includes('/api/storage/source-files')) {
      throw new Error(`expected localhost list_source_files to use same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    if (!fetchCalls.includes('/api/storage/doc-default/docs%2Fexample.md')) {
      throw new Error(`expected localhost read_source_file to use same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    if (!fetchCalls.includes('/api/storage/doc-default/docs%2Fshared.md')) {
      throw new Error(`expected localhost read_shared_document to reuse same-origin storage path, got ${fetchCalls.join(', ')}`)
    }
    if ((sharedStructure as { flowNodeCount?: unknown }).flowNodeCount !== 2) {
      throw new Error(`expected inspect_shared_document_structure to count flow nodes, got ${JSON.stringify(sharedStructure)}`)
    }
    if ((sharedStructure as { flowSubgraphCount?: unknown }).flowSubgraphCount !== 1) {
      throw new Error(`expected inspect_shared_document_structure to count flow subgraphs, got ${JSON.stringify(sharedStructure)}`)
    }
    if ((localStructure as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_workspace_document to report an available active document, got ${JSON.stringify(localStructure)}`)
    }
    if ((localStructure as { documentName?: unknown }).documentName !== 'workspace:/local/agent-ready.md') {
      throw new Error(`expected inspect_local_workspace_document to return the active document name, got ${JSON.stringify(localStructure)}`)
    }
    if ((localStructure as { flowConnectionCount?: unknown }).flowConnectionCount !== 1) {
      throw new Error(`expected inspect_local_workspace_document to reuse structure inspection counts, got ${JSON.stringify(localStructure)}`)
    }
    if ((localSettingsChatReadiness as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_settings_chat_readiness to report available readiness state, got ${JSON.stringify(localSettingsChatReadiness)}`)
    }
    if ((localSettingsChatReadiness as { provider?: { id?: unknown } }).provider?.id !== 'openai') {
      throw new Error(`expected inspect_local_settings_chat_readiness to report the normalized provider, got ${JSON.stringify(localSettingsChatReadiness)}`)
    }
    if ((localSettingsChatReadiness as { routing?: { integrationEnabled?: unknown } }).routing?.integrationEnabled !== true) {
      throw new Error(`expected inspect_local_settings_chat_readiness to report integration enablement, got ${JSON.stringify(localSettingsChatReadiness)}`)
    }
    if (
      (localChatPipelineState as {
        available?: unknown
        promotionRecovery?: { available?: unknown; retryCommand?: unknown; surfaces?: unknown }
      }).available !== true
      || (localChatPipelineState as {
        promotionRecovery?: { available?: unknown; retryCommand?: unknown; surfaces?: unknown }
      }).promotionRecovery?.available !== false
      || (localChatPipelineState as {
        promotionRecovery?: { available?: unknown; retryCommand?: unknown; surfaces?: unknown }
      }).promotionRecovery?.retryCommand !== null
      || !Array.isArray((localChatPipelineState as {
        promotionRecovery?: { available?: unknown; retryCommand?: unknown; surfaces?: unknown }
      }).promotionRecovery?.surfaces)
      || ((localChatPipelineState as {
        promotionRecovery?: { available?: unknown; retryCommand?: unknown; surfaces?: unknown }
      }).promotionRecovery?.surfaces as unknown[]).length !== 0
    ) {
      throw new Error(`expected inspect_local_chat_pipeline_state to expose an idle promotion recovery contract when no mirroring failure exists, got ${JSON.stringify(localChatPipelineState)}`)
    }
    if ((localSettingsChatReadiness as { modelDiscovery?: { discoveredCount?: unknown } }).modelDiscovery?.discoveredCount !== 3) {
      throw new Error(`expected inspect_local_settings_chat_readiness to report discovered model count, got ${JSON.stringify(localSettingsChatReadiness)}`)
    }
    if ((localMainPanelState as { activeTab?: unknown }).activeTab !== 'mcp') {
      throw new Error(`expected inspect_local_mainpanel_state to report the active tab, got ${JSON.stringify(localMainPanelState)}`)
    }
    if ((localMainPanelState as { search?: { query?: unknown } }).search?.query !== 'browser api') {
      throw new Error(`expected inspect_local_mainpanel_state to report the current search query, got ${JSON.stringify(localMainPanelState)}`)
    }
    const localEditorInspection = localEditorWorkspaceState as { layoutMode?: unknown; draftState?: { hasUncommittedDraft?: unknown }; liveStructure?: { hasFrontmatter?: unknown } }
    if (localEditorInspection.layoutMode !== 'editor' || localEditorInspection.draftState?.hasUncommittedDraft !== true || localEditorInspection.liveStructure?.hasFrontmatter !== true) {
      throw new Error(`expected inspect_local_editor_workspace_state to report editor mode, live draft, and frontmatter structure, got ${JSON.stringify(localEditorWorkspaceState)}`)
    }
    if ((localChatPipelineState as { isLoading?: unknown }).isLoading !== true) {
      throw new Error(`expected inspect_local_chat_pipeline_state to report streaming/loading state, got ${JSON.stringify(localChatPipelineState)}`)
    }
    if ((localChatPipelineState as { streaming?: { active?: unknown } }).streaming?.active !== true) {
      throw new Error(`expected inspect_local_chat_pipeline_state to report an active streaming pipeline, got ${JSON.stringify(localChatPipelineState)}`)
    }
    if ((localChatPipelineState as { workspacePaths?: { streamingWorkspacePath?: unknown } }).workspacePaths?.streamingWorkspacePath !== '/chat/agenticgraph/session.md') {
      throw new Error(`expected inspect_local_chat_pipeline_state to expose the streaming workspace path, got ${JSON.stringify(localChatPipelineState)}`)
    }
    const localChatInspection = localChatPipelineState as { kgcValidation?: { stage?: unknown; hasYamlFrontmatter?: unknown }; finalize?: { stage?: unknown; persistedAgenticGraphPath?: unknown } }
    if (localChatInspection.kgcValidation?.stage !== 'validated' || localChatInspection.kgcValidation?.hasYamlFrontmatter !== true || localChatInspection.finalize?.stage !== 'applied' || localChatInspection.finalize?.persistedAgenticGraphPath !== '/chat/agenticgraph/session.md') {
      throw new Error(`expected inspect_local_chat_pipeline_state to expose validated frontmatter and applied finalize state, got ${JSON.stringify(localChatPipelineState)}`)
    }
    const localPipelineInspection = localPipelineState as { pipelineReady?: unknown; readiness?: { markdownFlowReady?: unknown; commerceReady?: unknown }; entrySurfaces?: { commerce?: { semanticKey?: unknown } }; counts?: { canvasNodeCount?: unknown }; issues?: unknown }
    if (localPipelineInspection.pipelineReady !== true || localPipelineInspection.readiness?.markdownFlowReady !== true || localPipelineInspection.readiness?.commerceReady !== true || localPipelineInspection.entrySurfaces?.commerce?.semanticKey !== AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey || localPipelineInspection.counts?.canvasNodeCount !== 2 || (Array.isArray(localPipelineInspection.issues) && localPipelineInspection.issues.length !== 0)) {
      throw new Error(`expected inspect_local_mainpanel_chat_canvas_pipeline to report ready E2E Commerce/frontmatter/canvas state without issues, got ${JSON.stringify(localPipelineState)}`)
    }
    if ((localCanvasTopology as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_canvas_topology to report an available local canvas, got ${JSON.stringify(localCanvasTopology)}`)
    }
    if ((localCanvasTopology as { graphScope?: unknown }).graphScope !== 'active-render-graph') {
      throw new Error(`expected inspect_local_canvas_topology to inspect the active render graph in document mode, got ${JSON.stringify(localCanvasTopology)}`)
    }
    if ((localCanvasTopology as { subgraphCount?: unknown }).subgraphCount !== 1) {
      throw new Error(`expected inspect_local_canvas_topology to count local subgraphs, got ${JSON.stringify(localCanvasTopology)}`)
    }
    if ((localCanvasTopology as { collapsedGroupCount?: unknown }).collapsedGroupCount !== 1) {
      throw new Error(`expected inspect_local_canvas_topology to report collapsed group count, got ${JSON.stringify(localCanvasTopology)}`)
    }
    if ((localCanvasTopology as { graphTopology?: { nodeCount?: unknown } }).graphTopology?.nodeCount !== 2) {
      throw new Error(`expected inspect_local_canvas_topology to report local node count, got ${JSON.stringify(localCanvasTopology)}`)
    }
    if ((localCanvasSnapshot as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_canvas_snapshot to report an available SVG snapshot, got ${JSON.stringify(localCanvasSnapshot)}`)
    }
    if ((localCanvasSnapshot as { svgLength?: unknown }).svgLength !== MOCK_CANVAS_SVG.length) {
      throw new Error(`expected inspect_local_canvas_snapshot to report SVG length, got ${JSON.stringify(localCanvasSnapshot)}`)
    }
    if ((localCanvasSnapshot as { viewBox?: unknown }).viewBox !== '0 0 640 360') {
      throw new Error(`expected inspect_local_canvas_snapshot to report SVG viewBox, got ${JSON.stringify(localCanvasSnapshot)}`)
    }
    if ((localThreeCameraPose as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_3d_camera_pose to report an available 3d camera pose, got ${JSON.stringify(localThreeCameraPose)}`)
    }
    if ((localThreeCameraPose as { canvas3dMode?: unknown }).canvas3dMode !== 'xr') {
      throw new Error(`expected inspect_local_3d_camera_pose to report the active 3d mode, got ${JSON.stringify(localThreeCameraPose)}`)
    }
    if ((localThreeCameraPose as { pose?: { position?: { z?: unknown } } }).pose?.position?.z !== 30) {
      throw new Error(`expected inspect_local_3d_camera_pose to report camera position, got ${JSON.stringify(localThreeCameraPose)}`)
    }
    if ((localThreeLayoutPositions as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_3d_layout_positions to report available positions, got ${JSON.stringify(localThreeLayoutPositions)}`)
    }
    if ((localThreeLayoutPositions as { positionCount?: unknown }).positionCount !== 3) {
      throw new Error(`expected inspect_local_3d_layout_positions to report position count, got ${JSON.stringify(localThreeLayoutPositions)}`)
    }
    if ((localThreeLayoutPositions as { selectedNodePosition?: { z?: unknown } }).selectedNodePosition?.z !== 30.988) {
      throw new Error(`expected inspect_local_3d_layout_positions to report rounded selected-node position, got ${JSON.stringify(localThreeLayoutPositions)}`)
    }
    if ((localThreeLayoutPositions as { samplePositions?: Array<{ id?: unknown }> }).samplePositions?.[0]?.id !== 'alpha') {
      throw new Error(`expected inspect_local_3d_layout_positions to sort sampled positions deterministically, got ${JSON.stringify(localThreeLayoutPositions)}`)
    }
    assertInspectedXrCatalogMatchesNativeLibrary(localXrSceneAssets)
    if ((localXrSceneControl as { ok?: unknown }).ok !== true || (localXrSceneControl as { scene?: { runtime?: { subjects?: Array<{ label?: unknown; transition?: unknown }> } } }).scene?.runtime?.subjects?.at(-1)?.label !== 'MCP CAST' || (localXrSceneControl as { scene?: { runtime?: { subjects?: Array<{ label?: unknown; transition?: unknown }> } } }).scene?.runtime?.subjects?.at(-1)?.transition !== 'linear') {
      throw new Error(`expected structured XR WebMCP control to place cast with typed interpolation, got ${JSON.stringify(localXrSceneControl)}`)
    }
    if ((invalidXrSceneBinding as { ok?: unknown }).ok !== false
      || (invalidXrSceneTransition as { ok?: unknown }).ok !== false
      || (invalidXrScenePair as { ok?: unknown }).ok !== false) {
      throw new Error('expected XR invocation parsing to reject duplicate bindings, invalid transitions, and unknown fields')
    }
    if ((localCamera as { schema?: unknown; optics?: { stateOwner?: unknown; sensors?: unknown[] } }).schema !== 'agenticgraph-shared-camera-mcp/v1'
      || (localCamera as { optics?: { stateOwner?: unknown } }).optics?.stateOwner !== 'FloatingPanel.Camera'
      || (localCamera as { optics?: { sensors?: unknown[] } }).optics?.sensors?.length !== 4) {
      throw new Error(`expected Camera WebMCP inspection to expose the shared Camera schema, got ${JSON.stringify(localCamera)}`)
    }
    const controlledCamera = localCameraControl as { ok?: unknown; action?: unknown; camera?: { framing?: { settings?: { angle?: unknown; level?: unknown; shot?: unknown; sensorId?: unknown; focalLengthMm?: unknown; focusDistanceMeters?: unknown; aspectRatio?: unknown } }; surface?: { cameraPanelOpen?: unknown } } }
    if (controlledCamera.ok !== true || controlledCamera.action !== 'frame' || controlledCamera.camera?.framing?.settings?.angle !== 'right-side' || controlledCamera.camera.framing.settings.level !== 'high-angle' || controlledCamera.camera.framing.settings.shot !== 'close-up' || controlledCamera.camera.framing.settings.sensorId !== '65mm' || controlledCamera.camera.framing.settings.focalLengthMm !== 85 || controlledCamera.camera.framing.settings.focusDistanceMeters !== 3.5 || controlledCamera.camera.framing.settings.aspectRatio !== '2.39:1' || controlledCamera.camera.surface?.cameraPanelOpen !== false) {
      throw new Error(`expected structured Camera WebMCP control to frame without ejecting the active panel, got ${JSON.stringify(localCameraControl)}`)
    }
    const animationInspection = localAnimation as { schema?: unknown; presets?: unknown[]; runtime?: { cast?: Array<{ actorId?: unknown; animation?: { presetId?: unknown } }> } }
    const animationControl = localAnimationControl as { ok?: unknown; targetId?: unknown; scene?: { runtime?: { cast?: Array<{ actorId?: unknown; animation?: { presetId?: unknown } }> } } }
    const animationState = useGraphStore.getState()
    if (animationInspection.schema !== 'agenticgraph-xr-animation-mcp/v1'
      || animationInspection.presets?.length !== 11
      || animationInspection.runtime?.cast?.find(track => track.actorId === 'start')?.animation?.presetId !== 'dance'
      || animationControl.ok !== true
      || animationControl.targetId !== 'start'
      || animationControl.scene?.runtime?.cast?.find(track => track.actorId === 'start')?.animation?.presetId !== 'dance'
      || animationState.floatingPanelOpen !== true
      || animationState.floatingPanelView !== 'animation'
      || animationState.bottomSurfaceCollapsed !== false
      || animationState.bottomSurfaceTab !== 'timeline') {
      throw new Error(`expected Animation WebMCP inspect/control to apply native dance choreography and reveal its runtime, got ${JSON.stringify({ localAnimation, localAnimationControl })}`)
    }
    if ((local2dZoomViewport as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_2d_zoom_viewport to report available zoom state, got ${JSON.stringify(local2dZoomViewport)}`)
    }
    if ((local2dZoomViewport as { zoomViewKey?: unknown }).zoomViewKey !== zoomViewKey) {
      throw new Error(`expected inspect_local_2d_zoom_viewport to reuse the active zoom view key, got ${JSON.stringify(local2dZoomViewport)}`)
    }
    if ((local2dZoomViewport as { zoomState?: { k?: unknown } }).zoomState?.k !== 1.75) {
      throw new Error(`expected inspect_local_2d_zoom_viewport to report keyed effective zoom scale, got ${JSON.stringify(local2dZoomViewport)}`)
    }
    if ((local2dZoomViewport as { zoomState?: { viewportW?: unknown } }).zoomState?.viewportW !== 960) {
      throw new Error(`expected inspect_local_2d_zoom_viewport to report keyed viewport width, got ${JSON.stringify(local2dZoomViewport)}`)
    }
    if ((localSourceFilesSnapshot as { available?: unknown }).available !== true) {
      throw new Error(`expected inspect_local_source_files_snapshot to report an available source-files snapshot, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { activePath?: unknown }).activePath !== '/docs/agent-ready.md') {
      throw new Error(`expected inspect_local_source_files_snapshot to report the active workspace path, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { activeSourcePath?: unknown }).activeSourcePath !== 'workspace:/docs/agent-ready.md') {
      throw new Error(`expected inspect_local_source_files_snapshot to report the active workspace source path, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { sourceFileCount?: unknown }).sourceFileCount !== 3) {
      throw new Error(`expected inspect_local_source_files_snapshot to report source file count, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { workspaceBackedSourceFileCount?: unknown }).workspaceBackedSourceFileCount !== 2) {
      throw new Error(`expected inspect_local_source_files_snapshot to report workspace-backed source file count, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { enabledNonWorkspaceSourceFileCount?: unknown }).enabledNonWorkspaceSourceFileCount !== 1) {
      throw new Error(`expected inspect_local_source_files_snapshot to report enabled non-workspace count, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { activeSourceFile?: { name?: unknown } }).activeSourceFile?.name !== 'Workspace Doc') {
      throw new Error(`expected inspect_local_source_files_snapshot to report the active workspace source file, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if ((localSourceFilesSnapshot as { sampleSourceFiles?: Array<{ id?: unknown }> }).sampleSourceFiles?.[0]?.id !== 'remote-doc') {
      throw new Error(`expected inspect_local_source_files_snapshot to preserve source file order in the sample payload, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if (typeof (localSourceFilesSnapshot as { compositionSignature?: unknown }).compositionSignature !== 'string' || !String((localSourceFilesSnapshot as { compositionSignature?: unknown }).compositionSignature).trim()) {
      throw new Error(`expected inspect_local_source_files_snapshot to report a composition signature, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if (!String((localSourceFilesSnapshot as { storageSyncSignature?: unknown }).storageSyncSignature || '').startsWith('remote-doc:')) {
      throw new Error(`expected inspect_local_source_files_snapshot to report the non-workspace storage sync signature, got ${JSON.stringify(localSourceFilesSnapshot)}`)
    }
    if (
      (localRuntimeIdentity as { identity?: { schema?: unknown } }).identity?.schema !== 'agenticgraph-runtime-identity/v1'
      || (localRuntimeIdentity as { gate?: { schema?: unknown } }).gate?.schema !== 'agenticgraph-runtime-identity-gate/v1'
    ) {
      throw new Error(`expected read_local_runtime_identity to expose the canonical identity and automatic gate snapshots, got ${JSON.stringify(localRuntimeIdentity)}`)
    }
    if (!fetchCalls.some((url) => url.endsWith('/agenticgraph/health'))) {
      throw new Error(`expected inspect_agent_surface to fetch the agent-ready health route, got ${fetchCalls.join(', ')}`)
    }
    if (!fetchCalls.some((url) => url.endsWith('/agenticgraph/.well-known/mcp/server-card.json'))) {
      throw new Error(`expected inspect_agent_surface to fetch the MCP server card, got ${fetchCalls.join(', ')}`)
    }
    const expectedInspection = buildExpectedMockAgentSurfaceInspection('http://localhost/agenticgraph')
    if (JSON.stringify(inspection) !== JSON.stringify(expectedInspection)) {
      throw new Error(`expected inspect_agent_surface to return the exact shared payload, got ${JSON.stringify(inspection)}`)
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    globalThis.fetch = previousFetch
    useGraphStore.setState({
      markdownDocumentName: previousMarkdownDocumentName,
      markdownDocumentText: previousMarkdownDocumentText,
      markdownDocumentSourceUrl: previousMarkdownDocumentSourceUrl,
      graphData: previousGraphData,
      graphDataRevision: previousGraphDataRevision,
      canvasRenderMode: previousCanvasRenderMode,
      canvas2dRenderer: previousCanvas2dRenderer,
      documentSemanticMode: previousDocumentSemanticMode,
      frontmatterModeEnabled: previousFrontmatterModeEnabled,
      multiDimTableModeEnabled: previousMultiDimTableModeEnabled,
      documentStructureBaselineLock: previousDocumentStructureBaselineLock,
      collapsedGroupIds: previousCollapsedGroupIds,
      selectedNodeId: previousSelectedNodeId,
      selectedEdgeId: previousSelectedEdgeId,
      canvasSnapshotFns: previousCanvasSnapshotFns,
      threeCameraSnapshotFns: previousThreeCameraSnapshotFns,
      threeLayoutSnapshotFns: previousThreeLayoutSnapshotFns,
      canvas3dMode: previousCanvas3dMode,
      floatingPanelOpen: previousFloatingPanelOpen,
      floatingPanelView: previousFloatingPanelView,
      bottomSurfaceTab: previousBottomSurfaceTab,
      bottomSurfaceCollapsed: previousBottomSurfaceCollapsed,
      viewPinned: previousViewPinned,
      fitToScreenMode: previousFitToScreenMode,
      zoomToSelectionMode: previousZoomToSelectionMode,
      zoomState: previousZoomState,
      zoomStateByKey: previousZoomStateByKey,
      renderMediaAsNodes: previousRenderMediaAsNodes,
      mediaPanelDensity: previousMediaPanelDensity,
      schema: previousSchema,
      designRendererWebpageLayoutKey: previousDesignRendererWebpageLayoutKey,
      sourceFiles: previousSourceFiles,
    } as never)
    useMarkdownExplorerStore.setState({ activePath: previousExplorerActivePath })
    resetAgenticGraphWebMcpRuntimeForTests()
    restore()
  }
}

export async function testWebMcpRuntimeProvidesContextWhenRegisterToolIsUnavailable(): Promise<void> {
  const previousBaseUrl = process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
  const { restore } = initJsdomHarness()
  const providedTools: RegisteredTool[] = []

  try {
    delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    resetAgenticGraphWebMcpRuntimeForTests()

    const navigatorObject = window.navigator as Navigator & {
      modelContext?: {
        provideContext?: (context: { tools: RegisteredTool[] }) => void
      }
    }
    try {
      delete navigatorObject.modelContext
    } catch {
      navigatorObject.modelContext = undefined
    }

    navigatorObject.modelContext = {
      provideContext(context) {
        providedTools.splice(0, providedTools.length, ...context.tools)
      },
    }

    installAgenticGraphWebMcpRuntime()

    if (document.documentElement.dataset.kgWebmcpContext !== 'installed') {
      throw new Error(
        `expected installed runtime state after provideContext registration, got ${String(document.documentElement.dataset.kgWebmcpContext)}`,
      )
    }
    assertWebMcpRuntimeToolParity(providedTools, 'runtime provideContext')
    if (document.documentElement.dataset.kgWebmcpTools !== EXPECTED_WEB_MCP_RUNTIME_CONTRACTS.map((tool) => tool.webName).join(',')) {
      throw new Error(
        `expected provideContext data-kg-webmcp-tools to match shared browser contract order, got ${String(document.documentElement.dataset.kgWebmcpTools)}`,
      )
    }
  } finally {
    if (typeof previousBaseUrl === 'string') process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL = previousBaseUrl
    else delete process.env.VITE_AGENTICGRAPH_STORAGE_BASE_URL
    resetAgenticGraphWebMcpRuntimeForTests()
    restore()
  }
}
