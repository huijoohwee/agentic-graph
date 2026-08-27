import type {
  LocalChatPipelineSurfaceSnapshot,
  LocalCommerceReadinessSurfaceSnapshot,
  LocalEditorWorkspaceSurfaceSnapshot,
  LocalMainPanelSurfaceSnapshot,
  LocalSettingsChatReadinessSurfaceSnapshot,
} from './browserLocalSurfaceSnapshots'
import { inspectLocalCanvasTopology } from './localCanvasTopologyInspection'
import { inspectLocalChatPipelineState } from './localChatPipelineStateInspection'
import { inspectLocalEditorWorkspaceState } from './localEditorWorkspaceStateInspection'
import { inspectLocalMainPanelState } from './localMainPanelStateInspection'
import { inspectLocalSettingsChatReadiness } from './localSettingsChatReadinessInspection'
import { inspectLocalWorkspaceDocument } from './localWorkspaceDocumentInspection'
import {
  AGENTICGRAPH_AGENT_READY_MAIN_PANEL_ENTRY_TABS,
  AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES,
  AGENTICGRAPH_SUPERAGENT_TASK_LEVELS,
} from './mainPanelSuperAgentIntegrationContract'

type LocalMainPanelChatCanvasPipelineInspectionArgs = {
  mainPanelSnapshot: (LocalMainPanelSurfaceSnapshot & { updatedAtMs?: number }) | null
  commerceReadinessSnapshot: (LocalCommerceReadinessSurfaceSnapshot & { updatedAtMs?: number }) | null
  settingsChatReadinessSnapshot: (LocalSettingsChatReadinessSurfaceSnapshot & { updatedAtMs?: number }) | null
  editorWorkspaceSnapshot: (LocalEditorWorkspaceSurfaceSnapshot & { updatedAtMs?: number }) | null
  chatPipelineSnapshot: (LocalChatPipelineSurfaceSnapshot & { updatedAtMs?: number }) | null
  markdownDocumentName?: unknown
  markdownDocumentText?: unknown
  markdownDocumentSourceUrl?: unknown
  graphData: unknown
  graphDataRevision?: unknown
  canvasRenderMode?: unknown
  canvas2dRenderer?: unknown
  documentSemanticMode?: unknown
  frontmatterModeEnabled?: unknown
  multiDimTableModeEnabled?: unknown
  documentStructureBaselineLock?: unknown
  collapsedGroupIds?: unknown
  selectedNodeId?: unknown
  selectedEdgeId?: unknown
}

const normalizeString = (value: unknown): string => String(value || '').trim()
const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    const normalized = normalizeString(entry)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
const includesAll = (available: readonly string[], required: readonly string[]): boolean => {
  const availableSet = new Set(available.map(value => normalizeString(value)))
  return required.every(value => availableSet.has(normalizeString(value)))
}

const inspectDeclaredSuperAgentPipeline = (args: {
  activeMainPanelTab: unknown
  settingsChatReadiness: ReturnType<typeof inspectLocalSettingsChatReadiness>
  workspaceDocument: ReturnType<typeof inspectLocalWorkspaceDocument>
  canvasTopology: ReturnType<typeof inspectLocalCanvasTopology>
}) => {
  const mainPanelDemo = (args.workspaceDocument.mainPanelIntegrationsDemo || { present: false }) as {
    present?: boolean
    mainPanelEntries?: unknown
    providerIds?: unknown
    taskCapabilities?: unknown
    taskLevels?: unknown
    canvas2dRenderer?: unknown
  }
  const superAgentDemo = (args.workspaceDocument.superAgentHarnessDemo || { present: false }) as {
    present?: boolean
    taskCapabilities?: unknown
    taskLevels?: unknown
    runtimeSurfaces?: unknown
  }
  const declaredEntryTabs = normalizeStringList(mainPanelDemo.mainPanelEntries)
  const requiredEntryTabs = declaredEntryTabs.length > 0
    ? declaredEntryTabs
    : [...AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS]
  const activeEntryTab = normalizeString(args.activeMainPanelTab)
  const declaredProviderIds = normalizeStringList(mainPanelDemo.providerIds)
  const requiredProviderIds = declaredProviderIds.length > 0
    ? declaredProviderIds
    : [...AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS]
  const availableProviderIds = normalizeStringList(args.settingsChatReadiness.providerCoverage?.availableProviderIds)
  const entryTabReady = mainPanelDemo.present === true
    ? Boolean(activeEntryTab) && requiredEntryTabs.includes(activeEntryTab)
    : true
  const providerCoverageReady = mainPanelDemo.present === true
    ? includesAll(availableProviderIds, requiredProviderIds)
    : true
  const declaredCapabilities = normalizeStringList(superAgentDemo.taskCapabilities || mainPanelDemo.taskCapabilities)
  const declaredLevels = normalizeStringList(superAgentDemo.taskLevels || mainPanelDemo.taskLevels)
  const declaredRuntimeSurfaces = normalizeStringList(superAgentDemo.runtimeSurfaces)
  const runtimeSurfacesReady = superAgentDemo.present === true
    ? includesAll(declaredRuntimeSurfaces, [...AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS])
    : true
  const renderedNodeIds = normalizeStringList((args.canvasTopology as { graphNodeIds?: unknown }).graphNodeIds)
  const runtimeSurfaceNodesReady = superAgentDemo.present === true
    ? includesAll(renderedNodeIds, Object.values(AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS))
    : true
  const subagentNodesReady = superAgentDemo.present === true
    ? includesAll(renderedNodeIds, Object.values(AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS))
    : true
  const taskCapabilitiesReady = superAgentDemo.present === true
    ? includesAll(declaredCapabilities, [...AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES])
    : true
  const taskLevelsReady = superAgentDemo.present === true
    ? includesAll(declaredLevels, [...AGENTICGRAPH_SUPERAGENT_TASK_LEVELS])
    : true
  const declaredRenderer = normalizeString(
    mainPanelDemo.canvas2dRenderer
    || args.workspaceDocument.frontmatterScalars?.kgCanvas2dRenderer,
  )
  const storyboardRendererReady = declaredRenderer === AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER
    ? args.canvasTopology.canvas2dRenderer === AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER
    : true
  const superAgentDemoReady =
    (superAgentDemo.present !== true || (taskCapabilitiesReady && taskLevelsReady && runtimeSurfacesReady && runtimeSurfaceNodesReady && subagentNodesReady))
    && (mainPanelDemo.present !== true || (entryTabReady && providerCoverageReady))
    && storyboardRendererReady

  return {
    declared: mainPanelDemo.present === true || superAgentDemo.present === true,
    entryTabReady,
    providerCoverageReady,
    taskCapabilitiesReady,
    taskLevelsReady,
    runtimeSurfacesReady,
    runtimeSurfaceNodesReady,
    subagentNodesReady,
    storyboardRendererReady,
    superAgentDemoReady,
    requiredEntryTabs,
    activeEntryTab: activeEntryTab || null,
    requiredProviderIds,
    availableProviderIds,
    declaredTaskCapabilities: declaredCapabilities,
    declaredTaskLevels: declaredLevels,
    declaredRuntimeSurfaces,
    requiredRuntimeSurfaceNodeIds: Object.values(AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS),
    requiredSubagentNodeIds: Object.values(AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS),
    renderedNodeIds,
    declaredRenderer: declaredRenderer || null,
    mainPanelDemo,
    superAgentDemo,
  }
}

const inspectLocalCommerceReadiness = (
  snapshot: (LocalCommerceReadinessSurfaceSnapshot & { updatedAtMs?: number }) | null,
) => {
  if (!snapshot) {
    return {
      available: false,
      sourceKind: 'browser-local-mainpanel-commerce-readiness',
      message: 'MainPanel Commerce readiness is not currently mounted in the local AgenticGraph browser runtime.',
    }
  }
  return {
    available: true,
    sourceKind: 'browser-local-mainpanel-commerce-readiness',
    surface: snapshot.surface,
    semanticKey: snapshot.semanticKey,
    routeCount: snapshot.routeCount,
    routePaths: snapshot.routePaths,
    sectionCount: Array.isArray(snapshot.sections) ? snapshot.sections.length : 0,
    sections: snapshot.sections,
    signals: snapshot.signals,
    updatedAtMs: snapshot.updatedAtMs || null,
  }
}

const buildIssues = (args: {
  mainPanel: ReturnType<typeof inspectLocalMainPanelState>
  commerceReadiness: ReturnType<typeof inspectLocalCommerceReadiness>
  settingsChatReadiness: ReturnType<typeof inspectLocalSettingsChatReadiness>
  editorWorkspace: ReturnType<typeof inspectLocalEditorWorkspaceState>
  chatPipeline: ReturnType<typeof inspectLocalChatPipelineState>
  workspaceDocument: ReturnType<typeof inspectLocalWorkspaceDocument>
  canvasTopology: ReturnType<typeof inspectLocalCanvasTopology>
  declaredSuperAgentPipeline: ReturnType<typeof inspectDeclaredSuperAgentPipeline>
}): string[] => {
  const issues: string[] = []
  if (args.mainPanel.available !== true) {
    issues.push('MainPanel is not mounted in the local browser runtime.')
  } else if (!AGENTICGRAPH_AGENT_READY_MAIN_PANEL_ENTRY_TABS.includes(String(args.mainPanel.activeTab || '') as (typeof AGENTICGRAPH_AGENT_READY_MAIN_PANEL_ENTRY_TABS)[number])) {
    issues.push('MainPanel is mounted, but the active tab is not MCP, Integrations, or Commerce.')
  } else if (
    String(args.mainPanel.activeTab || '') === 'commerce'
    && (
      args.commerceReadiness.available !== true
      || Number(args.commerceReadiness.routeCount || 0) <= 0
    )
  ) {
    issues.push('MainPanel Commerce is active, but shared commerce route readiness is not available.')
  }

  if (args.settingsChatReadiness.available !== true) {
    issues.push('Settings chat readiness is not mounted in the local browser runtime.')
  } else {
    if (args.settingsChatReadiness.modelDiscovery?.ready !== true) {
      issues.push('Chat provider, endpoint, or model selection is incomplete in MainPanel settings.')
    }
    if (args.settingsChatReadiness.routing?.integrationEnabled !== true) {
      issues.push('MainPanel Integrations does not currently enable AI chat routing into the FloatingPanel chat surface.')
    }
  }

  if (args.editorWorkspace.available !== true) {
    issues.push('Editor Workspace is not mounted in the local browser runtime.')
  } else if (args.editorWorkspace.workspaceViewMode !== 'editor' || args.editorWorkspace.isMarkdown !== true) {
    issues.push('Editor Workspace is mounted, but the active document is not in the Markdown editor workflow.')
  }

  if (args.chatPipeline.available !== true) {
    issues.push('FloatingPanel Chat is not mounted in the local browser runtime.')
  } else {
    if (args.chatPipeline.kgcValidation?.hasYamlFrontmatter !== true) {
      issues.push('FloatingPanel Chat has not yet produced validated YAML frontmatter output.')
    }
    if (!String(args.chatPipeline.workspacePaths?.streamFollowPath || '').trim()) {
      issues.push('FloatingPanel Chat does not currently expose a followable workspace path for the active stream/draft.')
    }
  }

  if (args.workspaceDocument.available !== true) {
    issues.push('No active local workspace markdown document is available for inspection.')
  } else {
    if (args.workspaceDocument.hasFrontmatter !== true) {
      issues.push('The active workspace document does not yet contain YAML frontmatter.')
    }
    if (args.workspaceDocument.hasFlowBlock !== true) {
      issues.push('The active workspace document does not yet expose a canonical flow block.')
    }
    if (Array.isArray(args.workspaceDocument.forbiddenGroupingKeys) && args.workspaceDocument.forbiddenGroupingKeys.length > 0) {
      issues.push(`The active workspace document still uses forbidden grouping keys: ${args.workspaceDocument.forbiddenGroupingKeys.join(', ')}.`)
    }
  }

  if (args.canvasTopology.available !== true) {
    issues.push('No active canvas topology is available in the local browser runtime.')
  } else if (Number(args.canvasTopology.graphTopology?.nodeCount || 0) <= 0) {
    issues.push('The active canvas topology is available, but the render graph is empty.')
  }

  if (args.declaredSuperAgentPipeline.declared === true) {
    if (args.declaredSuperAgentPipeline.entryTabReady !== true) {
      issues.push(`The active MainPanel entry tab is not declared for the SuperAgent demo: ${args.declaredSuperAgentPipeline.requiredEntryTabs.join(', ')}.`)
    }
    if (args.declaredSuperAgentPipeline.providerCoverageReady !== true) {
      issues.push(`MainPanel Integrations provider coverage is incomplete for the declared SuperAgent demo: ${args.declaredSuperAgentPipeline.requiredProviderIds.join(', ')}.`)
    }
    if (args.declaredSuperAgentPipeline.taskCapabilitiesReady !== true) {
      issues.push(`The active workspace document does not declare all SuperAgent task capabilities: ${AGENTICGRAPH_SUPERAGENT_TASK_CAPABILITIES.join(', ')}.`)
    }
    if (args.declaredSuperAgentPipeline.taskLevelsReady !== true) {
      issues.push(`The active workspace document does not declare all SuperAgent task levels: ${AGENTICGRAPH_SUPERAGENT_TASK_LEVELS.join(', ')}.`)
    }
    if (args.declaredSuperAgentPipeline.runtimeSurfacesReady !== true) {
      issues.push(`The active workspace document does not declare all SuperAgent runtime surfaces: ${AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_KEYS.join(', ')}.`)
    }
    if (args.declaredSuperAgentPipeline.runtimeSurfaceNodesReady !== true) {
      issues.push('The active Storyboard Widget graph does not render every declared SuperAgent runtime surface node.')
    }
    if (args.declaredSuperAgentPipeline.subagentNodesReady !== true) {
      issues.push('The active Storyboard Widget graph does not render every declared SuperAgent subagent node.')
    }
    if (args.declaredSuperAgentPipeline.storyboardRendererReady !== true) {
      issues.push('The active workspace document declares Storyboard rendering, but the active canvas topology is using another renderer.')
    }
  }

  return issues
}

export const inspectLocalMainPanelChatCanvasPipeline = (
  args: LocalMainPanelChatCanvasPipelineInspectionArgs,
) => {
  const mainPanel = inspectLocalMainPanelState(args.mainPanelSnapshot)
  const commerceReadiness = inspectLocalCommerceReadiness(args.commerceReadinessSnapshot)
  const settingsChatReadiness = inspectLocalSettingsChatReadiness(args.settingsChatReadinessSnapshot)
  const editorWorkspace = inspectLocalEditorWorkspaceState(args.editorWorkspaceSnapshot)
  const chatPipeline = inspectLocalChatPipelineState(args.chatPipelineSnapshot)
  const workspaceDocument = inspectLocalWorkspaceDocument({
    markdownDocumentName: args.markdownDocumentName,
    markdownDocumentText: args.markdownDocumentText,
    markdownDocumentSourceUrl: args.markdownDocumentSourceUrl,
  })
  const canvasTopology = inspectLocalCanvasTopology({
    graphData: args.graphData as Parameters<typeof inspectLocalCanvasTopology>[0]['graphData'],
    graphDataRevision: args.graphDataRevision as Parameters<typeof inspectLocalCanvasTopology>[0]['graphDataRevision'],
    markdownDocumentName: args.markdownDocumentName,
    markdownDocumentText: args.markdownDocumentText,
    canvasRenderMode: args.canvasRenderMode,
    canvas2dRenderer: args.canvas2dRenderer,
    documentSemanticMode: args.documentSemanticMode,
    frontmatterModeEnabled: args.frontmatterModeEnabled,
    multiDimTableModeEnabled: args.multiDimTableModeEnabled,
    documentStructureBaselineLock: args.documentStructureBaselineLock,
    collapsedGroupIds: args.collapsedGroupIds,
    selectedNodeId: args.selectedNodeId,
    selectedEdgeId: args.selectedEdgeId,
  })
  const declaredSuperAgentPipeline = inspectDeclaredSuperAgentPipeline({
    activeMainPanelTab: mainPanel.available === true ? mainPanel.activeTab : null,
    settingsChatReadiness,
    workspaceDocument,
    canvasTopology,
  })

  const issues = buildIssues({
    mainPanel,
    commerceReadiness,
    settingsChatReadiness,
    editorWorkspace,
    chatPipeline,
    workspaceDocument,
    canvasTopology,
    declaredSuperAgentPipeline,
  })
  const activeMainPanelTab = mainPanel.available === true ? String(mainPanel.activeTab || '') : ''
  const commerceReady =
    commerceReadiness.available === true
    && Number(commerceReadiness.routeCount || 0) > 0
    && Number(commerceReadiness.sectionCount || 0) > 0
  const routeReady =
    mainPanel.available === true
    && (
      activeMainPanelTab === 'mcp'
      || activeMainPanelTab === 'integrations'
      || (activeMainPanelTab === 'commerce' && commerceReady)
    )
  const settingsReady =
    settingsChatReadiness.available === true
    && settingsChatReadiness.modelDiscovery?.ready === true
    && settingsChatReadiness.routing?.integrationEnabled === true
  const chatReady =
    chatPipeline.available === true
    && chatPipeline.kgcValidation?.hasYamlFrontmatter === true
    && Boolean(chatPipeline.workspacePaths?.streamFollowPath || chatPipeline.finalize?.persistedAgenticGraphPath)
  const markdownFlowReady =
    workspaceDocument.available === true
    && workspaceDocument.hasFrontmatter === true
    && workspaceDocument.hasFlowBlock === true
    && Array.isArray(workspaceDocument.forbiddenGroupingKeys)
    && workspaceDocument.forbiddenGroupingKeys.length === 0
  const canvasReady =
    canvasTopology.available === true
    && Number(canvasTopology.graphTopology?.nodeCount || 0) > 0
  const editorWorkspaceReady =
    editorWorkspace.available === true
    && editorWorkspace.workspaceViewMode === 'editor'
    && editorWorkspace.isMarkdown === true
  const declaredSuperAgentReady =
    declaredSuperAgentPipeline.declared !== true
    || declaredSuperAgentPipeline.superAgentDemoReady === true
  const pipelineReady = routeReady && settingsReady && editorWorkspaceReady && chatReady && markdownFlowReady && canvasReady && declaredSuperAgentReady

  return {
    available: mainPanel.available === true
      || settingsChatReadiness.available === true
      || editorWorkspace.available === true
      || chatPipeline.available === true
      || workspaceDocument.available === true
      || canvasTopology.available === true,
    sourceKind: 'browser-local-mainpanel-chat-canvas-pipeline',
    stage: pipelineReady ? 'ready' : chatPipeline.streaming?.active ? 'streaming' : 'partial',
    pipelineReady,
    message: pipelineReady
      ? 'MainPanel MCP/Integrations/Commerce, FloatingPanel Chat, workspace markdown/frontmatter, and active canvas topology are aligned for the current local E2E pipeline.'
      : 'One or more local E2E pipeline checkpoints are missing or incomplete.',
    checkpoints: {
      mainPanelMounted: mainPanel.available === true,
      commerceReadinessMounted: commerceReadiness.available === true,
      settingsChatReadinessMounted: settingsChatReadiness.available === true,
      editorWorkspaceMounted: editorWorkspace.available === true,
      chatPipelineMounted: chatPipeline.available === true,
      workspaceDocumentAvailable: workspaceDocument.available === true,
      canvasTopologyAvailable: canvasTopology.available === true,
    },
    readiness: {
      routeReady,
      commerceReady,
      settingsReady,
      editorWorkspaceReady,
      chatReady,
      markdownFlowReady,
      canvasReady,
      integrationProviderCoverageReady: declaredSuperAgentPipeline.providerCoverageReady,
      superAgentEntryTabReady: declaredSuperAgentPipeline.entryTabReady,
      superAgentTaskCapabilitiesReady: declaredSuperAgentPipeline.taskCapabilitiesReady,
      superAgentTaskLevelsReady: declaredSuperAgentPipeline.taskLevelsReady,
      superAgentRuntimeSurfacesReady: declaredSuperAgentPipeline.runtimeSurfacesReady,
      superAgentRuntimeSurfaceNodesReady: declaredSuperAgentPipeline.runtimeSurfaceNodesReady,
      superAgentSubagentNodesReady: declaredSuperAgentPipeline.subagentNodesReady,
      storyboardRendererReady: declaredSuperAgentPipeline.storyboardRendererReady,
      superAgentDemoReady: declaredSuperAgentPipeline.superAgentDemoReady,
    },
    entrySurfaces: {
      mcp: {
        active: activeMainPanelTab === 'mcp',
        ready: mainPanel.available === true && activeMainPanelTab === 'mcp',
      },
      integrations: {
        active: activeMainPanelTab === 'integrations',
        ready: mainPanel.available === true && activeMainPanelTab === 'integrations',
      },
      commerce: {
        active: activeMainPanelTab === 'commerce',
        ready: commerceReady,
        semanticKey: commerceReadiness.available === true ? commerceReadiness.semanticKey : null,
        routeCount: commerceReadiness.available === true ? commerceReadiness.routeCount : null,
      },
    },
    route: {
      activeMainPanelTab: mainPanel.available === true ? mainPanel.activeTab : null,
      integrationOpenTab: settingsChatReadiness.available === true
        ? settingsChatReadiness.routing?.integrationOpenTab || null
        : null,
      chatContextScope: settingsChatReadiness.available === true
        ? settingsChatReadiness.routing?.contextScope || null
        : null,
    },
    counts: {
      flowNodeCount: workspaceDocument.available === true ? workspaceDocument.flowNodeCount : null,
      flowConnectionCount: workspaceDocument.available === true ? workspaceDocument.flowConnectionCount : null,
      flowSubgraphCount: workspaceDocument.available === true ? workspaceDocument.flowSubgraphCount : null,
      canvasNodeCount: canvasTopology.available === true ? canvasTopology.graphTopology?.nodeCount ?? null : null,
      canvasEdgeCount: canvasTopology.available === true ? canvasTopology.graphTopology?.edgeCount ?? null : null,
      canvasSubgraphCount: canvasTopology.available === true ? canvasTopology.subgraphCount : null,
      collapsedGroupCount: canvasTopology.available === true ? canvasTopology.collapsedGroupCount : null,
    },
    superAgentPipeline: declaredSuperAgentPipeline,
    issues,
    mainPanel,
    commerceReadiness,
    settingsChatReadiness,
    editorWorkspace,
    chatPipeline,
    workspaceDocument,
    canvasTopology,
  }
}
