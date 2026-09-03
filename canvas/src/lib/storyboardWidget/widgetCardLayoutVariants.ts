import {
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'

export const WIDGET_CARD_TYPE_ZERO_LAYOUT_ID = 'widget-card-type-0' as const
export const PROBE_TREE_TYPE_ONE_LAYOUT_ID = 'probe-tree-type-1' as const
export const PROBE_TREE_TYPE_TWO_LAYOUT_ID = 'probe-tree-type-2' as const
export const RICH_MEDIA_DELIVERABLES_LAYOUT_ID = 'rich-media-deliverables' as const

export type WidgetCardLayoutVariantId =
  | typeof WIDGET_CARD_TYPE_ZERO_LAYOUT_ID
  | typeof PROBE_TREE_TYPE_ONE_LAYOUT_ID
  | typeof PROBE_TREE_TYPE_TWO_LAYOUT_ID
  | typeof RICH_MEDIA_DELIVERABLES_LAYOUT_ID

export type WidgetCardLayoutVariantDescriptor = {
  id: WidgetCardLayoutVariantId
  label: string
  layoutKind: 'card-media' | 'card-output' | 'card-multi-select'
  nodeTypeId: typeof FLOW_TEXT_GENERATION_NODE_TYPE_ID
  widgetTypeId: 'default'
  formId: 'textGeneration'
}

export const WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS: readonly WidgetCardLayoutVariantDescriptor[] = [
  {
    id: WIDGET_CARD_TYPE_ZERO_LAYOUT_ID,
    label: 'Widget Card Type 0',
    layoutKind: 'card-media',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    widgetTypeId: 'default',
    formId: 'textGeneration',
  },
  {
    id: PROBE_TREE_TYPE_ONE_LAYOUT_ID,
    label: 'Probe-Tree Type 1',
    layoutKind: 'card-output',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    widgetTypeId: 'default',
    formId: 'textGeneration',
  },
  {
    id: PROBE_TREE_TYPE_TWO_LAYOUT_ID,
    label: 'Probe-Tree Type 2',
    layoutKind: 'card-multi-select',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    widgetTypeId: 'default',
    formId: 'textGeneration',
  },
  {
    id: RICH_MEDIA_DELIVERABLES_LAYOUT_ID,
    label: 'Deliverables Widget Card',
    layoutKind: 'card-output',
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    widgetTypeId: 'default',
    formId: 'textGeneration',
  },
] as const

export function readWidgetCardLayoutVariantDescriptor(
  value: unknown,
): WidgetCardLayoutVariantDescriptor | null {
  const id = String(value || '').trim()
  return WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.find(descriptor => descriptor.id === id) || null
}

export function readWidgetCardLayoutVariantId(value: unknown): WidgetCardLayoutVariantId | null {
  return readWidgetCardLayoutVariantDescriptor(value)?.id || null
}

export function buildWidgetCardLayoutSeed(variantId: unknown): {
  label: string
  properties: Record<string, unknown>
} | null {
  const id = readWidgetCardLayoutVariantId(variantId)
  if (!id) return null
  if (id === RICH_MEDIA_DELIVERABLES_LAYOUT_ID) {
    return {
      label: 'Deliverables Widget Card',
      properties: {
        title: 'Deliverables Widget Card',
        cardTypeLabel: 'Deliverables Widget Card',
        richMediaDeliverablesMode: true,
        externalMcpCreateArtifacts: true,
        externalSlidesMcpCapability: 'auto',
        externalSheetsMcpCapability: 'auto',
        prompt: [
          '/investment-research-agent @source.body #runtime-ready',
          'Use the connected Rich Media output as the source of truth.',
          'Generate a reusable Markdown slide deck and a Markdown financial-model spreadsheet with an XLSX companion workbook.',
          'Keep assumptions explicit and do not invent source facts.',
        ].join('\n'),
        summary: 'Connect a Rich Media output to prompt_in, then Run to publish Markdown panels, an XLSX workbook, and optional approved external MCP artifacts.',
        output: '',
        tags: ['rich-media', 'slide-deck', 'financial-model', 'mcp'],
      },
    }
  }
  if (id === PROBE_TREE_TYPE_TWO_LAYOUT_ID) {
    return {
      label: 'Probe-Tree Card',
      properties: {
        title: 'Probe-Tree Card',
        cardTypeLabel: 'Probe-Tree Card',
        probeTreeTypeLabel: 'Probe-Tree Type 2',
        probeTreeCardVariant: PROBE_TREE_TYPE_TWO_LAYOUT_ID,
        selectionMode: 'multiple',
        selectionOptions: [
          { id: 'option-1', label: 'Option 1' },
          { id: 'option-2', label: 'Option 2' },
        ],
        allowOther: true,
        lane: 'Probe-Tree',
        prompt: '/agentic-graph.probe-tree',
        summary: 'Select one or more bounded options.',
        output: '',
        tags: ['probe-tree', 'multi-select'],
      },
    }
  }
  if (id === PROBE_TREE_TYPE_ONE_LAYOUT_ID) {
    return {
      label: 'Probe-Tree Card',
      properties: {
        title: 'Probe-Tree Card',
        cardTypeLabel: 'Probe-Tree Card',
        probeTreeTypeLabel: 'Probe-Tree Type 1',
        probeTreeCardVariant: PROBE_TREE_TYPE_ONE_LAYOUT_ID,
        selectionMode: 'freeform',
        typeLabel: 'Probe-Tree Card',
        lane: 'Probe-Tree',
        prompt: '/agentic-graph.probe-tree',
        summary: '',
        output: '',
        tags: ['probe-tree'],
      },
    }
  }
  return {
    label: FLOW_TEXT_GENERATION_NODE_LABEL,
    properties: {
      title: FLOW_TEXT_GENERATION_NODE_LABEL,
      output: '',
    },
  }
}
