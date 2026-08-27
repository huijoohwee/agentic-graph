import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { appendChatHistoryWorkspaceFile } from '@/features/chat/chatHistoryWorkspace'
import { applyChatKgcWorkspaceDocumentToCanvas } from '@/features/chat/chatKgcCanvasApply'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { collectStructuredFrontmatterFields } from '@/features/chat/chatResponseStructuredFrontmatter'
import type { JSONValue } from '@/lib/graph/types'

const readNodeById = (graphData: NonNullable<ReturnType<typeof useGraphStore.getState>['graphData']>, id: string) => (
  (graphData.nodes || []).find(node => String(node.id || '') === id) || null
)

export async function testChatResponseStructuredContentProjectsFlowDiagramsToDynamicRichMediaPanels() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    canvas:',
      '      renderer: "2D Renderer: Storyboard"',
      '    flow_diagrams:',
      '      key: flow_diagrams',
      '      type: object',
      '      value:',
      '        gitgraph:',
      '          key: gitgraph',
      '          type: mermaid_gitgraph',
      '          title: Neutral Chat GitGraph',
      '          render_on: [flow_editor, storyboard]',
      '          value: |-',
      '            gitGraph',
      '              commit id:"intake"',
      '              branch parallel_lane',
      '              checkout parallel_lane',
      '              commit id:"panel_compute"',
      '              checkout main',
      '              merge parallel_lane',
      '        gantt:',
      '          key: gantt',
      '          type: mermaid_gantt',
      '          title: Neutral Chat Gantt',
      '          render_on: [flow_editor, timeline_view]',
      '          value: |-',
      '            gantt',
      '              title neutral chat diagram flow',
      '              dateFormat YYYY-MM-DD',
      '              section Intake',
      '              Intake :done, intake, 2026-06-05, 1d',
      '              section Critical path',
      '              Panel compute :crit, panel_compute, after intake, 1d',
      '    cards:',
      '      - id: diagram-source-card',
      '        label: Diagram Source Card',
      '        kind: text',
      '        output: "Structured response carries diagram frontmatter as data."',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T071000Z/kgc_20260605T071000Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 7, 10, 0),
      providerSummary: 'structured flow diagrams test',
      userText: 'Render GitGraph and Gantt from neutral structured frontmatter.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-flow-diagrams',
      title: 'Structured Flow Diagrams',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of [
      'flow_diagrams:',
      'type: mermaid_gitgraph',
      'type: mermaid_gantt',
      'Neutral Chat GitGraph',
      'Neutral Chat Gantt',
    ]) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected canonical KGC file to include ${snippet}`)
    }
    if (/flow_diagrams:\s*["']\{/.test(canonicalText)) {
      throw new Error('Expected flow_diagrams to be projected as a YAML object, not a quoted JSON scalar')
    }

    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected structured flow diagrams response to apply to canvas graph')
    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected active canvas graph to be frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const frontmatterMeta = (graphData.metadata || {}).frontmatterMeta as Record<string, unknown> | undefined
    if (!frontmatterMeta?.flow_diagrams) throw new Error('Expected source frontmatterMeta to preserve flow_diagrams')

    const expectedNodes = [
      ['flow-diagram-gitgraph-source', 'FlowDiagramSource'],
      ['flow-diagram-gitgraph-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
      ['flow-diagram-gitgraph-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
      ['flow-diagram-gantt-source', 'FlowDiagramSource'],
      ['flow-diagram-gantt-compute', FLOW_TEXT_GENERATION_NODE_TYPE_ID],
      ['flow-diagram-gantt-panel', FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID],
    ] as const
    for (const [id, type] of expectedNodes) {
      const node = readNodeById(graphData, id)
      if (!node) throw new Error(`Expected derived diagram node ${id}`)
      if (String(node.type || '') !== type) throw new Error(`Expected ${id} type ${type}, got ${String(node.type || '')}`)
    }

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const connected = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set(['flow-diagram-gitgraph-panel', 'flow-diagram-gantt-panel']),
    })
    const gitgraphSrcDoc = connected.get('flow-diagram-gitgraph-panel')?.['properties.outputSrcDoc']
    const ganttSrcDoc = connected.get('flow-diagram-gantt-panel')?.['properties.outputSrcDoc']
    if (
      typeof gitgraphSrcDoc?.value !== 'string'
      || !gitgraphSrcDoc.value.includes('data-kg-flow-diagram-kind="gitgraph"')
      || !gitgraphSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
      || !gitgraphSrcDoc.value.includes('data-kg-mermaid-source="1"')
      || !gitgraphSrcDoc.value.includes('First-class terms')
      || !gitgraphSrcDoc.value.includes('parallel_lane')
      || !gitgraphSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-gitgraph-compute' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed GitGraph Rich Media output, got: ${JSON.stringify(gitgraphSrcDoc)}`)
    if (
      typeof ganttSrcDoc?.value !== 'string'
      || !ganttSrcDoc.value.includes('data-kg-flow-diagram-kind="gantt"')
      || !ganttSrcDoc.value.includes("data-kg-flow-diagram-chart='1'")
      || !ganttSrcDoc.value.includes('data-kg-mermaid-source="1"')
      || !ganttSrcDoc.value.includes('Critical path')
      || !ganttSrcDoc.value.includes('Panel compute')
      || !ganttSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-gantt-compute' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed Gantt Rich Media output, got: ${JSON.stringify(ganttSrcDoc)}`)

    const editedGraphData = {
      ...graphData,
      nodes: graphData.nodes.map(node => String(node.id || '') === 'flow-diagram-gitgraph-source'
        ? {
            ...node,
            properties: {
              ...(node.properties || {}),
              diagramSource: [
                'gitGraph',
                '  commit id:"intake"',
                '  branch revised_lane',
                '  checkout revised_lane',
                '  commit id:"revised_panel_compute"',
                '  checkout main',
                '  merge revised_lane',
              ].join('\n'),
            },
          }
        : node),
    }
    const recomputed = computeFlowConnectedValuesBySchemaPath({
      graphData: editedGraphData,
      registry,
      targetNodeIds: new Set(['flow-diagram-gitgraph-panel']),
    }).get('flow-diagram-gitgraph-panel')?.['properties.outputSrcDoc']?.value
    if (typeof recomputed !== 'string' || !recomputed.includes('revised_lane') || !recomputed.includes('revised_panel_compute')) {
      throw new Error(`Expected GitGraph Rich Media output to recompute from edited source, got: ${String(recomputed)}`)
    }
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}

export function testChatResponseStructuredContentFlowDiagramsRejectsAliasRemap() {
  const canonical: Record<string, JSONValue> = {}
  collectStructuredFrontmatterFields({
    flow_diagrams: {
      key: 'flow_diagrams',
      type: 'object',
      value: {
        work: {
          key: 'work',
          type: 'mermaid_gantt',
          value: 'gantt\n  title canonical',
        },
      },
    },
  }, canonical)
  if (!canonical.flow_diagrams) throw new Error('Expected canonical flow_diagrams to project into structured frontmatter')

  for (const aliasKey of ['diagrams', 'flowdiagrams']) {
    const out: Record<string, JSONValue> = {}
    collectStructuredFrontmatterFields({
      [aliasKey]: {
        key: 'flow_diagrams',
        type: 'object',
        value: {
          work: {
            key: 'work',
            type: 'mermaid_gantt',
            value: 'gantt\n  title alias',
          },
        },
      },
    }, out)
    if (out.flow_diagrams) {
      throw new Error(`Expected ${aliasKey} to stay unprojected instead of remapping to flow_diagrams`)
    }
  }
}

export async function testChatResponseStructuredContentProjectsExplicitFrontmatterMetadata() {
  const storage = new MemoryStorage()
  const { restore: restoreWindow } = initWindowHarness({ storage })
  const { restore: restoreDom } = initJsdomHarness()
  const originalFetch = globalThis.fetch
  try {
    resetWorkspaceFsForTests()
    useGraphStore.getState().clearGraphData()
    globalThis.fetch = (async () => ({ ok: true } as Response)) as typeof fetch

    const assistantText = [
      '```yaml',
      'response:',
      '  structuredContent:',
      '    frontmatter:',
      '      storytree_product: "strytree"',
      '      demo_status: "dev-source capability demo; no Prod or Cloudflare deploy claim"',
      '      deployed_api_claim: false',
      '      live_route_validation_required_before_claim: true',
      '      copyhardcode_forbid: true',
      '      validation_input_forbid_hardcode_in_repo: true',
      '      kgWorkflowManagerModeEnabled: "true"',
      '      kgStrybldrStoryboard: "true"',
      '      miromind_deep_research_demo:',
      '        schema_version: "agenticgraph-miromind-deep-research-strytree/v1"',
      '        provider_id: "miromind"',
      '        request_mode: "mcp-style structured response"',
      '      storytree_edge_flow_alignment:',
      '        edge_authority: "storytree.nodes[].parentNodeId plus candidateRuns[].parentNodeId"',
      '        graph_edges: ["rootBranch", "parent_node_id", "candidateRun", "candidateOption", "candidateScorecard"]',
      '        static_edge_backfill_forbid: true',
      '      nodes:',
      '        - id: forbidden-frontmatter-node',
      '      structured-content:',
      '        leak: "forbidden-structured-content"',
      '      rich-media:',
      '        leak: "forbidden-rich-media"',
      '      flow_diagrams:',
      '        key: flow_diagrams',
      '        type: object',
      '        value:',
      '          storytree_gitgraph:',
      '            key: storytree_gitgraph',
      '            type: mermaid_gitgraph',
      '            title: Strytree Research Branches',
      '            render_on: [flow_editor, strybldr]',
      '            value: |-',
      '              gitGraph',
      '                commit id:"brief"',
      '                branch miromind',
      '                checkout miromind',
      '                commit id:"research_synthesis"',
      '                checkout main',
      '                merge miromind',
      '          storytree_gantt:',
      '            key: storytree_gantt',
      '            type: mermaid_gantt',
      '            title: Strytree Capability Path',
      '            render_on: [flow_editor, timeline_view]',
      '            value: |-',
      '              gantt',
      '                title strytree capability path',
      '                dateFormat YYYY-MM-DD',
      '                section Research',
      '                Brief :done, brief, 2026-06-05, 1d',
      '                section Dataflow',
      '                Rich Media Compute :crit, rich_media_compute, after brief, 1d',
      '    canvas:',
      '      surfaceMode: "2D Mode"',
      '      renderMode: "2D Mode"',
      '      renderer: "2D Renderer: Storyboard"',
      '    cards:',
      '      - id: storytree-source-review',
      '        label: Lineage Intake Card',
      '        kind: text',
      '        parentNodeId: null',
      '        output: "Lineage intake keeps card parent data upstream."',
      '      - id: storytree-brief',
      '        label: Strytree Brief',
      '        kind: text',
      '        parentNodeId: storytree-source-review',
      '        output: "MiroMind-style deep research branches become editable structured data."',
      '    panels:',
      '      - id: storytree-panel',
      '        label: Storytree Rich Media Panel',
      '        kind: html',
      '```',
    ].join('\n')

    const workspacePath = await appendChatHistoryWorkspaceFile({
      requestedPath: '/chat-log/20260605T083000Z/kgc_20260605T083000Z.md',
      timestampMs: Date.UTC(2026, 5, 5, 8, 30, 0),
      providerSummary: 'structured explicit frontmatter metadata test',
      userText: 'Generate a MiroMind-inspired Strytree structured response with dynamic diagrams and Rich Media output.',
      assistantText,
      storageType: 'chatAgenticGraph',
      traceId: 'trace-structured-frontmatter-metadata',
      title: 'Structured Explicit Frontmatter Metadata',
    })

    const fs = await getWorkspaceFs()
    const canonicalText = await fs.readFileText(workspacePath)
    for (const snippet of [
      'storytree_product: "strytree"',
      'kgWorkflowManagerModeEnabled: true',
      'kgStrybldrStoryboard: true',
      'miromind_deep_research_demo:',
      'storytree_edge_flow_alignment:',
      'flow_diagrams:',
      'type: mermaid_gitgraph',
      'type: mermaid_gantt',
      'kgCanvas2dRenderer: "storyboard"',
      'parentNodeId: "storytree-source-review"',
      'mcp-response-storytree-source-review',
      'mcp-response-storytree-brief',
      'mcp-response-structured-compute',
      'mcp-response-storytree-panel',
    ]) {
      if (!canonicalText.includes(snippet)) throw new Error(`Expected canonical KGC file to include ${snippet}`)
    }
    for (const forbidden of [
      'forbidden-frontmatter-node',
      'forbidden-structured-content',
      'forbidden-rich-media',
    ]) {
      if (canonicalText.includes(forbidden)) throw new Error(`Expected graph-channel frontmatter record to stay unprojected: ${forbidden}`)
    }

    const applied = await applyChatKgcWorkspaceDocumentToCanvas(workspacePath)
    if (!applied) throw new Error('Expected explicit frontmatter metadata response to apply to canvas graph')
    const graphData = useGraphStore.getState().graphData
    if (!graphData || graphData.context !== 'frontmatter-flow') {
      throw new Error(`Expected active canvas graph to be frontmatter-flow, got: ${JSON.stringify(graphData?.metadata || null)}`)
    }
    const frontmatterMeta = (graphData.metadata || {}).frontmatterMeta as Record<string, unknown> | undefined
    if (frontmatterMeta?.storytree_product !== 'strytree') throw new Error(`Expected storytree_product metadata, got ${JSON.stringify(frontmatterMeta)}`)
    if (frontmatterMeta?.kgWorkflowManagerModeEnabled !== true) throw new Error(`Expected workflow-manager metadata to normalize to boolean true, got ${JSON.stringify(frontmatterMeta)}`)
    if (frontmatterMeta?.kgStrybldrStoryboard !== true) throw new Error(`Expected Strybldr storyboard metadata to normalize to boolean true, got ${JSON.stringify(frontmatterMeta)}`)
    const deepResearch = frontmatterMeta?.miromind_deep_research_demo as Record<string, unknown> | undefined
    if (deepResearch?.provider_id !== 'miromind' || deepResearch?.request_mode !== 'mcp-style structured response') {
      throw new Error(`Expected nested MiroMind metadata, got ${JSON.stringify(deepResearch || null)}`)
    }
    const edgeFlow = frontmatterMeta?.storytree_edge_flow_alignment as Record<string, unknown> | undefined
    if (edgeFlow?.static_edge_backfill_forbid !== true || !String(edgeFlow.edge_authority || '').includes('parentNodeId')) {
      throw new Error(`Expected storytree edge-flow metadata to preserve parent lineage authority, got ${JSON.stringify(edgeFlow || null)}`)
    }
    if (!frontmatterMeta?.flow_diagrams) throw new Error('Expected source frontmatterMeta to preserve explicit flow_diagrams metadata')

    for (const nodeId of [
      'flow-diagram-storytree_gitgraph-panel',
      'flow-diagram-storytree_gantt-panel',
      'mcp-response-storytree-source-review',
      'mcp-response-storytree-brief',
      'mcp-response-structured-compute',
      'mcp-response-storytree-panel',
    ]) {
      if (!readNodeById(graphData, nodeId)) throw new Error(`Expected derived/appended node ${nodeId}`)
    }
    const storytreeBrief = readNodeById(graphData, 'mcp-response-storytree-brief')
    if (storytreeBrief?.properties?.parentNodeId !== 'storytree-source-review') {
      throw new Error(`Expected structured card lineage to preserve parentNodeId, got ${JSON.stringify(storytreeBrief?.properties || null)}`)
    }

    const registry = Array.isArray(graphData.metadata?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
      ? graphData.metadata[FLOW_WIDGET_REGISTRY_METADATA_KEY] as never[]
      : []
    const connected = computeFlowConnectedValuesBySchemaPath({
      graphData,
      registry,
      targetNodeIds: new Set([
        'flow-diagram-storytree_gitgraph-panel',
        'flow-diagram-storytree_gantt-panel',
        'mcp-response-storytree-panel',
      ]),
    })
    const gitgraphSrcDoc = connected.get('flow-diagram-storytree_gitgraph-panel')?.['properties.outputSrcDoc']
    const ganttSrcDoc = connected.get('flow-diagram-storytree_gantt-panel')?.['properties.outputSrcDoc']
    const panelSrcDoc = connected.get('mcp-response-storytree-panel')?.['properties.outputSrcDoc']
    if (
      typeof gitgraphSrcDoc?.value !== 'string'
      || !gitgraphSrcDoc.value.includes('research_synthesis')
      || !gitgraphSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-storytree_gitgraph-compute' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed Strytree GitGraph Rich Media output, got: ${JSON.stringify(gitgraphSrcDoc)}`)
    if (
      typeof ganttSrcDoc?.value !== 'string'
      || !ganttSrcDoc.value.includes('Rich Media Compute')
      || !ganttSrcDoc.sources.some(source => source.nodeId === 'flow-diagram-storytree_gantt-compute' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed Strytree Gantt Rich Media output, got: ${JSON.stringify(ganttSrcDoc)}`)
    if (
      typeof panelSrcDoc?.value !== 'string'
      || !panelSrcDoc.value.includes('Lineage intake keeps card parent data upstream.')
      || !panelSrcDoc.sources.some(source => source.nodeId === 'mcp-response-structured-compute' && source.portKey === 'outputSrcDoc')
    ) throw new Error(`Expected computed structured Rich Media output, got: ${JSON.stringify(panelSrcDoc)}`)
  } finally {
    useGraphStore.getState().clearGraphData()
    resetWorkspaceFsForTests()
    globalThis.fetch = originalFetch
    restoreDom()
    restoreWindow()
  }
}
