import {
  KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  buildKnowgrphStorageDefaultDocPath,
  buildKnowgrphStorageDocPath,
  buildKnowgrphStorageSourceFilesIndexPath,
} from '@/lib/storage/knowgrphStorageSyncContract'
import { readEnvString } from '@/lib/config.env'
import { resolvePublishedDocIdentity } from '@/features/canvas/canvasDocShareToken.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  buildKnowgrphAgentReadyToolContracts,
  KNOWGRPH_AGENT_READY_TOOL_IDS,
} from './knowgrphAgentReadyToolContract.mjs'
import {
  readLocalChatPipelineSurfaceSnapshot,
  readLocalCommerceReadinessSurfaceSnapshot,
  readLocalEditorWorkspaceSurfaceSnapshot,
  readLocalMainPanelSurfaceSnapshot,
  readLocalSettingsChatReadinessSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
} from './browserLocalSurfaceSnapshots'
import { createAgentSurfaceInspectionExecutor } from './agentSurfaceInspection.mjs'
import { createPublishedAgentReadyToolExecutors } from './publishedToolExecutors.mjs'
import { inspectSharedDocumentStructure } from './sharedDocumentStructureInspection.mjs'
import { createWebMcpLifecycleController } from './webMcpLifecycle.mjs'
import { inspectLocalCanvasTopology } from './localCanvasTopologyInspection'
import { inspectLocalCanvasSnapshot } from './localCanvasSnapshotInspection'
import { inspectLocalThreeCameraPose } from './localThreeCameraPoseInspection'
import { inspectLocalThreeLayoutPositions } from './localThreeLayoutPositionsInspection'
import { inspectLocal2dZoomViewport } from './local2dZoomViewportInspection'
import { inspectLocalSourceFilesSnapshot } from './localSourceFilesSnapshotInspection'
import { inspectLocalMainPanelState } from './localMainPanelStateInspection'
import { inspectLocalEditorWorkspaceState } from './localEditorWorkspaceStateInspection'
import { inspectLocalChatPipelineState } from './localChatPipelineStateInspection'
import { inspectLocalMainPanelChatCanvasPipeline } from './localMainPanelChatCanvasPipelineInspection'
import { inspectLocalSettingsChatReadiness } from './localSettingsChatReadinessInspection'
import { inspectLocalWorkspaceDocument } from './localWorkspaceDocumentInspection'
import { buildReadLocalRuntimeIdentityTool } from './localRuntimeIdentityWebMcpTool'
import { buildXrSceneWebMcpToolBuilders } from './xrSceneWebMcpTools'
import { buildCameraWebMcpToolBuilders } from './cameraWebMcpTools'
import { buildXrAnimationWebMcpToolBuilders } from './xrAnimationWebMcpTools'
import { buildMotionControlWebMcpToolBuilders } from './motionControlWebMcpTools'
import { buildGameModeWebMcpToolBuilders } from './gameModeWebMcpTools'
import { buildFlightSimWebMcpToolBuilders } from './flightSimWebMcpTools'
import { buildCitySimWebMcpToolBuilders } from './citySimWebMcpTools'
import { buildStorageSyncWebMcpToolBuilders } from './storageSyncWebMcpTools'
import { buildGroupPanelWebMcpToolBuilders } from '@/features/group-panel/groupPanelWebMcpTools'
import type { AgentReadyToolContract, ModelContextLike, ModelContextRegistrationState, WebMcpNavigator, WebMcpRuntimeState, WebMcpTool, WebMcpToolInput } from './webMcpRuntimeTypes'

const WEB_MCP_TOOL_CONTRACTS = buildKnowgrphAgentReadyToolContracts({
  defaultWorkspaceId: KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
}) as AgentReadyToolContract[]

const findWebToolContract = (name: string): AgentReadyToolContract => {
  const contract = WEB_MCP_TOOL_CONTRACTS.find(entry => entry.name === name)
  if (!contract) {
    throw new Error(`missing Knowgrph agent-ready tool contract: ${name}`)
  }
  return contract
}
const XR_SCENE_WEB_MCP_TOOL_BUILDERS = buildXrSceneWebMcpToolBuilders(findWebToolContract)
const CAMERA_WEB_MCP_TOOL_BUILDERS = buildCameraWebMcpToolBuilders(findWebToolContract)
const XR_ANIMATION_WEB_MCP_TOOL_BUILDERS = buildXrAnimationWebMcpToolBuilders(findWebToolContract)
const MOTION_CONTROL_WEB_MCP_TOOL_BUILDERS = buildMotionControlWebMcpToolBuilders(findWebToolContract)
const GAME_MODE_WEB_MCP_TOOL_BUILDERS = buildGameModeWebMcpToolBuilders(findWebToolContract)
const FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS = buildFlightSimWebMcpToolBuilders(findWebToolContract)
const CITY_SIM_WEB_MCP_TOOL_BUILDERS = buildCitySimWebMcpToolBuilders(findWebToolContract)
const STORAGE_SYNC_WEB_MCP_TOOL_BUILDERS = buildStorageSyncWebMcpToolBuilders(findWebToolContract)
const GROUP_PANEL_WEB_MCP_TOOL_BUILDERS = buildGroupPanelWebMcpToolBuilders(findWebToolContract)
const SEARCH_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.search)
const FETCH_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.fetch)
const SOURCE_FILES_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles)
const READ_SOURCE_FILE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile)
const READ_SHARED_DOCUMENT_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument)
const INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure)
const INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness)
const INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState)
const INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState)
const INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState)
const INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline)
const INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument)
const INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology)
const INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot)
const INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose)
const INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions)
const INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport)
const INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot)
const READ_LOCAL_RUNTIME_IDENTITY_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity)
const INSPECT_AGENT_SURFACE_TOOL_CONTRACT = findWebToolContract(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface)
const SEARCH_TOOL_NAME = SEARCH_TOOL_CONTRACT.webName
const FETCH_TOOL_NAME = FETCH_TOOL_CONTRACT.webName
const SOURCE_FILES_TOOL_NAME = SOURCE_FILES_TOOL_CONTRACT.webName
const READ_SOURCE_FILE_TOOL_NAME = READ_SOURCE_FILE_TOOL_CONTRACT.webName
const READ_SHARED_DOCUMENT_TOOL_NAME = READ_SHARED_DOCUMENT_TOOL_CONTRACT.webName
const INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_NAME = INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_NAME = INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT.webName
const INSPECT_LOCAL_MAINPANEL_STATE_TOOL_NAME = INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_NAME = INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_NAME = INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_NAME = INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_NAME = INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT.webName
const INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_NAME = INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT.webName
const INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_NAME = INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT.webName
const INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_NAME = INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT.webName
const INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_NAME = INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT.webName
const INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_NAME = INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT.webName
const INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_NAME = INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT.webName
const INSPECT_AGENT_SURFACE_TOOL_NAME = INSPECT_AGENT_SURFACE_TOOL_CONTRACT.webName
const WEB_MCP_TOOL_NAMES = WEB_MCP_TOOL_CONTRACTS.map(tool => tool.webName)
const WEB_MCP_LATE_BINDING_RETRY_DELAY_MS = 500
const WEB_MCP_LATE_BINDING_MAX_ATTEMPTS = 20
const WEB_MCP_DEFAULT_STORAGE_BASE_URL = 'https://airvio.co'
const WEB_MCP_DEFAULT_AGENT_READY_BASE_URL = 'https://airvio.co/knowgrph'
const WEB_MCP_APP_BASE_PATH = '/knowgrph'
const webMcpRuntimeState: WebMcpRuntimeState = {
  fallbackContext: null,
  activeRegisteredContext: null,
  registrations: new WeakMap<ModelContextLike, ModelContextRegistrationState>(),
  lateBindingRetryId: null,
  lateBindingAttemptCount: 0,
}

const markWebMcpRuntime = (state = WEB_MCP_TOOL_NAMES.join(',')): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.kgWebmcpTools = WEB_MCP_TOOL_NAMES.join(',')
  document.documentElement.dataset.kgWebmcpContext = state
}

const markWebMcpHostBinding = (state: string): void => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.kgWebmcpHostContext = state
}

const normalizeString = (value: unknown): string => String(value || '').trim()

const isLocalhostHost = (hostname: string): boolean => {
  const normalized = normalizeString(hostname).toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

const readWebMcpStorageBaseUrl = (): string => normalizeString(readEnvString('VITE_KNOWGRPH_STORAGE_BASE_URL', ''))

const buildWebMcpStorageRequestUrl = (path: string): string => {
  const safePath = normalizeString(path)
  if (!safePath) return ''
  if (typeof window !== 'undefined') {
    const hostname = normalizeString(window.location?.hostname)
    if (isLocalhostHost(hostname) && safePath.startsWith('/api/storage/')) return safePath
    const currentOrigin = normalizeString(window.location?.origin)
    const baseUrl = readWebMcpStorageBaseUrl() || currentOrigin || WEB_MCP_DEFAULT_STORAGE_BASE_URL
    return new URL(safePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
  }
  const baseUrl = readWebMcpStorageBaseUrl() || WEB_MCP_DEFAULT_STORAGE_BASE_URL
  return new URL(safePath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

const readWebMcpDocumentBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    const currentOrigin = normalizeString(window.location?.origin)
    if (currentOrigin) return currentOrigin
  }
  return readWebMcpStorageBaseUrl() || WEB_MCP_DEFAULT_STORAGE_BASE_URL
}

const readWebMcpAgentReadyBaseUrl = (): string => {
  const configuredBaseUrl = normalizeString(readEnvString('VITE_KNOWGRPH_AGENT_READY_BASE_URL', ''))
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/+$/, '')
  if (typeof window !== 'undefined') {
    const currentOrigin = normalizeString(window.location?.origin)
    if (currentOrigin) {
      return new URL(`${WEB_MCP_APP_BASE_PATH}/`, currentOrigin.endsWith('/') ? currentOrigin : `${currentOrigin}/`)
        .toString()
        .replace(/\/+$/, '')
    }
  }
  return WEB_MCP_DEFAULT_AGENT_READY_BASE_URL
}

const fetchJson = async (url: string, accept = 'application/json'): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { accept },
  })
  if (!response.ok) {
    throw new Error(`inspect_agent_surface failed with ${response.status} for ${url}`)
  }
  return response.json()
}

const buildStorageDocPath = (canonicalPath: string, workspaceId = ''): string => {
  const normalizedWorkspaceId = normalizeString(workspaceId)
  return normalizedWorkspaceId
    ? buildKnowgrphStorageDocPath(normalizedWorkspaceId, canonicalPath)
    : buildKnowgrphStorageDefaultDocPath(canonicalPath)
}

const buildAgentSurfaceInspection = () =>
  createAgentSurfaceInspectionExecutor({
    baseUrl: readWebMcpAgentReadyBaseUrl(),
    fetchJson,
  })()

const PUBLISHED_WEB_MCP_TOOL_EXECUTORS = createPublishedAgentReadyToolExecutors({
  toolNames: {
    search: SEARCH_TOOL_NAME,
    fetch: FETCH_TOOL_NAME,
    listSourceFiles: SOURCE_FILES_TOOL_NAME,
    readSourceFile: READ_SOURCE_FILE_TOOL_NAME,
    readSharedDocument: READ_SHARED_DOCUMENT_TOOL_NAME,
    inspectSharedDocumentStructure: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_NAME,
    inspectAgentSurface: INSPECT_AGENT_SURFACE_TOOL_NAME,
  },
  defaultWorkspaceId: KNOWGRPH_STORAGE_DEFAULT_WORKSPACE_ID,
  publicBaseUrl: readWebMcpStorageBaseUrl() || readWebMcpDocumentBaseUrl() || WEB_MCP_DEFAULT_STORAGE_BASE_URL,
  buildStorageDocPath,
  fetchSourceFilesIndexResponse: () =>
    fetch(buildWebMcpStorageRequestUrl(buildKnowgrphStorageSourceFilesIndexPath()), {
      headers: { accept: 'text/markdown' },
    }),
  fetchStorageMarkdownResponse: (path: string) =>
    fetch(buildWebMcpStorageRequestUrl(path), {
      headers: { accept: 'text/markdown' },
    }),
  resolveSharedDocumentInput: (input: WebMcpToolInput) =>
    resolvePublishedDocIdentity({
      shareToken: input?.shareToken,
      shareUrl: input?.shareUrl,
      appBasePath: WEB_MCP_APP_BASE_PATH,
      baseUrl: readWebMcpDocumentBaseUrl(),
    }),
  inspectSharedDocumentStructure,
  buildAgentSurfaceInspection,
})

const buildSearchTool = (): WebMcpTool => ({
  name: SEARCH_TOOL_NAME,
  title: SEARCH_TOOL_CONTRACT.title,
  description: SEARCH_TOOL_CONTRACT.description,
  inputSchema: SEARCH_TOOL_CONTRACT.inputSchema,
  outputSchema: SEARCH_TOOL_CONTRACT.outputSchema,
  annotations: SEARCH_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[SEARCH_TOOL_NAME],
})

const buildFetchTool = (): WebMcpTool => ({
  name: FETCH_TOOL_NAME,
  title: FETCH_TOOL_CONTRACT.title,
  description: FETCH_TOOL_CONTRACT.description,
  inputSchema: FETCH_TOOL_CONTRACT.inputSchema,
  outputSchema: FETCH_TOOL_CONTRACT.outputSchema,
  annotations: FETCH_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[FETCH_TOOL_NAME],
})

const buildSourceFilesTool = (): WebMcpTool => ({
  name: SOURCE_FILES_TOOL_NAME,
  title: SOURCE_FILES_TOOL_CONTRACT.title,
  description: SOURCE_FILES_TOOL_CONTRACT.description,
  inputSchema: SOURCE_FILES_TOOL_CONTRACT.inputSchema,
  annotations: SOURCE_FILES_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[SOURCE_FILES_TOOL_NAME],
})

const buildReadSourceFileTool = (): WebMcpTool => ({
  name: READ_SOURCE_FILE_TOOL_NAME,
  title: READ_SOURCE_FILE_TOOL_CONTRACT.title,
  description: READ_SOURCE_FILE_TOOL_CONTRACT.description,
  inputSchema: READ_SOURCE_FILE_TOOL_CONTRACT.inputSchema,
  annotations: READ_SOURCE_FILE_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[READ_SOURCE_FILE_TOOL_NAME],
})

const buildReadSharedDocumentTool = (): WebMcpTool => ({
  name: READ_SHARED_DOCUMENT_TOOL_NAME,
  title: READ_SHARED_DOCUMENT_TOOL_CONTRACT.title,
  description: READ_SHARED_DOCUMENT_TOOL_CONTRACT.description,
  inputSchema: READ_SHARED_DOCUMENT_TOOL_CONTRACT.inputSchema,
  annotations: READ_SHARED_DOCUMENT_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[READ_SHARED_DOCUMENT_TOOL_NAME],
})

const buildInspectSharedDocumentStructureTool = (): WebMcpTool => ({
  name: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_NAME,
  title: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT.title,
  description: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_NAME],
})

const buildInspectLocalMainPanelStateTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_MAINPANEL_STATE_TOOL_NAME,
  title: INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT.annotations,
  execute: async () => inspectLocalMainPanelState(readLocalMainPanelSurfaceSnapshot()),
})

const buildInspectLocalSettingsChatReadinessTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_NAME,
  title: INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT.annotations,
  execute: async () => inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot()),
})

const buildInspectLocalEditorWorkspaceStateTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_NAME,
  title: INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT.annotations,
  execute: async () => inspectLocalEditorWorkspaceState(readLocalEditorWorkspaceSurfaceSnapshot()),
})

const buildInspectLocalChatPipelineStateTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_NAME,
  title: INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT.annotations,
  execute: async () => inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot()),
})

const buildInspectLocalMainPanelChatCanvasPipelineTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_NAME,
  title: INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocalMainPanelChatCanvasPipeline({
      mainPanelSnapshot: readLocalMainPanelSurfaceSnapshot(),
      commerceReadinessSnapshot: readLocalCommerceReadinessSurfaceSnapshot(),
      settingsChatReadinessSnapshot: readLocalSettingsChatReadinessSurfaceSnapshot(),
      editorWorkspaceSnapshot: readLocalEditorWorkspaceSurfaceSnapshot(),
      chatPipelineSnapshot: readLocalChatPipelineSurfaceSnapshot(),
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
      markdownDocumentSourceUrl: state.markdownDocumentSourceUrl,
      graphData: state.graphData,
      graphDataRevision: state.graphDataRevision,
      canvasRenderMode: state.canvasRenderMode,
      canvas2dRenderer: state.canvas2dRenderer,
      documentSemanticMode: state.documentSemanticMode,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      multiDimTableModeEnabled: state.multiDimTableModeEnabled,
      documentStructureBaselineLock: state.documentStructureBaselineLock,
      collapsedGroupIds: state.collapsedGroupIds,
      selectedNodeId: state.selectedNodeId,
      selectedEdgeId: state.selectedEdgeId,
    })
  },
})

const buildInspectLocalWorkspaceDocumentTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_NAME,
  title: INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT.annotations,
  execute: async () => inspectLocalWorkspaceDocument(useGraphStore.getState()),
})

const buildInspectLocalCanvasTopologyTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_NAME,
  title: INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocalCanvasTopology({
      graphData: state.graphData,
      graphDataRevision: state.graphDataRevision,
      markdownDocumentName: state.markdownDocumentName,
      markdownDocumentText: state.markdownDocumentText,
      canvasRenderMode: state.canvasRenderMode,
      canvas2dRenderer: state.canvas2dRenderer,
      documentSemanticMode: state.documentSemanticMode,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      multiDimTableModeEnabled: state.multiDimTableModeEnabled,
      documentStructureBaselineLock: state.documentStructureBaselineLock,
      collapsedGroupIds: state.collapsedGroupIds,
      selectedNodeId: state.selectedNodeId,
      selectedEdgeId: state.selectedEdgeId,
    })
  },
})

const buildInspectLocalCanvasSnapshotTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_NAME,
  title: INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    const svgMarkup = await state.captureCanvasSvgSnapshot('2d')
    return inspectLocalCanvasSnapshot({
      markdownDocumentName: state.markdownDocumentName,
      canvasRenderMode: state.canvasRenderMode,
      canvas2dRenderer: state.canvas2dRenderer,
      svgMarkup,
    })
  },
})

const buildInspectLocal3dCameraPoseTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_NAME,
  title: INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocalThreeCameraPose({
      markdownDocumentName: state.markdownDocumentName,
      canvasRenderMode: state.canvasRenderMode,
      canvas3dMode: state.canvas3dMode,
      viewPinned: state.viewPinned,
      pose: state.captureThreeCameraPose(),
    })
  },
})

const buildInspectLocal3dLayoutPositionsTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_NAME,
  title: INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocalThreeLayoutPositions({
      markdownDocumentName: state.markdownDocumentName,
      canvasRenderMode: state.canvasRenderMode,
      canvas3dMode: state.canvas3dMode,
      viewPinned: state.viewPinned,
      selectedNodeId: state.selectedNodeId,
      positions: state.captureThreeLayoutPositions(),
    })
  },
})

const buildInspectLocal2dZoomViewportTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_NAME,
  title: INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocal2dZoomViewport({
      markdownDocumentName: state.markdownDocumentName,
      canvasRenderMode: state.canvasRenderMode,
      canvas2dRenderer: state.canvas2dRenderer,
      schema: state.schema,
      graphData: state.graphData,
      documentSemanticMode: state.documentSemanticMode,
      frontmatterModeEnabled: state.frontmatterModeEnabled,
      multiDimTableModeEnabled: state.multiDimTableModeEnabled,
      documentStructureBaselineLock: state.documentStructureBaselineLock,
      renderMediaAsNodes: state.renderMediaAsNodes,
      mediaPanelDensity: state.mediaPanelDensity,
      collapsedGroupIds: state.collapsedGroupIds,
      designRendererWebpageLayoutKey: state.designRendererWebpageLayoutKey,
      viewPinned: state.viewPinned,
      fitToScreenMode: state.fitToScreenMode,
      zoomToSelectionMode: state.zoomToSelectionMode,
      zoomState: state.zoomState,
      zoomStateByKey: state.zoomStateByKey,
    })
  },
})

const buildInspectLocalSourceFilesSnapshotTool = (): WebMcpTool => ({
  name: INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_NAME,
  title: INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT.title,
  description: INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT.description,
  inputSchema: INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT.annotations,
  execute: async () => {
    const state = useGraphStore.getState()
    return inspectLocalSourceFilesSnapshot({
      sourceFiles: state.sourceFiles,
      activePath: useMarkdownExplorerStore.getState().activePath,
    })
  },
})

const buildInspectAgentSurfaceTool = (): WebMcpTool => ({
  name: INSPECT_AGENT_SURFACE_TOOL_NAME,
  title: INSPECT_AGENT_SURFACE_TOOL_CONTRACT.title,
  description: INSPECT_AGENT_SURFACE_TOOL_CONTRACT.description,
  inputSchema: INSPECT_AGENT_SURFACE_TOOL_CONTRACT.inputSchema,
  annotations: INSPECT_AGENT_SURFACE_TOOL_CONTRACT.annotations,
  execute: PUBLISHED_WEB_MCP_TOOL_EXECUTORS[INSPECT_AGENT_SURFACE_TOOL_NAME],
})

const WEB_MCP_TOOL_BUILDERS: Record<string, () => WebMcpTool> = {
  [KNOWGRPH_AGENT_READY_TOOL_IDS.search]: buildSearchTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.fetch]: buildFetchTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles]: buildSourceFilesTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile]: buildReadSourceFileTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument]: buildReadSharedDocumentTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure]: buildInspectSharedDocumentStructureTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness]: buildInspectLocalSettingsChatReadinessTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState]: buildInspectLocalMainPanelStateTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState]: buildInspectLocalEditorWorkspaceStateTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState]: buildInspectLocalChatPipelineStateTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline]: buildInspectLocalMainPanelChatCanvasPipelineTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument]: buildInspectLocalWorkspaceDocumentTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology]: buildInspectLocalCanvasTopologyTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot]: buildInspectLocalCanvasSnapshotTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose]: buildInspectLocal3dCameraPoseTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions]: buildInspectLocal3dLayoutPositionsTool,
  ...CAMERA_WEB_MCP_TOOL_BUILDERS,
  ...XR_ANIMATION_WEB_MCP_TOOL_BUILDERS,
  ...MOTION_CONTROL_WEB_MCP_TOOL_BUILDERS,
  ...GAME_MODE_WEB_MCP_TOOL_BUILDERS,
  ...FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS,
  ...CITY_SIM_WEB_MCP_TOOL_BUILDERS,
  ...STORAGE_SYNC_WEB_MCP_TOOL_BUILDERS,
  ...GROUP_PANEL_WEB_MCP_TOOL_BUILDERS,
  ...XR_SCENE_WEB_MCP_TOOL_BUILDERS,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport]: buildInspectLocal2dZoomViewportTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot]: buildInspectLocalSourceFilesSnapshotTool,
  [KNOWGRPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity]: () => buildReadLocalRuntimeIdentityTool(READ_LOCAL_RUNTIME_IDENTITY_TOOL_CONTRACT),
  [KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface]: buildInspectAgentSurfaceTool,
}

const applySharedDescriptorFields = (
  tool: WebMcpTool,
  contract: AgentReadyToolContract,
): WebMcpTool => ({
  ...tool,
  ...(Array.isArray(contract.securitySchemes) && contract.securitySchemes.length
    ? { securitySchemes: contract.securitySchemes }
    : {}),
  ...(contract.outputSchema ? { outputSchema: contract.outputSchema } : {}),
  ...(contract._meta ? { _meta: contract._meta } : {}),
})

const WEB_MCP_TOOLS = WEB_MCP_TOOL_CONTRACTS.map((contract) => {
  const buildTool = WEB_MCP_TOOL_BUILDERS[contract.name]
  if (typeof buildTool !== 'function') {
    throw new Error(`missing Knowgrph browser WebMCP tool builder: ${contract.name}`)
  }
  return applySharedDescriptorFields(buildTool(), contract)
})
const webMcpLifecycle = createWebMcpLifecycleController({
  root: globalThis as typeof globalThis & { navigator?: WebMcpNavigator; window?: { navigator?: WebMcpNavigator } },
  state: webMcpRuntimeState as unknown as Record<string, unknown>,
  tools: WEB_MCP_TOOLS,
  toolNames: WEB_MCP_TOOL_NAMES,
  lateBindingRetryDelayMs: WEB_MCP_LATE_BINDING_RETRY_DELAY_MS,
  lateBindingMaxAttempts: WEB_MCP_LATE_BINDING_MAX_ATTEMPTS,
  markRuntimeState: markWebMcpRuntime,
  markHostBindingState: markWebMcpHostBinding,
})

export function installKnowgrphWebMcpRuntime(): void {
  if (typeof globalThis === 'undefined') return
  webMcpLifecycle.install()
}

export function resetKnowgrphWebMcpRuntimeForTests(): void {
  webMcpLifecycle.dispose()
  webMcpRuntimeState.activeRegisteredContext = null
  webMcpRuntimeState.registrations = new WeakMap<ModelContextLike, ModelContextRegistrationState>()
  webMcpRuntimeState.lateBindingAttemptCount = 0
  resetBrowserLocalSurfaceSnapshotsForTests()
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.kgWebmcpContext
    delete document.documentElement.dataset.kgWebmcpHostContext
    delete document.documentElement.dataset.kgWebmcpTools
  }
}
