import {
  AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  buildAgenticGraphStorageDefaultDocPath,
  buildAgenticGraphStorageDocPath,
  buildAgenticGraphStorageSourceFilesIndexPath,
} from '@/lib/storage/agenticgraphStorageSyncContract'
import { readEnvString } from '@/lib/config.env'
import { resolvePublishedDocIdentity } from '@/features/canvas/canvasDocShareToken.mjs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import {
  buildAgenticGraphAgentReadyToolContracts,
  AGENTICGRAPH_AGENT_READY_TOOL_IDS,
} from './agenticgraphAgentReadyToolContract.mjs'
import {
  readLocalChatPipelineSurfaceSnapshot,
  readLocalCommerceReadinessSurfaceSnapshot,
  readLocalEditorWorkspaceSurfaceSnapshot,
  readLocalMainPanelSurfaceSnapshot,
  readLocalSettingsChatReadinessSurfaceSnapshot,
} from './browserLocalSurfaceSnapshots'
import { createAgentSurfaceInspectionExecutor } from './agentSurfaceInspection.mjs'
import { createPublishedAgentReadyToolExecutors } from './publishedToolExecutors.mjs'
import { inspectSharedDocumentStructure } from './sharedDocumentStructureInspection.mjs'
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
import { buildImmersiveMediaWebMcpToolBuilders } from './immersiveMediaWebMcpTools'
import { buildCitySimWebMcpToolBuilders } from './citySimWebMcpTools'
import { buildStorageSyncWebMcpToolBuilders } from './storageSyncWebMcpTools'
import { buildGroupPanelWebMcpToolBuilders } from '@/features/group-panel/groupPanelWebMcpTools'
import { buildImportUrlWebMcpToolBuilders } from './importUrlWebMcpTools'
import { buildCanvasViewWebMcpToolBuilders } from './canvasViewWebMcpTools'
import { buildCanvasInteractionWebMcpToolBuilders } from './canvasInteractionWebMcpTools'
import { buildWorkspaceLaunchWebMcpToolBuilders } from './workspaceLaunchWebMcpTools'
import { buildToolbarActionWebMcpToolBuilders } from './toolbarActionWebMcpTools'
import type { AgentReadyToolContract, WebMcpTool, WebMcpToolInput } from './webMcpRuntimeTypes'
import type { ErrorObject, ValidateFunction } from 'ajv'

export type WebMcpToolRegistry = {
  tools: readonly WebMcpTool[]
  get(name: string): WebMcpTool | null
  execute(name: string, input?: WebMcpToolInput): Promise<unknown>
}

export class WebMcpToolInputValidationError extends Error {
  readonly toolName: string
  readonly missingFields: readonly string[]

  constructor(toolName: string, message: string, missingFields: readonly string[]) {
    super(message)
    this.name = 'WebMcpToolInputValidationError'
    this.toolName = toolName
    this.missingFields = Object.freeze([...new Set(missingFields)].sort())
  }
}

type AjvRuntime = Readonly<{
  compile(schema: object): ValidateFunction
  errorsText(
    errors?: ErrorObject[] | null,
    options?: { separator?: string; dataVar?: string },
  ): string
}>

let ajvRuntimePromise: Promise<AjvRuntime> | null = null
const getAjvRuntime = (): Promise<AjvRuntime> => {
  ajvRuntimePromise ||= import('ajv/dist/2020.js').then(({ default: Ajv2020 }) => (
    new Ajv2020({ allErrors: true, strict: false }) as AjvRuntime
  ))
  return ajvRuntimePromise
}

const cloneFrozenMetadata = <T>(value: T, seen = new WeakMap<object, unknown>()): T => {
  if (!value || typeof value !== 'object') return value
  const existing = seen.get(value)
  if (existing) return existing as T
  if (Array.isArray(value)) {
    const clone: unknown[] = []
    seen.set(value, clone)
    value.forEach(entry => clone.push(cloneFrozenMetadata(entry, seen)))
    return Object.freeze(clone) as T
  }
  const clone: Record<string, unknown> = {}
  seen.set(value, clone)
  Object.entries(value).forEach(([key, entry]) => {
    clone[key] = cloneFrozenMetadata(entry, seen)
  })
  return Object.freeze(clone) as T
}

const freezeValidatedTool = (tool: WebMcpTool): WebMcpTool => {
  const inputSchema = cloneFrozenMetadata(tool.inputSchema)
  let validatorPromise: Promise<Readonly<{ ajv: AjvRuntime; validate: ValidateFunction }>> | null = null
  const getValidator = () => {
    validatorPromise ||= getAjvRuntime().then(ajv => Object.freeze({
      ajv,
      validate: ajv.compile(inputSchema),
    }))
    return validatorPromise
  }
  return Object.freeze({
    ...tool,
    inputSchema,
    ...(tool.outputSchema ? { outputSchema: cloneFrozenMetadata(tool.outputSchema) } : {}),
    ...(tool.annotations ? { annotations: cloneFrozenMetadata(tool.annotations) } : {}),
    ...(tool.securitySchemes ? { securitySchemes: cloneFrozenMetadata(tool.securitySchemes) } : {}),
    ...(tool._meta ? { _meta: cloneFrozenMetadata(tool._meta) } : {}),
    execute: async (input?: WebMcpToolInput) => {
      const { ajv, validate } = await getValidator()
      if (!validate(input ?? {})) {
        const errors = [...(validate.errors || [])]
        const missingFields = errors.flatMap(error => (
          error.keyword === 'required' && typeof error.params?.missingProperty === 'string'
            ? [error.params.missingProperty]
            : []
        ))
        throw new WebMcpToolInputValidationError(
          tool.name,
          `Invalid input for ${tool.name}: ${ajv.errorsText(errors, { separator: '; ' })}`,
          missingFields,
        )
      }
      return tool.execute(input)
    },
  })
}

export const createWebMcpToolRegistry = (tools: readonly WebMcpTool[]): WebMcpToolRegistry => {
  const toolsByName = new Map<string, WebMcpTool>()
  for (const tool of tools) {
    if (!tool.name || toolsByName.has(tool.name)) {
      throw new Error(`duplicate or empty WebMCP tool name: ${tool.name}`)
    }
    toolsByName.set(tool.name, tool)
  }
  const frozenTools = Object.freeze(tools.map(freezeValidatedTool))
  frozenTools.forEach(tool => toolsByName.set(tool.name, tool))
  return Object.freeze({
    tools: frozenTools,
    get: (name: string) => toolsByName.get(name) ?? null,
    execute: async (name: string, input?: WebMcpToolInput) => {
      const tool = toolsByName.get(name)
      if (!tool) throw new Error(`unknown WebMCP tool: ${name}`)
      return tool.execute(input)
    },
  })
}

const WEB_MCP_TOOL_CONTRACTS = buildAgenticGraphAgentReadyToolContracts({
  defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  includeBrowserOnlyTools: true,
}) as AgentReadyToolContract[]

const findWebToolContract = (name: string): AgentReadyToolContract => {
  const contract = WEB_MCP_TOOL_CONTRACTS.find(entry => entry.name === name)
  if (!contract) {
    throw new Error(`missing AgenticGraph agent-ready tool contract: ${name}`)
  }
  return contract
}
const XR_SCENE_WEB_MCP_TOOL_BUILDERS = buildXrSceneWebMcpToolBuilders(findWebToolContract)
const CAMERA_WEB_MCP_TOOL_BUILDERS = buildCameraWebMcpToolBuilders(findWebToolContract)
const XR_ANIMATION_WEB_MCP_TOOL_BUILDERS = buildXrAnimationWebMcpToolBuilders(findWebToolContract)
const MOTION_CONTROL_WEB_MCP_TOOL_BUILDERS = buildMotionControlWebMcpToolBuilders(findWebToolContract)
const GAME_MODE_WEB_MCP_TOOL_BUILDERS = buildGameModeWebMcpToolBuilders(findWebToolContract)
const FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS = buildFlightSimWebMcpToolBuilders(findWebToolContract)
const IMMERSIVE_MEDIA_WEB_MCP_TOOL_BUILDERS = buildImmersiveMediaWebMcpToolBuilders(findWebToolContract)
const CITY_SIM_WEB_MCP_TOOL_BUILDERS = buildCitySimWebMcpToolBuilders(findWebToolContract)
const STORAGE_SYNC_WEB_MCP_TOOL_BUILDERS = buildStorageSyncWebMcpToolBuilders(findWebToolContract)
const GROUP_PANEL_WEB_MCP_TOOL_BUILDERS = buildGroupPanelWebMcpToolBuilders(findWebToolContract)
const IMPORT_URL_WEB_MCP_TOOL_BUILDERS = buildImportUrlWebMcpToolBuilders(findWebToolContract)
const CANVAS_VIEW_WEB_MCP_TOOL_BUILDERS = buildCanvasViewWebMcpToolBuilders(findWebToolContract)
const CANVAS_INTERACTION_WEB_MCP_TOOL_BUILDERS = buildCanvasInteractionWebMcpToolBuilders(findWebToolContract)
const WORKSPACE_LAUNCH_WEB_MCP_TOOL_BUILDERS = buildWorkspaceLaunchWebMcpToolBuilders(findWebToolContract)
const TOOLBAR_ACTION_WEB_MCP_TOOL_BUILDERS = buildToolbarActionWebMcpToolBuilders(findWebToolContract)
const SEARCH_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.search)
const FETCH_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.fetch)
const SOURCE_FILES_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.listSourceFiles)
const READ_SOURCE_FILE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.readSourceFile)
const READ_SHARED_DOCUMENT_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.readSharedDocument)
const INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure)
const INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness)
const INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState)
const INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState)
const INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState)
const INSPECT_LOCAL_MAINPANEL_CHAT_CANVAS_PIPELINE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline)
const INSPECT_LOCAL_WORKSPACE_DOCUMENT_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument)
const INSPECT_LOCAL_CANVAS_TOPOLOGY_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology)
const INSPECT_LOCAL_CANVAS_SNAPSHOT_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot)
const INSPECT_LOCAL_3D_CAMERA_POSE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose)
const INSPECT_LOCAL_3D_LAYOUT_POSITIONS_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions)
const INSPECT_LOCAL_2D_ZOOM_VIEWPORT_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport)
const INSPECT_LOCAL_SOURCE_FILES_SNAPSHOT_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot)
const READ_LOCAL_RUNTIME_IDENTITY_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity)
const INSPECT_AGENT_SURFACE_TOOL_CONTRACT = findWebToolContract(AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectAgentSurface)
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
const WEB_MCP_DEFAULT_STORAGE_BASE_URL = 'https://airvio.co'
const WEB_MCP_DEFAULT_AGENT_READY_BASE_URL = 'https://airvio.co/agenticgraph'
const WEB_MCP_APP_BASE_PATH = '/agenticgraph'

const normalizeString = (value: unknown): string => String(value || '').trim()

const isLocalhostHost = (hostname: string): boolean => {
  const normalized = normalizeString(hostname).toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0'
}

const readWebMcpStorageBaseUrl = (): string => normalizeString(readEnvString('VITE_AGENTICGRAPH_STORAGE_BASE_URL', ''))

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
  const configuredBaseUrl = normalizeString(readEnvString('VITE_AGENTICGRAPH_AGENT_READY_BASE_URL', ''))
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
    ? buildAgenticGraphStorageDocPath(normalizedWorkspaceId, canonicalPath)
    : buildAgenticGraphStorageDefaultDocPath(canonicalPath)
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
  defaultWorkspaceId: AGENTICGRAPH_STORAGE_DEFAULT_WORKSPACE_ID,
  publicBaseUrl: readWebMcpStorageBaseUrl() || readWebMcpDocumentBaseUrl() || WEB_MCP_DEFAULT_STORAGE_BASE_URL,
  buildStorageDocPath,
  fetchSourceFilesIndexResponse: () =>
    fetch(buildWebMcpStorageRequestUrl(buildAgenticGraphStorageSourceFilesIndexPath()), {
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

const buildContractTool = (
  contract: AgentReadyToolContract,
  execute: WebMcpTool['execute'],
): WebMcpTool => ({
  name: contract.webName,
  title: contract.title,
  description: contract.description,
  inputSchema: contract.inputSchema,
  annotations: contract.annotations,
  execute,
})

const buildPublishedTool = (contract: AgentReadyToolContract): WebMcpTool =>
  buildContractTool(contract, PUBLISHED_WEB_MCP_TOOL_EXECUTORS[contract.webName])
const buildInspectLocalMainPanelStateTool = (): WebMcpTool => buildContractTool(
  INSPECT_LOCAL_MAINPANEL_STATE_TOOL_CONTRACT,
  async () => inspectLocalMainPanelState(readLocalMainPanelSurfaceSnapshot()),
)

const buildInspectLocalSettingsChatReadinessTool = (): WebMcpTool => buildContractTool(
  INSPECT_LOCAL_SETTINGS_CHAT_READINESS_TOOL_CONTRACT,
  async () => inspectLocalSettingsChatReadiness(readLocalSettingsChatReadinessSurfaceSnapshot()),
)

const buildInspectLocalEditorWorkspaceStateTool = (): WebMcpTool => buildContractTool(
  INSPECT_LOCAL_EDITOR_WORKSPACE_STATE_TOOL_CONTRACT,
  async () => inspectLocalEditorWorkspaceState(readLocalEditorWorkspaceSurfaceSnapshot()),
)

const buildInspectLocalChatPipelineStateTool = (): WebMcpTool => buildContractTool(
  INSPECT_LOCAL_CHAT_PIPELINE_STATE_TOOL_CONTRACT,
  async () => inspectLocalChatPipelineState(readLocalChatPipelineSurfaceSnapshot()),
)

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

const WEB_MCP_TOOL_BUILDERS: Record<string, () => WebMcpTool> = {
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.search]: () => buildPublishedTool(SEARCH_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.fetch]: () => buildPublishedTool(FETCH_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.listSourceFiles]: () => buildPublishedTool(SOURCE_FILES_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.readSourceFile]: () => buildPublishedTool(READ_SOURCE_FILE_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.readSharedDocument]: () => buildPublishedTool(READ_SHARED_DOCUMENT_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure]: () => buildPublishedTool(INSPECT_SHARED_DOCUMENT_STRUCTURE_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness]: buildInspectLocalSettingsChatReadinessTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState]: buildInspectLocalMainPanelStateTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState]: buildInspectLocalEditorWorkspaceStateTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState]: buildInspectLocalChatPipelineStateTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline]: buildInspectLocalMainPanelChatCanvasPipelineTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument]: buildInspectLocalWorkspaceDocumentTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology]: buildInspectLocalCanvasTopologyTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot]: buildInspectLocalCanvasSnapshotTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose]: buildInspectLocal3dCameraPoseTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions]: buildInspectLocal3dLayoutPositionsTool,
  ...CAMERA_WEB_MCP_TOOL_BUILDERS,
  ...XR_ANIMATION_WEB_MCP_TOOL_BUILDERS,
  ...MOTION_CONTROL_WEB_MCP_TOOL_BUILDERS,
  ...GAME_MODE_WEB_MCP_TOOL_BUILDERS,
  ...FLIGHT_SIM_WEB_MCP_TOOL_BUILDERS,
  ...IMMERSIVE_MEDIA_WEB_MCP_TOOL_BUILDERS,
  ...CITY_SIM_WEB_MCP_TOOL_BUILDERS,
  ...STORAGE_SYNC_WEB_MCP_TOOL_BUILDERS,
  ...GROUP_PANEL_WEB_MCP_TOOL_BUILDERS,
  ...IMPORT_URL_WEB_MCP_TOOL_BUILDERS,
  ...CANVAS_VIEW_WEB_MCP_TOOL_BUILDERS,
  ...CANVAS_INTERACTION_WEB_MCP_TOOL_BUILDERS,
  ...WORKSPACE_LAUNCH_WEB_MCP_TOOL_BUILDERS,
  ...TOOLBAR_ACTION_WEB_MCP_TOOL_BUILDERS,
  ...XR_SCENE_WEB_MCP_TOOL_BUILDERS,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport]: buildInspectLocal2dZoomViewportTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot]: buildInspectLocalSourceFilesSnapshotTool,
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity]: () => buildReadLocalRuntimeIdentityTool(READ_LOCAL_RUNTIME_IDENTITY_TOOL_CONTRACT),
  [AGENTICGRAPH_AGENT_READY_TOOL_IDS.inspectAgentSurface]: () => buildPublishedTool(INSPECT_AGENT_SURFACE_TOOL_CONTRACT),
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
    throw new Error(`missing AgenticGraph browser WebMCP tool builder: ${contract.name}`)
  }
  return applySharedDescriptorFields(buildTool(), contract)
})

const AGENTICGRAPH_WEB_MCP_TOOL_REGISTRY = createWebMcpToolRegistry(WEB_MCP_TOOLS)

export const getAgenticGraphWebMcpToolRegistry = (): WebMcpToolRegistry =>
  AGENTICGRAPH_WEB_MCP_TOOL_REGISTRY
