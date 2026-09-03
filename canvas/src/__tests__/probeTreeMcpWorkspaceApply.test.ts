import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import {
  buildProbeTreeStructuredResponse,
  PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
} from '@/features/agent-ready/probeTreeContract.mjs'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { applyChatAgenticOsWorkspaceDocumentToCanvas } from '@/features/chat/chatAgenticOsCanvasApply'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID, FLOW_TEXT_GENERATION_NODE_TYPE_ID } from '@/lib/config.storyboard-widget'
import { deriveFrontmatterFlowOverlayNodeIds } from '@/lib/storyboardWidget/frontmatterOverlayNodeIds'
import { readStoryboardProbeTreeMultiSelectModel } from '@/components/StoryboardCanvas/storyboardProbeTreeMultiSelectModel'

export async function testProbeTreeLiteralMcpResultAppliesVisibleWidgetCardPanelTree() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  let unsubscribeExplorerReset = () => void 0
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const contextText = [
      'Authored request:',
      'Compare member risk tier across CRM authority, claims freshness, policy status, and care-plan sources.',
      'Prioritize source authority, freshness window, handoff owner, and care-plan status.',
      'Review member evidence across claims values, coverage tier, care-plan owner, and current status.',
      'Selected Widget id: care-source',
    ].join('\n')
    const options = [
      {
        id: 'source-authority',
        text: 'Which CRM or claims source should determine member risk tier?',
        rationale: 'Clarifies the authored member risk source question.',
        evidenceNeeded: 'User-selected member risk source.',
        selectionOptions: ['Prefer verified CRM system authority', 'Require recently refreshed claims evidence'],
        contextAnchors: ['member risk tier', 'CRM authority', 'claims freshness'],
      },
      {
        id: 'freshness-window',
        text: 'Which policy or care-plan status should guide the member review?',
        rationale: 'Clarifies the authored member status question.',
        evidenceNeeded: 'User-selected member status.',
        selectionOptions: ['Prioritize currently effective policy status', 'Require confirmed care-plan status'],
        contextAnchors: ['policy status', 'care-plan status', 'member'],
      },
      {
        id: 'handoff-owner',
        text: 'Which source authority or handoff owner should guide the next review?',
        rationale: 'Clarifies the authored source and handoff ownership question.',
        evidenceNeeded: 'User-selected review owner.',
        selectionOptions: ['Require documented source authority', 'Assign named handoff owner accountability'],
        contextAnchors: ['source authority', 'handoff owner', 'Review member evidence'],
      },
    ]
    const response = buildProbeTreeStructuredResponse({
      threadRootId: 'care-agent',
      currentNodeId: 'care-source',
      contextText,
      optionCount: 3,
      options,
    })
    const assistantText = JSON.stringify({
      jsonrpc: '2.0',
      id: 'probe-tree-generate',
      result: {
        content: [{ type: 'text', text: 'Canvas-ready Probe-Tree MCP result.' }],
        structuredContent: {
          contractVersion: 'agentic-graph-probe-tree/v0.1',
          ok: true,
          response,
          cost_log: { model: 'qwen-local', prompt_tokens: 24, completion_tokens: 18, cache_hits: 0, estimated_cost_usd: 0 },
        },
      },
    }, null, 2)

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260716T120000Z/agenticOs_20260716T120000Z.md',
      timestampMs: Date.UTC(2026, 6, 16, 12, 0, 0),
      providerSummary: 'agentic-graph MCP · Probe-Tree',
      userText: '/agentic-graph.probe-tree @agentic-graph.probe-tree #agentic-graph.probe-tree',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-probe-tree-mcp-apply',
      title: 'Knowledge Graph Canvas Storage',
      structuredResponseSource: 'literal-mcp',
    })
    const canonicalText = await (await getWorkspaceFs()).readFileText(workspacePath)
    for (const token of [
      'mcp-response-care-source',
      'mcp-response-source-authority',
      'mcp-response-freshness-window',
      'mcp-response-handoff-owner',
      'mcp-response-probe-tree-branches-care-source',
      PROBE_TREE_LLM_RESPONSE_CONTRACT_VERSION,
    ]) {
      if (!canonicalText.includes(token)) throw new Error(`expected canonical AGENTIC_OS to contain ${token}`)
    }

    const originalActivePath = '/authored-source.md'
    useMarkdownExplorerStore.getState().setActivePath(originalActivePath)
    let simulatedConcurrentSelection = false
    unsubscribeExplorerReset = useMarkdownExplorerStore.subscribe(state => {
      if (state.activePath !== workspacePath || simulatedConcurrentSelection) return
      simulatedConcurrentSelection = true
      queueMicrotask(() => {
        if (useMarkdownExplorerStore.getState().activePath === workspacePath) {
          useMarkdownExplorerStore.getState().setActivePath(originalActivePath)
        }
      })
    })
    if (await applyChatAgenticOsWorkspaceDocumentToCanvas(workspacePath)) {
      throw new Error('expected Chat AGENTIC_OS apply to abort when Explorer ownership changes concurrently')
    }
    if (!simulatedConcurrentSelection || useMarkdownExplorerStore.getState().activePath !== originalActivePath) {
      throw new Error('expected Chat AGENTIC_OS apply to preserve a concurrent Explorer selection')
    }
    unsubscribeExplorerReset()
    unsubscribeExplorerReset = () => void 0
    if (!await applyChatAgenticOsWorkspaceDocumentToCanvas(workspacePath)) {
      throw new Error('expected the Probe-Tree MCP AGENTIC_OS to apply to the active Canvas')
    }
    if (useMarkdownExplorerStore.getState().activePath !== workspacePath) {
      throw new Error('expected Chat AGENTIC_OS apply to activate the generated workspace path')
    }
    const graphData = useGraphStore.getState().graphData
    const source = graphData?.nodes.find(node => node.id === 'mcp-response-care-source')
    const panel = graphData?.nodes.find(node => node.id === 'mcp-response-probe-tree-branches-care-source')
    const cards = (graphData?.nodes || []).filter(node => node.properties?.cardTypeLabel === 'Probe-Tree Card')
    const candidateEdges = (graphData?.edges || []).filter(edge => edge.label === 'candidateOption')
    if (
      source?.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || panel?.type !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      || !String(panel.properties?.output || '').includes('# Probe-Tree Branches')
      || cards.length !== 3
      || cards.map(card => card.properties?.index).join(',') !== 'P1,P2,P3'
      || cards.some(card => card.type !== FLOW_TEXT_GENERATION_NODE_TYPE_ID || card.properties?.parentNodeId !== 'care-source')
      || cards.some(card => card.properties?.output !== '' || !card.properties?.summary)
      || candidateEdges.length !== 3
      || candidateEdges.some(edge => edge.source !== source.id || !cards.some(card => card.id === edge.target))
    ) {
      throw new Error(`expected one visible source Widget, three inferred candidate branches, and one Rich Media panel, got ${JSON.stringify(graphData)}`)
    }
    const multiSelectModels = cards.map(card => readStoryboardProbeTreeMultiSelectModel(card.properties || {}))
    if (
      multiSelectModels.some(model => !model || model.options.length < 2)
      || multiSelectModels.flatMap(model => model?.options.map(option => option.label) || []).join('|')
        !== options.flatMap(option => option.selectionOptions).join('|')
    ) {
      throw new Error(`expected applied Probe-Tree cards to retain renderable multi-select options, got ${JSON.stringify(multiSelectModels)}`)
    }
    const overlayIds = new Set(deriveFrontmatterFlowOverlayNodeIds(graphData!))
    for (const node of [source, ...cards, panel]) {
      if (!node || !overlayIds.has(String(node.id))) throw new Error(`expected ${String(node?.id || 'missing node')} on the visible overlay tree`)
    }
  } finally {
    unsubscribeExplorerReset()
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
