import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildStoryboardWidgetInlineComputeOutputPatch,
  resolveStoryboardWidgetWorkflowConnectedValuesInput,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowRunInputs'
import { buildStoryboardWidgetSourceBackedRunOutput } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetSourceBackedRunOutput'
import {
  isStoryboardWidgetWorkflowRunnableNode,
  readFlowWidgetCardRunDownstreamTargetIds,
  resolveStoryboardWidgetWorkflowDownstreamRunTargetIds,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowDownstreamRunTargets'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { isUnsafeFlowComputeSource, readFlowComputeSource } from '@/lib/storyboardWidget/flowComputeInline'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { buildFlowRunAllNodeSequence } from '@/lib/storyboardWidget/runAllSequenceSsot'
import { buildFlowWidgetEligibleNodeIdSet } from '@/lib/graph/flowWidgetEligibility'
import type { GraphData, GraphNode } from '@/lib/graph/types'

export function testStoryboardWidgetCanvasRunsFlowComputeBeforeProviderTextBranch() {
  const workflowActionsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunAction.ts'), 'utf8')
  const workflowRunInputsText = readFileSync(resolve(process.cwd(), 'src', 'components', 'StoryboardWidgetCanvas', 'runtime', 'storyboardWidgetWorkflowRunInputs.ts'), 'utf8')
  const requiredRunInputs = [
    'export function buildStoryboardWidgetInlineComputeOutputPatch(args: {',
    "if (!args.node || !readFlowComputeSource(args.node)) return null",
    "const isComputedDataOutput = outputSchemaPaths.size === 0 && schemaPath.startsWith('properties.data.')",
    "const materializedPath = materializeInlineComputeOutputSchemaPath({ schemaPath, outputSchemaPaths })",
  ]
  for (const snippet of requiredRunInputs) {
    if (!workflowRunInputsText.includes(snippet)) throw new Error(`expected StoryboardWidget workflow run-input helper to include ${snippet}`)
  }
  const inlineComputeIndex = workflowActionsText.indexOf('if (readFlowComputeSource(node))')
  const providerTextIndex = workflowActionsText.indexOf('if (nodeType === FLOW_TEXT_GENERATION_NODE_TYPE_ID)')
  if (inlineComputeIndex < 0 || providerTextIndex < 0 || inlineComputeIndex > providerTextIndex) {
    throw new Error('expected StoryboardWidget workflow run path to execute authored inline compute before provider TextGeneration runs')
  }
  for (const snippet of [
    'const nextInlinePatch = buildStoryboardWidgetInlineComputeOutputPatch({',
    'updateRunOutputForKnownNodeIds(nodeProps => buildStoryboardWidgetInlineComputeOutputPatch({',
    "message: 'Ran inline compute.'",
    'resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({',
    'await runWorkflowNode(targetId, {',
    '...runOptions, allowCreateRichMediaPanel, suppressLayoutMutation, visitedNodeIds,',
    'publishStoryboardWidgetSourceBackedRunOutput({ id, node',
  ]) {
    if (!workflowActionsText.includes(snippet)) throw new Error(`expected StoryboardWidget workflow run path to include ${snippet}`)
  }

  const sourceNode: GraphNode = {
    id: 'source_input',
    type: 'InputWidget',
    label: 'Source Input',
    properties: {
      'canvas:widgetCard': {
        key: 'canvas:widgetCard',
        type: 'object',
        value: {
          onEdit: { trigger: 'runDownstream', targets: ['compute_summary'] },
          actions: [
            { id: 'run', trigger: 'runDownstream', targets: ['compute_summary', 'compute_summary'] },
          ],
        },
      },
    } as never,
  } as GraphNode
  const computeNode: GraphNode = {
    id: 'compute_summary',
    type: 'ComputeWidget',
    label: 'Compute Summary',
    properties: { compute: { key: 'compute', type: 'string', value: 'inputs => ({ output: inputs.query })' } } as never,
  } as GraphNode
  const graphData: GraphData = {
    nodes: [sourceNode, computeNode],
    edges: [
      { id: 'source-to-compute', source: 'source_input', target: 'compute_summary', properties: {} },
    ],
  } as never
  const authoredTargetIds = readFlowWidgetCardRunDownstreamTargetIds(sourceNode)
  if (authoredTargetIds.join(',') !== 'compute_summary') {
    throw new Error('expected authored widget-card runDownstream targets to be deduped and reusable by the overlay Run action')
  }
  const downstreamTargetIds = resolveStoryboardWidgetWorkflowDownstreamRunTargetIds({ node: sourceNode, graphData })
  if (downstreamTargetIds.join(',') !== 'compute_summary') {
    throw new Error('expected overlay Run on source widgets to resolve authored downstream compute targets')
  }
  if (!isStoryboardWidgetWorkflowRunnableNode({ node: computeNode })) {
    throw new Error('expected downstream typed compute node to be treated as runnable')
  }
  const runAllPlan = buildFlowRunAllNodeSequence({
    graphData,
    eligibleNodeIds: new Set(['source_input', 'compute_summary']),
  })
  if (runAllPlan.orderedNodeIds.join(',') !== 'compute_summary' || runAllPlan.phaseCounts.text !== 1) {
    throw new Error(`expected Toolbar Run all to schedule typed compute nodes, got ${JSON.stringify(runAllPlan)}`)
  }
  const sourceBackedOutput = buildStoryboardWidgetSourceBackedRunOutput(sourceNode)
  for (const expected of ['# Source Input', 'Run-ready card output generated from the selected InputWidget node', 'canvas:widgetCard']) {
    if (!sourceBackedOutput.includes(expected)) {
      throw new Error(`expected source-backed card Run output to include ${expected}, got ${sourceBackedOutput}`)
    }
  }
  if (/<div\b/i.test(sourceBackedOutput)) throw new Error(`expected source-backed card Run output to avoid generic div markup, got ${sourceBackedOutput}`)

  const missAlphaPath = resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs', 'agentic-graph-missalph-demo.md')
  const missAlphaMarkdown = readFileSync(missAlphaPath, 'utf8')
  const missAlphaParsed = tryParseMarkdownFrontmatterFlowGraph('agentic-graph-missalph-demo.md', missAlphaMarkdown)
  if (!missAlphaParsed) throw new Error('expected MissAlpha demo to parse as a frontmatter flow graph')
  const missAlphaEligible = buildFlowWidgetEligibleNodeIdSet(missAlphaParsed.graphData.nodes)
  const missAlphaPlan = buildFlowRunAllNodeSequence({
    graphData: missAlphaParsed.graphData,
    eligibleNodeIds: missAlphaEligible,
  })
  const missAlphaComputeSummary = missAlphaParsed.graphData.nodes.find(node => String(node.id || '') === 'compute_summary')
  const missAlphaComputeSource = missAlphaComputeSummary ? readFlowComputeSource(missAlphaComputeSummary) : ''
  if (!missAlphaComputeSource || isUnsafeFlowComputeSource(missAlphaComputeSource)) {
    throw new Error(`expected MissAlpha compute_summary to retain a runnable inline compute source, got length ${missAlphaComputeSource.length}`)
  }
  if (!missAlphaPlan.orderedNodeIds.includes('compute_summary') || missAlphaPlan.phaseCounts.text !== 6) {
    throw new Error(`expected MissAlpha Toolbar Run all to schedule all six compute nodes, got ${JSON.stringify(missAlphaPlan)}`)
  }

  const computingTemplatePath = resolve(process.cwd(), '..', '..', 'huijoohwee', 'docs', 'agentic-graph-storyboard-widget-computing-flow-template.md')
  const computingTemplateMarkdown = readFileSync(computingTemplatePath, 'utf8')
  const computingTemplateParsed = tryParseMarkdownFrontmatterFlowGraph('agentic-graph-storyboard-widget-computing-flow-template.md', computingTemplateMarkdown)
  if (!computingTemplateParsed) throw new Error('expected computing-flow template to parse as a frontmatter flow graph')
  const computingTemplateComputeNode = computingTemplateParsed.graphData.nodes.find(node => String(node.id || '') === 'compute_summary') || null
  if (!computingTemplateComputeNode) throw new Error('expected computing-flow template to include compute_summary')
  const computingTemplateRunValues = computeFlowConnectedValuesBySchemaPath({
    graphData: computingTemplateParsed.graphData,
    registry: [],
    targetNodeIds: new Set(['compute_summary']),
    preserveMaterializedOutputs: false,
  }).get('compute_summary')
  const computingTemplatePatch = buildStoryboardWidgetInlineComputeOutputPatch({
    node: computingTemplateComputeNode,
    registryEntry: null,
    connectedValuesBySchemaPath: computingTemplateRunValues,
    currentProperties: computingTemplateComputeNode.properties || {},
  })
  const runSrcDoc = String(computingTemplatePatch?.outputSrcDoc || '')
  const computingTemplateSourceNode = computingTemplateParsed.graphData.nodes.find(node => String(node.id || '') === 'source_input') || null
  const expectedMetricTarget = Number((computingTemplateSourceNode?.properties || {}).input_metric_target)
  if (!Number.isFinite(expectedMetricTarget) || expectedMetricTarget <= 0) {
    throw new Error(`expected computing-flow template to keep a positive KTV input_metric_target, got ${String((computingTemplateSourceNode?.properties || {}).input_metric_target)}`)
  }
  if (!runSrcDoc.includes(`${expectedMetricTarget} target`)) {
    throw new Error(`expected widget Run to materialize recomputed outputSrcDoc from current KTV input_metric_target ${expectedMetricTarget}, got ${runSrcDoc}`)
  }

  const ktvComputeParsed = tryParseMarkdownFrontmatterFlowGraph('ktv-compute.md', [
    '---',
    'schema: "kgc-computing-flow/v1"',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: "source_input"}',
    '      type: {key: type, type: string, value: "InputWidget"}',
    '      label: {key: label, type: string, value: "Source Input"}',
    '      input_metric_target: {key: input_metric_target, type: number, value: 50}',
    '    - id: {key: id, type: string, value: "compute_summary"}',
    '      type: {key: type, type: string, value: "ComputeWidget"}',
    '      label: {key: label, type: string, value: "Compute Summary"}',
    '      compute:',
    '        key: compute',
    '        type: string',
    '        value: |',
    '          inputs => ({ outputSrcDoc: String(inputs.input_metric_target) + " target" })',
    '  edges:',
    '    - id: {key: id, type: string, value: "edge_metric"}',
    '      source: {key: source, type: string, value: "source_input"}',
    '      sourceHandle: {key: sourceHandle, type: string, value: "input_metric_target"}',
    '      target: {key: target, type: string, value: "compute_summary"}',
    '      targetHandle: {key: targetHandle, type: string, value: "input_metric_target"}',
    '      label: {key: label, type: string, value: "input_metric_target"}',
    '      type: {key: type, type: string, value: "template_number_signal"}',
    '---',
    '',
  ].join('\n'))
  const ktvComputeNode = ktvComputeParsed?.graphData.nodes.find(node => String(node.id || '') === 'compute_summary') || null
  if (!ktvComputeNode || readFlowComputeSource(ktvComputeNode) !== 'inputs => ({ outputSrcDoc: String(inputs.input_metric_target) + " target" })') {
    throw new Error('expected frontmatter KTV compute envelopes to materialize as runnable flow:compute source')
  }

  const staleRenderGraph: GraphData = {
    type: 'flow',
    nodes: [
      { id: 'source_input', type: 'InputWidget', label: 'Source Input', properties: { input_metric_target: 500 } },
      { id: 'compute_summary', type: 'ComputeWidget', label: 'Compute Summary', properties: { compute: 'inputs => ({ outputSrcDoc: String(inputs.input_metric_target) })' } },
    ],
    edges: [
      { id: 'edge_metric', source: 'source_input', target: 'compute_summary', properties: { 'flow:sourcePortKey': 'input_metric_target', 'flow:targetPortKey': 'input_metric_target' } },
    ],
  } as never
  const liveRunGraph: GraphData = {
    ...staleRenderGraph,
    nodes: [
      { id: 'source_input', type: 'InputWidget', label: 'Source Input', properties: { input_metric_target: 550 } },
      { id: 'compute_summary', type: 'ComputeWidget', label: 'Compute Summary', properties: { compute: 'inputs => ({ outputSrcDoc: String(inputs.input_metric_target) })' } },
    ],
  } as never
  const connectedInput = resolveStoryboardWidgetWorkflowConnectedValuesInput({
    context: {
      graphSemanticKey: 'test',
      draftGraph: liveRunGraph,
      renderGraph: staleRenderGraph,
      baseGraph: staleRenderGraph,
      storeGraph: staleRenderGraph,
      draftNodes: liveRunGraph.nodes,
      renderNodes: staleRenderGraph.nodes,
      baseNodes: staleRenderGraph.nodes,
      storeNodes: staleRenderGraph.nodes,
      draftNodeById: new Map(liveRunGraph.nodes.map(node => [String(node.id || ''), node])),
      renderNodeById: new Map(staleRenderGraph.nodes.map(node => [String(node.id || ''), node])),
      baseNodeById: new Map(staleRenderGraph.nodes.map(node => [String(node.id || ''), node])),
      storeNodeById: new Map(staleRenderGraph.nodes.map(node => [String(node.id || ''), node])),
    },
    graphForRun: liveRunGraph,
    writableNodeId: 'compute_summary',
    registry: [],
    preserveMaterializedOutputs: false,
  })
  const metricValue = connectedInput?.connectedValuesByNodeId.get('compute_summary')?.['properties.input_metric_target']?.value
  if (metricValue !== 550) {
    throw new Error(`expected widget Auto/Run connected values to prefer live run graph over stale render graph, got ${String(metricValue)}`)
  }
}
