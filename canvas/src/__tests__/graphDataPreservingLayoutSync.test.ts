import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'

export function testSetGraphDataPreservingLayoutSyncsGraphFields() {
  const store = useGraphStore.getState()
  store.clearGraphData()

  store.setGraphData({
    type: 'Graph',
    nodes: [{ id: 'n1', type: 'Node', label: 'N1', properties: {}, metadata: {} }],
    edges: [],
    metadata: {},
  } as never)

  const beforeOrder = useGraphStore.getState().graphDataTableColumnOrder || []
  if (beforeOrder.includes('prop:node:foo' as never)) throw new Error('expected prop:node:foo to be absent before adding properties')

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    nodes: [{ id: 'n1', type: 'Node', label: 'N1', properties: { foo: 'bar' }, metadata: {} }],
    edges: [],
    metadata: {},
  } as never)

  const after = useGraphStore.getState()
  const afterOrder = after.graphDataTableColumnOrder || []
  if (!afterOrder.includes('prop:node:foo' as never)) throw new Error('expected prop:node:foo to be added after preserving-layout update')

  const vis = (after.graphDataTableVisibleColumns || {}) as Record<string, boolean | undefined>
  if (vis['prop:node:foo'] !== true) throw new Error(`expected prop:node:foo visible, got ${String(vis['prop:node:foo'])}`)
}

export function testSetGraphDataPreservingLayoutCommitsProbeTreeOutputWithoutTopologyChange() {
  const store = useGraphStore.getState()
  store.clearGraphData()

  const baseGraph = {
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'n1', type: 'TextGeneration', label: 'Widget Card', properties: { prompt: '@agenticgraph.probe-tree' }, metadata: {} },
      { id: 'n2', type: 'RichMediaPanel', label: 'Rich Media Panel', properties: { media_interactive: true }, metadata: {} },
    ],
    edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'output', properties: {} }],
    metadata: { kind: 'frontmatter-flow' },
  }
  store.setGraphDataPreservingLayout(baseGraph as never)
  store.setGraphDataPreservingLayout({
    ...baseGraph,
    nodes: [
      baseGraph.nodes[0],
      {
        ...baseGraph.nodes[1],
        label: 'Probe-Tree Branches',
        properties: {
          media_interactive: true,
          output: '# Probe-Tree Branches',
          richMediaActiveTab: 'text',
          workflowOutputKey: 'probe-tree-branches',
        },
      },
    ],
  } as never)

  const panel = useGraphStore.getState().graphData?.nodes.find(node => node.id === 'n2')
  if (panel?.label !== 'Probe-Tree Branches' || panel.properties?.output !== '# Probe-Tree Branches') {
    throw new Error(`expected same-topology Probe-Tree output to reach canonical graph authority, got ${JSON.stringify(panel)}`)
  }
}

export function testSetGraphDataPreservingLayoutAppliesWidgetRegistryFromMetadata() {
  const store = useGraphStore.getState()
  store.clearGraphData()

  store.setWidgetRegistry([])
  store.setGraphDataPreservingLayout({
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
        {
          id: 'qe1',
          nodeTypeId: 'VideoGeneration',
          widgetTypeId: 'kg.flow',
          formId: 'kg.flow.form',
          updatedAt: '1',
          isEnabled: true,
          fields: [{ fieldKey: 'prompt', fieldType: 'text' }],
          ports: [],
        },
      ],
    },
  } as never)

  const reg = useGraphStore.getState().documentWidgetRegistry || []
  if (reg.length !== 1) throw new Error(`expected 1 registry entry, got ${reg.length}`)
  if (String(reg[0]?.id || '') !== 'qe1') throw new Error(`expected registry id qe1, got ${String(reg[0]?.id || '')}`)

  const effective = useGraphStore.getState().effectiveWidgetRegistry || []
  if (effective.length !== 1) throw new Error(`expected 1 effective registry entry, got ${effective.length}`)
  if (String(effective[0]?.id || '') !== 'qe1') throw new Error(`expected effective registry id qe1, got ${String(effective[0]?.id || '')}`)
}

export function testSetGraphDataPreservingLayoutScopesFrontmatterFlowWidgetsByNodeId() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setWidgetRegistry([])

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [
      { id: 'n-canvas', type: 'input', label: 'Canvas', properties: { 'flow:widgetFormId': 'fm:n-canvas' }, metadata: {} },
      { id: 'n-pack', type: 'default', label: 'Pack', properties: { 'flow:widgetFormId': 'fm:n-pack' }, metadata: {} },
      { id: 'n-ai', type: 'default', label: 'AI', properties: { 'flow:widgetFormId': 'fm:n-ai' }, metadata: {} },
      { id: 'n-validate', type: 'default', label: 'Validate', properties: { 'flow:widgetFormId': 'fm:n-validate' }, metadata: {} },
      { id: 'n-render', type: 'output', label: 'Render', properties: { 'flow:widgetFormId': 'fm:n-render' }, metadata: {} },
    ],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
        { id: 'qe-canvas', nodeTypeId: 'input', widgetTypeId: 'default', formId: 'fm:n-canvas', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'signal', fieldType: 'text' }], ports: [] },
        { id: 'qe-pack', nodeTypeId: 'default', widgetTypeId: 'default', formId: 'fm:n-pack', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'context', fieldType: 'text' }], ports: [] },
        { id: 'qe-ai', nodeTypeId: 'default', widgetTypeId: 'default', formId: 'fm:n-ai', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'model', fieldType: 'text' }], ports: [] },
        { id: 'qe-validate', nodeTypeId: 'default', widgetTypeId: 'default', formId: 'fm:n-validate', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'rules', fieldType: 'text' }], ports: [] },
        { id: 'qe-render', nodeTypeId: 'output', widgetTypeId: 'default', formId: 'fm:n-render', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'store', fieldType: 'text' }], ports: [] },
        { id: 'qe-stale', nodeTypeId: 'default', widgetTypeId: 'default', formId: 'fm:n-stale', updatedAt: '1', isEnabled: true, fields: [{ fieldKey: 'stale', fieldType: 'text' }], ports: [] },
        { id: 'qe-dup-ai', nodeTypeId: 'default', widgetTypeId: 'default', formId: 'fm:n-ai', updatedAt: '2', isEnabled: true, fields: [{ fieldKey: 'noise', fieldType: 'text' }], ports: [] },
      ],
    },
  } as never)

  const reg = useGraphStore.getState().documentWidgetRegistry || []
  const forms = reg.map(r => String(r?.formId || '')).filter(Boolean).sort()
  const expected = ['fm:n-ai', 'fm:n-canvas', 'fm:n-pack', 'fm:n-render', 'fm:n-validate'].sort()
  if (JSON.stringify(forms) !== JSON.stringify(expected)) {
    throw new Error(`expected frontmatter-flow widget forms to be node-id-scoped, got ${JSON.stringify(forms)}`)
  }
}
