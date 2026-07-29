import { upsertFrontmatterFlowMarkdownText } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import type { GraphData } from '@/lib/graph/types'

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
