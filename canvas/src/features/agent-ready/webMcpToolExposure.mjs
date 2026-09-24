import { AGENTIC_OS_AGENT_READY_TOOL_IDS as ids } from './agenticGraphAgentReadyToolIds.mjs'
import { PYTHON_LEARNING_TOOL_IDS } from '../python-learning/learningToolContract.mjs'

// Browser discovery policy only. Shared contracts/executors remain the invocation authority.
export const WEB_MCP_CORE_TOOL_IDS = Object.freeze([
  ids.controlLocalToolbarAction, ids.controlLocalWorkspaceLaunch,
  ids.controlLocalCanvasView, ids.readLocalRuntimeIdentity, ids.controlLocalWidget,
])
export const WEB_MCP_TOOL_SCOPES = Object.freeze(Object.fromEntries(Object.entries({
  graph: [ids.controlLocalImportUrl, ids.controlLocalCanvasInteraction, ids.inspectLocalCanvasTopology,
    ids.inspectLocalCanvasSnapshot, ids.inspectLocal2dZoomViewport, ids.controlLocalGroupPanel],
  mission: ['run.start', 'run.status', 'run.cancel', 'run.retry', 'run.query', 'run.trace', 'run.evaluate', 'run.compare'],
  editor: [ids.search, ids.fetch, ids.listSourceFiles, ids.readSourceFile, ids.readSharedDocument,
    ids.inspectSharedDocumentStructure, ids.inspectLocalWorkspaceDocument,
    ids.inspectLocalEditorWorkspaceState, ids.inspectLocalSourceFilesSnapshot],
  chat: [ids.inspectLocalChatPipelineState, ids.inspectLocalMainPanelChatCanvasPipeline],
  pythonLearning: Object.values(PYTHON_LEARNING_TOOL_IDS),
  settings: [ids.inspectLocalSettingsChatReadiness, ids.inspectLocalMainPanelState, ids.inspectAgentSurface],
  xr: [ids.inspectLocalXrSceneAssets, ids.controlLocalXrScene, ids.inspectLocalSemanticSpace, ids.controlLocalSemanticSpace, ids.inspectLocal3dCameraPose, ids.inspectLocal3dLayoutPositions],
  camera: [ids.inspectLocalCamera, ids.controlLocalCamera],
  animation: [ids.inspectLocalAnimation, ids.controlLocalAnimation],
  motionControl: [ids.inspectLocalMotionControl, ids.controlLocalMotionControl],
  gameMode: [ids.inspectLocalGameMode, ids.controlLocalGameMode],
  flightSim: [ids.inspectLocalFlightSim, ids.controlLocalFlightSim],
  media: [ids.inspectLocalImmersiveMedia, ids.controlLocalImmersiveMedia],
  cityBuilder: [ids.inspectLocalCitySim, ids.controlLocalCitySim],
  storage: [ids.inspectLocalGitRepository, ids.controlLocalGitRepository, ids.inspectLocalFileSync, ids.controlLocalFileSync],
}).map(([name, tools]) => [name, Object.freeze(tools)])))
export const WEB_MCP_SCOPE_TOOL_NAME = 'agentic-graph.select_local_tool_scope'
// Project regression budgets, not claims about any browser host's undocumented limits.
export const WEB_MCP_EXPOSURE_BUDGET = Object.freeze({ tools: 16, bytes: 32 * 1024 })
export const measureWebMcpExposure = tools => ({
  tools: tools.length, bytes: new TextEncoder().encode(JSON.stringify(tools)).length,
})
export function resolveWebMcpToolScope(state, missionOpen = false) {
  if (missionOpen) return 'mission'
  if (state.floatingPanelOpen && Object.hasOwn(WEB_MCP_TOOL_SCOPES, state.floatingPanelView)) return state.floatingPanelView
  if (state.workspaceViewMode === 'editor') return /\.py$/i.test(String(state.markdownDocumentName || '')) ? 'pythonLearning' : 'editor'
  return state.canvasRenderMode === '3d' ? 'xr' : 'graph'
}

export function createWebMcpToolExposure(registry, selectScope) {
  const scopedTools = new Map()
  const projectedTools = new Map()
  const selector = Object.freeze({
    name: WEB_MCP_SCOPE_TOOL_NAME,
    title: 'Select browser tool scope',
    description: 'Expose core tools plus one workspace group. Changes discovery only; executes no domain action. Discover tools again after selection.',
    inputSchema: Object.freeze({ type: 'object', additionalProperties: false,
      required: ['scope'], properties: { scope: { type: 'string', enum: Object.keys(WEB_MCP_TOOL_SCOPES) } } }),
    annotations: Object.freeze({ readOnlyHint: true, idempotentHint: true, openWorldHint: false }),
    execute: async input => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1
        || typeof input.scope !== 'string' || !Object.hasOwn(WEB_MCP_TOOL_SCOPES, input.scope)) {
        throw new Error('Choose one supported browser tool scope.')
      }
      return selectScope(input.scope)
    },
  })
  return Object.freeze({
    get(scope) {
      if (!Object.hasOwn(WEB_MCP_TOOL_SCOPES, scope)) throw new Error(`Unknown browser tool scope: ${scope}`)
      if (scopedTools.has(scope)) return scopedTools.get(scope)
      const tools = [...WEB_MCP_CORE_TOOL_IDS, ...WEB_MCP_TOOL_SCOPES[scope]].map(id => {
        const name = `agentic-graph.${id}`
        if (projectedTools.has(name)) return projectedTools.get(name)
        const tool = registry.get(name)
        if (!tool) throw new Error(`Missing browser tool: ${name}`)
        // Preserve the complete input schema and validated executor. Output schemas and
        // server-only metadata stay in the internal registry, outside browser discovery.
        const { title, description, inputSchema, annotations, execute } = tool
        const descriptor = Object.freeze({ name, title, description, inputSchema, annotations, execute })
        projectedTools.set(name, descriptor)
        return descriptor
      })
      tools.push(selector)
      const size = measureWebMcpExposure(tools)
      if (new Set(tools.map(tool => tool.name)).size !== size.tools
        || size.tools > WEB_MCP_EXPOSURE_BUDGET.tools || size.bytes > WEB_MCP_EXPOSURE_BUDGET.bytes) {
        throw new Error(`Browser tool scope exceeds project discovery budget: ${scope} (${size.tools} tools, ${size.bytes} bytes)`)
      }
      const frozen = Object.freeze(tools)
      scopedTools.set(scope, frozen)
      return frozen
    },
  })
}
