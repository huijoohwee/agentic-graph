import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { findAgenticOsInvocationByToken } from '@/features/agentic-os/agenticOsDocInvocations'
import { StoryboardCardInvocationChips } from '@/components/StoryboardWidgetCanvas/StoryboardCardInvocationChips'
import { createStoryboardWidgetWorkflowRichMediaPublishers } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPublication'
import { WORKFLOW_OUTPUT_EDGE_MODE_MANUAL, WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRichMediaPanel'
import { recoverStaleTextWidgetOutputsFromArtifacts } from '@/components/StoryboardWidgetCanvas/runtime/useTextWidgetOutputArtifactRecovery'
import { buildAgenticOsRuntimeInvocationSystemPrompt } from '@/features/chat/chatRuntimeInvocationProfile'
import { resolveChatRuntimeInvocationQuery } from '@/features/chat/chatRuntimeInvocationQuery'
import { extractChatResponseStructuredSurface } from '@/features/chat/chatResponseStructuredContent'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { buildProbeTreeCardFromGraphNode, materializeProbeTreeBranchCards, materializeProbeTreeBranchCardsFromGraphNode } from '@/components/StoryboardCanvas/storyboardProbeTreeInvocationAction'
import { materializeStoryboardWidgetProbeTreeInvocation, readStoryboardWidgetProbeTreeInvocationText, resolveStoryboardWidgetProbeTreeInvocationToken, runStoryboardWidgetProbeTreeInvocation } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowProbeTreeRun'
import { AGENTIC_OS_PROBE_TREE_INVOCATION_TOKENS } from '@/features/agentic-os/probeTreePromptPreset'
import type { GraphData } from '@/lib/graph/types'

export function testAgenticGraphProbeTreeInvocationGrammarUsesDocAliasesAndToolIdentity() {
  for (const token of ['/agentic-graph.probe-tree', '#agentic-graph.probe-tree', '@agentic-graph.probe-tree']) {
    const invocation = findAgenticOsInvocationByToken(token)
    if (!invocation || invocation.kind !== 'doc' || invocation.token !== token || invocation.label !== 'agentic-graph Probe-Tree') {
      throw new Error(`expected Probe-Tree alias ${token} to resolve through the document catalog, got ${JSON.stringify(invocation)}`)
    }
    const route = resolveChatRuntimeInvocationQuery(`${token} generate bounded branch choices`)
    if (route.leadingRoute?.kind !== 'agentic-os' || route.leadingRoute.token !== token || route.query !== 'generate bounded branch choices') {
      throw new Error(`expected Probe-Tree alias ${token} to resolve as the leading route, got ${JSON.stringify(route)}`)
    }
    const aliasPrompt = buildAgenticOsRuntimeInvocationSystemPrompt(`${token} generate bounded branch choices`)
    if (!aliasPrompt.includes(`Directives: ${token}`) || !aliasPrompt.includes('agentic-graph Probe-Tree')) {
      throw new Error(`expected Probe-Tree alias ${token} to contribute runtime context, got ${aliasPrompt}`)
    }
  }

  const runtimePrompt = buildAgenticOsRuntimeInvocationSystemPrompt('agentic-graph.probe.generate Generate branch choices for card care_source.')
  for (const expected of ['response.structuredContent.cards', 'agentic-graph.probe.generate', 'agentic-graph.probe.select', 'candidateOption']) {
    if (!runtimePrompt.includes(expected)) throw new Error(`expected Probe-Tree runtime prompt to include ${expected}`)
  }

  const surface = extractChatResponseStructuredSurface([
    'Probe-Tree branches:',
    '```yaml',
    'response:',
    '  structuredContent:',
    '    cards:',
    '      - id: care-source-safety',
    '        label: Safety boundary',
    '        kind: text',
    '        parentNodeId: care_source',
    '        candidateOptionId: ask-safety',
    '        question: "Any severe, worsening, or urgent symptoms?"',
    '        rationale: Clarifies urgent risk before downstream planning.',
    '        evidenceNeeded: Current symptom severity and trajectory.',
    '        selectionMode: multiple',
    '        probeTreeCardVariant: probe-tree-type-2',
    '        selectionOptions: [{ id: severe-symptoms, label: severe symptoms }, { id: worsening-symptoms, label: worsening symptoms }]',
    '        contextAnchors: [severe symptoms, worsening symptoms]',
    '        allowOther: true',
    '        nextAction: agentic-graph.probe.select',
    '        output: ""',
    '```',
  ].join('\n'))
  const node = surface?.nodes[0]
  if (node?.properties['chat:structuredRole'] !== 'card' || node.properties.parentNodeId !== 'care_source' || node.properties.nextAction !== 'agentic-graph.probe.select' || node.properties.summary !== 'Any severe, worsening, or urgent symptoms?' || node.properties.output !== '') {
    throw new Error(`expected Probe-Tree structured response cards to project as selectable card nodes, got ${JSON.stringify(surface)}`)
  }
  const candidateEdge = surface?.edges.find(edge => (
    edge.source === 'care_source'
    && edge.target === node?.id
    && edge.label === 'candidateOption'
  ))
  if (!candidateEdge) {
    throw new Error(`expected Probe-Tree structured response cards to infer a candidateOption edge from parentNodeId, got ${JSON.stringify(surface?.edges || [])}`)
  }

  const docMarkdown = readFileSync(resolve(process.cwd(), '..', 'docs', 'documents', 'agentic-graph-probe-tree-prd-tad.md'), 'utf8')
  const parsedDoc = tryParseMarkdownFrontmatterFlowGraph('agentic-graph-probe-tree-prd-tad.md', docMarkdown)
  const frontmatterMeta = (parsedDoc?.graphData.metadata || {}).frontmatterMeta as Record<string, unknown> | undefined
  if (!parsedDoc || frontmatterMeta?.kgCanvas2dRenderer !== 'storyboard' || frontmatterMeta?.kgCanvasRenderMode !== '2d') {
    throw new Error(`expected Probe-Tree PRD/TAD frontmatter to select 2D Renderer: Storyboard, got ${JSON.stringify(frontmatterMeta)}`)
  }
  const parsedIds = new Set((parsedDoc.graphData.nodes || []).map(parsedNode => String(parsedNode.id || '')))
  for (const expected of ['probe_root', 'probe_options', 'probe_selected', 'probe_terminal', 'probe_memory']) {
    if (!parsedIds.has(expected)) throw new Error(`expected PRD/TAD Mermaid seed to parse node ${expected}, got ${Array.from(parsedIds).join(',')}`)
  }
  if (!parsedDoc.graphData.edges.some(edge => edge.source === 'probe_options' && edge.target === 'probe_selected' && edge.label === 'probe.select')) {
    throw new Error(`expected PRD/TAD Mermaid seed to parse probe.select edge, got ${JSON.stringify(parsedDoc.graphData.edges)}`)
  }

  const propsPanelText = readFileSync(resolve(process.cwd(), 'src', 'features', 'toolbar', 'FloatingPropsPanel.tsx'), 'utf8')
  for (const expected of [
    'WidgetPalette',
    'data-kg-props-panel-surface="widget-palette"',
    'filter(isPropsPanelWidgetPaletteEntry)',
  ]) {
    if (!propsPanelText.includes(expected)) throw new Error(`expected Props Panel cleanup to retain palette-only snippet ${expected}`)
  }
  for (const staleSnippet of [
    'FloatingPropsPanelProbeTreeButton',
    'disabled={!canUseNodeContext}',
    'propsPanelProbeTree',
  ]) {
    if (propsPanelText.includes(staleSnippet)) throw new Error(`expected Props Panel cleanup to omit stale selected-card Probe-Tree snippet ${staleSnippet}`)
  }

  const propsPanelGraph: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'props_source',
      label: 'Props Panel Card',
      type: 'Card',
      x: 10,
      y: 20,
      properties: {
        summary: 'Clean-slate selected card context',
        action: 'Generate bounded next-step options',
        prompt: 'agentic-graph.probe.generate',
        lane: 'Storyboard',
        tags: ['runtime-ready', 'props-panel'],
      },
    }],
    edges: [],
  }
  const propsPanelNode = propsPanelGraph.nodes[0]
  const propsPanelCard = buildProbeTreeCardFromGraphNode(propsPanelNode)
  if (propsPanelCard.id !== 'props_source' || propsPanelCard.title !== 'Props Panel Card' || propsPanelCard.lane !== 'Storyboard') {
    throw new Error(`expected Props Panel graph node to adapt into a Storyboard card, got ${JSON.stringify(propsPanelCard)}`)
  }
  const propsPanelMaterialized = materializeProbeTreeBranchCardsFromGraphNode({ graphData: propsPanelGraph, node: propsPanelNode })
  if (
    propsPanelMaterialized.changed
    || propsPanelMaterialized.materializedNodeIds.length !== 0
    || propsPanelMaterialized.kind !== 'warning'
    || !propsPanelMaterialized.message.includes('does not create hardcoded preview branches')
    || propsPanelMaterialized.graphData !== propsPanelGraph
  ) {
    throw new Error(`expected the Props Panel Probe-Tree action to fail closed without model-backed branches, got ${JSON.stringify(propsPanelMaterialized)}`)
  }
}

export function testStoryboardProbeTreeInvocationChipDoesNotNavigateAwayFromCanvas() {
  const html = renderToStaticMarkup(React.createElement(StoryboardCardInvocationChips, {
    tokens: AGENTIC_OS_PROBE_TREE_INVOCATION_TOKENS,
  }))
  if (html.includes('<a') || html.includes('href=')) {
    throw new Error(`expected Storyboard Probe-Tree invocation metadata to stay non-navigating, got ${html}`)
  }
  if (!html.includes('data-kg-agentic-os-invocation-token="/agentic-graph.probe-tree"')) {
    throw new Error(`expected Storyboard Probe-Tree chip to retain the shared invocation token marker, got ${html}`)
  }
  if (!html.includes('agentic-graph-probe-tree-prd-tad.md')) {
    throw new Error(`expected non-navigating Storyboard Probe-Tree chip to retain source provenance in its title, got ${html}`)
  }
}

export function testTerminalTextPublicationKeepsStandalonePanelAtomic() {
  const sourceNode = {
    id: 'n1',
    type: 'TextGeneration',
    label: 'Widget Card',
    x: 100,
    y: 200,
    properties: {
      prompt: '/agentic-graph.probe-tree @agentic-graph.probe-tree #agentic-graph.probe-tree',
      output: '#',
      outputLoading: true,
      outputLoadingKind: 'text',
    },
  } as GraphData['nodes'][number]
  let draft: GraphData = { type: 'Graph', nodes: [sourceNode], edges: [] }
  let published: GraphData | null = null
  let publishedCommitCount = 0
  const resolveNode = (id: string) => draft.nodes.find(node => node.id === id) || null
  const context = {
    graphSemanticKey: 'probe-tree-text-publication',
    draftGraph: draft,
    renderGraph: draft,
    baseGraph: draft,
    storeGraph: draft,
    draftNodes: draft.nodes,
    renderNodes: draft.nodes,
    baseNodes: draft.nodes,
    storeNodes: draft.nodes,
    draftNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    renderNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    baseNodeById: new Map(draft.nodes.map(node => [node.id, node])),
    storeNodeById: new Map(draft.nodes.map(node => [node.id, node])),
  } as never
  const publishers = createStoryboardWidgetWorkflowRichMediaPublishers({
    context,
    graphForRun: draft,
    allowCreateRichMediaPanel: true,
    withRunLayoutMutationGuard: run => run(),
    scheduleWorkflowOutputEdgeRefresh: () => undefined,
    readLiveDraftGraphData: () => draft,
    appendDraftNode: () => { throw new Error('text publication must use the atomic graph transaction') },
    commitDraftGraphDataUpdate: (_current, next) => { draft = next },
    commitPublishedGraphData: next => {
      publishedCommitCount += 1
      draft = next
      published = {
        ...next,
        nodes: next.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}) } })),
        edges: next.edges.map(edge => ({ ...edge, properties: { ...(edge.properties || {}) } })),
      }
    },
    updateNode: (id, patch) => {
      draft = { ...draft, nodes: draft.nodes.map(node => node.id === id ? { ...node, ...patch } : node) }
    },
    appendWorkflowOutputEdge: edge => { draft = { ...draft, edges: [...draft.edges, edge] } },
    resolveNodeByIdAcrossGraphs: resolveNode,
  })

  publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: sourceNode,
    outputText: '#',
    title: 'Probe-Tree Branches',
    model: 'seed-1-8-251228',
    loading: true,
  })
  if (publishedCommitCount !== 0 || !draft.nodes.some(node => node.type === 'RichMediaPanel')) {
    throw new Error('expected streaming text to remain draft-only while materializing its output panel')
  }

  const terminalOutput = '# Probe-Tree Branches\n\n1. Safety boundary\n2. Evidence scope'
  draft = {
    ...draft,
    nodes: draft.nodes.map(node => node.id === sourceNode.id ? {
      ...node,
      properties: {
        ...(node.properties || {}),
        output: terminalOutput,
        outputPath: 'workspace:/docs/probe-tree-output.md',
        outputLoading: undefined,
        outputLoadingKind: undefined,
      },
    } : node),
  }
  const materializedProbeTreeGraph = materializeStoryboardWidgetProbeTreeInvocation({
    prompt: String(sourceNode.properties.prompt || ''),
    graphData: draft,
    node: draft.nodes.find(node => node.id === sourceNode.id),
  })?.graphData
  if (!materializedProbeTreeGraph) throw new Error('expected Probe-Tree branches before terminal Rich Media publication')
  publishers.publishTextRunOutputToRichMediaPanel({
    anchorNode: sourceNode,
    baseGraphData: materializedProbeTreeGraph,
    outputText: terminalOutput,
    title: 'Probe-Tree Branches',
    model: 'seed-1-8-251228',
    outputPath: 'workspace:/docs/probe-tree-output.md',
    loading: false,
  })

  const publishedGraph = published as GraphData | null
  const publishedSource = publishedGraph?.nodes.find(node => node.id === sourceNode.id)
  const publishedPanel = publishedGraph?.nodes.find(node => node.type === 'RichMediaPanel')
  const panelProperties = (publishedPanel?.properties || {}) as Record<string, unknown>
  if (
    Number(publishedCommitCount) !== 1
    || publishedSource?.properties.output !== terminalOutput
    || panelProperties.output !== terminalOutput
    || panelProperties.outputPath !== 'workspace:/docs/probe-tree-output.md'
    || panelProperties.outputLoading === true
    || panelProperties.outputLoadingKind === 'text'
    || publishedGraph?.nodes.some(node => node.type === 'TextGeneration' && node.properties.cardTypeLabel === 'Probe-Tree Card')
    || publishedGraph?.edges.some(edge => edge.source === sourceNode.id && edge.label === 'candidateOption')
    || publishedGraph?.edges.some(edge => edge.source === sourceNode.id && edge.target === publishedPanel?.id)
    || panelProperties[WORKFLOW_OUTPUT_EDGE_MODE_PROPERTY] !== WORKFLOW_OUTPUT_EDGE_MODE_MANUAL
  ) {
    throw new Error(`expected terminal Widget and standalone Rich Media Panel to publish atomically without an inferred edge, got ${JSON.stringify(publishedGraph)}`)
  }
}

export async function testStaleTextPublicationRecoversExistingWorkspaceArtifact() {
  const nowMs = Date.parse('2026-07-16T05:10:00.000Z')
  const cell = (key: string, type: string, value: unknown) => ({ key, type, value })
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: cell('id', 'string', 'n1'), type: cell('type', 'string', 'TextGeneration'), label: cell('label', 'string', 'Widget Card'), properties: {
          prompt: 'Generate a text response for the active request.',
          output: '#',
          outputLoading: cell('outputLoading', 'boolean', true),
          outputLoadingKind: cell('outputLoadingKind', 'string', 'text'),
          outputModel: cell('outputModel', 'string', 'seed-1-8-251228'),
          lastRunAt: cell('lastRunAt', 'string', '2026-07-16T05:00:00.000Z'),
        },
      } as never,
      {
        id: cell('id', 'string', 'n2'), type: cell('type', 'string', 'RichMediaPanel'), label: cell('label', 'string', 'Rich Media Panel'), properties: {
          media_interactive: true,
          workflowOutputAnchorNodeId: cell('workflowOutputAnchorNodeId', 'string', 'n1'),
          workflowOutputKey: cell('workflowOutputKey', 'string', 'output'),
        },
      } as never,
    ],
    edges: [{
      id: 'n1-output-n2',
      source: 'n1',
      target: 'n2',
      label: 'output',
      properties: {},
    }],
  }
  const artifactOutput = '# Recovered output\n\nThe completed workspace artifact is authoritative.'
  const recovered = await recoverStaleTextWidgetOutputsFromArtifacts({
    graphData,
    documentName: 'workspace:/docs/note_20260716T045859Z.md',
    nowMs,
    fs: {
      ensureSeed: async () => undefined,
      listEntries: async () => [{ path: '/docs/note_20260716t045859z-widget-card-text-output.md', parentPath: '/docs', kind: 'file', name: 'note_20260716t045859z-widget-card-text-output.md', updatedAtMs: nowMs }],
      readFileText: async path => String(path) === '/docs/note_20260716t045859z-widget-card-text-output.md' ? artifactOutput : null,
    } as never,
  })
  const sourceProperties = (recovered?.nodes[0]?.properties || {}) as Record<string, unknown>
  const panelProperties = (recovered?.nodes[1]?.properties || {}) as Record<string, unknown>
  if (
    !recovered
    || sourceProperties.output !== artifactOutput
    || panelProperties.output !== artifactOutput
    || sourceProperties.outputLoading === true
    || panelProperties.outputLoading === true
    || panelProperties.richMediaActiveTab !== 'text'
    || !String(panelProperties.outputPath || '').endsWith('note_20260716t045859z-widget-card-text-output.md')
  ) {
    throw new Error(`expected stale Widget and Rich Media output to recover from the existing artifact, got ${JSON.stringify(recovered)}`)
  }

  const projectedGraphData = structuredClone(graphData)
  delete (projectedGraphData.nodes[0].properties as Record<string, unknown>).lastRunAt
  const recoveredProjectedGraph = await recoverStaleTextWidgetOutputsFromArtifacts({
    graphData: projectedGraphData,
    documentName: 'note_20260716T045859Z.md',
    nowMs,
    fs: {
      ensureSeed: async () => undefined,
      listEntries: async () => [{ path: '/docs/note_20260716t045859z-widget-card-text-output.md', parentPath: '/docs', kind: 'file', name: 'note_20260716t045859z-widget-card-text-output.md', updatedAtMs: nowMs - (10 * 60 * 1000) }],
      readFileText: async path => String(path) === '/docs/note_20260716t045859z-widget-card-text-output.md' ? artifactOutput : null,
    } as never,
  })
  if ((recoveredProjectedGraph?.nodes[1]?.properties as Record<string, unknown>)?.output !== artifactOutput) {
    throw new Error(`expected a projected pending node without lastRunAt to recover only from a stale matching artifact, got ${JSON.stringify(recoveredProjectedGraph)}`)
  }
}

export function testStoryboardWidgetRunMaterializesEmbeddedProbeTreeInvocation() {
  const prompt = [
    '/sme-care-agent @source.frontmatter @source.body',
    '/agentic-graph.probe-tree',
    'Assess the active SME workspace sources.',
  ].join('\n')
  if (resolveStoryboardWidgetProbeTreeInvocationToken(prompt) !== '/agentic-graph.probe-tree') {
    throw new Error('expected Widget Card execution to resolve an embedded Probe-Tree directive after another leading route')
  }
  for (const alias of ['#agentic-graph.probe-tree', '@agentic-graph.probe-tree']) {
    if (resolveStoryboardWidgetProbeTreeInvocationToken(`Prepare branches ${alias} now`) !== alias) {
      throw new Error(`expected Widget Card execution to resolve Probe-Tree alias ${alias}`)
    }
  }

  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'n1',
      type: 'TextGeneration',
      label: 'Widget Card',
      x: 100,
      y: 200,
      properties: { prompt },
    }],
    edges: [],
  }

  const summaryOnlyGraphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'summary-only',
      type: 'TextGeneration',
      label: 'Widget Card',
      properties: {
        key: 'properties',
        type: 'object',
        value: {
          summary: { key: 'summary', type: 'string', value: prompt },
          prompt: { key: 'prompt', type: 'string', value: '' },
        },
      },
    } as never],
    edges: [],
  }
  const summaryOnlyNode = summaryOnlyGraphData.nodes[0]
  const summaryInvocationText = readStoryboardWidgetProbeTreeInvocationText(summaryOnlyNode)
  if (resolveStoryboardWidgetProbeTreeInvocationToken(summaryInvocationText) !== '/agentic-graph.probe-tree') {
    throw new Error(`expected Widget Card Run to resolve Probe-Tree from a typed Summary when prompt is empty, got ${summaryInvocationText}`)
  }
  let summaryOnlyCommit: GraphData | null = null
  const summaryOnlyRunResult = runStoryboardWidgetProbeTreeInvocation({
    graphForRun: summaryOnlyGraphData,
    nodeIds: ['summary-only'],
    fallbackNode: summaryOnlyNode,
    onMaterialized: () => undefined,
    publishOutput: output => { summaryOnlyCommit = output.baseGraphData || null; return summaryOnlyCommit },
  })
  if (
    summaryOnlyRunResult?.changed
    || summaryOnlyCommit !== null
    || summaryOnlyRunResult?.invocationToken !== '/agentic-graph.probe-tree'
    || !summaryOnlyRunResult?.message.includes('does not create hardcoded preview branches')
  ) {
    throw new Error(`expected summary-only typed Widget Card routing to refuse hardcoded preview cards, got ${JSON.stringify(summaryOnlyRunResult)}`)
  }
  const materialized = materializeStoryboardWidgetProbeTreeInvocation({
    prompt,
    graphData,
    node: graphData.nodes[0],
  })
  if (
    materialized?.changed
    || materialized?.invocationToken !== '/agentic-graph.probe-tree'
    || materialized?.materializedNodeIds.length !== 0
    || !materialized?.message.includes('does not create hardcoded preview branches')
  ) {
    throw new Error(`expected embedded Widget Card Probe-Tree routing to wait for a model-backed Run response, got ${JSON.stringify(materialized)}`)
  }

  let selectedNodeIds: readonly string[] = []
  let publishedOutput: Parameters<Parameters<typeof runStoryboardWidgetProbeTreeInvocation>[0]['publishOutput']>[0] | null = null
  const runResult = runStoryboardWidgetProbeTreeInvocation({
    graphForRun: graphData,
    nodeIds: ['n1'],
    fallbackNode: graphData.nodes[0],
    onMaterialized: nodeIds => { selectedNodeIds = nodeIds },
    publishOutput: output => { publishedOutput = output; return output.baseGraphData || null },
  })
  if (
    runResult?.changed
    || selectedNodeIds.length !== 0
    || publishedOutput !== null
    || !runResult?.message.includes('does not create hardcoded preview branches')
  ) throw new Error(`expected the legacy synchronous projection path to refuse branch synthesis before provider execution, got ${JSON.stringify({ runResult, selectedNodeIds, publishedOutput })}`)

  const depthLimitedGraph: GraphData = {
    type: 'Graph',
    nodes: [{ ...graphData.nodes[0], properties: { ...graphData.nodes[0].properties, probeTreeDepth: 8 } }],
    edges: [],
  }
  const depthLimited = materializeStoryboardWidgetProbeTreeInvocation({
    prompt,
    graphData: depthLimitedGraph,
    node: depthLimitedGraph.nodes[0],
  })
  if (depthLimited?.changed || depthLimited?.kind !== 'warning' || !depthLimited.message.includes('does not create hardcoded preview branches')) {
    throw new Error(`expected the reveal-only projection path to avoid synthesizing depth-limit response cards, got ${JSON.stringify(depthLimited)}`)
  }

  const runActionSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const probeTreeRunSource = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowProbeTreeRun.ts'), 'utf8')
  const textGenerationIndex = runActionSource.indexOf("FLOW_TEXT_GENERATION_NODE_TYPE_ID) {")
  const probeRunnerIndex = runActionSource.indexOf('const probeTreeOutput = await runStoryboardWidgetProbeTreeTextGenerationInvocation({')
  const probeDispatchIndex = runActionSource.indexOf('if (await runProbeTreeInvocation(textGeneration)) return', textGenerationIndex)
  const crawlerIndex = runActionSource.indexOf('runStoryboardWidgetNativeCrawlerInvocation({', probeDispatchIndex)
  const genericProviderIndex = runActionSource.indexOf('await runHeadlessTextGeneration(textGeneration', probeDispatchIndex)
  const providerFactoryIndex = probeTreeRunSource.indexOf('const generateProviderResponse = args.generateProviderResponse ||')
  const nativeProbeIndex = probeTreeRunSource.indexOf('const result = await runStoryboardWidgetProbeTreeMcpInvocation({')
  const providerForwardIndex = probeTreeRunSource.indexOf('generateProviderResponse,', nativeProbeIndex)
  const nativeProbeRunSource = probeTreeRunSource.slice(nativeProbeIndex, providerForwardIndex)
  if (
    textGenerationIndex < 0
    || probeDispatchIndex <= textGenerationIndex
    || probeRunnerIndex < 0
    || crawlerIndex <= probeDispatchIndex
    || genericProviderIndex <= probeDispatchIndex
    || providerFactoryIndex < 0
    || providerFactoryIndex >= nativeProbeIndex
    || nativeProbeIndex < 0
    || providerForwardIndex <= nativeProbeIndex
    || probeTreeRunSource.includes('providerRefinementApproved')
    || runActionSource.includes('materializeProbeTreeOutput')
    || runActionSource.includes('const probeTreeOutput = runStoryboardWidgetProbeTreeInvocation({')
    || !runActionSource.slice(probeRunnerIndex, textGenerationIndex).includes('publishOutput: publishTextRunOutputToRichMediaPanel')
    || !nativeProbeRunSource.includes('graphForRun: args.graphForRun')
    || !nativeProbeRunSource.includes('publishOutput: args.publishOutput')
    || nativeProbeRunSource.includes('commitGraphData:')
    || nativeProbeRunSource.includes('graphData: args.readDraftGraphData()')
  ) {
    throw new Error('expected Widget Card Probe-Tree handling to invoke the MCP-first structured runner inside the TextGeneration owner before generic provider publication')
  }
}

export function testProbeTreeToolbarAndSlashRunShareOneIdempotentBranchSet() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'n1',
      type: 'TextGeneration',
      label: 'Widget Card',
      x: 100,
      y: 200,
      properties: {
        prompt: [
          '/sme-care-agent @source.frontmatter @source.body',
          '/agentic-graph.probe-tree',
          'Generate bounded branches from this Widget Card.',
        ].join('\n'),
      },
    }],
    edges: [],
  }
  const sourceNode = graphData.nodes[0]
  const toolbarFirst = materializeProbeTreeBranchCards({
    graphData,
    card: buildProbeTreeCardFromGraphNode(sourceNode),
  })
  if (
    toolbarFirst.changed
    || toolbarFirst.materializedNodeIds.length !== 0
    || !toolbarFirst.message.includes('does not create hardcoded preview branches')
  ) {
    throw new Error(`expected the bubble-toolbar action to refuse an initial hardcoded branch set, got ${JSON.stringify(toolbarFirst)}`)
  }
  let emptyRunPublished = false
  const emptyRun = runStoryboardWidgetProbeTreeInvocation({
    graphForRun: graphData,
    nodeIds: ['n1'],
    fallbackNode: sourceNode,
    onMaterialized: () => undefined,
    publishOutput: output => { emptyRunPublished = true; return output.baseGraphData || null },
  })
  if (
    emptyRun?.changed
    || emptyRunPublished
    || emptyRun?.materializedNodeIds.length !== 0
    || !emptyRun?.message.includes('does not create hardcoded preview branches')
  ) {
    throw new Error(`expected the legacy synchronous Run projection to refuse hardcoded branches, got ${JSON.stringify(emptyRun)}`)
  }

  const acceptedGraph: GraphData = {
    ...graphData,
    nodes: [
      ...graphData.nodes,
      { id: 'model-card-1', type: 'TextGeneration', label: 'Which market horizon should the China comparison use?', properties: { cardTypeLabel: 'Probe-Tree Card', probeTreeResponseMode: 'llm-contract', parentNodeId: 'n1', parentGraphNodeId: 'n1', summary: 'Which market horizon should the China comparison use?' } },
      { id: 'model-card-2', type: 'TextGeneration', label: 'Which SE Asia economies should the comparison include?', properties: { cardTypeLabel: 'Probe-Tree Card', probeTreeResponseMode: 'llm-contract', parentNodeId: 'n1', parentGraphNodeId: 'n1', summary: 'Which SE Asia economies should the comparison include?' } },
    ],
    edges: [
      { id: 'model-edge-1', source: 'n1', target: 'model-card-1', label: 'candidateOption', properties: {} },
      { id: 'model-edge-2', source: 'n1', target: 'model-card-2', label: 'candidateOption', properties: {} },
    ],
  }
  const toolbarAfterModel = materializeProbeTreeBranchCards({
    graphData: acceptedGraph,
    card: buildProbeTreeCardFromGraphNode(sourceNode),
  })
  if (
    toolbarAfterModel.changed
    || toolbarAfterModel.kind !== 'neutral'
    || toolbarAfterModel.materializedNodeIds.join(',') !== 'model-card-1,model-card-2'
  ) {
    throw new Error(`expected the bubble toolbar to reveal only accepted model-backed cards, got ${JSON.stringify(toolbarAfterModel)}`)
  }

  let selectedNodeIds: readonly string[] = []
  let projectedGraph: GraphData | null = null
  const projected = runStoryboardWidgetProbeTreeInvocation({
    graphForRun: acceptedGraph,
    nodeIds: ['n1'],
    fallbackNode: sourceNode,
    onMaterialized: ids => { selectedNodeIds = ids },
    publishOutput: output => { projectedGraph = output.baseGraphData || null; return projectedGraph },
  })
  if (
    projected?.changed
    || !projectedGraph
    || selectedNodeIds.join(',') !== 'model-card-1,model-card-2'
  ) {
    throw new Error(`expected synchronous projection to publish only pre-accepted branches, got ${JSON.stringify({ projected, selectedNodeIds })}`)
  }
}
