import { syncActiveMarkdownDocumentTextFromParsedGraph } from '@/hooks/store/graph-data-slice/graphDataFrontmatterFlowSync'
import type { GraphData } from '@/lib/graph/types'
import {
  resolveStoryboardCardMediaGraphSourceGraph,
  resolveStoryboardCardMediaGraphSourceOwner,
  shouldUpdateStoryboardCardMediaGraphActiveDocument,
} from '@/components/StoryboardWidgetCanvas/runtime/storyboardCardMediaGraphSourceOwner'
import { resolveStoryboardCardMediaGraphPersistenceText } from '@/components/StoryboardWidgetCanvas/runtime/storyboardCardMediaGraphSource'
import { readSubgraphs } from '@/lib/graph/subgraphs'

const OWNER_PATH = '/docs/workflow.md'
const GENERATED_PATH = '/docs/generated-output.md'

const ownerSourceText = [
  '---',
  'flow:',
  '  nodes:',
  '    - id: {key: id, type: string, value: n1}',
  '      type: {key: type, type: string, value: TextGeneration}',
  '      label: {key: label, type: string, value: Widget Card}',
  '      output: {key: output, type: string, value: ""}',
  '  edges: []',
  '---',
].join('\n')

export function testStoryboardCardMediaGraphPersistenceKeepsSemanticSourceOwner() {
  const generatedArtifactText = '# Generated output\n\nThis file is not the Canvas graph owner.'
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{
      id: 'n1',
      type: 'TextGeneration',
      label: 'Widget Card',
      properties: { output: 'Semantic run result' },
    }],
    edges: [],
    metadata: { kind: 'frontmatter-flow' },
  }
  const sourceFiles = [
    {
      id: 'workflow-source',
      enabled: true,
      name: 'workflow.md',
      text: ownerSourceText,
      source: { kind: 'local', path: OWNER_PATH },
    },
    {
      id: 'generated-output',
      enabled: true,
      name: 'generated-output.md',
      text: generatedArtifactText,
      source: { kind: 'local', path: GENERATED_PATH },
    },
  ]
  const ownerResolution = resolveStoryboardCardMediaGraphSourceOwner({
    state: {
      markdownDocumentName: GENERATED_PATH,
      markdownDocumentText: generatedArtifactText,
      sourceFiles,
    } as never,
    sourceOwner: {
      documentName: OWNER_PATH,
      documentText: ownerSourceText,
    },
  })
  const synced = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: ownerResolution.state,
    sourceFiles: ownerResolution.state.sourceFiles,
    parsedGraphData: graphData,
  })
  const syncedOwner = synced.sourceFiles.find(file => file.id === 'workflow-source')
  const untouchedArtifact = synced.sourceFiles.find(file => file.id === 'generated-output')
  if (
    ownerResolution.ownerPath !== OWNER_PATH
    || ownerResolution.state.markdownDocumentName !== OWNER_PATH
    || ownerResolution.state.markdownDocumentText !== ownerSourceText
    || !synced.accepted
    || !String(syncedOwner?.text || '').includes('Semantic run result')
    || untouchedArtifact?.text !== generatedArtifactText
    || shouldUpdateStoryboardCardMediaGraphActiveDocument({ currentDocumentName: GENERATED_PATH, ownerPath: OWNER_PATH })
    || !shouldUpdateStoryboardCardMediaGraphActiveDocument({ currentDocumentName: OWNER_PATH, ownerPath: OWNER_PATH })
  ) {
    throw new Error(`expected graph persistence to update only its semantic source owner, got ${JSON.stringify({ ownerResolution, synced })}`)
  }
}

export function testStoryboardCardMediaGraphPersistenceProjectsComposedOwnerLayer() {
  const ownerGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', type: 'TextGeneration', label: 'Widget Card', properties: { output: '' } }],
    edges: [],
    metadata: {},
  }
  const otherGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'other', type: 'Note', label: 'Other source', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow' },
  }
  const sourceFiles = [
    {
      id: 'owner-layer',
      enabled: true,
      name: 'workflow.md',
      text: '',
      source: { kind: 'local', path: OWNER_PATH },
      parsedGraphData: ownerGraph,
    },
    {
      id: 'other-layer',
      enabled: true,
      name: 'other.md',
      text: '# Other source',
      source: { kind: 'local', path: '/docs/other.md' },
      parsedGraphData: otherGraph,
    },
  ]
  const composedGraph: GraphData = {
    type: 'Graph',
    nodes: [
      {
        id: 'owner-layer::n1',
        type: 'TextGeneration',
        label: 'Widget Card',
        properties: { output: 'Composed owner result' },
        metadata: { sourceLayerId: 'owner-layer', sourceLayerLabel: 'workflow.md', documentPath: 'workflow.md' },
      },
      {
        id: 'other-layer::other',
        type: 'Note',
        label: 'Other source',
        properties: {},
        metadata: { sourceLayerId: 'other-layer', sourceLayerLabel: 'other.md', documentPath: 'other.md' },
      },
      { id: 'n2', type: 'RichMediaPanel', label: 'Generated output', properties: { output: 'Composed owner result' } },
    ],
    edges: [{ id: 'output-edge', source: 'owner-layer::n1', target: 'n2', label: '', properties: {} }],
    metadata: {
      sourceLayerComposition: 'compose',
      graphDataRevision: 9,
      'kg:subgraphs': [{
        id: 'workflow-materialization:n1',
        label: 'Generated outputs',
        memberNodeIds: ['owner-layer::n1', 'n2'],
        parentId: null,
        kind: 'subgraph',
        autoBounds: true,
      }],
    },
  }
  const ownerResolution = resolveStoryboardCardMediaGraphSourceOwner({
    state: {
      markdownDocumentName: OWNER_PATH,
      markdownDocumentText: '',
      sourceFiles,
    } as never,
    sourceOwner: { documentName: OWNER_PATH, documentText: '' },
  })
  const sourceGraph = resolveStoryboardCardMediaGraphSourceGraph({
    graphData: composedGraph,
    ownerFile: ownerResolution.ownerFile,
    ownerText: '',
  })
  const synced = syncActiveMarkdownDocumentTextFromParsedGraph({
    state: ownerResolution.state,
    sourceFiles: ownerResolution.state.sourceFiles,
    parsedGraphData: sourceGraph,
  })
  const sourceNodeIds = sourceGraph.nodes.map(node => String(node.id || '')).sort()
  const sourceEdge = sourceGraph.edges[0]
  const sourceSubgraph = readSubgraphs(sourceGraph)[0]
  const syncedOwnerText = String(synced.sourceFiles.find(file => file.id === 'owner-layer')?.text || '')
  const otherSourceText = String(synced.sourceFiles.find(file => file.id === 'other-layer')?.text || '')
  if (
    sourceNodeIds.join('|') !== 'n1|n2'
    || sourceGraph.context !== 'frontmatter-flow'
    || String((sourceGraph.metadata as Record<string, unknown>)?.kind || '') !== 'frontmatter-flow'
    || sourceEdge?.source !== 'n1'
    || sourceEdge?.target !== 'n2'
    || sourceSubgraph?.id !== 'workflow-materialization:n1'
    || sourceSubgraph.autoBounds !== true
    || sourceSubgraph.memberNodeIds.join('|') !== 'n1|n2'
    || !synced.accepted
    || !syncedOwnerText.includes('Composed owner result')
    || !syncedOwnerText.includes('flow:')
    || syncedOwnerText.includes('Other source')
    || otherSourceText !== '# Other source'
  ) {
    throw new Error(`expected composed publication to serialize only the originating source layer, got ${JSON.stringify({ sourceGraph, synced })}`)
  }
}

export function testStoryboardCardMediaGraphPersistenceWritesAlreadySynchronizedText() {
  const synchronizedText = `${ownerSourceText}\n<!-- generated output already projected in active state -->`
  const persistenceText = resolveStoryboardCardMediaGraphPersistenceText({
    activeText: synchronizedText,
    synchronizedText: undefined,
  })
  if (persistenceText !== synchronizedText) {
    throw new Error('expected persistence to write active text even when graph serialization produces no state delta')
  }
}
