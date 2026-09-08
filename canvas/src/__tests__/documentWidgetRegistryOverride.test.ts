import { useGraphStore } from '@/hooks/useGraphStore'
import { FLOW_IMAGE_GENERATION_NODE_TYPE_ID, FLOW_WIDGET_REGISTRY_METADATA_KEY, FLOW_VIDEO_GENERATION_NODE_TYPE_ID } from '@/lib/config'

export function testDocumentWidgetRegistryOverrideDoesNotOverwriteGlobal() {
  const store = useGraphStore.getState()
  store.clearGraphData()

  store.setWidgetRegistry([
    {
      id: 'global1',
      nodeTypeId: 'VideoGeneration',
      widgetTypeId: 'default',
      formId: 'videoGeneration',
      updatedAt: '1',
      isEnabled: true,
      fields: [],
      ports: [{ portKey: 'reference_image', direction: 'input' }],
    },
  ] as never)

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {
      [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
        {
          id: 'doc1',
          nodeTypeId: 'VideoGeneration',
          widgetTypeId: 'default',
          formId: 'videoGeneration',
          updatedAt: '2',
          isEnabled: true,
          fields: [],
          ports: [{ portKey: 'videoUrl', direction: 'output' }],
        },
      ],
    },
  } as never)

  const afterDoc = useGraphStore.getState()
  if ((afterDoc.widgetRegistry || []).length !== 1) throw new Error('expected global registry to remain unchanged')
  if (String(afterDoc.widgetRegistry?.[0]?.id || '') !== 'global1') throw new Error('expected global registry id global1')
  if ((afterDoc.documentWidgetRegistry || []).length !== 1) throw new Error('expected document registry to be set')
  if (String(afterDoc.documentWidgetRegistry?.[0]?.id || '') !== 'doc1') throw new Error('expected document registry id doc1')
  if ((afterDoc.effectiveWidgetRegistry || []).length !== 1) throw new Error('expected effective registry to prefer document registry')
  if (String(afterDoc.effectiveWidgetRegistry?.[0]?.id || '') !== 'doc1') throw new Error('expected effective registry id doc1')

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    nodes: [],
    edges: [],
    metadata: {},
  } as never)

  const afterClear = useGraphStore.getState()
  if ((afterClear.documentWidgetRegistry || []).length !== 0) throw new Error('expected document registry to clear')
  if ((afterClear.effectiveWidgetRegistry || []).length !== 1) throw new Error('expected effective registry to fall back to global')
  if (String(afterClear.effectiveWidgetRegistry?.[0]?.id || '') !== 'global1') throw new Error('expected effective registry id global1')
}

export function testFrontmatterFlowEffectiveRegistryKeepsWidgetSeedsWhileAvoidingUnrelatedGlobalMappings() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setWidgetRegistry([
    {
      id: 'global-unrelated',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'global:default',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'global', fieldType: 'text' }],
      ports: [],
    },
    {
      id: 'global-image-widget',
      nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'imageGeneration',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'prompt', fieldType: 'textarea' }],
      ports: [{ portKey: 'imageUrl', direction: 'output' }],
    },
    {
      id: 'global-video-widget',
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'videoGeneration',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'prompt', fieldType: 'textarea' }],
      ports: [{ portKey: 'videoUrl', direction: 'output' }],
    },
  ] as never)

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'n-pack', type: 'default', label: 'Pack', properties: { 'flow:widgetFormId': 'fm:n-pack' }, metadata: {} }],
    edges: [],
    metadata: {
      kind: 'frontmatter-flow',
      [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
        {
          id: 'doc-pack',
          nodeTypeId: 'default',
          widgetTypeId: 'default',
          formId: 'fm:n-pack',
          updatedAt: '2',
          isEnabled: true,
          fields: [{ fieldKey: 'context', fieldType: 'text' }],
          ports: [],
        },
      ],
    },
  } as never)

  const current = useGraphStore.getState()
  const effective = current.effectiveWidgetRegistry || []
  if (effective.length !== 3) throw new Error(`expected frontmatter-flow effective registry to keep document entry plus widget seeds, got ${effective.length}`)
  if (String(effective[0]?.id || '') !== 'doc-pack') throw new Error(`expected frontmatter-flow effective registry first id doc-pack, got ${String(effective[0]?.id || '')}`)
  const ids = effective.map(entry => String(entry?.id || ''))
  if (!ids.includes('global-image-widget') || !ids.includes('global-video-widget')) {
    throw new Error(`expected frontmatter-flow effective registry to keep widget seeds, got ${JSON.stringify(ids)}`)
  }
  if (ids.includes('global-unrelated')) {
    throw new Error(`expected frontmatter-flow effective registry to avoid unrelated global mappings, got ${JSON.stringify(ids)}`)
  }
}

export function testDocumentEffectiveRegistryStaysAuthoritativeAfterGlobalRegistryRefresh() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setWidgetRegistry([
    {
      id: 'global-1',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'global:default',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'globalA', fieldType: 'text' }],
      ports: [],
    },
  ] as never)
  store.setDocumentWidgetRegistry([
    {
      id: 'doc-1',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'fm:n-pack',
      updatedAt: '2',
      isEnabled: true,
      fields: [{ fieldKey: 'docA', fieldType: 'text' }],
      ports: [],
    },
  ] as never)

  // Simulate delayed global registry refresh after document registry has already been set.
  store.setWidgetRegistry([
    {
      id: 'global-1',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'global:default',
      updatedAt: '3',
      isEnabled: true,
      fields: [{ fieldKey: 'globalA', fieldType: 'text' }],
      ports: [],
    },
    {
      id: 'global-2',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'global:extra',
      updatedAt: '3',
      isEnabled: true,
      fields: [{ fieldKey: 'globalB', fieldType: 'text' }],
      ports: [],
    },
    {
      id: 'global-widget',
      nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'videoGeneration',
      updatedAt: '3',
      isEnabled: true,
      fields: [{ fieldKey: 'prompt', fieldType: 'textarea' }],
      ports: [{ portKey: 'videoUrl', direction: 'output' }],
    },
  ] as never)

  const state = useGraphStore.getState()
  const effective = state.effectiveWidgetRegistry || []
  if (effective.length !== 2) throw new Error(`expected effective registry to keep document entry plus widget seeds after global refresh, got ${effective.length}`)
  if (String(effective[0]?.id || '') !== 'doc-1') throw new Error(`expected effective registry id doc-1 after global refresh, got ${String(effective[0]?.id || '')}`)
  if (!effective.some(entry => String(entry?.id || '') === 'global-widget')) {
    throw new Error(`expected effective registry to preserve widget seed after global refresh, got ${JSON.stringify(effective.map(entry => entry?.id || ''))}`)
  }
}

export function testFrontmatterFlowWithoutDocumentRegistryFallsBackOnlyToWidgetSeeds() {
  const store = useGraphStore.getState()
  store.clearGraphData()
  store.setWidgetRegistry([
    {
      id: 'global-default',
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'global:default',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'global', fieldType: 'text' }],
      ports: [],
    },
    {
      id: 'global-image-widget',
      nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
      widgetTypeId: 'default',
      formId: 'imageGeneration',
      updatedAt: '1',
      isEnabled: true,
      fields: [{ fieldKey: 'prompt', fieldType: 'textarea' }],
      ports: [{ portKey: 'imageUrl', direction: 'output' }],
    },
  ] as never)

  store.setGraphDataPreservingLayout({
    type: 'Graph',
    context: 'frontmatter-flow',
    nodes: [{ id: 'n-pack', type: 'default', label: 'Pack', properties: {}, metadata: {} }],
    edges: [],
    metadata: { kind: 'frontmatter-flow' },
  } as never)

  const state = useGraphStore.getState()
  const effective = state.effectiveWidgetRegistry || []
  if (effective.length !== 1 || String(effective[0]?.id || '') !== 'global-image-widget') {
    throw new Error(`expected only widget seeds before frontmatter document registry hydration, got ${JSON.stringify(effective.map(entry => entry?.id || ''))}`)
  }
}

export function testFrontmatterFlowOpenWidgetIdsAreScopedByRegistryForms() {
  const prior = useGraphStore.getState()
  try {
    const store = prior
    store.clearGraphData()
    store.setGraphData({
      type: 'Graph',
      context: 'frontmatter-flow',
      nodes: [
        { id: 'n-pack', type: 'default', label: 'Pack', properties: {}, metadata: {} },
        { id: 'n-other', type: 'default', label: 'Other', properties: {}, metadata: {} },
        { id: 'n-image', type: FLOW_IMAGE_GENERATION_NODE_TYPE_ID, label: 'Image', properties: {}, metadata: {} },
      ],
      edges: [],
      metadata: {
        kind: 'frontmatter-flow',
        [FLOW_WIDGET_REGISTRY_METADATA_KEY]: [
          {
            id: 'doc-pack',
            nodeTypeId: 'default',
            widgetTypeId: 'default',
            formId: 'fm:n-pack',
            updatedAt: '2',
            isEnabled: true,
            fields: [{ fieldKey: 'context', fieldType: 'text' }],
            ports: [],
          },
        ],
      },
    } as never)

    store.setOpenWidgetNodeIds(['n-pack', 'n-other', 'n-image'])
    const ids = useGraphStore.getState().openWidgetNodeIds || []
    if (ids.length !== 1 || ids[0] !== 'n-image') {
      throw new Error(`expected canonical image widget eligibility without turning arbitrary registry metadata into executable widgets, got ${JSON.stringify(ids)}`)
    }
  } finally { useGraphStore.setState(prior, true) }
}
