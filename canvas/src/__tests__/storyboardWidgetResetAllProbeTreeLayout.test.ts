import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildStoryboardWidgetWorkflowResetAllGraphData } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetWorkflowResetAll'
import { PROBE_TREE_OUTPUT_KEY } from '@/components/StoryboardWidgetCanvas/runtime/storyboardWidgetProbeTreeLayout'
import type { GraphData } from '@/lib/graph/types'
import {
  PROBE_TREE_BALANCED_LAYOUT_MODE,
  PROBE_TREE_BALANCED_LAYOUT_VERSION,
  PROBE_TREE_LAYOUT_MODE_PROPERTY,
  PROBE_TREE_LAYOUT_VERSION_PROPERTY,
  PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY,
} from '@/lib/storyboardWidget/probeTreeLayoutContract'

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message)
}

const readPosition = (graphData: GraphData, nodeId: string): { x: number; y: number } => {
  const node = graphData.nodes.find(candidate => String(candidate.id) === nodeId)
  const x = Number(node?.x)
  const y = Number(node?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`expected finite position for ${nodeId}`)
  return { x, y }
}

const assertBalancedThread = (graphData: GraphData, rootId: string, branchIds: readonly string[]): void => {
  const positions = branchIds.map(branchId => readPosition(graphData, branchId))
  assert(new Set(positions.map(position => position.x)).size >= 2, `expected ${rootId} to use multiple columns`)
  assert(new Set(positions.map(position => position.y)).size >= 2, `expected ${rootId} to retain a top-down waterfall`)
  assert(positions.every(position => position.x % 20 === 0 && position.y % 20 === 0), `expected ${rootId} to remain grid snapped`)
  for (let leftIndex = 0; leftIndex < branchIds.length; leftIndex += 1) {
    const left = positions[leftIndex]!
    for (let rightIndex = leftIndex + 1; rightIndex < branchIds.length; rightIndex += 1) {
      const right = positions[rightIndex]!
      assert(Math.abs(left.x - right.x) >= 360 || Math.abs(left.y - right.y) >= 640, `expected ${branchIds[leftIndex]} and ${branchIds[rightIndex]} not to overlap`)
    }
  }
  for (const branchId of branchIds) {
    const node = graphData.nodes.find(candidate => candidate.id === branchId)
    const properties = node?.properties || {}
    const parentId = String(properties.parentNodeId || '')
    assert(readPosition(graphData, branchId).x > readPosition(graphData, parentId).x, `expected ${parentId} -> ${branchId} to remain forward-only`)
    assert(properties[PROBE_TREE_LAYOUT_MODE_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_MODE, `expected ${branchId} to use balanced layout authority`)
    assert(properties[PROBE_TREE_LAYOUT_VERSION_PROPERTY] === PROBE_TREE_BALANCED_LAYOUT_VERSION, `expected ${branchId} to use the current layout version`)
    assert(properties[PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY] === true, `expected ${branchId} to remain pinned by default`)
  }
}

export function testProbeTreeResetAllClearsOutputsAndRebalancesEveryThread() {
  const staleLayoutProperties = (rootId: string, parentNodeId: string, index: string) => ({
    cardTypeLabel: 'Probe-Tree Card',
    index,
    parentNodeId,
    probeTreeCandidateKey: `candidate-${rootId}-${index}`,
    probeTreeThreadRootId: rootId,
    [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
    [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
    [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
  })
  const threadAIds = ['a-1', 'a-2', 'a-3']
  const threadBIds = ['b-1', 'b-2', 'b-3']
  const graphData: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root-a', type: 'TextGeneration', label: 'Root A', x: 0, y: 0, properties: { prompt: 'keep root A' } },
      ...threadAIds.map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 440,
        y: -680 + index * 680,
        properties: { ...staleLayoutProperties('root-a', 'root-a', `P${index + 1}`), ...(index === 0 ? { output: 'stale answer', prompt: 'keep authored prompt' } : {}) },
      })),
      {
        id: 'ledger-a',
        type: 'RichMediaPanel',
        label: 'Probe-Tree Branches',
        x: 960,
        y: 0,
        properties: { workflowOutputAnchorNodeId: 'root-a', workflowOutputKey: PROBE_TREE_OUTPUT_KEY, outputSrcDoc: '<main>stale</main>' },
      },
      { id: 'root-b', type: 'TextGeneration', label: 'Root B', x: 0, y: 3200, properties: { prompt: 'keep root B' } },
      ...threadBIds.map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 440,
        y: 2520 + index * 680,
        properties: staleLayoutProperties('root-b', 'root-b', `P${index + 1}`),
      })),
    ],
    edges: [
      ...threadAIds.map(id => ({ id: `edge-${id}`, source: 'root-a', target: id, label: 'candidateOption', properties: {} })),
      ...threadBIds.map(id => ({ id: `edge-${id}`, source: 'root-b', target: id, label: 'candidateOption', properties: {} })),
    ],
  }

  const reset = buildStoryboardWidgetWorkflowResetAllGraphData(graphData)
  assert(reset.resetCount === 2, `expected both stale output owners to reset, got ${reset.resetCount}`)
  assert(reset.layoutChanged, 'expected Reset all to force one balanced layout transaction')
  assert(reset.graphData.nodes.find(node => node.id === 'a-1')?.properties.prompt === 'keep authored prompt', 'expected reset to preserve authored fields')
  assert(!Object.prototype.hasOwnProperty.call(reset.graphData.nodes.find(node => node.id === 'a-1')?.properties || {}, 'output'), 'expected reset to clear card Output')
  assert(!Object.prototype.hasOwnProperty.call(reset.graphData.nodes.find(node => node.id === 'ledger-a')?.properties || {}, 'outputSrcDoc'), 'expected reset to clear ledger output')
  assertBalancedThread(reset.graphData, 'root-a', threadAIds)
  assertBalancedThread(reset.graphData, 'root-b', threadBIds)
  const rootAX = readPosition(reset.graphData, 'root-a').x
  const ledgerX = readPosition(reset.graphData, 'ledger-a').x
  const leftmostThreadAX = Math.min(...threadAIds.map(nodeId => readPosition(reset.graphData, nodeId).x))
  assert(ledgerX > rootAX && ledgerX < leftmostThreadAX, 'expected the canonical ledger between the source and the rebalanced branch columns')
}

export function testProbeTreeResetAllReflowsASettledLayoutWithoutStaleOutputOrNavigation() {
  const initial: GraphData = {
    type: 'Graph',
    metadata: { kind: 'frontmatter-flow', frontmatterFlowSettings: { gridSize: 20 } },
    nodes: [
      { id: 'root', type: 'TextGeneration', label: 'Root', x: 0, y: 0, properties: {} },
      ...['a', 'b', 'c'].map((id, index) => ({
        id,
        type: 'TextGeneration',
        label: id,
        x: 440,
        y: -680 + index * 680,
        properties: {
          cardTypeLabel: 'Probe-Tree Card',
          index: `P${index + 1}`,
          parentNodeId: 'root',
          probeTreeCandidateKey: `candidate-${id}`,
          probeTreeThreadRootId: 'root',
          [PROBE_TREE_LAYOUT_MODE_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_MODE,
          [PROBE_TREE_LAYOUT_VERSION_PROPERTY]: PROBE_TREE_BALANCED_LAYOUT_VERSION,
          [PROBE_TREE_PINNED_BY_DEFAULT_PROPERTY]: true,
        },
      })),
    ],
    edges: ['a', 'b', 'c'].map(id => ({ id: `edge-${id}`, source: 'root', target: id, label: 'candidateOption', properties: {} })),
  }
  const settled = buildStoryboardWidgetWorkflowResetAllGraphData(initial).graphData
  const layoutOnlyReset = buildStoryboardWidgetWorkflowResetAllGraphData(settled)
  assert(layoutOnlyReset.resetCount === 0, 'expected a settled graph to have no stale workflow output')
  assert(layoutOnlyReset.layoutChanged, 'expected explicit Reset all to reapply the balanced heuristic even when outputs are already empty')
  assertBalancedThread(layoutOnlyReset.graphData, 'root', ['a', 'b', 'c'])

  const actionSource = readFileSync(resolve(process.cwd(), 'src/components/StoryboardWidgetCanvas/runtime/useStoryboardWidgetWorkflowActions.ts'), 'utf8')
  assert(actionSource.includes("await args.persistDraftGraphData(reset.graphData, { label: 'Reset All', source: 'gitGraph' })"), 'expected Reset all to publish and version the atomic normalized graph through the durable commit')
  assert(actionSource.includes('const handler = () => void resetWorkflowOutputs()'), 'expected the toolbar event to run the asynchronous in-document reset transaction')
  assert(!actionSource.includes('location.reload') && !actionSource.includes('window.location'), 'expected Reset all to avoid browser navigation and page refresh APIs')
}
