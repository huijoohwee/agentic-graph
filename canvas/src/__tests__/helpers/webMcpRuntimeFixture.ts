import { buildAgentSurfaceInspectionPayload } from '@/features/agent-ready/agentSurfaceInspection.mjs'
import {
  publishLocalChatPipelineSurfaceSnapshot,
  publishLocalCommerceReadinessSurfaceSnapshot,
  publishLocalEditorWorkspaceSurfaceSnapshot,
  publishLocalMainPanelSurfaceSnapshot,
  publishLocalSettingsChatReadinessSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { AGENTIC_COMMERCE_MAIN_PANEL_READINESS } from 'grph-shared/payments/agenticCommerceSsot'

export const MOCK_SHARED_DOCUMENT_MARKDOWN = `---
flow:
  nodes:
    - id: start
      label: Start
    - id: end
      label: End
  connections:
    - source: start
      target: end
  subgraphs:
    - id: lane-main
      label: Main
---

# Shared Doc

## Overview
`

export const MOCK_CANVAS_GRAPH_DATA = {
  nodes: [
    { id: 'start', type: 'Step', label: 'Start' },
    { id: 'end', type: 'Step', label: 'End' },
  ],
  edges: [
    { id: 'edge-1', source: 'start', target: 'end', label: 'next' },
  ],
  metadata: {
    'kg:subgraphs': [
      { id: 'lane-main', label: 'Main', memberNodeIds: ['start', 'end'] },
    ],
  },
  type: 'application/json',
}

export const MOCK_CANVAS_SVG = '<svg viewBox="0 0 640 360" width="640" height="360"><g data-kg-node="start" /></svg>'

export const MOCK_THREE_CAMERA_POSE = {
  position: { x: 10, y: 20, z: 30 },
  quaternion: { x: 0, y: 0.5, z: 0, w: 0.8660254 },
  target: { x: 1, y: 2, z: 3 },
  fov: 45,
  zoom: 1.25,
}

export const MOCK_THREE_LAYOUT_POSITIONS = {
  alpha: [1.1114, 2.2225, 3.3336],
  start: [10.1234, 20.5678, 30.9876],
  omega: [40.4444, 50.5555, 60.6666],
}

export const createMockResponse = (url: string): Response =>
  ({
    ok: true,
    status: 200,
    text: async () => (
      url.includes('/api/storage/doc-default/')
        || url.includes('/api/storage/doc/')
        ? MOCK_SHARED_DOCUMENT_MARKDOWN
        : '# mock markdown'
    ),
    json: async () => buildMockEndpointPayload(url),
  }) as Response

const buildMockEndpointPayload = (url: string) => ({
  url,
  ok: true,
  capabilities: { tools: [{ name: 'list_source_files' }] },
  status: 'pass',
  service: 'agentic-agent-ready-pages',
  skills: [{ name: 'agentic-graph-source-files', type: 'markdown', url: `${url}/skill.md`, sha256: 'sha' }],
  openapi: '3.1.0',
  paths: { '/agentic-graph/health': { get: {} } },
})

export const buildExpectedMockAgentSurfaceInspection = (baseUrl: string) => {
  const baseOrigin = new URL(`${baseUrl}/`).origin

  return buildAgentSurfaceInspectionPayload({
    baseUrl,
    health: buildMockEndpointPayload(`${baseUrl}/health`),
    apiCatalog: buildMockEndpointPayload(`${baseUrl}/.well-known/api-catalog`),
    openApi: buildMockEndpointPayload(`${baseUrl}/.well-known/openapi.json`),
    mcpServerCard: buildMockEndpointPayload(`${baseUrl}/.well-known/mcp/server-card.json`),
    agentCard: buildMockEndpointPayload(`${baseUrl}/.well-known/agent-card.json`),
    agentSkills: buildMockEndpointPayload(`${baseUrl}/.well-known/agent-skills/index.json`),
    commerce: {
      acpDiscovery: buildMockEndpointPayload(`${baseOrigin}/.well-known/acp.json`),
      ucpProfile: buildMockEndpointPayload(`${baseOrigin}/.well-known/ucp`),
      mppOpenApi: buildMockEndpointPayload(`${baseOrigin}/openapi.json`),
    },
  })
}

export const publishMockWebMcpLocalSurfaceSnapshots = (): void => {
  publishLocalMainPanelSurfaceSnapshot({
    activeTab: 'mcp',
    activeTabLabel: 'MCP',
    searchable: true,
    searchOpen: true,
    searchVisible: true,
    searchQuery: 'browser api',
    searchPlaceholder: 'Search settings',
    footerLabel: 'MCP',
    traversalChip: { modeLabel: 'AgenticRAG', edgesLabel: '1 edge', nodesLabel: '2 nodes' },
    sharedActions: {
      hasApply: true,
      hasReset: true,
      hasGlobalReset: false,
      hasCollapseAll: true,
      hasExpandAll: true,
      allCollapsed: false,
    },
  })
  publishLocalCommerceReadinessSurfaceSnapshot(AGENTIC_COMMERCE_MAIN_PANEL_READINESS)
  publishLocalSettingsChatReadinessSurfaceSnapshot({
    normalizedChatProvider: 'openai',
    chatEndpointUrl: 'https://api.openai.com/v1/chat/completions',
    chatModel: 'gpt-4.1',
    chatAuthMode: 'serverManaged',
    chatContextScope: 'workspace',
    integrationEnabled: true,
    integrationOpenTab: 'chat',
    isRefreshingChatModels: false,
    chatModelsStatus: 'Discovered 3 models.',
    discoveredChatModelCount: 3,
    suggestedChatModelCount: 8,
  })
  publishLocalEditorWorkspaceSurfaceSnapshot({
    activeDocumentKey: 'workspace:/local/agent-ready.md',
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
    liveMarkdownText: `${MOCK_SHARED_DOCUMENT_MARKDOWN}\nAgent-ready draft\n`,
    persistedMarkdownText: MOCK_SHARED_DOCUMENT_MARKDOWN,
    hasUncommittedDraft: true,
    liveDraftSource: 'viewer-inline',
  })
  publishLocalChatPipelineSurfaceSnapshot({
    messageCount: 3,
    isLoading: true,
    errorText: null,
    connectivity: 'ok',
    connectivityDetail: 'streaming',
    chatProviderSummary: 'OpenAI / Global / gpt-4.1',
    chatProviderHint: 'Use a reasoning-capable model',
    chatContextScope: 'workspace',
    chatStorageTarget: 'chatAgenticGraph',
    chatAgenticGraphWorkspacePath: '/chat/agentic-graph/session.md',
    chatHistoryWorkspacePath: '/chat/history/session.md',
    workspaceViewMode: 'editor',
    editorWorkspacePane: 'markdown',
    markdownDocumentName: 'workspace:/local/agent-ready.md',
    selectedNodeId: 'start',
    streamingAssistant: {
      id: 'assistant-1',
      text: '---\nflow:\n  nodes:\n    - id: start\n      label: Start\n---\n# Agent draft',
    },
    streamingWorkspacePath: '/chat/agentic-graph/session.md',
    streamFollowPath: '/chat/agentic-graph/session.md',
    streamDraft: {
      path: '/chat/agentic-graph/session.md',
      text: '---\nflow:\n  nodes:\n    - id: start\n      label: Start\n---\n# Draft workspace',
    },
    agenticOsValidation: {
      stage: 'validated',
      attempt: 2,
      maxAttempts: 3,
      failedRuleId: null,
      failedMessage: null,
      correctionPromptPreview: null,
      hasStructuredAgenticOs: true,
      hasStructuredResponseSurface: false,
      hasYamlFrontmatter: true,
      validatedAgenticOsLength: 94,
    },
    finalize: {
      stage: 'applied',
      traceId: 'trace-123',
      modelId: 'gpt-4.1',
      finalStatus: 'ok',
      persistedAgenticGraphPath: '/chat/agentic-graph/session.md',
      applied: true,
      message: 'Canonical AGENTIC_OS workspace document was persisted and applied to the active canvas graph.',
      failureNote: null,
      retryHint: null,
      retryCommand: null,
    },
  })
}
