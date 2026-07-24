import {
  KNOWGRPH_AGENT_SURFACE_OUTPUT_SCHEMA,
  buildKnowgrphMcpNoauthSecuritySchemes,
  buildKnowgrphMcpAppsToolMeta,
} from './mcpAppsReadyContract.mjs'
import { XR_SCENE_WEB_MCP_TOOL_IDS } from '../three/xrSceneMcpContract.mjs'
import { CAMERA_WEB_MCP_TOOL_IDS } from '../strybldr/cameraMcpContract.mjs'
import { XR_ANIMATION_WEB_MCP_TOOL_IDS } from '../three/xrAnimationMcpContract.mjs'
import { buildMotionControlAgentReadyToolContracts, MOTION_CONTROL_AGENT_READY_TOOL_IDS } from './motionControlAgentReadyContract.mjs'
import { buildGameModeAgentReadyToolContracts, GAME_MODE_AGENT_READY_TOOL_IDS } from './gameModeAgentReadyContract.mjs'
import { buildFlightSimAgentReadyToolContracts, FLIGHT_SIM_AGENT_READY_TOOL_IDS } from './flightSimAgentReadyContract.mjs'
import { buildCitySimAgentReadyToolContracts, CITY_SIM_AGENT_READY_TOOL_IDS } from './citySimAgentReadyContract.mjs'
import { buildStorageSyncAgentReadyToolContracts, STORAGE_SYNC_AGENT_READY_TOOL_IDS } from './storageSyncAgentReadyContract.mjs'
import { FETCH_OUTPUT_SCHEMA, RUNTIME_IDENTITY_OUTPUT_SCHEMA, SEARCH_OUTPUT_SCHEMA } from './knowgrphAgentReadyOutputSchemas.mjs'

export const KNOWGRPH_AGENT_READY_TOOL_IDS = Object.freeze({
  search: 'search',
  fetch: 'fetch',
  listSourceFiles: 'list_source_files',
  readSourceFile: 'read_source_file',
  readSharedDocument: 'read_shared_document',
  inspectSharedDocumentStructure: 'inspect_shared_document_structure',
  inspectLocalSettingsChatReadiness: 'inspect_local_settings_chat_readiness',
  inspectLocalMainPanelState: 'inspect_local_mainpanel_state',
  inspectLocalEditorWorkspaceState: 'inspect_local_editor_workspace_state',
  inspectLocalChatPipelineState: 'inspect_local_chat_pipeline_state',
  inspectLocalMainPanelChatCanvasPipeline: 'inspect_local_mainpanel_chat_canvas_pipeline',
  inspectLocalWorkspaceDocument: 'inspect_local_workspace_document',
  inspectLocalCanvasTopology: 'inspect_local_canvas_topology',
  inspectLocalCanvasSnapshot: 'inspect_local_canvas_snapshot',
  inspectLocal3dCameraPose: 'inspect_local_3d_camera_pose',
  inspectLocalCamera: CAMERA_WEB_MCP_TOOL_IDS.inspect,
  controlLocalCamera: CAMERA_WEB_MCP_TOOL_IDS.control,
  inspectLocalAnimation: XR_ANIMATION_WEB_MCP_TOOL_IDS.inspect,
  controlLocalAnimation: XR_ANIMATION_WEB_MCP_TOOL_IDS.control,
  ...MOTION_CONTROL_AGENT_READY_TOOL_IDS,
  ...GAME_MODE_AGENT_READY_TOOL_IDS,
  ...FLIGHT_SIM_AGENT_READY_TOOL_IDS,
  ...CITY_SIM_AGENT_READY_TOOL_IDS,
  ...STORAGE_SYNC_AGENT_READY_TOOL_IDS,
  inspectLocal3dLayoutPositions: 'inspect_local_3d_layout_positions',
  inspectLocalXrSceneAssets: XR_SCENE_WEB_MCP_TOOL_IDS.inspect,
  controlLocalXrScene: XR_SCENE_WEB_MCP_TOOL_IDS.control,
  inspectLocal2dZoomViewport: 'inspect_local_2d_zoom_viewport',
  inspectLocalSourceFilesSnapshot: 'inspect_local_source_files_snapshot',
  readLocalRuntimeIdentity: 'read_local_runtime_identity',
  inspectAgentSurface: 'inspect_agent_surface',
})

export const KNOWGRPH_AGENT_READY_WEB_MCP_NAMESPACE = 'knowgrph'
export const KNOWGRPH_AGENT_READY_DEFAULT_WORKSPACE_ID = 'kgws:canonical-docs'

const buildReadOnlyToolAnnotations = () => Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
})
const READ_ONLY_TOOL_ANNOTATIONS = buildReadOnlyToolAnnotations()
const LOCAL_MUTATION_TOOL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: false,
})

const XR_PHYSICS_CONTROL_FIELDS = Object.freeze({
  subjectId: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
  bodyMode: { type: 'string', enum: ['static', 'dynamic', 'kinematic', 'trigger'] },
  massKg: { type: 'number', minimum: 0.001, maximum: 10000 },
  friction: { type: 'number', minimum: 0, maximum: 1 },
  restitution: { type: 'number', minimum: 0, maximum: 1 },
  linearDamping: { type: 'number', minimum: 0, maximum: 20 },
  collisionGroup: { type: 'integer', minimum: 1, maximum: 65535 },
  collisionMask: { type: 'integer', minimum: 0, maximum: 65535 },
  gravity: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: -100, maximum: 100 } },
  fixedStepSeconds: { type: 'number', minimum: 1 / 240, maximum: 1 / 30 },
  maxSubsteps: { type: 'integer', minimum: 1, maximum: 8 },
  impulse: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: -10000, maximum: 10000 } },
  ticks: { type: 'integer', minimum: 1, maximum: 240 },
  controllerMode: { type: 'string', enum: ['ball', 'rocket'] },
})
const XR_PHYSICS_BODY_FIELD_NAMES = Object.freeze([
  'bodyMode', 'massKg', 'friction', 'restitution', 'linearDamping', 'collisionGroup', 'collisionMask',
])
const buildXrPhysicsOperationSchema = ({ scope, operation, fields = [], required = [], requireOneOf = [] }) => ({
  type: 'object',
  additionalProperties: false,
  required: ['scope', 'operation', ...required],
  properties: {
    scope: { const: scope },
    operation: { const: operation },
    ...Object.fromEntries(fields.map(field => [field, XR_PHYSICS_CONTROL_FIELDS[field]])),
  },
  ...(requireOneOf.length ? { minProperties: 3 + required.length } : {}),
})
const XR_PHYSICS_CONTROL_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    ...['play', 'pause', 'stop', 'reset'].map(operation => buildXrPhysicsOperationSchema({ scope: 'world', operation })),
    buildXrPhysicsOperationSchema({ scope: 'world', operation: 'step', fields: ['ticks'] }),
    buildXrPhysicsOperationSchema({ scope: 'world', operation: 'configure', fields: ['gravity', 'fixedStepSeconds', 'maxSubsteps'], requireOneOf: ['gravity', 'fixedStepSeconds', 'maxSubsteps'] }),
    buildXrPhysicsOperationSchema({ scope: 'body', operation: 'attach', fields: ['subjectId', ...XR_PHYSICS_BODY_FIELD_NAMES], required: ['subjectId', 'bodyMode'] }),
    buildXrPhysicsOperationSchema({ scope: 'body', operation: 'configure', fields: ['subjectId', ...XR_PHYSICS_BODY_FIELD_NAMES], required: ['subjectId'], requireOneOf: XR_PHYSICS_BODY_FIELD_NAMES }),
    buildXrPhysicsOperationSchema({ scope: 'body', operation: 'detach', fields: ['subjectId'], required: ['subjectId'] }),
    buildXrPhysicsOperationSchema({ scope: 'impulse', operation: 'impulse', fields: ['subjectId', 'impulse'], required: ['subjectId', 'impulse'] }),
    buildXrPhysicsOperationSchema({ scope: 'controller', operation: 'develop-run', fields: ['controllerMode'] }),
    ...['pause', 'resume', 'reset', 'exit'].map(operation => buildXrPhysicsOperationSchema({ scope: 'controller', operation })),
    buildXrPhysicsOperationSchema({ scope: 'controller', operation: 'select', fields: ['controllerMode'], required: ['controllerMode'] }),
  ],
})

const XR_SCENE_CONTROL_FIELDS = Object.freeze({
  invocation: { type: 'string', minLength: 1, pattern: '\\S', description: 'Invocation such as /xr.place @vehicle-helicopter transition=linear, /xr.transform @subject #transform asset=prop-ball position=1,0,-2, /xr.physics @canvas #controller operation=develop-run mode=ball, or /xr.present @scene #reticle.' },
  action: { type: 'string', enum: ['stage', 'place', 'transform', 'transition', 'label', 'remove', 'physics', 'present'] },
  stageId: { type: 'string', minLength: 1, pattern: '\\S' },
  assetId: { type: 'string', minLength: 1, pattern: '\\S' },
  subjectId: { type: 'string', minLength: 1, maxLength: 160, pattern: '\\S' },
  label: { type: 'string', minLength: 1, maxLength: 80, pattern: '\\S' },
  transition: { type: 'string', enum: ['linear', 'hold'] },
  position: { type: 'array', minItems: 3, maxItems: 3, prefixItems: [
    { type: 'number', minimum: -50, maximum: 50 },
    { type: 'number', minimum: 0, maximum: 50 },
    { type: 'number', minimum: -50, maximum: 50 },
  ] },
  rotationYDegrees: { type: 'number', minimum: -180, maximum: 180 },
  scale: { type: 'number', minimum: 0.25, maximum: 4 },
  color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
  physics: XR_PHYSICS_CONTROL_INPUT_SCHEMA,
})
const buildXrSceneStructuredActionSchema = ({ action, fields = [], required = fields }) => ({
  type: 'object',
  additionalProperties: false,
  required: ['action', ...required],
  properties: {
    action: { const: action },
    ...Object.fromEntries(fields.map(field => [field, XR_SCENE_CONTROL_FIELDS[field]])),
  },
})
const XR_SCENE_CONTROL_INPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  properties: XR_SCENE_CONTROL_FIELDS,
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: { invocation: XR_SCENE_CONTROL_FIELDS.invocation },
    },
    buildXrSceneStructuredActionSchema({ action: 'stage', fields: ['stageId'] }),
    buildXrSceneStructuredActionSchema({ action: 'place', fields: ['assetId', 'label', 'transition'], required: ['assetId'] }),
    { ...buildXrSceneStructuredActionSchema({ action: 'transform', fields: ['subjectId', 'assetId', 'position', 'rotationYDegrees', 'scale', 'color'], required: ['subjectId'] }), minProperties: 3 },
    buildXrSceneStructuredActionSchema({ action: 'transition', fields: ['subjectId', 'transition'], required: ['subjectId'] }),
    buildXrSceneStructuredActionSchema({ action: 'label', fields: ['subjectId', 'label'] }),
    buildXrSceneStructuredActionSchema({ action: 'remove', fields: ['subjectId'] }),
    buildXrSceneStructuredActionSchema({ action: 'physics', fields: ['physics'] }),
    buildXrSceneStructuredActionSchema({ action: 'present' }),
  ],
})

const XR_SCENE_INSPECTION_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: true,
  required: ['schema', 'webMcpTools', 'sceneReady', 'catalogDefaults', 'invocationGrammar', 'environments', 'assets', 'runtime', 'physics', 'immersivePlacement'],
  properties: {
    catalogDefaults: {
      type: 'object',
      additionalProperties: false,
      required: ['terrainId', 'assetId'],
      properties: {
        terrainId: { type: 'string', minLength: 1 },
        assetId: { type: 'string', minLength: 1 },
      },
    },
    environments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'label', 'kind', 'default', 'sizeMeters', 'invocation'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          kind: { type: 'string', enum: ['terrain', 'environment'] },
          default: { type: 'boolean' },
          sizeMeters: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', exclusiveMinimum: 0 } },
          invocation: { type: 'string', pattern: '^/xr\\.stage\\s+@' },
        },
      },
    },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'label', 'category', 'default', 'featured', 'dimensionsMeters', 'mobile', 'invocation'],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          category: { type: 'string', enum: ['people', 'animals', 'vehicles', 'furniture', 'props'] },
          default: { type: 'boolean' },
          featured: { type: 'boolean' },
          dimensionsMeters: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', exclusiveMinimum: 0 } },
          mobile: { type: 'boolean' },
          invocation: { type: 'string', pattern: '^/xr\\.place\\s+@' },
        },
      },
    },
  },
})

const XR_ANIMATION_CONTROL_FIELDS = Object.freeze({
  invocation: { type: 'string', minLength: 1, pattern: '\\S', description: 'Native invocation such as /animation.control #action-path @selected-actor operation=move-object keys=w+d distance=0.25.' },
  trackKind: { type: 'string', enum: ['character-motion', 'action-path'] },
  presetId: { type: 'string', minLength: 1, pattern: '\\S' },
  targetId: { type: 'string', minLength: 1, pattern: '\\S' },
  timeSeconds: { type: 'number', minimum: 0 },
  markId: { type: 'string', minLength: 1, pattern: '^[a-zA-Z0-9:._-]+$' },
  easing: { type: 'string', enum: ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'] },
  gait: { type: 'string', enum: ['hold', 'walk', 'jog', 'run', 'wheeled', 'flight', 'drop'] },
  position: {
    type: 'array',
    description: 'Cast mark [x, y, z] position in stage meters. Timing remains owned by BottomPanel Timeline.',
    minItems: 3,
    maxItems: 3,
    items: { type: 'number', minimum: -1000, maximum: 1000 },
  },
  keys: {
    type: 'array',
    description: 'One or more WASD or arrow keys. Opposites cancel and diagonal movement is normalized.',
    minItems: 1,
    maxItems: 8,
    uniqueItems: true,
    items: { type: 'string', enum: ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] },
  },
  distanceMeters: { type: 'number', exclusiveMinimum: 0, maximum: 10 },
  fine: { type: 'boolean', description: 'Use the shared 0.05 m precision step when distanceMeters is omitted.' },
})
const buildXrAnimationOperationSchema = ({ operation, fields = [], required = [] }) => ({
  type: 'object',
  additionalProperties: false,
  required: ['operation', ...required],
  properties: {
    operation: { const: operation },
    ...Object.fromEntries(fields.map(field => [field, XR_ANIMATION_CONTROL_FIELDS[field]])),
  },
})
const XR_ANIMATION_CONTROL_INPUT_SCHEMA = Object.freeze({
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['invocation'],
      properties: { invocation: XR_ANIMATION_CONTROL_FIELDS.invocation },
    },
    buildXrAnimationOperationSchema({ operation: 'apply', fields: ['trackKind', 'presetId', 'targetId'], required: ['presetId'] }),
    buildXrAnimationOperationSchema({ operation: 'clear', fields: ['trackKind', 'targetId'] }),
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'markKind', 'markId'],
      properties: {
        operation: { const: 'configure-mark' },
        markKind: { const: 'cast' },
        markId: XR_ANIMATION_CONTROL_FIELDS.markId,
        targetId: XR_ANIMATION_CONTROL_FIELDS.targetId,
        trackKind: { const: 'action-path' },
        easing: XR_ANIMATION_CONTROL_FIELDS.easing,
        gait: XR_ANIMATION_CONTROL_FIELDS.gait,
        position: XR_ANIMATION_CONTROL_FIELDS.position,
      },
      anyOf: [
        { properties: { easing: XR_ANIMATION_CONTROL_FIELDS.easing }, required: ['easing'] },
        { properties: { gait: XR_ANIMATION_CONTROL_FIELDS.gait }, required: ['gait'] },
        { properties: { position: XR_ANIMATION_CONTROL_FIELDS.position }, required: ['position'] },
      ],
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'markKind', 'markId', 'easing'],
      properties: {
        operation: { const: 'configure-mark' },
        markKind: { const: 'camera' },
        markId: XR_ANIMATION_CONTROL_FIELDS.markId,
        easing: XR_ANIMATION_CONTROL_FIELDS.easing,
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'keys'],
      properties: {
        operation: { const: 'move-object' },
        targetId: XR_ANIMATION_CONTROL_FIELDS.targetId,
        trackKind: { const: 'action-path' },
        markId: XR_ANIMATION_CONTROL_FIELDS.markId,
        keys: XR_ANIMATION_CONTROL_FIELDS.keys,
        distanceMeters: XR_ANIMATION_CONTROL_FIELDS.distanceMeters,
        fine: XR_ANIMATION_CONTROL_FIELDS.fine,
      },
    },
    ...['play', 'pause', 'export'].map(operation => buildXrAnimationOperationSchema({ operation })),
    buildXrAnimationOperationSchema({ operation: 'scrub', fields: ['timeSeconds'], required: ['timeSeconds'] }),
  ],
})

export const buildKnowgrphWebMcpToolName = (
  toolName,
  namespace = KNOWGRPH_AGENT_READY_WEB_MCP_NAMESPACE,
) => `${String(namespace || '').trim()}.${String(toolName || '').trim()}`

export const buildKnowgrphAgentReadyToolContracts = (args = {}) => {
  const defaultWorkspaceId = String(args.defaultWorkspaceId || '').trim()
  const includeBrowserOnlyTools = args.includeBrowserOnlyTools === true
  const contracts = [
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.search,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.search),
      title: 'Search Knowgrph Source Files',
      description: 'Use this when an MCP host needs to search published Knowgrph Source Files and return stable document IDs for the `fetch` tool. Call this first for OpenAI Deep Research-style retrieval, Claude, Qwen Code, Kimi CLI, BytePlus ModelArk, and generic MCP clients.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string' },
          limit: { type: 'number', default: 10 },
        },
      },
      outputSchema: SEARCH_OUTPUT_SCHEMA,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.fetch,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.fetch),
      title: 'Fetch Knowgrph Source File',
      description: 'Use this when an MCP host needs the complete published Knowgrph Source File for an ID returned by `search`. Returns markdown as both `content` and `text` for OpenAI, Claude, Qwen Code, Kimi CLI, BytePlus ModelArk, and generic MCP clients.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: {
          id: { type: 'string' },
        },
      },
      outputSchema: FETCH_OUTPUT_SCHEMA,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.listSourceFiles),
      title: 'List Source Files',
      description: 'Use this when an MCP host needs the published Knowgrph Source Files index as markdown.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readSourceFile),
      title: 'Read Source File',
      description: 'Use this when an MCP host knows a published Knowgrph canonical path and needs that Editor Workspace markdown content. Defaults to the canonical docs workspace when workspaceId is omitted.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['canonicalPath'],
        properties: {
          canonicalPath: { type: 'string' },
          workspaceId: defaultWorkspaceId ? { type: 'string', default: defaultWorkspaceId } : { type: 'string' },
        },
      },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readSharedDocument),
      title: 'Read Shared Document',
      description: 'Use this when an MCP host has a Knowgrph share token or public Knowgrph share/document URL and needs the published markdown content.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shareToken: { type: 'string' },
          shareUrl: { type: 'string' },
        },
        anyOf: [{ required: ['shareToken'] }, { required: ['shareUrl'] }],
      },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectSharedDocumentStructure),
      title: 'Inspect Shared Document Structure',
      description: 'Use this when an MCP host has a Knowgrph share token or public Knowgrph share/document URL and needs frontmatter/body structure without mutating the document.',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          shareToken: { type: 'string' },
          shareUrl: { type: 'string' },
        },
        anyOf: [{ required: ['shareToken'] }, { required: ['shareUrl'] }],
      },
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
    },
    ...(includeBrowserOnlyTools
      ? [{
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSettingsChatReadiness),
          title: 'Inspect Local Settings Chat Readiness',
          description: 'Inspect the active browser-local Knowgrph SettingsView chat readiness state for MainPanel MCP, Integrations, and Commerce, including provider, routing, and model discovery status.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelState),
          title: 'Inspect Local MainPanel State',
          description: 'Inspect the active browser-local Knowgrph MainPanel tab, search, and shared action state for MCP, Integrations, and Commerce readiness.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalEditorWorkspaceState),
          title: 'Inspect Local Editor Workspace State',
          description: 'Inspect the active browser-local Knowgrph Editor Workspace and Markdown pane state, including pane visibility and live draft/frontmatter structure.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalChatPipelineState),
          title: 'Inspect Local Chat Pipeline State',
          description: 'Inspect the active browser-local Knowgrph FloatingPanel chat runtime, including streaming, workspace follow path, LLM-to-workspace pipeline state, and promotion retry recovery for already-saved local artifacts.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalMainPanelChatCanvasPipeline),
          title: 'Inspect Local MainPanel Chat Canvas Pipeline',
          description: 'Inspect the active browser-local Knowgrph E2E readiness path from MainPanel MCP, Integrations, and Commerce through FloatingPanel Chat, workspace markdown/frontmatter, and canvas topology.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalWorkspaceDocument),
          title: 'Inspect Local Workspace Document',
          description: 'Inspect the active browser-local Knowgrph workspace markdown document structure without reading published storage routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasTopology),
          title: 'Inspect Local Canvas Topology',
          description: 'Inspect the active browser-local Knowgrph canvas topology summary from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCanvasSnapshot),
          title: 'Inspect Local Canvas Snapshot',
          description: 'Inspect the active browser-local Knowgrph canvas SVG snapshot from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dCameraPose),
          title: 'Inspect Local 3D Camera Pose',
          description: 'Inspect the active browser-local Knowgrph 3D camera pose from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCamera,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalCamera),
          title: 'Inspect Local Camera',
          description: 'Inspect the first-class shared Camera framing, sensor-aware optics, aspect masks, and XR camera choreography, including its hydrated MCP and / @ # invocation grammar.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          outputSchema: { type: 'object', additionalProperties: true, required: ['schema', 'webMcpTools', 'invocationGrammar', 'surface', 'framing', 'choreography'] },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalCamera,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalCamera),
          title: 'Control Local Camera',
          description: 'Control shared Camera framing, real sensor optics, zoom, rack-focus distance, aspect masks, keyboard orbit, subject-bound XR moves, and camera choreography through structured actions or upstream Camera commands, bindings, semantic routes, and typed key=value parameters.',
          inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              invocation: { type: 'string', description: 'Invocation such as /camera.select @camera #camera camera=fixed-follow or /camera.animate @camera #camera-motion sensor=super-35 lens=35 focus=2 aspect=2.39:1 time=1.' },
              action: { type: 'string', enum: ['select', 'frame', 'animate', 'playback', 'scrub'] },
              cameraId: { type: 'string', enum: ['fixed-follow', 'free-orbit'] },
              targetId: { type: 'string' },
              angle: { type: 'string', enum: ['front', 'left-side', 'right-side', 'overhead'] },
              level: { type: 'string', enum: ['eye-level', 'high-angle', 'low-angle'] },
              shot: { type: 'string', enum: ['wide', 'medium', 'close-up'] },
              sensorId: { type: 'string', enum: ['super-16', 'super-35', 'full-frame', '65mm'] },
              focalLengthMm: { type: 'number', minimum: 8, maximum: 300 },
              focusDistanceMeters: { type: 'number', minimum: 0.1, maximum: 1000 },
              aspectRatio: { type: 'string', enum: ['4:3', '16:9', '1.85:1', '2.39:1'] },
              rig: { type: 'string', enum: ['dolly', 'steadicam', 'handheld', 'crane', 'drone', 'car-mount'] },
              moveId: { type: 'string', enum: ['orbit-clockwise', 'orbit-counterclockwise', 'crane-rise', 'crane-descend', 'drone-follow', 'vertigo-dolly-zoom'] },
              moveDurationSeconds: { type: 'number', minimum: 0.25, maximum: 30 },
              timeSeconds: { type: 'number', minimum: 0 },
              playing: { type: 'boolean' },
              keys: {
                type: 'array',
                description: 'One or more shared WASD or arrow keys. Opposites cancel and diagonal camera orbit is normalized.',
                minItems: 1,
                maxItems: 8,
                uniqueItems: true,
                items: { type: 'string', enum: ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] },
              },
              amount: { type: 'number', exclusiveMinimum: 0, maximum: 2, description: 'Optional normalized camera-orbit amount; defaults to the shared 0.08 or fine 0.02 step.' },
              fine: { type: 'boolean' },
              markId: { type: 'string', description: 'Optional Camera choreography mark id for keyboard animation; defaults to the selected Camera mark.' },
            },
            anyOf: [{ required: ['invocation'] }, { required: ['action'] }],
          },
          outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
          annotations: LOCAL_MUTATION_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalAnimation,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalAnimation),
          title: 'Inspect Local Animation',
          description: 'Inspect native XR character-motion and action-path presets, selected cast state, deterministic package capability, and the in-repo invocation grammar.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          outputSchema: { type: 'object', additionalProperties: true, required: ['schema', 'webMcpTools', 'sceneReady', 'catalog', 'invocationGrammar', 'presets', 'runtime'] },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalAnimation,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalAnimation),
          title: 'Control Local Animation',
          description: 'Apply, clear, configure, keyboard-move, play, pause, scrub, or export native XR choreography through structured fields or the in-repo /animation.control, #character-motion, #action-path, @selected-actor, and @canvas grammar.',
          inputSchema: XR_ANIMATION_CONTROL_INPUT_SCHEMA,
          outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
          annotations: LOCAL_MUTATION_TOOL_ANNOTATIONS,
        }, ...buildMotionControlAgentReadyToolContracts({ buildWebName: buildKnowgrphWebMcpToolName, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS, mutationAnnotations: LOCAL_MUTATION_TOOL_ANNOTATIONS }), ...buildGameModeAgentReadyToolContracts({ buildWebName: buildKnowgrphWebMcpToolName, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS, mutationAnnotations: LOCAL_MUTATION_TOOL_ANNOTATIONS }), ...buildFlightSimAgentReadyToolContracts({ buildWebName: buildKnowgrphWebMcpToolName, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS, mutationAnnotations: LOCAL_MUTATION_TOOL_ANNOTATIONS }), ...buildCitySimAgentReadyToolContracts({ buildWebName: buildKnowgrphWebMcpToolName, readOnlyAnnotations: READ_ONLY_TOOL_ANNOTATIONS, mutationAnnotations: LOCAL_MUTATION_TOOL_ANNOTATIONS }), ...buildStorageSyncAgentReadyToolContracts({ buildWebName: buildKnowgrphWebMcpToolName }), {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal3dLayoutPositions),
          title: 'Inspect Local 3D Layout Positions',
          description: 'Inspect the active browser-local Knowgrph 3D layout positions from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalXrSceneAssets),
          title: 'Inspect Local XR Scene Assets',
          description: 'Inspect the browser-local XR terrain and environment kits, explicit catalog defaults, procedural 3D asset library, native dynamics, immersive AR placement, typed invocation grammar, placed subjects, and path interpolation without mutating the scene.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          outputSchema: XR_SCENE_INSPECTION_OUTPUT_SCHEMA,
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalXrScene,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.controlLocalXrScene),
          title: 'Control Local XR Scene',
          description: 'Control the open browser-local XR scene through structured stage, placement, native dynamics, immersive AR reticle placement, path-interpolation, label, and removal actions. Animation is owned separately by /animation.control.',
          inputSchema: XR_SCENE_CONTROL_INPUT_SCHEMA,
          outputSchema: { type: 'object', additionalProperties: true, required: ['ok', 'message'] },
          annotations: LOCAL_MUTATION_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocal2dZoomViewport),
          title: 'Inspect Local 2D Zoom Viewport',
          description: 'Inspect the active browser-local Knowgrph 2D zoom and viewport state from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectLocalSourceFilesSnapshot),
          title: 'Inspect Local Source Files Snapshot',
          description: 'Inspect the active browser-local Knowgrph Source Files runtime snapshot from the app runtime without calling published storage or Pages MCP routes.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }, {
          name: KNOWGRPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity,
          webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.readLocalRuntimeIdentity),
          title: 'Read Local Runtime Identity',
          description: 'Read the application-global canonical Knowgrph runtime identity and automatic cross-device verification status without refreshing catalogs, rebuilding identity, copying clipboard data, or mutating source.',
          inputSchema: { type: 'object', additionalProperties: false, properties: {} },
          outputSchema: RUNTIME_IDENTITY_OUTPUT_SCHEMA,
          annotations: READ_ONLY_TOOL_ANNOTATIONS,
        }]
      : []),
    {
      name: KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface,
      webName: buildKnowgrphWebMcpToolName(KNOWGRPH_AGENT_READY_TOOL_IDS.inspectAgentSurface),
      title: 'Inspect Agent Surface',
      description: 'Use this when an MCP Apps-capable host or generic MCP client needs to inspect Knowgrph agent-ready discovery, MCP Apps readiness, OpenAPI, and skill metadata.',
      inputSchema: { type: 'object', additionalProperties: false, properties: {} },
      outputSchema: KNOWGRPH_AGENT_SURFACE_OUTPUT_SCHEMA,
      annotations: READ_ONLY_TOOL_ANNOTATIONS,
      _meta: buildKnowgrphMcpAppsToolMeta(),
    },
  ]
  return contracts.map((contract) => ({
    ...contract,
    securitySchemes: Array.isArray(contract.securitySchemes) && contract.securitySchemes.length
      ? contract.securitySchemes
      : buildKnowgrphMcpNoauthSecuritySchemes(),
  }))
}
