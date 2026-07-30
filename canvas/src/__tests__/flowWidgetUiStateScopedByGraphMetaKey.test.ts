import { useGraphStore } from '@/hooks/useGraphStore'
import { buildGraphMetaKeyIgnoringPending } from '@/lib/graph/graphMetaKey'

export function testFlowWidgetUiStateIsScopedByGraphMetaKey() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_SVO', type: 'Node', label: 'SVO', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow', sourceLayerHash: 'graph-a' },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({ NODE_SVO: false })
  useGraphStore.getState().setFlowWidgetPosByNodeId({ NODE_SVO: { top: 10, left: 20 } })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ NODE_SVO: { x: 1, y: 2 } })

  const afterA = useGraphStore.getState()
  if (afterA.flowWidgetPinnedByNodeId.NODE_SVO !== false) throw new Error('expected pinned state for graph A')
  if (afterA.flowWidgetPosByNodeId.NODE_SVO?.top !== 10) throw new Error('expected pos for graph A')
  if (afterA.flowWidgetWorldPosByNodeId.NODE_SVO?.x !== 1) throw new Error('expected world pos for graph A')

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_SVO', type: 'Node', label: 'SVO', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow', sourceLayerHash: 'graph-b' },
  } as never)

  const afterB = useGraphStore.getState()
  if (Object.keys(afterB.flowWidgetPinnedByNodeId || {}).length !== 0) throw new Error('expected no pinned state for graph B')
  if (Object.keys(afterB.flowWidgetPosByNodeId || {}).length !== 0) throw new Error('expected no pos state for graph B')
  if (Object.keys(afterB.flowWidgetWorldPosByNodeId || {}).length !== 0) throw new Error('expected no world pos state for graph B')

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_SVO', type: 'Node', label: 'SVO', properties: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow', sourceLayerHash: 'graph-a' },
  } as never)

  const afterARestore = useGraphStore.getState()
  if (afterARestore.flowWidgetPinnedByNodeId.NODE_SVO !== false) throw new Error('expected pinned restored for graph A')
  if (afterARestore.flowWidgetPosByNodeId.NODE_SVO?.left !== 20) throw new Error('expected pos restored for graph A')
  if (afterARestore.flowWidgetWorldPosByNodeId.NODE_SVO?.y !== 2) throw new Error('expected world pos restored for graph A')
}

export function testFlowWidgetUiStateCarriesAcrossSameSourceRecomposeHashChanges() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'CustomWidget', label: 'Text Widget', properties: {} }],
    edges: [{ id: 'EDGE_A', source: 'NODE_TEXT', target: 'NODE_TEXT' }],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'typed-hash-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({ NODE_TEXT: true })
  useGraphStore.getState().setFlowWidgetPosByNodeId({ NODE_TEXT: { top: 120, left: 240 } })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ NODE_TEXT: { x: 12, y: 24 } })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'CustomWidget', label: 'Text Widget', properties: { prompt: 'updated' } }],
    edges: [{ id: 'EDGE_A', source: 'NODE_TEXT', target: 'NODE_TEXT' }],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'typed-hash-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT !== true) {
    throw new Error('expected same-source recomposition to preserve pinned widget state across sourceLayerHash changes')
  }
  if (after.flowWidgetPosByNodeId.NODE_TEXT?.top !== 120 || after.flowWidgetPosByNodeId.NODE_TEXT?.left !== 240) {
    throw new Error('expected same-source recomposition to preserve widget viewport position across sourceLayerHash changes')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT?.x !== 12 || after.flowWidgetWorldPosByNodeId.NODE_TEXT?.y !== 24) {
    throw new Error('expected same-source recomposition to preserve widget world position across sourceLayerHash changes')
  }

  useGraphStore.getState().setGraphDataPreservingLayout({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT', type: 'CustomWidget', label: 'Text Widget', properties: { prompt: 'retained' } },
      { id: 'NODE_OUTPUT', type: 'CustomWidget', label: 'Output Widget', properties: {} },
    ],
    edges: [{ id: 'EDGE_OUTPUT', source: 'NODE_TEXT', target: 'NODE_OUTPUT' }],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'typed-hash-c',
    },
  } as never)

  const afterGrowth = useGraphStore.getState()
  if (afterGrowth.flowWidgetPinnedByNodeId.NODE_TEXT !== true) {
    throw new Error('expected same-document topology growth to preserve retained widget placement authority')
  }
  if (
    afterGrowth.flowWidgetPosByNodeId.NODE_TEXT?.top !== 120
    || afterGrowth.flowWidgetPosByNodeId.NODE_TEXT?.left !== 240
  ) {
    throw new Error('expected same-document topology growth to preserve retained widget viewport position')
  }
  if (
    afterGrowth.flowWidgetWorldPosByNodeId.NODE_TEXT?.x !== 12
    || afterGrowth.flowWidgetWorldPosByNodeId.NODE_TEXT?.y !== 24
  ) {
    throw new Error('expected same-document topology growth to preserve retained widget world position')
  }
  if (
    afterGrowth.flowWidgetPosByNodeId.NODE_OUTPUT !== undefined
    || afterGrowth.flowWidgetWorldPosByNodeId.NODE_OUTPUT !== undefined
  ) {
    throw new Error('expected newly added widgets to enter normal placement without inheriting retained-node authority')
  }
}

export function testFlowWidgetUiStateCarriesOnlyStableRetainedNodesAcrossSameSourceTopologyReplacement() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_SOURCE', type: 'CustomWidget', label: 'Source', x: 100, y: 80, properties: {} },
      { id: 'NODE_LAYOUT_CHANGED', type: 'CustomWidget', label: 'Changed', x: 220, y: 80, properties: {} },
      { id: 'NODE_OUTPUT_OLD', type: 'CustomWidget', label: 'Old output', x: 340, y: 80, properties: {} },
    ],
    edges: [{ id: 'EDGE_OUTPUT_OLD', source: 'NODE_SOURCE', target: 'NODE_OUTPUT_OLD' }],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/replacement-continuity.md',
      sourceLayerHash: 'replacement-hash-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_SOURCE: true,
    NODE_LAYOUT_CHANGED: true,
    NODE_OUTPUT_OLD: true,
  })
  useGraphStore.getState().setFlowWidgetPosByNodeId({
    NODE_SOURCE: { top: 140, left: 240 },
    NODE_LAYOUT_CHANGED: { top: 140, left: 640 },
    NODE_OUTPUT_OLD: { top: 140, left: 1040 },
  })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({
    NODE_SOURCE: { x: 12, y: 24 },
    NODE_LAYOUT_CHANGED: { x: 36, y: 24 },
    NODE_OUTPUT_OLD: { x: 60, y: 24 },
  })

  const previousCamera = {
    zoomRequest: useGraphStore.getState().zoomRequest,
    zoomState: useGraphStore.getState().zoomState,
    zoomStateByKey: useGraphStore.getState().zoomStateByKey,
  }
  const unchangedZoomState = { k: 1, x: 160, y: 96, viewportW: 1280, viewportH: 720 }
  const unchangedZoomStateByKey = { 'replacement-continuity-camera': unchangedZoomState }
  const unchangedZoomRequest = {
    type: 'transform',
    payload: { k: 1, x: 160, y: 96 },
    intent: 'zoomPreset',
    at: 42,
  } as const
  useGraphStore.setState({
    zoomRequest: unchangedZoomRequest,
    zoomState: unchangedZoomState,
    zoomStateByKey: unchangedZoomStateByKey,
  } as never)

  try {
    useGraphStore.getState().setGraphDataPreservingLayout({
      type: 'Graph',
      context: 'frontmatter-flow',
      nodes: [
        { id: 'ws:rerun::NODE_SOURCE', type: 'CustomWidget', label: 'Source', x: 100, y: 80, properties: { revision: 2 } },
        { id: 'ws:rerun::NODE_LAYOUT_CHANGED', type: 'ChangedWidget', label: 'Changed', x: 260, y: 160, properties: {} },
        { id: 'ws:rerun::NODE_OUTPUT_NEW', type: 'CustomWidget', label: 'New output', x: 340, y: 80, properties: {} },
      ],
      edges: [{ id: 'ws:rerun::EDGE_OUTPUT_NEW', source: 'ws:rerun::NODE_SOURCE', target: 'ws:rerun::NODE_OUTPUT_NEW' }],
      metadata: {
        kind: 'frontmatter-flow',
        source: 'workspace:/replacement-continuity.md',
        sourceLayerHash: 'replacement-hash-b',
      },
    } as never)

    const after = useGraphStore.getState()
    const retainedId = 'ws:rerun::NODE_SOURCE'
    if (after.flowWidgetPinnedByNodeId[retainedId] !== true) {
      throw new Error('expected same-source output replacement to preserve the stable retained canonical pin authority')
    }
    if (
      after.flowWidgetPosByNodeId[retainedId]?.top !== 140
      || after.flowWidgetPosByNodeId[retainedId]?.left !== 240
      || after.flowWidgetWorldPosByNodeId[retainedId]?.x !== 12
      || after.flowWidgetWorldPosByNodeId[retainedId]?.y !== 24
    ) {
      throw new Error('expected same-source output replacement to preserve stable retained screen/world placement')
    }

    const expectedPlacementKeys = [retainedId]
    const actualPlacementKeySets = [
      Object.keys(after.flowWidgetPinnedByNodeId || {}).sort(),
      Object.keys(after.flowWidgetPosByNodeId || {}).sort(),
      Object.keys(after.flowWidgetWorldPosByNodeId || {}).sort(),
    ]
    if (actualPlacementKeySets.some(keys => JSON.stringify(keys) !== JSON.stringify(expectedPlacementKeys))) {
      throw new Error(`expected removed, new, and layout-changed IDs to remain unplaced, got ${JSON.stringify(actualPlacementKeySets)}`)
    }

    const activeGraphKey = buildGraphMetaKeyIgnoringPending(after.graphData)
    const scopedPlacementKeys = Object.keys(
      (after.flowWidgetPosByNodeIdByGraphMetaKey || {})[activeGraphKey] || {},
    ).sort()
    if (JSON.stringify(scopedPlacementKeys) !== JSON.stringify(expectedPlacementKeys)) {
      throw new Error(`expected the active graph-key placement index to filter replacement residue, got ${JSON.stringify(scopedPlacementKeys)}`)
    }
    if (
      after.zoomRequest !== unchangedZoomRequest
      || after.zoomState !== unchangedZoomState
      || after.zoomStateByKey !== unchangedZoomStateByKey
    ) {
      throw new Error('expected same-source output replacement to leave the active camera request and stored transforms untouched')
    }
  } finally {
    useGraphStore.setState(previousCamera as never)
  }
}

export function testFrontmatterBuiltInFloatingScreenLayoutCarriesAcrossStableSameSourceRecompose() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'TextGeneration', label: 'Text Widget', x: 120, y: 80, properties: {} }],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-hash-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({ NODE_TEXT: false })
  useGraphStore.getState().setFlowWidgetPosByNodeId({ NODE_TEXT: { top: 180, left: 320 } })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ NODE_TEXT: { x: 16, y: 28 } })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'TextGeneration', label: 'Text Widget', x: 120, y: 80, properties: { prompt: 'updated' } }],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-hash-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT !== false) {
    throw new Error('expected stable same-source frontmatter recompose to preserve floating widget pinned semantics')
  }
  if (after.flowWidgetPosByNodeId.NODE_TEXT?.top !== 180 || after.flowWidgetPosByNodeId.NODE_TEXT?.left !== 320) {
    throw new Error('expected stable same-source frontmatter recompose to preserve initialized floating widget screen layout')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT?.x !== 16 || after.flowWidgetWorldPosByNodeId.NODE_TEXT?.y !== 28) {
    throw new Error('expected stable same-source frontmatter recompose to preserve derived widget world layout state')
  }
}

export function testFrontmatterBuiltInFloatingResidueClusterDoesNotCarryAcrossStableSameSourceRecompose() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: {} },
      { id: 'NODE_TEXT_B', type: 'TextGeneration', label: 'Text B', x: 180, y: 80, properties: {} },
      { id: 'NODE_TEXT_C', type: 'TextGeneration', label: 'Text C', x: 240, y: 80, properties: {} },
      { id: 'NODE_TEXT_D', type: 'TextGeneration', label: 'Text D', x: 300, y: 80, properties: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-residue-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_TEXT_A: false,
    NODE_TEXT_B: false,
    NODE_TEXT_C: false,
    NODE_TEXT_D: false,
  })
  useGraphStore.getState().setFlowWidgetPosByNodeId({
    NODE_TEXT_A: { top: 120, left: 320 },
    NODE_TEXT_B: { top: 760, left: 320 },
    NODE_TEXT_C: { top: 1400, left: 320 },
    NODE_TEXT_D: { top: 2040, left: 320 },
  })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({
    NODE_TEXT_A: { x: 16, y: 28 },
    NODE_TEXT_B: { x: 18, y: 30 },
    NODE_TEXT_C: { x: 20, y: 32 },
    NODE_TEXT_D: { x: 22, y: 34 },
  })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: { prompt: 'updated-a' } },
      { id: 'NODE_TEXT_B', type: 'TextGeneration', label: 'Text B', x: 180, y: 80, properties: { prompt: 'updated-b' } },
      { id: 'NODE_TEXT_C', type: 'TextGeneration', label: 'Text C', x: 240, y: 80, properties: { prompt: 'updated-c' } },
      { id: 'NODE_TEXT_D', type: 'TextGeneration', label: 'Text D', x: 300, y: 80, properties: { prompt: 'updated-d' } },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-residue-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT_A !== false) {
    throw new Error('expected stable same-source frontmatter recompose to preserve floating widget pinned semantics even when residue layout is stripped')
  }
  if (
    after.flowWidgetPosByNodeId.NODE_TEXT_A !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_B !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_C !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_D !== undefined
  ) {
    throw new Error('expected stable same-source frontmatter recompose to strip long-column residue screen layout for auto-managed built-in widgets')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT_A?.x !== 16 || after.flowWidgetWorldPosByNodeId.NODE_TEXT_D?.y !== 34) {
    throw new Error('expected stable same-source frontmatter recompose to preserve derived world layout state while clearing residue screen positions')
  }
}

export function testFrontmatterBuiltInFloatingPartialCoverageDoesNotCarryAcrossStableSameSourceRecompose() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: {} },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 180, y: 80, properties: {} },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 240, y: 80, properties: {} },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 300, y: 80, properties: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-partial-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_TEXT_A: false,
    NODE_TEXT_B: false,
    NODE_TEXT_C: false,
    NODE_TEXT_D: false,
  })
  useGraphStore.getState().setFlowWidgetPosByNodeId({
    NODE_TEXT_A: { top: 180, left: 320 },
    NODE_TEXT_B: { top: 180, left: 760 },
  })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({
    NODE_TEXT_A: { x: 16, y: 28 },
    NODE_TEXT_B: { x: 18, y: 30 },
    NODE_TEXT_C: { x: 20, y: 32 },
    NODE_TEXT_D: { x: 22, y: 34 },
  })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: { prompt: 'updated-a' } },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 180, y: 80, properties: { prompt: 'updated-b' } },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 240, y: 80, properties: { prompt: 'updated-c' } },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 300, y: 80, properties: { prompt: 'updated-d' } },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-partial-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT_A !== false) {
    throw new Error('expected stable same-source frontmatter recompose to preserve floating widget pinned semantics when partial screen coverage is cleared')
  }
  if (
    after.flowWidgetPosByNodeId.NODE_TEXT_A !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_B !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_C !== undefined
    || after.flowWidgetPosByNodeId.NODE_TEXT_D !== undefined
  ) {
    throw new Error('expected stable same-source frontmatter recompose to clear partial auto-managed screen coverage before indexing can replay a hybrid collective layout')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT_A?.x !== 16 || after.flowWidgetWorldPosByNodeId.NODE_TEXT_D?.y !== 34) {
    throw new Error('expected stable same-source frontmatter recompose to preserve derived world layout state while clearing partial screen coverage')
  }
}

export function testFrontmatterBuiltInPinnedCanvasResidueDoesNotCarryAcrossComposedSourceRecompose() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: {} },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 180, y: 80, properties: {} },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 240, y: 80, properties: {} },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 300, y: 80, properties: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-pinned-residue-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_TEXT_A: true,
    NODE_TEXT_B: true,
    NODE_TEXT_C: true,
    NODE_TEXT_D: true,
  })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({
    NODE_TEXT_A: { x: 16, y: 28 },
    NODE_TEXT_B: { x: 18, y: 30 },
    NODE_TEXT_C: { x: 20, y: 32 },
    NODE_TEXT_D: { x: 22, y: 34 },
  })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'ws:semantic::NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: { prompt: 'updated-a' } },
      { id: 'ws:semantic::NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 180, y: 80, properties: { prompt: 'updated-b' } },
      { id: 'ws:semantic::NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 240, y: 80, properties: { prompt: 'updated-c' } },
      { id: 'ws:semantic::NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 300, y: 80, properties: { prompt: 'updated-d' } },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-pinned-residue-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (
    after.flowWidgetPinnedByNodeId['ws:semantic::NODE_TEXT_A'] === true
    || after.flowWidgetPinnedByNodeId['ws:semantic::NODE_TEXT_B'] === true
    || after.flowWidgetPinnedByNodeId['ws:semantic::NODE_TEXT_C'] === true
    || after.flowWidgetPinnedByNodeId['ws:semantic::NODE_TEXT_D'] === true
    || after.flowWidgetPinnedByNodeId.NODE_TEXT_A === true
  ) {
    throw new Error('expected composed frontmatter source hydration to strip stale pinned-canvas residue for auto-managed widgets')
  }
}

export function testFrontmatterBuiltInExplicitPinSetterPersistsUntilGraphCommitCleanup() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 120, y: 80, properties: {} },
      { id: 'NODE_PANEL_A', type: 'RichMediaPanel', label: 'Panel A', x: 180, y: 80, properties: {} },
      { id: 'NODE_CUSTOM_A', type: 'CustomNode', label: 'Custom A', x: 240, y: 80, properties: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'frontmatter-root-setter-pinned-residue',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_TEXT_A: true,
    NODE_PANEL_A: true,
    NODE_CUSTOM_A: true,
  })

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT_A !== true || after.flowWidgetPinnedByNodeId.NODE_PANEL_A !== true) {
    throw new Error('expected root pinned-state setter to preserve explicit user pinning for frontmatter auto-managed widgets')
  }
  if (after.flowWidgetPinnedByNodeId.NODE_CUSTOM_A !== true) {
    throw new Error('expected root pinned-state setter to preserve non-auto-managed frontmatter widget pin state')
  }
}

export function testFlowWidgetOverlayStateDoesNotCarryAcrossSameSourceLayoutChanges() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'CustomWidget', label: 'Text Widget', x: 0, y: 0, properties: {} }],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'layout-hash-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({ NODE_TEXT: true })
  useGraphStore.getState().setFlowWidgetPosByNodeId({ NODE_TEXT: { top: 120, left: 240 } })
  useGraphStore.getState().setFlowWidgetWorldPosByNodeId({ NODE_TEXT: { x: 12, y: 24 } })

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'NODE_TEXT', type: 'CustomWidget', label: 'Text Widget', x: 640, y: 320, properties: {} }],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'layout-hash-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT !== undefined) {
    throw new Error('expected layout-changing same-source recomposition to reset pinned widget state')
  }
  if (after.flowWidgetPosByNodeId.NODE_TEXT !== undefined) {
    throw new Error('expected layout-changing same-source recomposition to reset widget viewport position')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT !== undefined) {
    throw new Error('expected layout-changing same-source recomposition to reset widget world position')
  }
}

export {
  testFrontmatterBuiltInFloatingBalancedLayoutCarriesAcrossSameSourceLayoutChanges,
} from './flowWidgetUiStateBalancedLayoutCarry.test'
