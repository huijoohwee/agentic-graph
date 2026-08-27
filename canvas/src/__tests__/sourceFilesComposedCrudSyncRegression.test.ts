import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { applyGraphOwnerComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
export async function testComposedUpdateNodeSyncsToSourceFileAndRecomposes() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)
    const g1: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
      edges: [],
      metadata: {},
    }

    state.addSourceFile({
      id: 'sf-1',
      name: 'a.md',
      text: 'a',
      enabled: true,
      status: 'parsed',
      parsedGraphData: g1,
      parsedTextHash: 'h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'a.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const before = useGraphStore.getState()
    const beforeGraph = before.graphData
    if (!beforeGraph) throw new Error('expected composed graph data')
    const beforeKey = String(((beforeGraph.metadata || {}) as any).sourceLayerHash || '')
    if (!beforeKey) throw new Error('expected sourceLayerHash')

    before.updateNode('sf-1::n1', { label: 'A2' })

    const after = useGraphStore.getState()
    const file = after.sourceFiles.find(f => f.id === 'sf-1')
    const label = file?.parsedGraphData?.nodes?.find(n => n.id === 'n1')?.label
    if (label !== 'A2') throw new Error(`expected source file node label to update, got ${String(label)}`)
    if ((file?.parsedGraphRevision || 0) !== 1) throw new Error('expected parsedGraphRevision to increment')
    if (!String(file?.text || '').includes('flow:')) throw new Error('expected source file text to receive flow frontmatter writeback on composed update')
    if (!String(file?.text || '').includes('"A2"')) throw new Error('expected updated node label to persist into source file text')

    const afterGraph = after.graphData
    if (!afterGraph) throw new Error('expected composed graph data after update')
    const afterKey = String(((afterGraph.metadata || {}) as any).sourceLayerHash || '')
    if (afterKey === beforeKey) throw new Error('expected sourceLayerHash to change after composed CRUD update')
    const composedLabel = afterGraph.nodes.find(n => n.id === 'sf-1::n1')?.label
    if (composedLabel !== 'A2') throw new Error(`expected composed node label to update, got ${String(composedLabel)}`)
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedAddNodePrefersActiveMarkdownDocumentSourceFile() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const graphA: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'a1', label: 'A', type: 'Thing', properties: {} }],
      edges: [],
      metadata: {},
    }
    const graphB: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'b1', label: 'B', type: 'Thing', properties: {} }],
      edges: [],
      metadata: {},
    }

    state.addSourceFile({
      id: 'sf-a',
      name: 'a.md',
      text: 'a',
      enabled: true,
      status: 'parsed',
      parsedGraphData: graphA,
      parsedTextHash: 'ha',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/a.md' },
    })
    state.addSourceFile({
      id: 'sf-b',
      name: 'b.md',
      text: 'b',
      enabled: true,
      status: 'parsed',
      parsedGraphData: graphB,
      parsedTextHash: 'hb',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/b.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const composed = useGraphStore.getState()
    composed.setMarkdownDocument('workspace:/b.md', '---\ntitle: B\n---\n')
    useGraphStore.setState({ selectedNodeId: 'sf-a::a1' })

    composed.addNode({
      id: 'grabmaps-discovery',
      label: 'GrabMaps Chat Discovery Widget',
      type: 'GrabMapsDiscovery',
      x: 10,
      y: 20,
      properties: { geo: { lat: 1.29, lng: 103.85 } } as never,
    })

    const after = useGraphStore.getState()
    const sourceA = after.sourceFiles.find(f => f.id === 'sf-a')
    const sourceB = after.sourceFiles.find(f => f.id === 'sf-b')
    const inA = sourceA?.parsedGraphData?.nodes?.some(n => n.id === 'grabmaps-discovery')
    const inB = sourceB?.parsedGraphData?.nodes?.some(n => n.id === 'grabmaps-discovery')
    if (inA) throw new Error('expected composed addNode to avoid appending into the selected non-active markdown source file')
    if (!inB) throw new Error('expected composed addNode to append into the active markdown document source file')
    const composedNode = after.graphData?.nodes?.find(n => n.id === 'sf-b::grabmaps-discovery')
    if (!composedNode) throw new Error('expected recomposed graph to expose the new node under the active markdown source layer id')
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedSourceFilesPreferEnabledReadmeFrontmatterPresetOnFreshBoot() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const previousActivePath = useMarkdownExplorerStore.getState().activePath
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    useMarkdownExplorerStore.getState().setActivePath(null)
    state.setDocumentStructureBaselineLock(true)
    state.setCanvasRenderMode('3d')
    state.setCanvas2dRenderer('storyboard')
    state.setDocumentSemanticMode('keyword')
    state.setFrontmatterModeEnabled(false)
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    state.addSourceFile({
      id: 'sf-readme',
      name: 'README.md',
      text: [
        '---',
        'title: "AgenticGraph"',
        'kgCanvasRenderMode: "2d"',
        'kgCanvas2dRenderer: "d3"',
        'kgDocumentSemanticMode: "document"',
        'kgFrontmatterModeEnabled: true',
        'kgDocumentStructureBaselineLock: false',
        '---',
        '',
        '# AgenticGraph',
      ].join('\n'),
      enabled: true,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'readme-node', label: 'README', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'readme-hash',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/README.md' },
    })
    state.addSourceFile({
      id: 'sf-demo',
      name: 'disabled-flow-preset.md',
      text: [
        '---',
        'title: "Demo"',
        'kgCanvasRenderMode: "2d"',
        'kgCanvas2dRenderer: "storyboard"',
        'kgDocumentSemanticMode: "document"',
        'kgFrontmatterModeEnabled: true',
        'kgDocumentStructureBaselineLock: false',
        '---',
        '',
        '# Demo',
      ].join('\n'),
      enabled: false,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'demo-node', label: 'Demo', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'demo-hash',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/fixtures/disabled-flow-preset.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()

    const after = useGraphStore.getState()
    if (after.canvasRenderMode !== '2d') {
      throw new Error(`expected README frontmatter preset to force 2d render mode on fresh composed boot, got ${String(after.canvasRenderMode)}`)
    }
    if (after.canvas2dRenderer !== 'd3') {
      throw new Error(`expected enabled README seed frontmatter to win over default storyboard renderer, got ${String(after.canvas2dRenderer)}`)
    }
    if (after.documentSemanticMode !== 'document') {
      throw new Error(`expected README frontmatter preset to force document semantic mode, got ${String(after.documentSemanticMode)}`)
    }
    if (after.frontmatterModeEnabled !== true) {
      throw new Error('expected README frontmatter preset to enable frontmatter mode during composed startup')
    }
    if (after.documentStructureBaselineLock !== false) {
      throw new Error('expected README frontmatter preset to force View Lock OFF during fresh composed startup')
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(previousActivePath)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedSourceFilesOrderOnlyRecomposeDoesNotReplayUnchangedPreset() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const previousActivePath = useMarkdownExplorerStore.getState().activePath
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    useMarkdownExplorerStore.getState().setActivePath('workspace:/README.md')
    state.setMarkdownDocument('workspace:/README.md', '---\ntitle: Readme\n---\n')
    state.setCanvasRenderMode('2d')
    state.setCanvas2dRenderer('storyboard')
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const readmeText = [
      '---',
      'title: "AgenticGraph"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "d3"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      'kgDocumentStructureBaselineLock: false',
      '---',
      '',
      '# AgenticGraph',
    ].join('\n')

    state.addSourceFile({
      id: 'sf-readme',
      name: 'README.md',
      text: readmeText,
      enabled: true,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'readme-node', label: 'README', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'readme-hash',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/README.md' },
    })
    state.addSourceFile({
      id: 'sf-demo',
      name: 'demo.md',
      text: '# Demo',
      enabled: true,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'demo-node', label: 'Demo', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'demo-hash',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/demo.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    if (useGraphStore.getState().canvas2dRenderer !== 'd3') {
      throw new Error('expected initial composed apply to honor the README preset renderer')
    }

    useGraphStore.getState().setCanvas2dRenderer('storyboard')
    useGraphStore.setState(s => ({ sourceFiles: [s.sourceFiles[1], s.sourceFiles[0]] }))
    applyGraphOwnerComposedGraphFromSourceFiles()

    if (useGraphStore.getState().canvas2dRenderer !== 'storyboard') {
      throw new Error('expected order-only recomposition to avoid replaying an unchanged composed frontmatter preset')
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(previousActivePath)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedSourceFilesDeleteLastEnabledSourceClearsGraphAndOpenWidgets() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const g1: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'n1', label: 'Widget', type: 'Text', properties: {} }],
      edges: [],
      metadata: {},
    }

    state.addSourceFile({
      id: 'sf-1',
      name: 'only.md',
      text: 'widget',
      enabled: true,
      status: 'parsed',
      parsedGraphData: g1,
      parsedTextHash: 'h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/only.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    state.setOpenWidgetNodeIds(['sf-1::n1'])

    const composedBeforeDelete = useGraphStore.getState().graphData
    if (String(((composedBeforeDelete?.metadata || {}) as Record<string, unknown>).sourceLayerComposition || '') !== 'compose') {
      throw new Error('expected composed graph before deleting the last enabled source file')
    }

    state.setSourceFiles([])
    applyGraphOwnerComposedGraphFromSourceFiles()

    const after = useGraphStore.getState()
    const graph = after.graphData
    if (!graph) throw new Error('expected graph state after deleting the last enabled source file')
    if ((graph.nodes || []).length !== 0 || (graph.edges || []).length !== 0) {
      throw new Error('expected deleting the last enabled source file to clear the composed graph immediately')
    }
    if ((after.openWidgetNodeIds || []).length !== 0) {
      throw new Error('expected deleting the last enabled source file to prune stale open widget overlays')
    }
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedAddNodeSeedsActiveMarkdownDocumentWhenGraphMissing() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const graphA: GraphData = {
      type: 'Graph',
      nodes: [{ id: 'a1', label: 'A', type: 'Thing', properties: {} }],
      edges: [],
      metadata: {},
    }

    state.addSourceFile({
      id: 'sf-a',
      name: 'a.md',
      text: '# A',
      enabled: true,
      status: 'parsed',
      parsedGraphData: graphA,
      parsedTextHash: 'ha',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/a.md' },
    })
    state.addSourceFile({
      id: 'sf-b',
      name: 'b.md',
      text: '---\ntitle: B\n---\n',
      enabled: true,
      status: 'idle',
      parsedGraphData: null,
      parsedTextHash: '',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/b.md' },
    })

    applyGraphOwnerComposedGraphFromSourceFiles()
    const composed = useGraphStore.getState()
    composed.setMarkdownDocument('workspace:/b.md', '---\ntitle: B\n---\n')
    useGraphStore.setState({ selectedNodeId: 'sf-a::a1' })

    composed.addNode({
      id: 'grabmaps-discovery-b',
      label: 'GrabMaps Chat Discovery Widget',
      type: 'GrabMapsDiscovery',
      x: 10,
      y: 20,
      properties: { geo: { lat: 1.29, lng: 103.85 } } as never,
    })

    const after = useGraphStore.getState()
    const sourceA = after.sourceFiles.find(f => f.id === 'sf-a')
    const sourceB = after.sourceFiles.find(f => f.id === 'sf-b')
    const inA = sourceA?.parsedGraphData?.nodes?.some(n => n.id === 'grabmaps-discovery-b')
    const inB = sourceB?.parsedGraphData?.nodes?.some(n => n.id === 'grabmaps-discovery-b')
    if (inA) throw new Error('expected active markdown addNode to avoid non-active source file insertion')
    if (!inB) throw new Error('expected addNode to seed and append into active markdown source file when parsed graph is missing')
    if ((sourceB?.parsedGraphRevision || 0) < 1) throw new Error('expected active markdown source parsedGraphRevision to increment after seeded addNode')
    const composedNode = after.graphData?.nodes?.find(n => n.id === 'sf-b::grabmaps-discovery-b')
    if (!composedNode) throw new Error('expected recomposed graph to expose the seeded active markdown source node')
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testAddNodeSeedsActiveMarkdownDocumentWithoutPreexistingComposedGraph() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
    const state = useGraphStore.getState()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    state.addSourceFile({
      id: 'sf-b',
      name: 'b.md',
      text: '---\ntitle: B\n---\n',
      enabled: true,
      status: 'idle',
      parsedGraphData: null,
      parsedTextHash: '',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: 'workspace:/b.md' },
    })

    const before = useGraphStore.getState()
    const fileBefore = before.sourceFiles.find(f => f.id === 'sf-b')
    if (fileBefore?.parsedGraphData) throw new Error('expected active markdown source file to start without parsed graph data')

    before.setMarkdownDocument('workspace:/b.md', '---\ntitle: B\n---\n')
    before.addNode({
      id: 'grabmaps-discovery-c',
      label: 'GrabMaps Chat Discovery Widget',
      type: 'GrabMapsDiscovery',
      x: 10,
      y: 20,
      properties: { geo: { lat: 1.29, lng: 103.85 } } as never,
    })

    const after = useGraphStore.getState()
    const sourceB = after.sourceFiles.find(f => f.id === 'sf-b')
    const inB = sourceB?.parsedGraphData?.nodes?.some(n => n.id === 'grabmaps-discovery-c')
    if (!inB) throw new Error('expected addNode to seed active markdown source file even when no composed graph existed yet')
    if ((sourceB?.parsedGraphRevision || 0) < 1) throw new Error('expected parsedGraphRevision increment after seeding active markdown source file')
    const composedNode = after.graphData?.nodes?.find(n => n.id === 'sf-b::grabmaps-discovery-c')
    if (!composedNode) throw new Error('expected graphData to recompose from seeded active markdown source file')
    if (!String(sourceB?.text || '').includes('flow:')) throw new Error('expected active markdown source text to receive frontmatter flow block writeback')
    if (!String(sourceB?.text || '').includes('GrabMaps Chat Discovery Widget')) throw new Error('expected active markdown source text to include newly appended widget node')
    if (String(after.markdownDocumentText || '') !== String(sourceB?.text || '')) throw new Error('expected active markdown editor text to stay in sync with source file text writeback')
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedUpdateNodePreservesTypedFrontmatterEnvelopeWriteback() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
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
    before.setMarkdownDocument('workspace:/typed.md', '---\ntitle: Typed\n---\n')
    before.updateNode('sf-typed::w-text', {
      properties: {
        ...(((typedGraph.nodes[0] || {}).properties || {}) as Record<string, unknown>),
        prompt: 'new prompt',
      } as never,
    })

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
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedTextWidgetUpdatePreservesWidgetLayoutAndEdgeWritebackSync() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
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
    before.setMarkdownDocument('workspace:/typed-layout.md', '---\ntitle: Typed Layout\n---\n')
    useGraphStore.setState({
      flowWidgetPosByNodeId: { 'sf-layout::w-text': { top: 120, left: 240 } },
      flowWidgetWorldPosByNodeId: { 'sf-layout::w-text': { x: 12, y: 24 } },
    } as never)

    before.updateNode('sf-layout::w-text', {
      properties: {
        ...((((graph.nodes[1] || {}).properties) || {}) as Record<string, unknown>),
        prompt: 'new prompt',
      } as never,
    })

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
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testComposedAddEdgeSyncsToSourceFileAndActiveMarkdownText() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  try {
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
    before.setMarkdownDocument('workspace:/edge.md', '---\ntitle: Edge\n---\n')
    before.addEdge({
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
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}
