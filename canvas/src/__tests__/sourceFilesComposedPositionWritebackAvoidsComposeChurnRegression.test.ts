import type { GraphData } from '@/lib/graph/types'
import { resetGraphStoreForTests, useGraphStore } from '@/hooks/useGraphStore'
import { applyGraphOwnerComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { settleWorkspaceSourceTextWrites } from '@/hooks/store/graph-data-slice/workspaceSourceTextWriteQueue'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { createGraphMutationTransitionClock } from '@/tests/lib/resetCanvasTestRuntime'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function testComposedPositionWritebackUpdatesSourceLayerKeysInGraphDataMetadata() {
  const writebackPath = resolve(process.cwd(), 'src', 'hooks', 'store', 'graph-data-slice', 'graphDataComposedSource.ts')
  const helperPath = resolve(process.cwd(), 'src', 'lib', 'graph', 'sourceLayers.ts')
  const writebackText = readFileSync(writebackPath, 'utf8')
  const helperText = readFileSync(helperPath, 'utf8')
  if (!writebackText.includes('updateGraphDataSourceLayerKeys({')) {
    throw new Error('expected composed position writeback to reuse the shared source-layer metadata key refresh helper')
  }
  if (!helperText.includes('export function updateGraphDataSourceLayerKeys(args:')) {
    throw new Error('expected source-layer metadata key refresh to be centralized in the shared sourceLayers helper')
  }
  if (!helperText.includes('export function readSourceLayerKeysFromGraphData(')) {
    throw new Error('expected source-layer metadata key reads to be centralized in the shared sourceLayers helper')
  }
}

export async function testComposedUpdateNodePreservesTypedFrontmatterEnvelopeWriteback() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const clock = createGraphMutationTransitionClock()
  const { canvasRenderMode, canvas2dRenderer } = useGraphStore.getState()
  try {
    resetGraphStoreForTests()
    useGraphStore.setState({
      markdownDocumentName: null, markdownDocumentText: null, workspaceGraphMutationLayoutLockActive: false,
      canvasRenderMode: '2d', canvas2dRenderer: 'd3',
    })
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const typedGraph: GraphData = {
      type: 'Graph',
      nodes: [
        {
          id: 'w-text',
          label: 'Text Widget',
          type: 'TextGeneration',
          properties: {
            prompt: 'old prompt',
            stream: true,
            'frontmatter:handles': { target: ['prompt_in'], source: ['text_out'] },
            'frontmatter:widgetFields': [
              { fieldKey: 'prompt', fieldType: 'string', schemaPath: 'prompt' },
              { fieldKey: 'stream', fieldType: 'boolean', schemaPath: 'stream' },
            ],
          } as never,
        },
      ],
      edges: [],
      metadata: {
        frontmatterFlowSettings: {
          direction: 'LR',
          edgeType: 'bezier',
          computed: true,
          snapToGrid: true,
        },
      },
    }

    state.addSourceFile({
      id: 'sf-typed',
      name: 'typed.md',
      text: '---\ntitle: Typed\n---\n',
      enabled: true,
      status: 'parsed',
      parsedGraphData: typedGraph,
      parsedTextHash: 'typed-h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/typed.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const before = useGraphStore.getState()
    if (before.graphData?.metadata?.sourceLayerComposition !== 'compose' || !before.graphData.nodes.some(node => node.id === 'sf-typed::w-text')) {
      throw new Error('expected the native composed source layer before document editing')
    }
    before.setMarkdownDocument('workspace:/typed.md', '---\ntitle: Typed\n---\n')
    const mutate = () => before.updateNode('sf-typed::w-text', {
      properties: {
        ...(((typedGraph.nodes[0] || {}).properties || {}) as Record<string, unknown>),
        prompt: 'new prompt',
      } as never,
    })
    clock.expectBlockedThenAdvance(mutate)
    mutate()

    const after = useGraphStore.getState()
    const file = after.sourceFiles.find(f => f.id === 'sf-typed')
    const text = String(file?.text || '')
    if (!text.includes('prompt: {key: prompt, type: string, value: "new prompt"}')) {
      throw new Error('expected typed frontmatter prompt envelope writeback to preserve key/type/value')
    }
    if (!text.includes('stream: {key: stream, type: boolean, value: true}')) {
      throw new Error('expected typed frontmatter boolean envelope writeback to preserve field type')
    }
    if (!text.includes('id: {key: id, type: string, value: "w-text"}')) {
      throw new Error('expected typed frontmatter node id envelope writeback')
    }
    if (String(after.markdownDocumentText || '') !== text) {
      throw new Error('expected active markdown editor text to stay aligned with typed frontmatter writeback')
    }
  } finally {
    try { await settleWorkspaceSourceTextWrites() } finally {
      try {
        useGraphStore.getState().clearSourceFiles()
        useGraphStore.getState().setMarkdownDocument(null, null)
        resetGraphStoreForTests()
      } finally {
        try { useGraphStore.setState({ canvasRenderMode, canvas2dRenderer }) } finally {
          try { clock.restore() } finally { bootstrap.restore() }
        }
      }
    }
  }
}

export async function testComposedTextWidgetUpdatePreservesWidgetLayoutAndEdgeWritebackSync() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const clock = createGraphMutationTransitionClock()
  const { canvasRenderMode, canvas2dRenderer } = useGraphStore.getState()
  try {
    resetGraphStoreForTests()
    useGraphStore.setState({
      markdownDocumentName: null, markdownDocumentText: null, workspaceGraphMutationLayoutLockActive: false,
      canvasRenderMode: '2d', canvas2dRenderer: 'd3',
    })
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const graph: GraphData = {
      type: 'Graph',
      nodes: [
        {
          id: 'source',
          label: 'Source',
          type: 'Thing',
          properties: { 'frontmatter:handles': { source: ['out'] } } as never,
        },
        {
          id: 'w-text',
          label: 'Text Widget',
          type: 'TextGeneration',
          properties: {
            prompt: 'old prompt',
            'frontmatter:handles': { target: ['prompt_in'], source: ['text_out'] },
            'frontmatter:widgetFields': [
              { fieldKey: 'prompt', fieldType: 'string', schemaPath: 'prompt' },
            ],
          } as never,
        },
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'source',
          target: 'w-text',
          properties: {
            'flow:sourcePortKey': 'out',
            'flow:targetPortKey': 'prompt_in',
          } as never,
        } as never,
      ],
      metadata: {
        source: 'workspace:/typed-layout.md',
      },
    }

    state.addSourceFile({
      id: 'sf-layout',
      name: 'typed-layout.md',
      text: '---\ntitle: Typed Layout\n---\n',
      enabled: true,
      status: 'parsed',
      parsedGraphData: graph,
      parsedTextHash: 'typed-layout-h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/typed-layout.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const before = useGraphStore.getState()
    if (before.graphData?.metadata?.sourceLayerComposition !== 'compose' || !before.graphData.nodes.some(node => node.id === 'sf-layout::w-text')) {
      throw new Error('expected the native composed source layer before document editing')
    }
    before.setMarkdownDocument('workspace:/typed-layout.md', '---\ntitle: Typed Layout\n---\n')
    useGraphStore.setState({
      flowWidgetPosByNodeId: { 'sf-layout::w-text': { top: 120, left: 240 } },
      flowWidgetWorldPosByNodeId: { 'sf-layout::w-text': { x: 12, y: 24 } },
    } as never)

    const mutate = () => before.updateNode('sf-layout::w-text', {
      properties: {
        ...((((graph.nodes[1] || {}).properties) || {}) as Record<string, unknown>),
        prompt: 'new prompt',
      } as never,
    })
    clock.expectBlockedThenAdvance(mutate)
    mutate()

    const after = useGraphStore.getState()
    const file = after.sourceFiles.find(f => f.id === 'sf-layout')
    const text = String(file?.text || '')
    if (!text.includes('prompt: {key: prompt, type: string, value: "new prompt"}')) {
      throw new Error('expected text widget update to write prompt changes back into the source file markdown')
    }
    if (String(after.markdownDocumentText || '') !== text) {
      throw new Error('expected active markdown editor/viewer text to stay aligned with text widget writeback')
    }
    if ((after.graphData?.edges || []).length !== 1) {
      throw new Error('expected composed edge count to stay stable after text widget update writeback')
    }
    if (after.flowWidgetPosByNodeId['sf-layout::w-text']?.top !== 120 || after.flowWidgetPosByNodeId['sf-layout::w-text']?.left !== 240) {
      throw new Error('expected text widget overlay position to stay stable across same-source recomposition')
    }
    if (after.flowWidgetWorldPosByNodeId['sf-layout::w-text']?.x !== 12 || after.flowWidgetWorldPosByNodeId['sf-layout::w-text']?.y !== 24) {
      throw new Error('expected text widget world position to stay stable across same-source recomposition')
    }
  } finally {
    try { await settleWorkspaceSourceTextWrites() } finally {
      try {
        useGraphStore.getState().clearSourceFiles()
        useGraphStore.getState().setMarkdownDocument(null, null)
        resetGraphStoreForTests()
      } finally {
        try { useGraphStore.setState({ canvasRenderMode, canvas2dRenderer }) } finally {
          try { clock.restore() } finally { bootstrap.restore() }
        }
      }
    }
  }
}

export async function testComposedAddEdgeSyncsToSourceFileAndActiveMarkdownText() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const clock = createGraphMutationTransitionClock()
  const { canvasRenderMode, canvas2dRenderer } = useGraphStore.getState()
  try {
    resetGraphStoreForTests()
    useGraphStore.setState({
      markdownDocumentName: null, markdownDocumentText: null, workspaceGraphMutationLayoutLockActive: false,
      canvasRenderMode: '2d', canvas2dRenderer: 'd3',
    })
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const graph: GraphData = {
      type: 'Graph',
      nodes: [
        { id: 'a', label: 'A', type: 'Thing', properties: { 'frontmatter:handles': { source: ['out'] } } as never },
        { id: 'b', label: 'B', type: 'Thing', properties: { 'frontmatter:handles': { target: ['in'] } } as never },
      ],
      edges: [],
      metadata: {},
    }

    state.addSourceFile({
      id: 'sf-edge',
      name: 'edge.md',
      text: '---\ntitle: Edge\n---\n',
      enabled: true,
      status: 'parsed',
      parsedGraphData: graph,
      parsedTextHash: 'edge-h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/edge.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const before = useGraphStore.getState()
    if (before.graphData?.metadata?.sourceLayerComposition !== 'compose' || !before.graphData.nodes.some(node => node.id === 'sf-edge::a')) {
      throw new Error('expected the native composed source layer before document editing')
    }
    before.setMarkdownDocument('workspace:/edge.md', '---\ntitle: Edge\n---\n')
    const mutate = () => before.addEdge({
      id: 'e1',
      source: 'sf-edge::a',
      target: 'sf-edge::b',
      label: 'out -> in',
      properties: {
        'flow:sourcePortKey': 'out',
        'flow:targetPortKey': 'in',
        animated: true,
      } as never,
    } as never)
    clock.expectBlockedThenAdvance(mutate)
    mutate()

    const after = useGraphStore.getState()
    const file = after.sourceFiles.find(f => f.id === 'sf-edge')
    const edge = file?.parsedGraphData?.edges?.find(e => String(e.id || '') === 'e1') || null
    if (!edge) throw new Error('expected composed addEdge to persist into source file parsed graph data')
    const text = String(file?.text || '')
    if (!text.includes('"source":"a","sourceHandle":"out","target":"b","targetHandle":"in"')) {
      throw new Error('expected edge frontmatter writeback to persist explicit sourceHandle/targetHandle')
    }
    if (String(after.markdownDocumentText || '') !== text) {
      throw new Error('expected active markdown editor text to stay aligned with edge writeback')
    }
  } finally {
    try { await settleWorkspaceSourceTextWrites() } finally {
      try {
        useGraphStore.getState().clearSourceFiles()
        useGraphStore.getState().setMarkdownDocument(null, null)
        resetGraphStoreForTests()
      } finally {
        try { useGraphStore.setState({ canvasRenderMode, canvas2dRenderer }) } finally {
          try { clock.restore() } finally { bootstrap.restore() }
        }
      }
    }
  }
}
