import { useGraphStore } from '@/hooks/useGraphStore'

export function testFrontmatterBuiltInFloatingBalancedLayoutCarriesAcrossSameSourceLayoutChanges() {
  useGraphStore.getState().setDocumentStructureBaselineLock(false)

  useGraphStore.getState().setGraphData({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 0, y: 0, properties: {} },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 200, y: 0, properties: {} },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 0, y: 200, properties: {} },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 200, y: 200, properties: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'balanced-layout-a',
    },
  } as never)

  useGraphStore.getState().setFlowWidgetPinnedByNodeId({
    NODE_TEXT_A: false,
    NODE_TEXT_B: false,
    NODE_TEXT_C: false,
    NODE_TEXT_D: false,
  })
  useGraphStore.getState().setFlowWidgetPosByNodeId({
    NODE_TEXT_A: { top: 140, left: 240 },
    NODE_TEXT_B: { top: 140, left: 720 },
    NODE_TEXT_C: { top: 760, left: 240 },
    NODE_TEXT_D: { top: 760, left: 720 },
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
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 640, y: 320, properties: { prompt: 'updated-a' } },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 960, y: 320, properties: { prompt: 'updated-b' } },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 640, y: 640, properties: { prompt: 'updated-c' } },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 960, y: 640, properties: { prompt: 'updated-d' } },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'balanced-layout-b',
    },
  } as never)

  const after = useGraphStore.getState()
  if (after.flowWidgetPinnedByNodeId.NODE_TEXT_A !== false || after.flowWidgetPinnedByNodeId.NODE_TEXT_D !== false) {
    throw new Error('expected balanced floating frontmatter collective to preserve floating pinned semantics across same-source layout changes')
  }
  if (
    after.flowWidgetPosByNodeId.NODE_TEXT_A?.top !== 140
    || after.flowWidgetPosByNodeId.NODE_TEXT_A?.left !== 240
    || after.flowWidgetPosByNodeId.NODE_TEXT_D?.top !== 760
    || after.flowWidgetPosByNodeId.NODE_TEXT_D?.left !== 720
  ) {
    throw new Error('expected balanced floating frontmatter collective to preserve screen-space layout across same-source layout changes')
  }
  if (after.flowWidgetWorldPosByNodeId.NODE_TEXT_A?.x !== 16 || after.flowWidgetWorldPosByNodeId.NODE_TEXT_D?.y !== 34) {
    throw new Error('expected balanced floating frontmatter collective to preserve world-space anchor state across same-source layout changes')
  }

  useGraphStore.getState().setGraphDataPreservingLayout({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'NODE_TEXT_A', type: 'TextGeneration', label: 'Text A', x: 640, y: 320, properties: { prompt: 'retained-a' } },
      { id: 'NODE_TEXT_B', type: 'ImageGeneration', label: 'Image B', x: 960, y: 320, properties: { prompt: 'retained-b' } },
      { id: 'NODE_TEXT_C', type: 'VideoGeneration', label: 'Video C', x: 640, y: 640, properties: { prompt: 'retained-c' } },
      { id: 'NODE_TEXT_D', type: 'RichMediaPanel', label: 'Panel D', x: 960, y: 640, properties: { prompt: 'retained-d' } },
      { id: 'NODE_TEXT_E', type: 'RichMediaPanel', label: 'Panel E', x: 1280, y: 640, properties: {} },
    ],
    edges: [{ id: 'EDGE_E', source: 'NODE_TEXT_D', target: 'NODE_TEXT_E' }],
    metadata: {
      kind: 'frontmatter-flow',
      source: 'workspace:/typed.md',
      sourceLayerHash: 'balanced-layout-c',
    },
  } as never)

  const afterGrowth = useGraphStore.getState()
  if (
    afterGrowth.flowWidgetPosByNodeId.NODE_TEXT_A?.top !== 140
    || afterGrowth.flowWidgetPosByNodeId.NODE_TEXT_A?.left !== 240
    || afterGrowth.flowWidgetPosByNodeId.NODE_TEXT_D?.top !== 760
    || afterGrowth.flowWidgetPosByNodeId.NODE_TEXT_D?.left !== 720
  ) {
    throw new Error('expected topology growth to preserve the balanced screen authority of every retained widget')
  }
  if (
    afterGrowth.flowWidgetWorldPosByNodeId.NODE_TEXT_A?.x !== 16
    || afterGrowth.flowWidgetWorldPosByNodeId.NODE_TEXT_D?.y !== 34
  ) {
    throw new Error('expected topology growth to preserve the world authority of every retained widget')
  }
  if (
    afterGrowth.flowWidgetPosByNodeId.NODE_TEXT_E !== undefined
    || afterGrowth.flowWidgetWorldPosByNodeId.NODE_TEXT_E !== undefined
  ) {
    throw new Error('expected a newly added built-in widget to remain unplaced until the native scene places it')
  }
}
