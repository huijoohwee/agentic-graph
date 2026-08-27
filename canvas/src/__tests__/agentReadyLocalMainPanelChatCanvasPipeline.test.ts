import React from 'react'
import { createRoot } from 'react-dom/client'
import MainPanel from '@/features/panels/MainPanel'
import { inspectLocalMainPanelChatCanvasPipeline } from '@/features/agent-ready/localMainPanelChatCanvasPipelineInspection'
import {
  AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS,
  AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS,
  AGENTICGRAPH_SUPERAGENT_RESEARCH_DEMO_SHARE_URL,
  AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
  AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID,
  AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS,
  AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS,
} from '@/features/agent-ready/mainPanelSuperAgentIntegrationContract'
import {
  readLocalMainPanelSurfaceSnapshot,
  resetBrowserLocalSurfaceSnapshotsForTests,
  type LocalEditorWorkspaceSurfaceSnapshot,
  type LocalSettingsChatReadinessSurfaceSnapshot,
} from '@/features/agent-ready/browserLocalSurfaceSnapshots'
import { DEFAULT_INTEGRATION_CONFIGS, stringifyIntegrationConfigs } from '@/features/integrations/config'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  installDeterministicRaf,
  mountReactRoot,
  unmountReactRoot,
  waitForFrames,
  waitForTasks,
} from '@/tests/lib/reactRootHarness'
import { AGENTIC_COMMERCE_MAIN_PANEL_READINESS } from 'grph-shared/payments/agenticCommerceSsot'
import { loadGraphDataFromTextViaParser } from '@/features/parsers/loader'
import { readResearchAgentDemoFixture } from './helpers/researchAgentDemoFixture'
import {
  READY_CHAT_PIPELINE,
  READY_EDITOR_WORKSPACE,
  READY_GRAPH,
  READY_MARKDOWN,
  READY_SETTINGS_CHAT,
  buildMainPanelSnapshot,
  inspectReadyPipeline,
} from './helpers/mainPanelChatCanvasPipelineFixtures'

type BrowserLocalSurfaceSnapshotsModule = typeof import('@/features/agent-ready/browserLocalSurfaceSnapshots')

const loadRenderedMainPanelSurfaceSnapshots = async (): Promise<BrowserLocalSurfaceSnapshotsModule> => (
  import('@/features/agent-ready/browserLocalSurfaceSnapshots')
)

const resetRenderedMainPanelSurfaceSnapshots = async (): Promise<void> => {
  resetBrowserLocalSurfaceSnapshotsForTests()
  const renderedSnapshots = await loadRenderedMainPanelSurfaceSnapshots()
  renderedSnapshots.resetBrowserLocalSurfaceSnapshotsForTests()
}

const readRenderedSettingsChatReadinessSurfaceSnapshot = async (): Promise<LocalSettingsChatReadinessSurfaceSnapshot | null> => {
  const renderedSnapshots = await loadRenderedMainPanelSurfaceSnapshots()
  return renderedSnapshots.readLocalSettingsChatReadinessSurfaceSnapshot()
}

export function testLocalMainPanelChatCanvasPipelineAcceptsMcpIntegrationsCommerceEntryTabs() {
  for (const activeTab of ['mcp', 'integrations', 'commerce']) {
    const inspection = inspectReadyPipeline(activeTab) as {
      pipelineReady?: unknown
      readiness?: { routeReady?: unknown; commerceReady?: unknown; editorWorkspaceReady?: unknown; chatReady?: unknown; markdownFlowReady?: unknown; canvasReady?: unknown }
      entrySurfaces?: { commerce?: { active?: unknown; ready?: unknown; semanticKey?: unknown; routeCount?: unknown } }
      route?: { activeMainPanelTab?: unknown }
      issues?: unknown
    }
    if (inspection.pipelineReady !== true) {
      throw new Error(`expected ${activeTab} entry tab to be pipeline-ready, got ${JSON.stringify(inspection)}`)
    }
    if (inspection.readiness?.routeReady !== true || inspection.readiness?.commerceReady !== true || inspection.readiness?.editorWorkspaceReady !== true || inspection.readiness?.chatReady !== true || inspection.readiness?.markdownFlowReady !== true || inspection.readiness?.canvasReady !== true) {
      throw new Error(`expected ${activeTab} entry tab to keep every readiness checkpoint true, got ${JSON.stringify(inspection.readiness)}`)
    }
    if (inspection.route?.activeMainPanelTab !== activeTab) {
      throw new Error(`expected ${activeTab} entry tab to remain explicit without remapping, got ${JSON.stringify(inspection.route)}`)
    }
    if (inspection.entrySurfaces?.commerce?.semanticKey !== AGENTIC_COMMERCE_MAIN_PANEL_READINESS.semanticKey) {
      throw new Error(`expected ${activeTab} entry tab to expose shared Commerce semantic key, got ${JSON.stringify(inspection.entrySurfaces)}`)
    }
    if (activeTab === 'commerce' && (inspection.entrySurfaces.commerce.active !== true || inspection.entrySurfaces.commerce.ready !== true || inspection.entrySurfaces.commerce.routeCount !== AGENTIC_COMMERCE_MAIN_PANEL_READINESS.routeCount)) {
      throw new Error(`expected active Commerce entry surface to be ready from shared routes, got ${JSON.stringify(inspection.entrySurfaces.commerce)}`)
    }
    if (Array.isArray(inspection.issues) && inspection.issues.length > 0) {
      throw new Error(`expected ${activeTab} entry tab to report no issues, got ${JSON.stringify(inspection.issues)}`)
    }
  }
}

export async function testLocalMainPanelChatCanvasPipelineUsesRenderedIntegrationsEntrySnapshots() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    await resetRenderedMainPanelSurfaceSnapshots()
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatProvider('openai')
    api.setChatEndpointUrl('/api/chat')
    api.setChatModel('gpt-4.1')
    api.setChatContextScope('workspace')
    api.setChatStorageTarget('chatAgenticGraph')
    api.setIntegrationConfigsJson(stringifyIntegrationConfigs({
      ...DEFAULT_INTEGRATION_CONFIGS,
      aiChat: {
        ...DEFAULT_INTEGRATION_CONFIGS.aiChat,
        enabled: true,
      },
    }))

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(MainPanel, {
      requestedTab: 'integrations',
      requestedSearchQuery: 'chat',
    }), {
      window: dom.window as unknown as Window,
      frames: 8,
      tasks: 4,
    })
    await waitForTasks(4)
    await waitForFrames(dom.window as unknown as Window, 2)

    const mainPanelSnapshot = readLocalMainPanelSurfaceSnapshot()
    const settingsChatReadinessSnapshot = await readRenderedSettingsChatReadinessSurfaceSnapshot()
    if (mainPanelSnapshot?.activeTab !== 'integrations') {
      throw new Error(`expected rendered MainPanel snapshot to stay on Integrations, got ${JSON.stringify(mainPanelSnapshot)}`)
    }
    if (mainPanelSnapshot.sharedActions?.hasApply !== true || mainPanelSnapshot.sharedActions.hasReset !== true) {
      throw new Error(`expected rendered Integrations entry to register shared Settings actions, got ${JSON.stringify(mainPanelSnapshot.sharedActions)}`)
    }
    if (
      settingsChatReadinessSnapshot?.integrationEnabled !== true ||
      settingsChatReadinessSnapshot.integrationOpenTab !== 'chat'
    ) {
      throw new Error(`expected rendered Integrations settings snapshot to expose normalized chat routing, got ${JSON.stringify(settingsChatReadinessSnapshot)}`)
    }

    const inspection = inspectLocalMainPanelChatCanvasPipeline({
      mainPanelSnapshot,
      commerceReadinessSnapshot: AGENTIC_COMMERCE_MAIN_PANEL_READINESS,
      settingsChatReadinessSnapshot,
      editorWorkspaceSnapshot: READY_EDITOR_WORKSPACE,
      chatPipelineSnapshot: READY_CHAT_PIPELINE,
      markdownDocumentName: 'workspace:/docs/agent-ready.md',
      markdownDocumentText: READY_MARKDOWN,
      markdownDocumentSourceUrl: '/agenticgraph/share/agent-ready',
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
    }) as {
      pipelineReady?: unknown
      readiness?: { routeReady?: unknown; settingsReady?: unknown; chatReady?: unknown; markdownFlowReady?: unknown; canvasReady?: unknown }
      entrySurfaces?: { integrations?: { active?: unknown; ready?: unknown } }
      route?: { activeMainPanelTab?: unknown; integrationOpenTab?: unknown; chatContextScope?: unknown }
      counts?: { flowNodeCount?: unknown; canvasNodeCount?: unknown }
      issues?: unknown
    }

    if (
      inspection.pipelineReady !== true ||
      inspection.entrySurfaces?.integrations?.active !== true ||
      inspection.entrySurfaces.integrations.ready !== true ||
      inspection.readiness?.routeReady !== true ||
      inspection.readiness.settingsReady !== true ||
      inspection.readiness.chatReady !== true ||
      inspection.readiness.markdownFlowReady !== true ||
      inspection.readiness.canvasReady !== true ||
      inspection.route?.activeMainPanelTab !== 'integrations' ||
      inspection.route.integrationOpenTab !== 'chat' ||
      inspection.route.chatContextScope !== 'workspace' ||
      inspection.counts?.flowNodeCount !== 2 ||
      inspection.counts.canvasNodeCount !== 2 ||
      (Array.isArray(inspection.issues) && inspection.issues.length > 0)
    ) {
      throw new Error(`expected rendered Integrations entry to prove the local chat/frontmatter/canvas E2E pipeline, got ${JSON.stringify(inspection)}`)
    }

    const text = container.textContent || ''
    if (!text.includes('integrationConfigsJson') || !text.includes('Open FloatingPanel Chat UI')) {
      throw new Error(`expected rendered Integrations UI to expose integration routing rows and Chat entry action, got ${JSON.stringify(text)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    await resetRenderedMainPanelSurfaceSnapshots()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testLocalMainPanelChatCanvasPipelineUsesRenderedMcpEntryForResearchAgentDemoSuperAgentStoryboardWidget() {
  const demoFixture = readResearchAgentDemoFixture()
  const demoText = demoFixture.text
  const parsed = await loadGraphDataFromTextViaParser(demoFixture.basename, demoText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  if (!parsed?.graphData) throw new Error('expected research-agent demo parser result for rendered MainPanel MCP proof')

  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { dom, restore: restoreDom } = initJsdomHarness()
  let root: ReturnType<typeof createRoot> | null = null

  try {
    await resetRenderedMainPanelSurfaceSnapshots()
    const anyWindow = dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }
    anyWindow.requestAnimationFrame = installDeterministicRaf(dom.window)

    const api = useGraphStore.getState()
    api.resetAll()
    api.setChatProvider('openai')
    api.setChatEndpointUrl('/api/chat')
    api.setChatModel('gpt-4.1')
    api.setChatContextScope('workspace')
    api.setChatStorageTarget('chatAgenticGraph')
    api.setIntegrationConfigsJson(stringifyIntegrationConfigs({
      ...DEFAULT_INTEGRATION_CONFIGS,
      aiChat: {
        ...DEFAULT_INTEGRATION_CONFIGS.aiChat,
        enabled: true,
        openTab: 'chat',
      },
    }))

    const container = dom.window.document.createElement('section')
    dom.window.document.body.appendChild(container)
    root = createRoot(container)
    await mountReactRoot(root, React.createElement(MainPanel, {
      requestedTab: 'mcp',
      requestedSearchQuery: 'openaiMcp',
    }), {
      window: dom.window as unknown as Window,
      frames: 10,
      tasks: 4,
    })
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (await readRenderedSettingsChatReadinessSurfaceSnapshot()) break
      await waitForTasks(4)
      await waitForFrames(dom.window as unknown as Window, 4)
    }

    const mainPanelSnapshot = readLocalMainPanelSurfaceSnapshot()
    const settingsChatReadinessSnapshot = await readRenderedSettingsChatReadinessSurfaceSnapshot()
    if (mainPanelSnapshot?.activeTab !== 'mcp') {
      throw new Error(`expected rendered MainPanel snapshot to stay on MCP, got ${JSON.stringify(mainPanelSnapshot)}`)
    }
    if (mainPanelSnapshot.sharedActions?.hasApply !== true || mainPanelSnapshot.sharedActions.hasReset !== true) {
      throw new Error(`expected rendered MCP entry to register shared Settings actions, got ${JSON.stringify(mainPanelSnapshot.sharedActions)}`)
    }
    if (
      settingsChatReadinessSnapshot?.integrationEnabled !== true ||
      settingsChatReadinessSnapshot.integrationOpenTab !== 'chat' ||
      settingsChatReadinessSnapshot.chatContextScope !== 'workspace'
    ) {
      throw new Error(`expected rendered MCP settings snapshot to expose chat routing, got ${JSON.stringify(settingsChatReadinessSnapshot)}`)
    }

    const inspection = inspectLocalMainPanelChatCanvasPipeline({
      mainPanelSnapshot,
      commerceReadinessSnapshot: AGENTIC_COMMERCE_MAIN_PANEL_READINESS,
      settingsChatReadinessSnapshot,
      editorWorkspaceSnapshot: {
        ...READY_EDITOR_WORKSPACE,
        activeDocumentKey: demoFixture.sourceFile,
        liveMarkdownText: demoText,
        persistedMarkdownText: demoText,
        markdownDocumentName: demoFixture.sourceFile,
      } as LocalEditorWorkspaceSurfaceSnapshot,
      chatPipelineSnapshot: {
        ...READY_CHAT_PIPELINE,
        chatProviderSummary: AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS.join(' / '),
        markdownDocumentName: demoFixture.sourceFile,
        selectedNodeId: AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
        streamFollowPath: demoFixture.sourceFile,
        kgcValidation: {
          ...READY_CHAT_PIPELINE.kgcValidation!,
          validatedKgcLength: demoText.length,
        },
        finalize: {
          ...READY_CHAT_PIPELINE.finalize!,
          persistedAgenticGraphPath: demoFixture.sourceFile,
        },
      },
      markdownDocumentName: demoFixture.sourceFile,
      markdownDocumentText: demoText,
      markdownDocumentSourceUrl: AGENTICGRAPH_SUPERAGENT_RESEARCH_DEMO_SHARE_URL,
      graphData: parsed.graphData,
      graphDataRevision: 3,
      canvasRenderMode: '2d',
      canvas2dRenderer: AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER,
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      multiDimTableModeEnabled: true,
      documentStructureBaselineLock: false,
      collapsedGroupIds: [],
      selectedNodeId: AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
      selectedEdgeId: AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID,
    }) as {
      pipelineReady?: unknown
      readiness?: {
        routeReady?: unknown
        settingsReady?: unknown
        editorWorkspaceReady?: unknown
        chatReady?: unknown
        markdownFlowReady?: unknown
        canvasReady?: unknown
        integrationProviderCoverageReady?: unknown
        superAgentEntryTabReady?: unknown
        superAgentRuntimeSurfacesReady?: unknown
        superAgentRuntimeSurfaceNodesReady?: unknown
        superAgentSubagentNodesReady?: unknown
        storyboardRendererReady?: unknown
        superAgentDemoReady?: unknown
      }
      entrySurfaces?: { mcp?: { active?: unknown; ready?: unknown } }
      route?: { activeMainPanelTab?: unknown; integrationOpenTab?: unknown; chatContextScope?: unknown }
      counts?: { flowNodeCount?: unknown; flowConnectionCount?: unknown; canvasNodeCount?: unknown; canvasEdgeCount?: unknown }
      canvasTopology?: { canvas2dRenderer?: unknown }
      issues?: unknown
    }

    if (
      inspection.pipelineReady !== true ||
      inspection.entrySurfaces?.mcp?.active !== true ||
      inspection.entrySurfaces.mcp.ready !== true ||
      inspection.route?.activeMainPanelTab !== 'mcp' ||
      inspection.route.integrationOpenTab !== 'chat' ||
      inspection.route.chatContextScope !== 'workspace' ||
      inspection.readiness?.routeReady !== true ||
      inspection.readiness.settingsReady !== true ||
      inspection.readiness.editorWorkspaceReady !== true ||
      inspection.readiness.chatReady !== true ||
      inspection.readiness.markdownFlowReady !== true ||
      inspection.readiness.canvasReady !== true ||
      inspection.readiness.integrationProviderCoverageReady !== true ||
      inspection.readiness.superAgentEntryTabReady !== true ||
      inspection.readiness.superAgentRuntimeSurfacesReady !== true ||
      inspection.readiness.superAgentRuntimeSurfaceNodesReady !== true ||
      inspection.readiness.superAgentSubagentNodesReady !== true ||
      inspection.readiness.storyboardRendererReady !== true ||
      inspection.readiness.superAgentDemoReady !== true ||
      inspection.canvasTopology?.canvas2dRenderer !== AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER ||
      Number(inspection.counts?.flowNodeCount || 0) <= 0 ||
      Number(inspection.counts.flowConnectionCount || 0) <= 0 ||
      Number(inspection.counts.canvasNodeCount || 0) < Number(inspection.counts.flowNodeCount || 0) ||
      Number(inspection.counts.canvasEdgeCount || 0) < Number(inspection.counts.flowConnectionCount || 0) ||
      (Array.isArray(inspection.issues) && inspection.issues.length > 0)
    ) {
      throw new Error(`expected rendered MainPanel MCP to prove research demo ingestion -> parsing -> Storyboard Widget SuperAgent rendering, got ${JSON.stringify(inspection)}`)
    }

    const renderedText = container.textContent || ''
    if (!renderedText.includes('OpenAI MCP Server Configuration') || !renderedText.includes('openaiMcp.server_url')) {
      throw new Error(`expected rendered MCP UI to expose configurable OpenAI MCP rows, got ${JSON.stringify(renderedText)}`)
    }
  } finally {
    if (root) {
      await unmountReactRoot(root, { window: dom.window as unknown as Window })
    }
    await resetRenderedMainPanelSurfaceSnapshots()
    useGraphStore.getState().resetAll()
    restoreDom()
    restoreWindow()
  }
}

export async function testLocalMainPanelChatCanvasPipelineUsesResearchAgentDemoSuperAgentStoryboardWidget() {
  const demoFixture = readResearchAgentDemoFixture()
  const demoText = demoFixture.text
  const parsed = await loadGraphDataFromTextViaParser(demoFixture.basename, demoText, {
    applyToStore: false,
    syncMarkdownDocument: false,
  })
  if (!parsed?.graphData) throw new Error('expected research-agent demo parser result for MainPanel pipeline proof')

  for (const activeTab of AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_ENTRY_TABS) {
    const inspection = inspectLocalMainPanelChatCanvasPipeline({
      mainPanelSnapshot: buildMainPanelSnapshot(activeTab),
      commerceReadinessSnapshot: AGENTIC_COMMERCE_MAIN_PANEL_READINESS,
      settingsChatReadinessSnapshot: READY_SETTINGS_CHAT,
      editorWorkspaceSnapshot: {
        ...READY_EDITOR_WORKSPACE,
        activeDocumentKey: demoFixture.sourceFile,
        liveMarkdownText: demoText,
        persistedMarkdownText: demoText,
        markdownDocumentName: demoFixture.sourceFile,
      } as LocalEditorWorkspaceSurfaceSnapshot,
      chatPipelineSnapshot: {
        ...READY_CHAT_PIPELINE,
        chatProviderSummary: AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_LABELS.join(' / '),
        markdownDocumentName: demoFixture.sourceFile,
        selectedNodeId: AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
        streamFollowPath: demoFixture.sourceFile,
        kgcValidation: {
          ...READY_CHAT_PIPELINE.kgcValidation!,
          validatedKgcLength: demoText.length,
        },
        finalize: {
          ...READY_CHAT_PIPELINE.finalize!,
          persistedAgenticGraphPath: demoFixture.sourceFile,
        },
      },
      markdownDocumentName: demoFixture.sourceFile,
      markdownDocumentText: demoText,
      markdownDocumentSourceUrl: AGENTICGRAPH_SUPERAGENT_RESEARCH_DEMO_SHARE_URL,
      graphData: parsed.graphData,
      graphDataRevision: 2,
      canvasRenderMode: '2d',
      canvas2dRenderer: AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER,
      documentSemanticMode: 'document',
      frontmatterModeEnabled: true,
      multiDimTableModeEnabled: true,
      documentStructureBaselineLock: false,
      collapsedGroupIds: [],
      selectedNodeId: AGENTICGRAPH_SUPERAGENT_HARNESS_NODE_ID,
      selectedEdgeId: AGENTICGRAPH_SUPERAGENT_REVIEW_EDGE_ID,
    }) as {
      pipelineReady?: unknown
      readiness?: {
        integrationProviderCoverageReady?: unknown
        superAgentEntryTabReady?: unknown
        superAgentTaskCapabilitiesReady?: unknown
        superAgentTaskLevelsReady?: unknown
        superAgentRuntimeSurfacesReady?: unknown
        superAgentRuntimeSurfaceNodesReady?: unknown
        superAgentSubagentNodesReady?: unknown
        storyboardRendererReady?: unknown
        superAgentDemoReady?: unknown
      }
      route?: { activeMainPanelTab?: unknown; integrationOpenTab?: unknown }
      counts?: { flowNodeCount?: unknown; flowConnectionCount?: unknown; canvasNodeCount?: unknown; canvasEdgeCount?: unknown }
      superAgentPipeline?: {
        requiredEntryTabs?: unknown
        requiredProviderIds?: unknown
        availableProviderIds?: unknown
        declaredTaskCapabilities?: unknown
        declaredTaskLevels?: unknown
        declaredRuntimeSurfaces?: unknown
        requiredRuntimeSurfaceNodeIds?: unknown
        requiredSubagentNodeIds?: unknown
        renderedNodeIds?: unknown
        declaredRenderer?: unknown
      }
      canvasTopology?: { canvas2dRenderer?: unknown }
      issues?: unknown
    }

    if (
      inspection.pipelineReady !== true ||
      inspection.route?.activeMainPanelTab !== activeTab ||
      inspection.route.integrationOpenTab !== 'chat' ||
      inspection.readiness?.integrationProviderCoverageReady !== true ||
      inspection.readiness.superAgentEntryTabReady !== true ||
      inspection.readiness.superAgentTaskCapabilitiesReady !== true ||
      inspection.readiness.superAgentTaskLevelsReady !== true ||
      inspection.readiness.superAgentRuntimeSurfacesReady !== true ||
      inspection.readiness.superAgentRuntimeSurfaceNodesReady !== true ||
      inspection.readiness.superAgentSubagentNodesReady !== true ||
      inspection.readiness.storyboardRendererReady !== true ||
      inspection.readiness.superAgentDemoReady !== true ||
      inspection.canvasTopology?.canvas2dRenderer !== AGENTICGRAPH_SUPERAGENT_CANVAS_RENDERER ||
      Number(inspection.counts?.flowNodeCount || 0) <= 0 ||
      Number(inspection.counts.flowConnectionCount || 0) <= 0 ||
      Number(inspection.counts.canvasNodeCount || 0) < Number(inspection.counts.flowNodeCount || 0) ||
      Number(inspection.counts.canvasEdgeCount || 0) < Number(inspection.counts.flowConnectionCount || 0) ||
      (Array.isArray(inspection.issues) && inspection.issues.length > 0)
    ) {
      throw new Error(`expected research-agent demo to prove MainPanel ${activeTab} -> ingestion -> parsing -> Storyboard Widget SuperAgent rendering, got ${JSON.stringify(inspection)}`)
    }

    const requiredEntryTabs = new Set(Array.isArray(inspection.superAgentPipeline?.requiredEntryTabs) ? inspection.superAgentPipeline.requiredEntryTabs.map(String) : [])
    if (!requiredEntryTabs.has(activeTab)) {
      throw new Error(`expected active MainPanel tab ${activeTab} in declared SuperAgent entry coverage, got ${JSON.stringify(inspection.superAgentPipeline)}`)
    }
    const requiredProviderIds = new Set(Array.isArray(inspection.superAgentPipeline?.requiredProviderIds) ? inspection.superAgentPipeline.requiredProviderIds.map(String) : [])
    const availableProviderIds = new Set(Array.isArray(inspection.superAgentPipeline?.availableProviderIds) ? inspection.superAgentPipeline.availableProviderIds.map(String) : [])
    for (const providerId of AGENTICGRAPH_SUPERAGENT_MAIN_PANEL_PROVIDER_IDS) {
      if (!requiredProviderIds.has(providerId) || !availableProviderIds.has(providerId)) {
        throw new Error(`expected provider ${providerId} in declared and available MainPanel coverage, got ${JSON.stringify(inspection.superAgentPipeline)}`)
      }
    }
    const requiredRuntimeSurfaceNodeIds = new Set(Array.isArray(inspection.superAgentPipeline?.requiredRuntimeSurfaceNodeIds) ? inspection.superAgentPipeline.requiredRuntimeSurfaceNodeIds.map(String) : [])
    const requiredSubagentNodeIds = new Set(Array.isArray(inspection.superAgentPipeline?.requiredSubagentNodeIds) ? inspection.superAgentPipeline.requiredSubagentNodeIds.map(String) : [])
    const renderedNodeIds = new Set(Array.isArray(inspection.superAgentPipeline?.renderedNodeIds) ? inspection.superAgentPipeline.renderedNodeIds.map(String) : [])
    for (const nodeId of Object.values(AGENTICGRAPH_SUPERAGENT_RUNTIME_SURFACE_NODE_IDS)) {
      if (!requiredRuntimeSurfaceNodeIds.has(nodeId) || !renderedNodeIds.has(nodeId)) {
        throw new Error(`expected rendered SuperAgent runtime surface node ${nodeId}, got ${JSON.stringify(inspection.superAgentPipeline)}`)
      }
    }
    for (const nodeId of Object.values(AGENTICGRAPH_SUPERAGENT_SUBAGENT_NODE_IDS)) {
      if (!requiredSubagentNodeIds.has(nodeId) || !renderedNodeIds.has(nodeId)) {
        throw new Error(`expected rendered SuperAgent subagent node ${nodeId}, got ${JSON.stringify(inspection.superAgentPipeline)}`)
      }
    }
  }
}

export function testLocalMainPanelChatCanvasPipelineRejectsLegacyPaymentsEntryTab() {
  const inspection = inspectReadyPipeline('payments') as {
    pipelineReady?: unknown
    readiness?: { routeReady?: unknown; commerceReady?: unknown }
    route?: { activeMainPanelTab?: unknown }
    issues?: string[]
  }
  if (inspection.route?.activeMainPanelTab !== 'payments') {
    throw new Error(`expected legacy active tab to remain visible to inspection instead of being remapped, got ${JSON.stringify(inspection.route)}`)
  }
  if (inspection.pipelineReady === true || inspection.readiness?.routeReady === true) {
    throw new Error(`expected legacy payments tab to be rejected as an agent-ready entry point, got ${JSON.stringify(inspection)}`)
  }
  if (inspection.readiness?.commerceReady !== true) {
    throw new Error(`expected Commerce readiness to stay independently available while rejecting legacy tab, got ${JSON.stringify(inspection.readiness)}`)
  }
  if (!inspection.issues?.includes('MainPanel is mounted, but the active tab is not MCP, Integrations, or Commerce.')) {
    throw new Error(`expected a precise legacy tab issue without compatibility remapping, got ${JSON.stringify(inspection.issues)}`)
  }
}
