import type { GraphData } from '@/lib/graph/types'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { applyComposedGraphFromSourceFiles } from '@/features/source-files/applyComposedGraphFromSourceFiles'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { buildSourceLayerKeys, composeGraphFromSourceLayers, resolveSourceLayerKeyChange } from '@/lib/graph/sourceLayers'
import {
  areSourceFilesEqualByIdAndHash,
  buildSourceFilesCompositionSignature,
  buildSourceFilesGeospatialSelectionSignature,
  buildSourceFilesPersistenceSignature,
} from '@/features/source-files/sourceFilesSignatures'
import {
  areSourceFileRecordsEqual,
  buildSourceFileRecord,
  buildSourceFileLifecycleState,
  normalizeSourceFileRecord,
  normalizeSourceFiles,
  readPersistedSourceFileRecord,
  areSourceFileParsedStatesEqual,
  buildSourceFileParsedState,
  buildUpdatedSourceFileParsedGraphState,
  readPersistedSourceFileParsedState,
  readSourceFileParsedState,
} from '@/features/source-files/sourceFileParsedState'
import {
  incrementParsedGraphRevision,
  resolveParsedGraphRevision,
} from '@/features/source-files/sourceFileParsedGraphRevision'
import {
  areSourceFilesWorkspaceStatesEqual,
  buildSourceFilesWorkspaceStateSignature,
  normalizeSourceFilesWorkspaceState,
} from '@/features/source-files/sourceFilesWorkspaceState'
import {
  resolveComposedApplyDeferralReason,
  shouldDeferComposedGraphRender,
  shouldClearComposedGraphForEmptyState,
} from '@/features/source-files/composedApplyGuards'
import {
  buildComposedSourceFileSelectionKey,
  readComposedSourceFilePath,
  resolvePreferredComposedSourceSelectionKey,
  resolvePreferredComposedDocumentPathFromState,
  resolvePreferredComposedSourceFile,
  resolvePreferredComposedSourceFileFromState,
  resolvePreferredComposedSourceRawText,
  resolvePreferredComposedSourceRawTextFromState,
} from '@/features/source-files/composedSourceSelection'
import {
  isGeospatialSourceFileEligible,
  resolveGeospatialSourceContext,
  resolvePreferredGeospatialSourceFile,
} from '@/features/source-files/geospatialSourceContext'

export function testSourceFilesCompositionOrderAndVisibility() {
  const g1: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }
  const g2: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n2', label: 'B', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const first = composeGraphFromSourceLayers({
    layers: [
      { id: 'sf-1', name: 'a.md', text: 'a', enabled: true, parsedGraphData: g1, parsedTextHash: 'h1', source: { kind: 'local', path: 'a.md' } },
      { id: 'sf-2', name: 'b.md', text: 'b', enabled: true, parsedGraphData: g2, parsedTextHash: 'h2', source: { kind: 'local', path: 'b.md' } },
    ],
  }).graphData
  const meta1 = (first.metadata || {}) as unknown as Record<string, unknown>
  const layers1Raw = meta1.sourceLayers
  const layerIds1 = Array.isArray(layers1Raw)
    ? layers1Raw
        .map(v => (v && typeof v === 'object' && 'id' in v ? String((v as { id?: unknown }).id || '') : ''))
        .filter(Boolean)
    : []
  if (layerIds1.length !== 2) throw new Error('expected 2 sourceLayers')
  if (layerIds1[0] !== 'sf-1' || layerIds1[1] !== 'sf-2') throw new Error('sourceLayers order mismatch')
  if (first.nodes.map(n => n.id).join(',') !== 'sf-1::n1,sf-2::n2') throw new Error('node order mismatch after compose')

  const contentKey1 = String(meta1.sourceLayerHash || '')
  const orderKey1 = String(meta1.sourceLayerOrderHash || '')
  if (!contentKey1 || !orderKey1) throw new Error('expected composition keys')

  const second = composeGraphFromSourceLayers({
    layers: [
      { id: 'sf-2', name: 'b.md', text: 'b', enabled: true, parsedGraphData: g2, parsedTextHash: 'h2', source: { kind: 'local', path: 'b.md' } },
      { id: 'sf-1', name: 'a.md', text: 'a', enabled: true, parsedGraphData: g1, parsedTextHash: 'h1', source: { kind: 'local', path: 'a.md' } },
    ],
  }).graphData
  const meta2 = (second.metadata || {}) as unknown as Record<string, unknown>
  const layers2Raw = meta2.sourceLayers
  const layerIds2 = Array.isArray(layers2Raw)
    ? layers2Raw
        .map(v => (v && typeof v === 'object' && 'id' in v ? String((v as { id?: unknown }).id || '') : ''))
        .filter(Boolean)
    : []
  if (layerIds2.length !== 2) throw new Error('expected 2 sourceLayers after reorder')
  if (layerIds2[0] !== 'sf-2' || layerIds2[1] !== 'sf-1') throw new Error('sourceLayers order mismatch after reorder')
  if (second.nodes.map(n => n.id).join(',') !== 'sf-2::n2,sf-1::n1') throw new Error('node order mismatch after reorder')

  const contentKey2 = String(meta2.sourceLayerHash || '')
  const orderKey2 = String(meta2.sourceLayerOrderHash || '')
  if (contentKey2 !== contentKey1) throw new Error('content key should not change on reorder')
  if (orderKey2 === orderKey1) throw new Error('order key should change on reorder')

  const third = composeGraphFromSourceLayers({
    layers: [
      { id: 'sf-2', name: 'b.md', text: 'b', enabled: false, parsedGraphData: g2, parsedTextHash: 'h2', source: { kind: 'local', path: 'b.md' } },
      { id: 'sf-1', name: 'a.md', text: 'a', enabled: true, parsedGraphData: g1, parsedTextHash: 'h1', source: { kind: 'local', path: 'a.md' } },
    ],
  }).graphData
  if (third.nodes.length !== 1 || third.nodes[0]?.id !== 'sf-1::n1') throw new Error('expected only enabled layer nodes')
}

export function testSourceFilesCompositionMergesWidgetRegistryMetadataFromNonBaseLayer() {
  const g1: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }
  const g2: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n2', label: 'Panel', type: 'RichMediaPanel', properties: { 'flow:widgetTypeId': 'default', 'flow:widgetFormId': 'richMediaPanel' } }],
    edges: [],
    metadata: {
      [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
        {
          id: 'qer-RichMediaPanel-default-richMediaPanel',
          isEnabled: true,
          nodeTypeId: 'RichMediaPanel',
          widgetTypeId: 'default',
          formId: 'richMediaPanel',
          fields: [],
          ports: [{ portKey: 'imageUrl', direction: 'input', schemaPath: 'properties.imageUrl' }],
          updatedAt: '2026-04-22T00:00:00.000Z',
        },
      ],
    },
  }

  const composed = composeGraphFromSourceLayers({
    layers: [
      { id: 'sf-1', name: 'a.md', text: 'a', enabled: true, parsedGraphData: g1, parsedTextHash: 'h1', source: { kind: 'local', path: 'a.md' } },
      { id: 'sf-2', name: 'widget-bundle.frontmatter.yaml', text: 'bundle', enabled: true, parsedGraphData: g2, parsedTextHash: 'h2', source: { kind: 'local', path: 'widget-bundle.frontmatter.yaml' } },
    ],
  }).graphData
  const meta = (composed.metadata || {}) as Record<string, unknown>
  const registry = Array.isArray(meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]) ? (meta[FLOW_WIDGET_REGISTRY_METADATA_KEY] as unknown[]) : []
  if (registry.length !== 1) throw new Error(`expected composed graph to preserve widget registry metadata, got ${registry.length}`)
  const entry = (registry[0] || {}) as Record<string, unknown>
  if (String(entry.nodeTypeId || '') !== 'RichMediaPanel') throw new Error('expected preserved widget registry entry for RichMediaPanel')
}

export function testSourceFilesCompositionSignatureIgnoresStatusOnlyChurn() {
  const base = [
    {
      id: 'sf-1',
      name: 'a.md',
      text: '# A',
      enabled: true,
      status: 'loading',
      parsedTextHash: 'h1',
      parsedGraphRevision: 0,
      parsedGraphData: null,
      source: { kind: 'local', path: 'a.md' },
      error: undefined,
    },
  ]
  const sameCompositionDifferentStatus = [
    {
      ...base[0],
      status: 'error',
      error: 'Request failed',
    },
  ]
  const enabledChanged = [
    {
      ...base[0],
      enabled: false,
    },
  ]
  const pathChanged = [
    {
      ...base[0],
      source: { kind: 'local', path: 'nested/a.md' },
    },
  ]
  const textPresenceChanged = [
    {
      ...base[0],
      text: '',
      parsedTextHash: '',
    },
  ]

  const baseSignature = buildSourceFilesCompositionSignature(base)
  if (buildSourceFilesCompositionSignature(sameCompositionDifferentStatus) !== baseSignature) {
    throw new Error('expected composition signature to ignore status-only churn')
  }
  if (buildSourceFilesCompositionSignature(enabledChanged) === baseSignature) {
    throw new Error('expected composition signature to change when enabled state changes')
  }
  if (buildSourceFilesCompositionSignature(pathChanged) === baseSignature) {
    throw new Error('expected composition signature to change when source path changes')
  }
  if (buildSourceFilesCompositionSignature(textPresenceChanged) === baseSignature) {
    throw new Error('expected composition signature to change when text presence changes')
  }
}

export function testSourceFilesGeospatialSelectionSignatureTracksGeoLayerEligibility() {
  const base = [
    {
      id: 'source:a',
      name: 'a.md',
      text: '# A',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'a.md' },
    },
  ]
  const geoLayerDisabled = [
    {
      ...base[0],
      geoLayerEnabled: false,
    },
  ]
  const disabled = [
    {
      ...base[0],
      enabled: false,
    },
  ]
  const baseSignature = buildSourceFilesGeospatialSelectionSignature(base)
  if (buildSourceFilesGeospatialSelectionSignature(geoLayerDisabled) === baseSignature) {
    throw new Error('expected geospatial selection signature to change when geoLayerEnabled changes')
  }
  if (buildSourceFilesGeospatialSelectionSignature(disabled) === baseSignature) {
    throw new Error('expected geospatial selection signature to change when enabled changes')
  }
}

export function testSourceFilesGeospatialSelectionSignatureUsesCandidateProfiles() {
  const geoTextA = '```geojson\n{"type":"FeatureCollection","features":[1]}\n```'
  const geoTextB = '```geojson\n{"type":"FeatureCollection","features":[2]}\n```'
  const base = [
    {
      id: 'source:geo',
      name: 'geo.md',
      text: geoTextA,
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'geo.md' },
    },
    {
      id: 'source:plain',
      name: 'plain.md',
      text: 'Plain source file without map data.',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'plain.md' },
    },
  ]
  const statusOnlyChurn = [
    base[0],
    {
      ...base[1],
      status: 'idle',
      text: 'Other source text without map data.',
    },
  ]
  const geoContentChanged = [
    {
      ...base[0],
      text: geoTextB,
    },
    base[1],
  ]
  const baseSignature = buildSourceFilesGeospatialSelectionSignature(base)
  if (buildSourceFilesGeospatialSelectionSignature(statusOnlyChurn) !== baseSignature) {
    throw new Error('expected geospatial source-file selection signatures to ignore plain non-map text and status churn')
  }
  if (buildSourceFilesGeospatialSelectionSignature(geoContentChanged) === baseSignature) {
    throw new Error('expected geospatial source-file selection signatures to still track geo candidate content changes')
  }
}

export function testSourceLayerKeysIgnoreParsedGraphRevisionOnlyChurnWhenGraphSemanticsMatch() {
  const baseGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: { stage: 'draft' } }],
    edges: [{ id: 'e1', source: 'n1', target: 'n1', label: 'self', properties: {} }],
    metadata: {
      kind: 'frontmatter-flow',
      graphDataRevision: 1,
      hash: 'rev:1',
    },
  }
  const sameSemanticGraph: GraphData = {
    ...baseGraph,
    nodes: baseGraph.nodes.map(node => ({ ...node, properties: { ...(node.properties || {}) } })),
    edges: baseGraph.edges.map(edge => ({ ...edge, properties: { ...(edge.properties || {}) } })),
    metadata: {
      kind: 'frontmatter-flow',
      graphDataRevision: 99,
      hash: 'rev:99',
    },
  }
  const changedSemanticGraph: GraphData = {
    ...sameSemanticGraph,
    nodes: sameSemanticGraph.nodes.map(node => (
      node.id === 'n1' ? { ...node, label: 'A changed' } : node
    )),
  }

  const baseKeys = buildSourceLayerKeys([
    {
      id: 'sf-1',
      name: 'demo.md',
      text: '# Demo',
      enabled: true,
      parsedTextHash: 'parsed-demo',
      parsedGraphRevision: 1,
      parsedGraphData: baseGraph,
      source: { kind: 'local', path: 'demo.md' },
    },
  ])
  const sameSemanticKeys = buildSourceLayerKeys([
    {
      id: 'sf-1',
      name: 'demo.md',
      text: '# Demo',
      enabled: true,
      parsedTextHash: 'parsed-demo',
      parsedGraphRevision: 99,
      parsedGraphData: sameSemanticGraph,
      source: { kind: 'local', path: 'demo.md' },
    },
  ])
  const changedSemanticKeys = buildSourceLayerKeys([
    {
      id: 'sf-1',
      name: 'demo.md',
      text: '# Demo',
      enabled: true,
      parsedTextHash: 'parsed-demo',
      parsedGraphRevision: 100,
      parsedGraphData: changedSemanticGraph,
      source: { kind: 'local', path: 'demo.md' },
    },
  ])

  if (sameSemanticKeys.contentKey !== baseKeys.contentKey || sameSemanticKeys.orderKey !== baseKeys.orderKey) {
    throw new Error('expected source-layer keys to ignore parsed graph revision churn when the parsed graph semantics stay unchanged')
  }
  if (changedSemanticKeys.contentKey === baseKeys.contentKey || changedSemanticKeys.orderKey === baseKeys.orderKey) {
    throw new Error('expected source-layer keys to change when parsed graph semantics change')
  }
}

export function testSourceFilesPersistenceSignatureHashesContentNotLengthOnly() {
  const left = [
    {
      id: 'sf-1',
      name: 'a.md',
      text: 'abcd',
      enabled: true,
      parsedTextHash: 'parsed-1',
      source: { kind: 'local', path: 'a.md' },
    },
  ]
  const sameLengthDifferentContent = [
    {
      ...left[0],
      text: 'wxyz',
    },
  ]

  if (buildSourceFilesPersistenceSignature(left) === buildSourceFilesPersistenceSignature(sameLengthDifferentContent)) {
    throw new Error('expected source-files persistence signature to change when same-length text content changes')
  }
  if (areSourceFilesEqualByIdAndHash(left, sameLengthDifferentContent)) {
    throw new Error('expected source-files persistence equality to detect same-length text content changes via shared hashing')
  }
}

export function testWorkspaceSourceFileRuntimeStateStaysTransientForPersistence() {
  const workspaceOriginal = [
    {
      id: 'ws-1',
      name: 'agentic-graph-video-demo.md',
      text: '# Demo',
      enabled: false,
      parsedTextHash: 'parsed-demo',
      source: { kind: 'local', path: 'workspace:/docs/agentic-graph-video-demo.md' },
    },
  ]
  const workspaceUpdated = [{ ...workspaceOriginal[0], enabled: true, text: '# Demo updated during workspace switching' }]
  if (buildSourceFilesPersistenceSignature(workspaceOriginal) !== buildSourceFilesPersistenceSignature(workspaceUpdated)) {
    throw new Error('expected workspace source-file runtime state to stay transient for persistence signature')
  }
  if (!areSourceFilesEqualByIdAndHash(workspaceOriginal, workspaceUpdated)) {
    throw new Error('expected workspace source-file runtime state to be ignored by persistence equality guards')
  }
}

export function testSourceLayerKeyChangeHelperCentralizesApplyBranching() {
  const previous: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      sourceLayerHash: 'content-a',
      sourceLayerOrderHash: 'order-a',
    },
  }

  if (
    resolveSourceLayerKeyChange({
      previousGraphData: previous,
      contentKey: 'content-a',
      orderKey: 'order-a',
    }) !== 'unchanged'
  ) {
    throw new Error('expected source-layer key change helper to treat identical content/order keys as unchanged')
  }

  if (
    resolveSourceLayerKeyChange({
      previousGraphData: previous,
      contentKey: 'content-a',
      orderKey: 'order-b',
    }) !== 'order-only'
  ) {
    throw new Error('expected source-layer key change helper to detect order-only source-layer changes')
  }

  if (
    resolveSourceLayerKeyChange({
      previousGraphData: previous,
      contentKey: 'content-b',
      orderKey: 'order-b',
    }) !== 'content'
  ) {
    throw new Error('expected source-layer key change helper to detect content-changing source-layer updates')
  }
}

export function testComposedApplyDeferralHelperCentralizesRaceSuppression() {
  const previousNodeBearingGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'stable', label: 'Stable', type: 'Thing', properties: {} }],
    edges: [{ id: 'stable-edge', source: 'stable', target: 'stable', label: 'stable', properties: {} }],
    metadata: {},
  }
  const emptyGraph: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {},
  }
  const edgeOnlyGraph: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [{ id: 'e1', source: 'a', target: 'b', label: 'edge', properties: {} }],
    metadata: {},
  }

  if (
    resolveComposedApplyDeferralReason({
      previousGraphData: previousNodeBearingGraph,
      composedGraphData: emptyGraph,
      layers: [{ enabled: true, source: { kind: 'url', url: 'https://example.com/demo.md' }, text: '', parsedGraphData: null }],
    }) !== 'pending-remote-source'
  ) {
    throw new Error('expected composed apply deferral helper to preserve the current graph while enabled remote sources are still hydrating')
  }

  if (
    resolveComposedApplyDeferralReason({
      previousGraphData: previousNodeBearingGraph,
      composedGraphData: edgeOnlyGraph,
      layers: [{ enabled: true, status: 'idle', text: '# pending parse', parsedGraphData: edgeOnlyGraph }],
    }) !== 'pending-parse-edge-only'
  ) {
    throw new Error('expected composed apply deferral helper to preserve node-bearing graphs during transient edge-only parse races')
  }

  if (
    resolveComposedApplyDeferralReason({
      previousGraphData: previousNodeBearingGraph,
      composedGraphData: emptyGraph,
      layers: [{ enabled: true, status: 'idle', text: '# pending text', parsedGraphData: null }],
    }) !== 'pending-text-without-parsed'
  ) {
    throw new Error('expected composed apply deferral helper to preserve the current graph while enabled text waits for its first parsed graph')
  }

  if (
    resolveComposedApplyDeferralReason({
      previousGraphData: previousNodeBearingGraph,
      composedGraphData: previousNodeBearingGraph,
      layers: [{ enabled: true, status: 'parsed', text: '# parsed text', parsedGraphData: previousNodeBearingGraph }],
      workspaceEditorOverlayOpen: true,
    }) !== null
  ) {
    throw new Error('expected composed apply deferral helper to avoid blocking semantic source-file graph/preset updates while Workspace overlay is open')
  }

  if (
    resolveComposedApplyDeferralReason({
      previousGraphData: previousNodeBearingGraph,
      composedGraphData: emptyGraph,
      layers: [
        { enabled: true, status: 'parsed', text: '# parsed text', parsedGraphData: previousNodeBearingGraph },
        { enabled: true, status: 'idle', text: '# pending text', parsedGraphData: null },
      ],
    }) !== null
  ) {
    throw new Error('expected composed apply deferral helper to allow apply when at least one enabled layer already has parsed content')
  }
}

export function testComposedApplyEmptyStateHelperCentralizesClearingRule() {
  const composedGraph: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      sourceLayerComposition: 'compose',
    },
  }
  const nonComposedGraph: GraphData = {
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {},
  }

  if (
    !shouldClearComposedGraphForEmptyState({
      previousGraphData: composedGraph,
      hasEnabledSourceFiles: false,
      hasEnabledContent: false,
    })
  ) {
    throw new Error('expected composed apply empty-state helper to clear previously composed graphs when all enabled source files disappear')
  }

  if (
    !shouldClearComposedGraphForEmptyState({
      previousGraphData: composedGraph,
      hasEnabledSourceFiles: true,
      hasEnabledContent: false,
    })
  ) {
    throw new Error('expected composed apply empty-state helper to clear previously composed graphs when enabled sources remain but none have content')
  }

  if (
    shouldClearComposedGraphForEmptyState({
      previousGraphData: nonComposedGraph,
      hasEnabledSourceFiles: false,
      hasEnabledContent: false,
    })
  ) {
    throw new Error('expected composed apply empty-state helper to leave non-composed graphs untouched')
  }
}

export function testComposedGraphRenderDeferralWaitsForCanonicalSourceLayerIdentity() {
  const directGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'local_node', label: 'Local', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }
  const otherParsedGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'other_node', label: 'Other', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }
  const composedGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'ws:abc123::local_node', label: 'Local', type: 'Thing', properties: {} }],
    edges: [],
    metadata: { sourceLayerComposition: 'compose' },
  }

  if (
    shouldDeferComposedGraphRender({
      graphData: directGraph,
      layers: [{ enabled: true, status: 'parsed', parsedGraphData: directGraph }],
    })
  ) {
    throw new Error('expected composed graph render deferral to allow the active source-local parsed graph to render its own overlays')
  }

  if (
    !shouldDeferComposedGraphRender({
      graphData: directGraph,
      layers: [{ enabled: true, status: 'parsed', parsedGraphData: otherParsedGraph }],
    })
  ) {
    throw new Error('expected composed graph render deferral to block stale source-local overlays while different parsed source layers are ready to compose')
  }

  if (
    shouldDeferComposedGraphRender({
      graphData: composedGraph,
      layers: [{ enabled: true, status: 'parsed', parsedGraphData: directGraph }],
    })
  ) {
    throw new Error('expected composed graph render deferral to allow overlays once source-layer composition owns canonical node ids')
  }

  if (
    shouldDeferComposedGraphRender({
      graphData: directGraph,
      layers: [{ enabled: true, status: 'idle', text: '# pending parse', parsedGraphData: null }],
    })
  ) {
    throw new Error('expected composed graph render deferral to avoid hiding direct graphs before any parsed source-layer graph exists')
  }
}

export function testComposedGraphRenderDeferralAllowsActiveFrontmatterFlowGraph() {
  const activeFrontmatterGraph: GraphData = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'frontmatter_widget', label: 'Frontmatter Widget', type: 'TextGeneration', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow' },
  }
  const otherParsedGraph: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'other_node', label: 'Other', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  if (
    shouldDeferComposedGraphRender({
      graphData: activeFrontmatterGraph,
      layers: [{ enabled: true, status: 'parsed', parsedGraphData: otherParsedGraph }],
    })
  ) {
    throw new Error('expected active frontmatter-flow graphs to render Storyboard Widget overlays while Source Files composition catches up')
  }
}

export async function testComposedUnchangedLayersReapplyActiveSourceFrontmatterPreset() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body></body></html>')
  const previousActivePath = useMarkdownExplorerStore.getState().activePath
  try {
    const state = useGraphStore.getState()
    state.resetAll()
    state.clearSourceFiles()
    state.setGraphData({ type: 'Graph', nodes: [], edges: [], metadata: {} } as unknown as GraphData)

    const mapsPath = 'docs/agentic-graph-maps-places.md'
    const videoPath = 'docs/agentic-graph-video-demo.md'
    const mapsText = [
      '---',
      'title: "Maps"',
      'kgCanvasSurfaceMode: "geospatial"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "d3"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      '---',
      '# Maps',
    ].join('\n')
    const videoText = [
      '---',
      'title: "Video Demo"',
      'kgCanvasSurfaceMode: "2d"',
      'kgCanvasRenderMode: "2d"',
      'kgCanvas2dRenderer: "storyboard"',
      'kgDocumentSemanticMode: "document"',
      'kgFrontmatterModeEnabled: true',
      '---',
      '# Video Demo',
    ].join('\n')

    state.addSourceFile({
      id: 'sf-maps',
      name: 'agentic-graph-maps-places.md',
      text: mapsText,
      enabled: true,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'maps-node', label: 'Maps', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'maps-h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: mapsPath },
    })
    state.addSourceFile({
      id: 'sf-video',
      name: 'agentic-graph-video-demo.md',
      text: videoText,
      enabled: true,
      status: 'parsed',
      parsedGraphData: {
        type: 'Graph',
        nodes: [{ id: 'video-node', label: 'Video', type: 'Thing', properties: {} }],
        edges: [],
        metadata: {},
      },
      parsedTextHash: 'video-h1',
      parsedGraphRevision: 0,
      source: { kind: 'local', path: videoPath },
    })

    useMarkdownExplorerStore.getState().setActivePath(mapsPath)
    state.setMarkdownDocument(mapsPath, mapsText)
    applyComposedGraphFromSourceFiles()
    useGraphStore.getState().setCanvas2dRenderer('d3')

    useMarkdownExplorerStore.getState().setActivePath(videoPath)
    state.setMarkdownDocument(videoPath, videoText)
    applyComposedGraphFromSourceFiles()

    const after = useGraphStore.getState()
    if (after.canvasRenderMode !== '2d') {
      throw new Error(`expected unchanged-layer active source switch to keep render mode in 2d, got ${String(after.canvasRenderMode)}`)
    }
    if (after.canvas2dRenderer !== 'storyboard') {
      throw new Error(`expected unchanged-layer active source switch to reapply video frontmatter renderer preset, got ${String(after.canvas2dRenderer)}`)
    }
  } finally {
    useMarkdownExplorerStore.getState().setActivePath(previousActivePath)
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export function testComposedSourceSelectionHelperCentralizesActiveFileAndRawTextResolution() {
  const sourceFiles = [
    {
      id: 'sf-readme',
      name: 'README.md',
      text: '# Readme',
      enabled: true,
      source: { kind: 'local', path: 'workspace:/README.md' },
    },
    {
      id: 'sf-doc',
      name: 'notes/demo.md',
      text: '# Demo',
      enabled: true,
      source: { kind: 'local', path: '/notes/demo.md/' },
    },
    {
      id: 'sf-disabled',
      name: 'disabled.md',
      text: '# Disabled',
      enabled: false,
      source: { kind: 'local', path: 'workspace:/disabled.md' },
    },
  ] as unknown as import('@/hooks/store/types').GraphState['sourceFiles']

  if (readComposedSourceFilePath(sourceFiles[1]) !== '/notes/demo.md') {
    throw new Error('expected composed source selection helper to normalize source-file paths through a shared reader')
  }

  const selectionKey = buildComposedSourceFileSelectionKey(sourceFiles[1])
  if (!selectionKey.includes('/notes/demo.md') || !selectionKey.includes('sf-doc')) {
    throw new Error(`expected composed source selection key to include canonical path and stable source id, got ${selectionKey}`)
  }

  const exact = resolvePreferredComposedSourceFile({
    sourceFiles,
    markdownDocumentName: 'workspace:/notes/demo.md',
  })
  if (exact?.id !== 'sf-doc') {
    throw new Error('expected composed source selection helper to prefer the active markdown path match')
  }

  const exactSelectionKey = resolvePreferredComposedSourceSelectionKey({
    sourceFiles,
    markdownDocumentName: 'workspace:/notes/demo.md',
    enabledOnly: true,
  })
  if (exactSelectionKey !== selectionKey) {
    throw new Error(`expected active composed source selection key to reuse the preferred source-file resolver, got ${exactSelectionKey}`)
  }

  const fallbackByName = resolvePreferredComposedSourceFile({
    sourceFiles,
    markdownDocumentName: '',
    fallbackName: 'README.md',
  })
  if (fallbackByName?.id !== 'sf-readme') {
    throw new Error('expected composed source selection helper to fall back to canonical file-name matching when no active path is available')
  }

  const enabledOnly = resolvePreferredComposedSourceFile({
    sourceFiles,
    markdownDocumentName: 'workspace:/disabled.md',
    enabledOnly: true,
  })
  if (enabledOnly !== null) {
    throw new Error('expected composed source selection helper to respect enabledOnly filtering for active-path matches')
  }

  const rawText = resolvePreferredComposedSourceRawText({
    sourceFiles,
    markdownDocumentName: 'workspace:/notes/demo.md',
  })
  if (rawText !== '# Demo') {
    throw new Error('expected composed source raw-text helper to reuse the preferred active source-file selection')
  }

  const activePath = resolvePreferredComposedDocumentPathFromState({
    state: {
      sourceFiles,
      markdownDocumentName: '',
    } as unknown as import('@/hooks/store/types').GraphState,
    explorerActivePath: 'workspace:/notes/demo.md',
    fallbackName: 'README.md',
  })
  if (activePath !== '/notes/demo.md') {
    throw new Error('expected composed source selection helper to centralize markdown-document vs explorer active-path precedence from state')
  }

  const fromState = resolvePreferredComposedSourceFileFromState({
    state: {
      sourceFiles,
      markdownDocumentName: '',
    } as unknown as import('@/hooks/store/types').GraphState,
    explorerActivePath: 'workspace:/notes/demo.md',
    fallbackName: 'README.md',
  })
  if (fromState?.id !== 'sf-doc') {
    throw new Error('expected state-driven composed source selection helper to reuse active document path precedence')
  }

  const rawTextFromState = resolvePreferredComposedSourceRawTextFromState({
    state: {
      sourceFiles,
      markdownDocumentName: '',
    } as unknown as import('@/hooks/store/types').GraphState,
    explorerActivePath: 'workspace:/notes/demo.md',
    fallbackName: 'README.md',
  })
  if (rawTextFromState !== '# Demo') {
    throw new Error('expected state-driven composed source raw-text helper to reuse the centralized active document precedence')
  }
}

export function testGeospatialSourceContextHelperCentralizesGeoEligibleSourceResolution() {
  const sourceFiles = [
    {
      id: 'sf-wrong',
      name: 'target.md.backup',
      text: '| name | location (lat,lng) |\n| --- | --- |\n| Wrong File | 1.1, 103.1 |\n',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'workspace:/sandbox/target.md.backup' },
    },
    {
      id: 'sf-target',
      name: 'target.md',
      text: '| name | location (lat,lng) |\n| --- | --- |\n| Exact Match | 1.2, 103.2 |\n',
      enabled: true,
      status: 'parsed',
      source: { kind: 'local', path: 'workspace:/sandbox/target.md' },
    },
    {
      id: 'sf-disabled-geo',
      name: 'graph-id-target.md',
      text: '| name | location (lat,lng) |\n| --- | --- |\n| Disabled | 1.3, 103.3 |\n',
      enabled: true,
      geoLayerEnabled: false,
      status: 'parsed',
      source: { kind: 'local', path: 'workspace:/sandbox/graph-id-target.md' },
    },
  ] as unknown as import('@/hooks/store/types').GraphState['sourceFiles']

  if (!isGeospatialSourceFileEligible(sourceFiles[1])) {
    throw new Error('expected shared geospatial source helper to treat enabled markdown files as eligible by default')
  }
  if (isGeospatialSourceFileEligible(sourceFiles[2])) {
    throw new Error('expected shared geospatial source helper to reject files with geoLayerEnabled=false')
  }

  const exactPathMatch = resolvePreferredGeospatialSourceFile({
    sourceFiles,
    sourceDocumentPath: 'workspace:/sandbox/target.md',
  })
  if (exactPathMatch?.id !== 'sf-target') {
    throw new Error('expected shared geospatial source resolver to prefer exact normalized sourceDocumentPath matches')
  }

  const graphIdFallback = resolvePreferredGeospatialSourceFile({
    sourceFiles: [
      {
        id: 'sf-graph-id-target',
        name: 'graph-id-target.md',
        text: '| name | location (lat,lng) |\n| --- | --- |\n| Graph Id Match | 1.4, 103.4 |\n',
        enabled: true,
        status: 'parsed',
        source: { kind: 'local', path: 'workspace:/sandbox/graph-id-target.md' },
      },
    ] as unknown as import('@/hooks/store/types').GraphState['sourceFiles'],
    graphId: 'workspace:/sandbox/graph-id-target.md',
  })
  if (graphIdFallback?.id !== 'sf-graph-id-target') {
    throw new Error('expected shared geospatial source resolver to reuse graphId path fallback when editor source path is absent')
  }

  const directContext = resolveGeospatialSourceContext({
    graphData: {
      type: 'Graph',
      context: 'markdown',
      nodes: [],
      edges: [],
      metadata: { graphId: 'workspace:/sandbox/target.md' },
    },
    markdownText: '# Direct',
    sourceDocumentPath: 'workspace:/sandbox/target.md',
    sourceFiles,
  })
  if (directContext.resolvedFrom !== 'direct' || directContext.markdownContext?.sourceDocumentPath !== 'workspace:/sandbox/target.md') {
    throw new Error('expected shared geospatial source context helper to preserve direct editor markdown context when present')
  }

  const sourceFilesContext = resolveGeospatialSourceContext({
    graphData: {
      type: 'Graph',
      context: 'markdown',
      nodes: [],
      edges: [],
      metadata: { graphId: 'workspace:/sandbox/target.md' },
    },
    markdownText: '',
    sourceDocumentPath: '',
    sourceFiles,
  })
  if (sourceFilesContext.resolvedFrom !== 'sourceFiles' || sourceFilesContext.bestSourceFile?.id !== 'sf-target') {
    throw new Error('expected shared geospatial source context helper to fall back to the matched source file outside editor mode')
  }
  if (sourceFilesContext.markdownContext?.sourceDocumentPath !== '/sandbox/target.md') {
    throw new Error('expected shared geospatial source context helper to normalize fallback source paths through the shared composed path reader')
  }
}

export function testSourceFilesParsedGraphRevisionUsesSharedOwnershipRules() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  if (resolveParsedGraphRevision({ parsedGraphData: undefined }) !== undefined) {
    throw new Error('expected parsed graph revision to clear when parsed graph data is absent')
  }
  if (resolveParsedGraphRevision({ parsedGraphData: graphData }) !== 0) {
    throw new Error('expected fresh parsed graph revisions to start at the shared baseline revision')
  }
  if (
    resolveParsedGraphRevision({
      parsedGraphData: graphData,
      previousRevision: 7,
      preserveExisting: true,
    }) !== 7
  ) {
    throw new Error('expected parsed graph revision reuse to preserve the existing revision when graph data is reused')
  }
  if (
    resolveParsedGraphRevision({
      parsedGraphData: graphData,
      previousRevision: 'bad',
      preserveExisting: true,
    }) !== 0
  ) {
    throw new Error('expected parsed graph revision reuse to fall back to the shared baseline revision when the previous revision is invalid')
  }
  if (incrementParsedGraphRevision(undefined) !== 1) {
    throw new Error('expected parsed graph revision increments to derive from the shared baseline revision')
  }
  if (incrementParsedGraphRevision(4) !== 5) {
    throw new Error('expected parsed graph revision increments to advance existing revisions monotonically')
  }
}

export function testSourceFileParsedStateHelperCentralizesSnapshots() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const cleared = buildSourceFileParsedState()
  if (cleared.parsedParserId !== undefined || cleared.parsedTextHash !== undefined) {
    throw new Error('expected parsed state reset helper to clear parser identity metadata')
  }
  if (cleared.parsedGraphRevision !== undefined || cleared.parsedGraphData !== undefined) {
    throw new Error('expected parsed state reset helper to clear parsed graph payload metadata')
  }

  const parsed = buildSourceFileParsedState({
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData,
  })
  if (parsed.parsedParserId !== 'frontmatter' || parsed.parsedTextHash !== 'hash-1') {
    throw new Error('expected parsed state helper to preserve parser identity fields on parse success')
  }
  if (parsed.parsedGraphRevision !== 0 || parsed.parsedGraphData !== graphData) {
    throw new Error('expected parsed state helper to seed parsed graph payloads at baseline revision')
  }

  const failed = buildSourceFileParsedState({
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData: undefined,
  })
  if (failed.parsedParserId !== 'frontmatter' || failed.parsedTextHash !== 'hash-1') {
    throw new Error('expected parsed state helper to preserve parse identity on parser failures without graph output')
  }
  if (failed.parsedGraphRevision !== undefined || failed.parsedGraphData !== undefined) {
    throw new Error('expected parsed state helper to clear parsed graph payloads when parser output is empty')
  }

  const updated = buildUpdatedSourceFileParsedGraphState({
    previousParsedState: parsed,
    graphData: { ...graphData, nodes: [...graphData.nodes, { id: 'n2', label: 'B', type: 'Thing', properties: {} }] },
  })
  if (updated.parsedParserId !== 'frontmatter' || updated.parsedTextHash !== 'hash-1') {
    throw new Error('expected parsed graph update helper to preserve parser identity metadata during graph-side mutations')
  }
  if (updated.parsedGraphRevision !== 1) {
    throw new Error('expected parsed graph update helper to increment revision from the shared baseline')
  }
}

export function testSourceFileParsedStateHelperNormalizesEqualityAndPersistenceViews() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const normalized = readSourceFileParsedState({
    parsedParserId: ' parser ',
    parsedTextHash: ' hash-1 ',
    parsedGraphRevision: 'bad',
    parsedGraphData: graphData,
  })
  if (normalized.parsedParserId !== 'parser' || normalized.parsedTextHash !== 'hash-1') {
    throw new Error('expected parsed state reader to normalize parser identity fields')
  }
  if (normalized.parsedGraphRevision !== 0 || normalized.parsedGraphData !== graphData) {
    throw new Error('expected parsed state reader to normalize graph payload state through the shared revision helper')
  }

  const persisted = readPersistedSourceFileParsedState(normalized)
  if (persisted.parsedParserId !== 'parser' || persisted.parsedTextHash !== 'hash-1') {
    throw new Error('expected persisted parsed state reader to keep only canonical persisted parsed identity fields')
  }

  if (
    !areSourceFileParsedStatesEqual(
      normalized,
      { parsedParserId: 'parser', parsedTextHash: 'hash-1', parsedGraphRevision: 0, parsedGraphData: graphData },
    )
  ) {
    throw new Error('expected parsed state equality helper to treat normalized parsed states as equal')
  }

  if (
    !areSourceFileParsedStatesEqual(
      normalized,
      { parsedParserId: 'parser', parsedTextHash: 'hash-1', parsedGraphRevision: 99, parsedGraphData: {} as GraphData },
      { includeGraphData: false, includeGraphRevision: false },
    )
  ) {
    throw new Error('expected parsed state equality helper to support persistence-style comparisons without graph payload identity')
  }
}

export function testSourceFileLifecycleStateHelperCentralizesLifecycleSnapshots() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const loading = buildSourceFileLifecycleState({ status: 'loading' })
  if (loading.status !== 'loading' || loading.error !== undefined) {
    throw new Error('expected lifecycle helper to normalize non-error lifecycle status metadata')
  }
  if (loading.parsedParserId !== undefined || loading.parsedGraphData !== undefined) {
    throw new Error('expected loading lifecycle helper to clear parsed state when no previous state is preserved')
  }

  const parsed = buildSourceFileLifecycleState({
    status: 'parsed',
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData,
  })
  if (parsed.status !== 'parsed' || parsed.error !== undefined) {
    throw new Error('expected lifecycle helper to normalize parsed lifecycle status metadata')
  }
  if (parsed.parsedParserId !== 'frontmatter' || parsed.parsedTextHash !== 'hash-1') {
    throw new Error('expected lifecycle helper to retain parse identity fields on parse success')
  }
  if (parsed.parsedGraphRevision !== 0 || parsed.parsedGraphData !== graphData) {
    throw new Error('expected lifecycle helper to reuse parsed-state ownership for parsed payloads')
  }

  const preserved = buildSourceFileLifecycleState({
    status: 'loading',
    previousState: parsed,
    preserveParsedState: true,
  })
  if (preserved.parsedParserId !== 'frontmatter' || preserved.parsedTextHash !== 'hash-1') {
    throw new Error('expected lifecycle helper to preserve parsed identity while transient loading/error states are in flight')
  }
  if (preserved.parsedGraphRevision !== 0 || preserved.parsedGraphData !== graphData) {
    throw new Error('expected lifecycle helper to preserve parsed graph payloads when explicitly requested')
  }

  const failed = buildSourceFileLifecycleState({
    status: 'error',
    error: ' Parse failed ',
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData: undefined,
  })
  if (failed.status !== 'error' || failed.error !== 'Parse failed') {
    throw new Error('expected lifecycle helper to normalize canonical error metadata')
  }
  if (failed.parsedParserId !== 'frontmatter' || failed.parsedTextHash !== 'hash-1') {
    throw new Error('expected lifecycle helper to preserve parse identity on parser failures without graph output')
  }
  if (failed.parsedGraphRevision !== undefined || failed.parsedGraphData !== undefined) {
    throw new Error('expected lifecycle helper to clear parsed graph payloads when parser output is empty')
  }
}

export function testSourceFileRecordBuilderCentralizesCreationDefaults() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const idle = buildSourceFileRecord({
    id: 'sf-1',
    name: ' source.md ',
    text: 'hello',
    enabled: true,
    source: { kind: 'local', path: 'source.md' },
  })
  if (idle.name !== 'source.md' || idle.text !== 'hello') {
    throw new Error('expected source-file record builder to normalize core source-file fields')
  }
  if (idle.status !== 'idle' || idle.error !== undefined) {
    throw new Error('expected source-file record builder to seed idle lifecycle defaults when no status is provided')
  }
  if (idle.parsedParserId !== undefined || idle.parsedGraphData !== undefined) {
    throw new Error('expected source-file record builder to clear parsed metadata on fresh source-file creation')
  }

  const parsed = buildSourceFileRecord({
    id: 'sf-2',
    name: 'parsed.md',
    text: '# parsed',
    enabled: true,
    status: 'parsed',
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData,
    source: { kind: 'url', url: 'https://example.com/parsed.md' },
  })
  if (parsed.status !== 'parsed' || parsed.parsedTextHash !== 'hash-1') {
    throw new Error('expected source-file record builder to delegate parsed lifecycle snapshots through the shared lifecycle helper')
  }
  if (parsed.parsedGraphRevision !== 0 || parsed.parsedGraphData !== graphData) {
    throw new Error('expected source-file record builder to preserve parsed graph payload ownership semantics')
  }
}

export function testSourceFileRecordNormalizerCanonicalizesSetPathsWithoutChurn() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const raw = {
    id: ' sf-1 ',
    name: ' source.md ',
    text: 'hello',
    enabled: 1,
    status: 'weird',
    error: '  ',
    parsedParserId: ' parser ',
    parsedTextHash: ' hash-1 ',
    parsedGraphRevision: 'bad',
    parsedGraphData: graphData,
    source: { kind: 'local', path: '' },
  } as unknown as import('@/hooks/store/types').SourceFile
  const normalized = normalizeSourceFileRecord(raw)
  if (normalized.id !== 'sf-1' || normalized.name !== 'source.md') {
    throw new Error('expected source-file normalizer to trim canonical identifiers')
  }
  if (normalized.status !== 'idle' || normalized.error !== undefined) {
    throw new Error('expected source-file normalizer to coerce invalid lifecycle metadata onto canonical defaults')
  }
  if (normalized.parsedParserId !== 'parser' || normalized.parsedTextHash !== 'hash-1') {
    throw new Error('expected source-file normalizer to reuse shared parsed-state normalization')
  }
  if (normalized.parsedGraphRevision !== 0 || normalized.parsedGraphData !== graphData) {
    throw new Error('expected source-file normalizer to preserve parsed graph payload ownership semantics')
  }
  if (String(normalized.source?.path || '') !== 'source.md') {
    throw new Error('expected source-file normalizer to backfill local source paths from canonical names')
  }

  const canonical = buildSourceFileRecord({
    id: 'sf-2',
    name: 'stable.md',
    text: '# stable',
    enabled: true,
    status: 'parsed',
    parserId: 'frontmatter',
    textHash: 'hash-stable',
    graphData,
    source: { kind: 'url', url: 'https://example.com/stable.md', path: 'workspace:/stable.md' },
  })
  if (normalizeSourceFileRecord(canonical) !== canonical) {
    throw new Error('expected source-file normalizer to preserve canonical source-file object identity')
  }
  const canonicalList = [canonical]
  if (normalizeSourceFiles(canonicalList) !== canonicalList) {
    throw new Error('expected source-file array normalizer to preserve canonical array identity when no normalization is needed')
  }
}

export function testSourceFileRecordEqualityCentralizesCanonicalFieldComparison() {
  const graphDataA: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }
  const graphDataB: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n2', label: 'B', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const left = buildSourceFileRecord({
    id: 'sf-1',
    name: 'same.md',
    text: '# same',
    enabled: true,
    geoLayerEnabled: true,
    status: 'parsed',
    error: undefined,
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData: graphDataA,
    source: { kind: 'url', url: 'https://example.com/same.md', path: 'workspace:/same.md' },
  })
  const right = buildSourceFileRecord({
    id: 'sf-1',
    name: 'same.md',
    text: '# same',
    enabled: true,
    geoLayerEnabled: true,
    status: 'parsed',
    error: undefined,
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData: graphDataA,
    source: { kind: 'url', url: 'https://example.com/same.md', path: 'workspace:/same.md' },
  })
  if (!areSourceFileRecordsEqual(left, right)) {
    throw new Error('expected shared source-file record equality to treat identical canonical records as equal')
  }

  const persistedView = buildSourceFileRecord({
    id: 'sf-1',
    name: 'same.md',
    text: '# same',
    enabled: true,
    geoLayerEnabled: true,
    status: 'parsed',
    error: undefined,
    parserId: 'frontmatter',
    textHash: 'hash-1',
    graphData: graphDataB,
    source: { kind: 'url', url: 'https://example.com/same.md', path: 'workspace:/same.md' },
  })
  if (!areSourceFileRecordsEqual(left, persistedView, { includeGraphData: false, includeGraphRevision: false })) {
    throw new Error('expected shared source-file record equality to support persistence comparisons without graph payload churn')
  }
  if (areSourceFileRecordsEqual(left, { ...right, error: 'Parse failed' })) {
    throw new Error('expected shared source-file record equality to detect lifecycle metadata changes')
  }
  if (areSourceFileRecordsEqual(left, { ...right, source: { kind: 'local', path: 'workspace:/same.md' } })) {
    throw new Error('expected shared source-file record equality to detect source ownership changes')
  }
}

export function testSourceFilePersistedRecordProjectionCentralizesDbShape() {
  const graphData: GraphData = {
    type: 'Graph',
    nodes: [{ id: 'n1', label: 'A', type: 'Thing', properties: {} }],
    edges: [],
    metadata: {},
  }

  const persisted = readPersistedSourceFileRecord({
    id: ' sf-1 ',
    name: ' source.md ',
    text: 'hello',
    enabled: true,
    status: 'loading',
    error: ' Parse failed ',
    geoLayerEnabled: true,
    parsedParserId: ' frontmatter ',
    parsedTextHash: ' hash-1 ',
    parsedGraphRevision: 7,
    parsedGraphData: graphData,
    source: { kind: 'url', url: ' https://example.com/source.md ', path: ' workspace:/source.md ' },
  })
  if (persisted.id !== 'sf-1' || persisted.name !== 'source.md' || persisted.text !== 'hello') {
    throw new Error('expected persisted source-file projection to normalize core record fields')
  }
  if (persisted.status !== 'idle') {
    throw new Error('expected persisted source-file projection to drop transient loading state back to idle')
  }
  if (persisted.error !== undefined) {
    throw new Error('expected persisted source-file projection to clear non-error lifecycle metadata before persistence')
  }
  if (persisted.parsedParserId !== 'frontmatter' || persisted.parsedTextHash !== 'hash-1') {
    throw new Error('expected persisted source-file projection to preserve canonical parsed identity fields')
  }
  if (persisted.parsedGraphRevision !== undefined || persisted.parsedGraphData !== undefined) {
    throw new Error('expected persisted source-file projection to omit graph payload and revision state from DB records')
  }
  if (persisted.source?.kind !== 'url' || persisted.source.url !== 'https://example.com/source.md' || persisted.source.path !== 'workspace:/source.md') {
    throw new Error('expected persisted source-file projection to preserve canonical persisted source ownership metadata')
  }

  const local = readPersistedSourceFileRecord({
    id: 'sf-2',
    name: ' local.md ',
    text: '',
    enabled: false,
    status: 'error',
    error: ' Parse failed ',
    source: { kind: 'local', path: ' ' },
  })
  if (local.status !== 'error' || local.error !== 'Parse failed') {
    throw new Error('expected persisted source-file projection to preserve canonical error lifecycle metadata')
  }
  if (local.source?.kind !== 'local' || local.source.path !== 'local.md') {
    throw new Error('expected persisted source-file projection to backfill missing local source paths from canonical names')
  }
}

export function testSourceFilesWorkspaceStateHelperCentralizesPersistenceShape() {
  const normalized = normalizeSourceFilesWorkspaceState({
    folderName: ' Demo Workspace ',
    accessMode: 'fs-access',
    folderCacheId: ' cache-1 ',
    selectedFolderPath: '/notes/demo/',
  })
  if (
    normalized.folderName !== 'Demo Workspace' ||
    normalized.accessMode !== 'fs-access' ||
    normalized.folderCacheId !== 'cache-1' ||
    normalized.selectedFolderPath !== 'notes/demo'
  ) {
    throw new Error('expected workspace-state helper to normalize persisted workspace metadata into a canonical shape')
  }

  if (
    !areSourceFilesWorkspaceStatesEqual(
      normalized,
      {
        folderName: 'Demo Workspace',
        accessMode: 'fs-access',
        folderCacheId: 'cache-1',
        selectedFolderPath: 'notes/demo',
      },
    )
  ) {
    throw new Error('expected workspace-state helper equality to compare normalized persisted workspace snapshots')
  }

  if (
    buildSourceFilesWorkspaceStateSignature(normalized) !==
    buildSourceFilesWorkspaceStateSignature({
      folderName: ' Demo Workspace ',
      accessMode: 'fs-access',
      folderCacheId: ' cache-1 ',
      selectedFolderPath: '/notes/demo/',
    })
  ) {
    throw new Error('expected workspace-state helper signature to be stable across equivalent persisted workspace snapshots')
  }

  if (
    buildSourceFilesWorkspaceStateSignature(normalized) ===
    buildSourceFilesWorkspaceStateSignature({
      ...normalized,
      selectedFolderPath: 'notes/other',
    })
  ) {
    throw new Error('expected workspace-state helper signature to change when canonical workspace metadata changes')
  }
}
