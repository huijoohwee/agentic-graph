import { useGraphStore } from '@/hooks/useGraphStore'
import { isFrontmatterFlowGraph } from '@/lib/graph/frontmatterMode'
import { createStroke, type SketchPoint } from '@/lib/graph/canvasSketch'
import { createUniqueId } from '@/lib/ids'
import { createSubgraph } from '@/lib/graph/subgraphs'
import { finalizeEdgeAuthoring } from '@/features/edge-creation/authoring'
import { isWorkspaceCameraInitializationBlocked } from '@/features/workspace-table/workspaceTableSsot'
import { validateNodeProperties } from '@/features/schema/validation'
import { runCanvasAuthoringTurn } from './canvasAuthoringTurn'
import { editableFlow, writeFlow, type AuthoringFlow } from './canvasAuthoringFlow'

type ToolIntent = { tool: 'node'; x: number; y: number }
  | { tool: 'stroke'; points: SketchPoint[] }
  | { tool: 'edge'; source: string; target: string }
  | { tool: 'subgraph'; members: string[] }

export async function authorCanvasTool(intent: ToolIntent) {
  const state = useGraphStore.getState()
  if (state.canvasAuthoringTurn || isWorkspaceCameraInitializationBlocked(state)) throw new Error('Canvas is read-only.')
  const data = state.graphData ?? { type: 'Graph', nodes: [], edges: [] }
  const sourceOwned = state.workspaceViewMode === 'editor' || isFrontmatterFlowGraph(data) || !data.nodes.length
  const edit = (change: (flow: AuthoringFlow) => AuthoringFlow) => runCanvasAuthoringTurn(state, new AbortController(), 'Add canvas ' + intent.tool,
    async initial => writeFlow(initial, change(editableFlow(initial))))
  if (intent.tool === 'stroke') {
    const stroke = createStroke(intent.points)
    const id = createUniqueId('sketch-stroke-', new Set(data.nodes.map(n => n.id)))
    return edit(flow => ({ ...flow, nodes: [...flow.nodes, { ...stroke, id }] }))
  }
  if (intent.tool === 'node') {
    const id = createUniqueId('node', new Set(data.nodes.map(node => node.id)))
    const node = { id, type: 'Concept', label: 'Node ' + (data.nodes.length + 1), x: intent.x, y: intent.y,
      properties: { ...state.schema.templates?.node?.Concept } }
    if (!validateNodeProperties(state.schema, id, node, data)) throw new Error('A required node property is missing.')
    if (!sourceOwned) return state.addNode(node)
    return edit(flow => ({ ...flow, nodes: [...flow.nodes, { id, label: node.label, type: node.type, properties: node.properties, position: { x: node.x, y: node.y } }] }))
  }
  if (intent.tool === 'edge') {
    if (![intent.source, intent.target].every(id => data.nodes.some(node => node.id === id))) throw new Error('Choose two current nodes.')
    const result = finalizeEdgeAuthoring({ mode: 'create', data, schema: state.schema, label: 'linksTo', selectedEdgeId: null,
      from: { nodeId: intent.source, portKey: null }, to: { nodeId: intent.target, portKey: null } })
    if (result.kind !== 'create') throw new Error(result.kind === 'select-existing' ? 'This edge already exists.' : 'The schema rejected this edge.')
    if (!sourceOwned) return state.addEdge(result.edge)
    return edit(flow => ({ ...flow, edges: [...flow.edges, { ...result.edge }] }))
  }
  const members = intent.members.filter(id => data.nodes.some(node => node.id === id))
  if (!members.length) throw new Error('Select a node to group.')
  if (!sourceOwned) {
    const result = state.createUserSubgraph({ memberNodeIds: members })
    if ('message' in result) throw new Error(result.message)
    return
  }
  const { subgraph } = createSubgraph(data, { nodeIds: members, autoBounds: true })
  return edit(flow => ({ ...flow, subgraphs: [...flow.subgraphs ?? [], { ...subgraph }] }))
}
