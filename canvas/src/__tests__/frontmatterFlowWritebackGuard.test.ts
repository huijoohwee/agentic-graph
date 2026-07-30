import { upsertFrontmatterFlowMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import type { GraphData } from '@/lib/graph/types'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import { readSubgraphs } from '@/lib/graph/subgraphs'
import {
  readWorkflowMaterializationProjectionSourceNodeId,
  WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY,
} from '@/lib/storyboardWidget/runMaterializationProjection'

export function testFrontmatterFlowWritebackDoesNotReplaceNonEmptyFlowWithEmptyGraph() {
  const text = [
    '---',
    'title: "Demo"',
    'flow:',
    '  nodes:',
    '    - id: {key: id, type: string, value: "source_input"}',
    '      type: {key: type, type: string, value: "InputWidget"}',
    '      label: {key: label, type: string, value: "Source Input"}',
    '  edges:',
    '    - {"id":"edge_a","source":"source_input","target":"compute_summary"}',
    '---',
    '## Body',
    '',
  ].join('\n')
  const emptyGraph: GraphData = {
    type: 'flow',
    nodes: [],
    edges: [],
    metadata: { frontmatterFlow: true },
  }
  const nextText = upsertFrontmatterFlowMarkdownText(text, emptyGraph)
  if (nextText !== text) {
    throw new Error('expected frontmatter flow writeback to preserve existing non-empty flow when the candidate graph is empty')
  }

  const legacyNoteText = [
    '---',
    'flow:',
    '  nodes: []',
    '  edges: []',
    '---',
    '',
  ].join('\n')
  const noteGraph: GraphData = {
    type: 'flow',
    nodes: [{ id: 'source', type: 'InputWidget', label: 'Source', properties: {} }],
    edges: [],
    metadata: { frontmatterFlow: true },
  }
  const repairedNoteText = upsertFrontmatterFlowMarkdownText(legacyNoteText, noteGraph, {
    documentName: '/notes/note_20260727T225041Z.md',
  })
  if (
    !repairedNoteText.startsWith('---\ntitle: "note_20260727T225041Z"\nkgCanvasSurfaceMode: "2d"\nkgCanvasRenderMode: "2d"\nflow:')
    || !repairedNoteText.includes('id: {key: id, type: string, value: "source"}')
  ) {
    throw new Error(`expected legacy authored-note flow writeback to restore titled 2D YAML frontmatter, got ${repairedNoteText}`)
  }
}

export function testFrontmatterFlowWritebackRoundTripsAutoBoundSubgraphs() {
  const graphData: GraphData = {
    type: 'flow',
    nodes: [
      { id: 'source', type: 'InputWidget', label: 'Source', properties: {} },
      { id: 'output', type: 'RichMediaPanel', label: 'Output', properties: {} },
    ],
    edges: [{
      id: 'output-edge',
      source: 'source',
      target: 'output',
      label: '',
      properties: {
        [WORKFLOW_MATERIALIZATION_PROJECTION_SOURCE_NODE_ID_PROPERTY]: 'output',
      },
    }],
    metadata: {
      frontmatterFlow: true,
      'kg:subgraphs': [{
        id: 'workflow-materialization:source',
        label: 'Generated outputs',
        memberNodeIds: ['source', 'output'],
        parentId: null,
        kind: 'subgraph',
        autoBounds: true,
      }],
    },
  }
  const text = upsertFrontmatterFlowMarkdownText('# Generated outputs\n', graphData, {
    documentName: '/notes/generated-output.md',
  })
  const parsed = tryParseMarkdownFrontmatterFlowGraph('generated-output.md', text)
  const subgraph = readSubgraphs(parsed?.graphData)[0]
  const projectionSourceNodeId = readWorkflowMaterializationProjectionSourceNodeId(
    parsed?.graphData.edges[0]?.properties,
  )
  if (
    !text.includes('  subgraphs:')
    || subgraph?.id !== 'workflow-materialization:source'
    || subgraph.autoBounds !== true
    || subgraph.memberNodeIds.join('|') !== 'output|source'
    || projectionSourceNodeId !== 'output'
  ) {
    throw new Error(`expected generated Group Panel membership and projected edge routing to survive frontmatter writeback, got ${JSON.stringify({ text, subgraph, projectionSourceNodeId })}`)
  }
}
