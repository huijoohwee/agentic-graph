import yaml from 'js-yaml'
import { withMarkdownDocumentSourceMetadata } from '@/hooks/store/graph-data-slice/markdownDocumentSourceGraph'
import { readSubgraphs } from '@/lib/graph/subgraphs'
import { extractYamlFrontmatterBlock } from '@/lib/markdown/frontmatter'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { upsertTopLevelFrontmatterSectionMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterSections'
import type { GraphState } from '@/hooks/store/types'

type Row = Record<string, unknown>
export type AuthoringFlow = Row & { nodes: Row[]; edges: Row[]; subgraphs?: Row[] }
const record = (row: unknown): row is Row => !!row && typeof row === 'object' && !Array.isArray(row)
function identifier(value: unknown) {
  const id = unwrapGraphCellValue(value)
  return typeof id === 'string' ? id.trim() : ''
}
function ids(rows: Row[], kind: string) {
  const result = new Set<string>()
  for (const row of rows) {
    const id = identifier(row.id)
    if (!id || result.has(id)) throw new Error('Missing or duplicate ' + kind + ' ID.')
    result.add(id)
  }
  return result
}

export function readAuthoringFlow(text: string, required = false): AuthoringFlow {
  if (text.length > 500_000) throw new Error('The diagram exceeds the local staging limit.')
  const block = extractYamlFrontmatterBlock(text)
  if (!block && text.trimStart().startsWith('---')) throw new Error('Incomplete Markdown frontmatter.')
  const header = block ? yaml.load(block.yamlText) : null
  const flow = record(header) ? header.flow : undefined
  if (flow === undefined && !required) return { nodes: [], edges: [] }
  const edges = record(flow) ? flow.edges ?? [] : undefined
  if (!record(flow) || !Array.isArray(flow.nodes) || !flow.nodes.every(record)
      || !Array.isArray(edges) || !edges.every(record)) throw new Error('Expected a flow with node and edge lists.')
  const result = { ...flow, nodes: flow.nodes, edges } as AuthoringFlow
  const nodes = ids(result.nodes, 'node')
  ids(result.edges, 'edge')
  for (const edge of result.edges) {
    if (!nodes.has(identifier(edge.source)) || !nodes.has(identifier(edge.target))) throw new Error('An edge references a missing node.')
  }
  if (result.subgraphs !== undefined) {
    if (!Array.isArray(result.subgraphs) || !result.subgraphs.every(record)) throw new Error('Invalid subgraphs.')
    ids(result.subgraphs, 'subgraph')
    for (const group of result.subgraphs) {
      if (!Array.isArray(group.memberNodeIds) || !group.memberNodeIds.length || group.memberNodeIds.some(id => !nodes.has(identifier(id)))) throw new Error('A subgraph references a missing node.')
    }
  }
  return result
}

export function editableFlow(state: GraphState) {
  const flow = readAuthoringFlow(state.markdownDocumentText ?? '')
  const ownedNodes = ids(flow.nodes, 'node')
  if (state.graphData?.nodes.some(node => !ownedNodes.has(node.id))) throw new Error('Choose the Markdown source that owns these nodes.')
  return flow
}

export function stageFlow(name: string | null, text: string, unchangedNodes?: ReadonlySet<string>) {
  const flow = readAuthoringFlow(text, true)
  const parsed = tryParseMarkdownFrontmatterFlowGraph(name || 'Canvas.md', text)
  const invalid = parsed?.warnings.find(warning => {
    if (warning.startsWith('Untyped connection: ')) return false
    // Adding positioned nodes can make implicit layout on an untouched note node report a warning.
    const fallback = /^(?:Node missing pos|Flow node type defaulted to default): (.+)$/.exec(warning)
    return !fallback || !unchangedNodes?.has(fallback[1])
  })
  if (!flow.nodes.length || !parsed || invalid || parsed.graphData.nodes.length !== flow.nodes.length
      || parsed.graphData.edges.length !== flow.edges.length) throw new Error(invalid || 'The diagram could not be projected completely.')
  return { text, graph: name ? withMarkdownDocumentSourceMetadata(parsed.graphData, name, null) : parsed.graphData }
}

export function writeFlow(state: GraphState, flow: AuthoringFlow, unchangedNodes?: ReadonlySet<string>) {
  const text = upsertTopLevelFrontmatterSectionMarkdownText({ rawText: state.markdownDocumentText ?? '', sectionKey: 'flow', sectionValue: flow })
  return stageFlow(state.markdownDocumentName, text, unchangedNodes)
}

export function stageCanvasReply(state: GraphState, reply: string) {
  const existing = editableFlow(state)
  let staged
  if (state.markdownDocumentText?.trim()) {
    const addition = readAuthoringFlow(reply, true)
    if (!addition.nodes.length && !addition.edges.length && !addition.subgraphs?.length) throw new Error('The diagram contains no changes.')
    staged = writeFlow(state, { ...existing, nodes: [...existing.nodes, ...addition.nodes], edges: [...existing.edges, ...addition.edges],
      ...(addition.subgraphs?.length ? { subgraphs: [...existing.subgraphs ?? [], ...addition.subgraphs] } : {}) }, ids(existing.nodes, 'node'))
  } else {
    staged = stageFlow(state.markdownDocumentName, reply)
  }
  const previousGroups = ids(existing.subgraphs ?? [], 'subgraph')
  const groups = readSubgraphs(staged.graph).filter(group => !previousGroups.has(group.id))
  const count = (n: number, kind: string) => n + ' ' + kind + (n === 1 ? '' : 's')
  const counts = [count(staged.graph.nodes.length - existing.nodes.length, 'node'), count(staged.graph.edges.length - existing.edges.length, 'edge')]
  if (groups.length) counts.push(count(groups.length, 'group'))
  const names = groups.slice(0, 3).map(group => group.label.slice(0, 80))
  const historyLabel = 'Added ' + counts.join(', ') + (names.length ? ' · ' + names.join(', ') + (groups.length > 3 ? '…' : '') : '')
  return { ...staged, historyLabel }
}
