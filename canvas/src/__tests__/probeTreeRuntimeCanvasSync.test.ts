import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { selectProbeOption } from '../../../mcp/probe-tree-runtime.js'

export async function testProbeTreeSelectedNodeParsesThroughFrontmatterFlowForCanvasSync() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentic-graph-probe-canvas-sync-'))
  const result = await selectProbeOption({
    thread_root_id: 'canvas-sync',
    parent_node_id: 'root',
    chosen_option: {
      id: 'option-one',
      text: 'What outcome would make this resolved?',
      rationale: 'Locks the terminal condition before more branching.',
    },
  }, { rootDir })

  const markdown = await fs.readFile(path.join(rootDir, result.node_path), 'utf8')
  const parsed = tryParseMarkdownFrontmatterFlowGraph(path.basename(result.node_path), markdown)
  if (!parsed) throw new Error('expected selected probe node markdown to parse as frontmatter-flow')

  const graph = parsed.graphData
  if (String(graph.context || '') !== 'frontmatter-flow') {
    throw new Error(`expected frontmatter-flow graph context, got ${String(graph.context || '')}`)
  }
  const node = graph.nodes.find(entry => entry.id === result.new_node_id)
  if (!node) throw new Error(`expected parsed canvas graph to include selected probe node ${result.new_node_id}`)
  if (node.type !== 'probe') throw new Error(`expected parsed probe node type=probe, got ${String(node.type || '')}`)

  const edge = graph.edges.find(entry => entry.id === result.edge_id)
  if (!edge) throw new Error(`expected parsed canvas graph to include selected edge ${result.edge_id}`)
  if (edge.source !== 'root' || edge.target !== result.new_node_id || edge.type !== 'branches-to') {
    throw new Error(`expected branches-to edge from root to selected probe node, got ${JSON.stringify(edge)}`)
  }
}
