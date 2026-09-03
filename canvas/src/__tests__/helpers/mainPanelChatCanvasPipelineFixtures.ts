import { inspectLocalMainPanelChatCanvasPipeline } from '@/features/agent-ready/localMainPanelChatCanvasPipelineInspection'
import {
  AGENTIC_OS_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
  AGENTIC_OS_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS,
} from '@/features/agent-ready/mainPanelSuperAgentIntegrationContract'
import type {
  LocalChatPipelineSurfaceSnapshot,
  LocalEditorWorkspaceSurfaceSnapshot,
  LocalMainPanelSurfaceSnapshot,
  LocalSettingsChatReadinessSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { AGENTIC_COMMERCE_MAIN_PANEL_READINESS } from 'grph-shared/payments/agenticCommerceSsot'

export const READY_MARKDOWN = `---
flow:
  nodes:
    - id: start
      label: Start
    - id: end
      label: End
  connections:
    - source: start
      target: end
---

# Agent Ready
`

export const READY_GRAPH = {
  nodes: [
    { id: 'start', type: 'Step', label: 'Start' },
    { id: 'end', type: 'Step', label: 'End' },
  ],
  edges: [
    { id: 'edge-1', source: 'start', target: 'end', label: 'next' },
  ],
}

export const buildMainPanelSnapshot = (activeTab: string): LocalMainPanelSurfaceSnapshot => ({
  activeTab,
  activeTabLabel: activeTab === 'mcp' ? 'MCP' : activeTab === 'integrations' ? 'Integrations' : activeTab === 'commerce' ? 'Commerce' : activeTab,
  searchable: true,
  searchOpen: true,
  searchVisible: true,
  searchQuery: 'agent ready',
  searchPlaceholder: 'Search',
  footerLabel: activeTab,
  traversalChip: null,
  sharedActions: {
    hasApply: true,
    hasReset: true,
    hasGlobalReset: false,
    hasCollapseAll: true,
    hasExpandAll: true,
    allCollapsed: false,
  },
})

export const READY_SETTINGS_CHAT: LocalSettingsChatReadinessSurfaceSnapshot = {
  normalizedChatProvider: 'openai',
  chatEndpointUrl: '/api/chat',
  chatModel: 'gpt-4.1',
  chatAuthMode: 'server',
  chatContextScope: 'workspace',
  integrationProviderIds: [...AGENTIC_OS_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS],
  integrationProviderLabels: [...AGENTIC_OS_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS],
  integrationEnabled: true,
  integrationOpenTab: 'chat',
  isRefreshingChatModels: false,
  chatModelsStatus: 'ready',
  discoveredChatModelCount: 3,
  suggestedChatModelCount: 1,
}

export const READY_CHAT_PIPELINE: LocalChatPipelineSurfaceSnapshot = {
  messageCount: 2,
  isLoading: false,
  errorText: null,
  connectivity: 'ok',
  connectivityDetail: 'ready',
  chatProviderSummary: 'OpenAI / gpt-4.1',
  chatProviderHint: null,
  chatContextScope: 'workspace',
  chatStorageTarget: 'chatAgenticGraph',
  chatAgenticGraphWorkspacePath: '/chat/agentic-graph/agent-ready.md',
  chatHistoryWorkspacePath: '/chat/history/agent-ready.md',
  workspaceViewMode: 'editor',
  editorWorkspacePane: 'markdown',
  markdownDocumentName: 'workspace:/docs/agent-ready.md',
  selectedNodeId: 'start',
  streamingAssistant: null,
  streamingWorkspacePath: null,
  streamFollowPath: '/chat/agentic-graph/agent-ready.md',
  streamDraft: null,
  kgcValidation: {
    stage: 'validated',
    attempt: 1,
    maxAttempts: 3,
    failedRuleId: null,
    failedMessage: null,
    correctionPromptPreview: null,
    hasStructuredKgc: true,
    hasStructuredResponseSurface: false,
    hasYamlFrontmatter: true,
    validatedKgcLength: READY_MARKDOWN.length,
  },
  finalize: {
    stage: 'applied',
    traceId: 'trace-agent-ready',
    modelId: 'gpt-4.1',
    finalStatus: 'ok',
    persistedAgenticGraphPath: '/chat/agentic-graph/agent-ready.md',
    applied: true,
    message: 'Applied',
    failureNote: null,
    retryHint: null,
    retryCommand: null,
  },
}

export const READY_EDITOR_WORKSPACE: LocalEditorWorkspaceSurfaceSnapshot = {
  activeDocumentKey: 'workspace:/docs/agent-ready.md',
  workspaceViewMode: 'editor',
  workspaceCanvasPaneOpen: true,
  workspaceEditorOverlayOpen: true,
  layoutMode: 'editor',
  viewerKind: 'markdown',
  viewerMode: 'read',
  isMarkdown: true,
  isJsonMarkdownEditing: false,
  paneVisibility: { markdown: true, json: true, viewer: true, html: false, binary: false },
  splitPaneVisibility: { markdown: true, json: true, viewer: true, html: false, bin: false },
  liveMarkdownText: READY_MARKDOWN,
  persistedMarkdownText: READY_MARKDOWN,
  hasUncommittedDraft: false,
  liveDraftSource: 'persisted',
}

export const inspectReadyPipeline = (activeTab: string) => inspectLocalMainPanelChatCanvasPipeline({
  mainPanelSnapshot: buildMainPanelSnapshot(activeTab),
  commerceReadinessSnapshot: AGENTIC_COMMERCE_MAIN_PANEL_READINESS,
  settingsChatReadinessSnapshot: READY_SETTINGS_CHAT,
  editorWorkspaceSnapshot: READY_EDITOR_WORKSPACE,
  chatPipelineSnapshot: READY_CHAT_PIPELINE,
  markdownDocumentName: 'workspace:/docs/agent-ready.md',
  markdownDocumentText: READY_MARKDOWN,
  markdownDocumentSourceUrl: '/agentic-graph/share/agent-ready',
  graphData: READY_GRAPH,
  graphDataRevision: 1,
  canvasRenderMode: '2d',
  canvas2dRenderer: 'd3',
  documentSemanticMode: 'document',
  frontmatterModeEnabled: true,
  multiDimTableModeEnabled: false,
  documentStructureBaselineLock: false,
  collapsedGroupIds: [],
  selectedNodeId: 'start',
  selectedEdgeId: 'edge-1',
})
