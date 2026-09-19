import { DASHBOARD_WIDGET_TOOL_ID } from '../../components/DashboardCanvas/dashboardWidgetToolContract.mjs'
import { XR_SCENE_WEB_MCP_TOOL_IDS } from '../three/xrSceneMcpContract.mjs'
import { CAMERA_WEB_MCP_TOOL_IDS } from '../strybldr/cameraMcpContract.mjs'
import { XR_ANIMATION_WEB_MCP_TOOL_IDS } from '../three/xrAnimationMcpContract.mjs'
import { MOTION_CONTROL_AGENT_READY_TOOL_IDS } from './motionControlAgentReadyContract.mjs'
import { GAME_MODE_AGENT_READY_TOOL_IDS } from './gameModeAgentReadyContract.mjs'
import { FLIGHT_SIM_AGENT_READY_TOOL_IDS } from './flightSimAgentReadyContract.mjs'
import { IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS } from './immersiveMediaAgentReadyContract.mjs'
import { CITY_SIM_AGENT_READY_TOOL_IDS } from './citySimAgentReadyContract.mjs'
import { STORAGE_SYNC_AGENT_READY_TOOL_IDS } from './storageSyncAgentReadyContract.mjs'
import { GROUP_PANEL_AGENT_READY_TOOL_IDS } from '../group-panel/groupPanelContract.mjs'
import { IMPORT_URL_AGENT_READY_TOOL_IDS } from './importUrlAgentReadyContract.mjs'
import { CANVAS_VIEW_AGENT_READY_TOOL_IDS } from './canvasViewAgentReadyContract.mjs'
import { CANVAS_INTERACTION_AGENT_READY_TOOL_IDS } from './canvasInteractionAgentReadyContract.mjs'
import { WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS } from './workspaceLaunchAgentReadyContract.mjs'
import { TOOLBAR_ACTION_AGENT_READY_TOOL_IDS } from './toolbarActionAgentReadyContract.mjs'
import { DURABLE_RUN_AGENT_READY_TOOL_IDS } from './durableRunAgentReadyContract.mjs'
export const AGENTIC_OS_AGENT_READY_TOOL_IDS = Object.freeze({
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
  ...IMMERSIVE_MEDIA_AGENT_READY_TOOL_IDS,
  ...CITY_SIM_AGENT_READY_TOOL_IDS,
  ...STORAGE_SYNC_AGENT_READY_TOOL_IDS,
  ...GROUP_PANEL_AGENT_READY_TOOL_IDS,
  controlLocalWidget: DASHBOARD_WIDGET_TOOL_ID,
  ...IMPORT_URL_AGENT_READY_TOOL_IDS,
  ...CANVAS_VIEW_AGENT_READY_TOOL_IDS,
  ...CANVAS_INTERACTION_AGENT_READY_TOOL_IDS,
  ...WORKSPACE_LAUNCH_AGENT_READY_TOOL_IDS,
  ...TOOLBAR_ACTION_AGENT_READY_TOOL_IDS,
  ...DURABLE_RUN_AGENT_READY_TOOL_IDS,
  inspectLocal3dLayoutPositions: 'inspect_local_3d_layout_positions',
  inspectLocalXrSceneAssets: XR_SCENE_WEB_MCP_TOOL_IDS.inspect,
  controlLocalXrScene: XR_SCENE_WEB_MCP_TOOL_IDS.control,
  inspectLocal2dZoomViewport: 'inspect_local_2d_zoom_viewport',
  inspectLocalSourceFilesSnapshot: 'inspect_local_source_files_snapshot',
  readLocalRuntimeIdentity: 'read_local_runtime_identity',
  inspectAgentSurface: 'inspect_agent_surface',
})
