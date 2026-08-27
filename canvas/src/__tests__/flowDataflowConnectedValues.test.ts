import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { computeFlowConnectedValuesBySchemaPath } from '@/lib/storyboardWidget/flowDataflow'
import { parseGraph } from '@/lib/graph/io/adapter'
import { FLOW_WIDGET_REGISTRY_METADATA_KEY } from '@/lib/config'
import { FLOW_WIDGET_FORM_ID_KEY, FLOW_WIDGET_TYPE_ID_KEY } from '@/features/storyboard-widget-manager/resolveWidgetRegistry'
import { tryParseMarkdownFrontmatterFlowGraph } from '@/features/parsers/markdownFrontmatterFlowGraph'
import {
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_SWARM_PREDICTION_FORM_ID,
  FLOW_SWARM_PREDICTION_NODE_TYPE_ID,
  FLOW_SWARM_PREDICTION_WIDGET_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import { buildSwarmPredictionRegistryDraft } from '@/features/swarm-prediction/swarmPredictionWidget'

export const testFlowDataflowConnectedValuesReusesSharedReaders = () => {
  const filePath = resolve(process.cwd(), 'src', 'lib', 'storyboardWidget', 'flowDataflow.ts')
  const text = readFileSync(filePath, 'utf8')
  if (!text.includes("import { readRecordPathValue, unwrapGraphCellValue } from '@/lib/graph/nodeProperties'")) {
    throw new Error('expected flow dataflow to reuse the shared logical cell and property-path readers upstream')
  }
  if (!text.includes("import { readGraphNodeProperties } from '@/lib/cards/graphNodeCardFields'")) {
    throw new Error('expected flow dataflow to reuse the persisted graph-property container reader upstream')
  }
  if (!text.includes("import { isPlainObject } from '@/lib/graph/value'")) {
    throw new Error('expected flow dataflow to reuse the shared plain-object guard upstream')
  }
  if (!text.includes('const readPlainObject = (value: unknown): Record<string, unknown> | null => {')) {
    throw new Error('expected flow dataflow to centralize plain-object coercion in one local helper')
  }
  if (!text.includes('hashRecordSignature32(readGraphNodeProperties(node), { maxEntries: 80, maxDepth: 3 })')) {
    throw new Error('expected flow dataflow graph keys to hash logical persisted properties')
  }
  if (!text.includes('const props = readPersistedPropertyObject(edge?.properties)')) {
    throw new Error('expected flow dataflow edge port reads to unwrap persisted property containers')
  }
  if (!text.includes('return readRecordPathValue(readGraphNodeProperties(node), path)')) {
    throw new Error('expected output-port reads to resolve logical persisted property values')
  }
  if (text.includes('function isRecord(v: unknown): v is Record<string, unknown> {')) {
    throw new Error('expected flow dataflow to stop defining a local record guard')
  }
}

export const testFlowDataflowConnectedValuesUnwrapsPersistedRichMediaOutput = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'generated-result',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Generated Result',
        properties: {
          key: 'properties',
          type: 'object',
          value: {
            output: {
              key: 'output',
              type: 'textarea',
              value: '# Generated result\n\nUse this source for the deliverables.',
            },
          },
        },
      },
      {
        id: 'deliverables-card',
        type: 'TextGeneration',
        label: 'Deliverables Widget Card',
        properties: {},
      },
    ],
    edges: [{
      id: 'generated-to-deliverables',
      source: 'generated-result',
      target: 'deliverables-card',
      label: 'output to prompt',
      properties: {
        key: 'properties',
        type: 'object',
        value: {
          'flow:sourcePortKey': { key: 'flow:sourcePortKey', type: 'string', value: 'output' },
          'flow:targetPortKey': { key: 'flow:targetPortKey', type: 'string', value: 'prompt_in' },
        },
      },
    }],
  }
  const registry = [
    {
      id: 'rich-media',
      isEnabled: true,
      nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      widgetTypeId: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      formId: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      fields: [],
      ports: [{ portKey: 'output', direction: 'output' as const, schemaPath: 'properties.output' }],
      schemaMappings: [],
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
    {
      id: 'text-generation',
      isEnabled: true,
      nodeTypeId: 'TextGeneration',
      widgetTypeId: 'default',
      formId: 'textGeneration',
      fields: [],
      ports: [{ portKey: 'prompt_in', direction: 'input' as const, schemaPath: 'properties.prompt' }],
      schemaMappings: [],
      updatedAt: '2026-07-19T00:00:00.000Z',
    },
  ]

  const connected = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry,
    targetNodeIds: new Set(['deliverables-card']),
  }).get('deliverables-card')?.['properties.prompt']
  if (connected?.value !== '# Generated result\n\nUse this source for the deliverables.') {
    throw new Error(`expected persisted Rich Media output scalar at Widget Card prompt_in, got ${JSON.stringify(connected)}`)
  }
  if (connected.sources[0]?.edgeId !== 'generated-to-deliverables' || connected.sources[0]?.portKey !== 'output') {
    throw new Error(`expected typed edge provenance from Generated Result output, got ${JSON.stringify(connected.sources)}`)
  }
}

export const testFlowDataflowConnectedValuesBySchemaPath = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'a',
        type: 'Node',
        label: 'A',
        properties: { value: 'hello', [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      { id: 'b', type: 'Node', label: 'B', properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'in', [FLOW_WIDGET_FORM_ID_KEY]: 'in' } },
    ],
    edges: [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'linksTo',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'in',
        },
      },
    ],
  }

  const registry = [
    {
      id: 'qa',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'out',
      formId: 'out',
      fields: [],
      ports: [{ portKey: 'out', direction: 'output' as const, schemaPath: 'properties.value' }],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'qb',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'in',
      formId: 'in',
      fields: [],
      ports: [{ portKey: 'in', direction: 'input' as const, schemaPath: 'properties.input' }],
      schemaMappings: [{ fromPath: 'in.in', toPath: 'properties.mapped' }],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry })
  const b = byNodeId.get('b')
  if (!b) throw new Error('expected connected values for node b')

  const input = b['properties.input']
  if (!input) throw new Error('expected connected value at properties.input')
  if (input.value !== 'hello') throw new Error(`expected properties.input to be hello, got ${String(input.value)}`)
  if (input.sources.length !== 1) throw new Error('expected exactly one source for properties.input')
  if (input.sources[0].nodeId !== 'a') throw new Error('expected source nodeId to be a')
  if (input.sources[0].portKey !== 'out') throw new Error('expected source portKey to be out')

  const mapped = b['properties.mapped']
  if (!mapped) throw new Error('expected derived mapping at properties.mapped')
  if (mapped.value !== 'hello') throw new Error(`expected properties.mapped to be hello, got ${String(mapped.value)}`)
}

export const testFlowDataflowConnectedValuesCacheReusesEquivalentRegistryShapes = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'a',
        type: 'Node',
        label: 'A',
        properties: { value: 'hello', [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      { id: 'b', type: 'Node', label: 'B', properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'in', [FLOW_WIDGET_FORM_ID_KEY]: 'in' } },
    ],
    edges: [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'linksTo',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'in',
        },
      },
    ],
  }

  const registry = [
    {
      id: 'qa',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'out',
      formId: 'out',
      fields: [],
      ports: [{ portKey: 'out', direction: 'output' as const, schemaPath: 'properties.value' }],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'qb',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'in',
      formId: 'in',
      fields: [],
      ports: [{ portKey: 'in', direction: 'input' as const, schemaPath: 'properties.input' }],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]

  const equivalentRegistry = registry.map(entry => ({
    ...entry,
    fields: [...entry.fields],
    ports: [...entry.ports],
    schemaMappings: [...entry.schemaMappings],
  }))
  const targetNodeIds = new Set(['b'])
  const first = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry, targetNodeIds })
  const second = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry: equivalentRegistry, targetNodeIds })
  if (first !== second) throw new Error('expected connected-values cache to reuse equivalent registry shapes')
}

export const testFlowDataflowConnectedValuesTransformsAndPropagation = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'a',
        type: 'Node',
        label: 'A',
        properties: { value: 'hello', [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      {
        id: 'b',
        type: 'Node',
        label: 'B',
        properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'mid', [FLOW_WIDGET_FORM_ID_KEY]: 'mid' },
      },
      {
        id: 'c',
        type: 'Node',
        label: 'C',
        properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'in', [FLOW_WIDGET_FORM_ID_KEY]: 'in' },
      },
      {
        id: 'a2',
        type: 'Node',
        label: 'A2',
        properties: { value: 'world', [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 'a',
        target: 'b',
        label: 'linksTo',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'in',
        },
      },
      {
        id: 'e2',
        source: 'b',
        target: 'c',
        label: 'linksTo',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'x',
        },
      },
      {
        id: 'e3',
        source: 'a2',
        target: 'b',
        label: 'linksTo',
        properties: {
          'flow:sourcePortKey': 'out',
          'flow:targetPortKey': 'in',
        },
      },
    ],
  }

  const registry = [
    {
      id: 'qa',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'out',
      formId: 'out',
      fields: [],
      ports: [{ portKey: 'out', direction: 'output' as const, schemaPath: 'properties.value' }],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'qb',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'mid',
      formId: 'mid',
      fields: [],
      ports: [
        { portKey: 'in', direction: 'input' as const, schemaPath: 'properties.input' },
        { portKey: 'out', direction: 'output' as const, schemaPath: 'properties.out' },
      ],
      schemaMappings: [
        { fromPath: 'in.in', toPath: 'properties.mapped', reduceId: 'join_comma' },
        { fromPath: 'in.in', toPath: 'properties.out', reduceId: 'first', transformId: 'upper' },
      ],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'qc',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'in',
      formId: 'in',
      fields: [],
      ports: [{ portKey: 'x', direction: 'input' as const, schemaPath: 'properties.x' }],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry })
  const b = byNodeId.get('b')
  if (!b) throw new Error('expected connected values for node b')

  const mapped = b['properties.mapped']
  if (!mapped) throw new Error('expected derived mapping at properties.mapped')
  if (mapped.value !== 'hello, world') throw new Error(`expected properties.mapped to be "hello, world", got ${String(mapped.value)}`)

  const out = b['properties.out']
  if (!out) throw new Error('expected derived mapping at properties.out')
  if (out.value !== 'HELLO') throw new Error(`expected properties.out to be "HELLO", got ${String(out.value)}`)

  const c = byNodeId.get('c')
  if (!c) throw new Error('expected connected values for node c')
  const cx = c['properties.x']
  if (!cx) throw new Error('expected connected value at properties.x')
  if (cx.value !== 'HELLO') throw new Error(`expected properties.x to be "HELLO", got ${String(cx.value)}`)
}

export const testFlowDataflowConnectedValuesSynthesizesOutputSrcDocFromOutput = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 't',
        type: 'TextGeneration',
        label: 'Text Node',
        properties: {
          output: '# Hello\n\nWorld',
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'textGeneration',
        },
      },
      {
        id: 'p',
        type: 'RichMediaPanel',
        label: 'Panel',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'richMediaPanel',
        },
      },
    ],
    edges: [
      {
        id: 'e1',
        source: 't',
        target: 'p',
        label: '',
        properties: {
          'flow:sourcePortKey': 'outputSrcDoc',
          'flow:targetPortKey': 'outputSrcDoc',
        },
      },
    ],
  }

  const registry = [
    {
      id: 'rt',
      isEnabled: true,
      nodeTypeId: 'TextGeneration',
      widgetTypeId: 'default',
      formId: 'textGeneration',
      fields: [],
      ports: [
        { portKey: 'outputSrcDoc', direction: 'output' as const, schemaPath: 'properties.outputSrcDoc' },
      ],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
    {
      id: 'rp',
      isEnabled: true,
      nodeTypeId: 'RichMediaPanel',
      widgetTypeId: 'default',
      formId: 'richMediaPanel',
      fields: [],
      ports: [
        { portKey: 'outputSrcDoc', direction: 'input' as const, schemaPath: 'properties.outputSrcDoc' },
      ],
      schemaMappings: [],
      updatedAt: '2026-02-01T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry })
  const panel = byNodeId.get('p')
  if (!panel) throw new Error('expected connected values for panel node')
  const srcDoc = panel['properties.outputSrcDoc']
  if (!srcDoc) throw new Error('expected connected value at properties.outputSrcDoc')
  const html = String(srcDoc.value || '')
  if (!html.startsWith('<!doctype html>')) throw new Error('expected synthesized srcdoc to be HTML')
  if (!html.includes('Hello')) throw new Error('expected synthesized srcdoc to contain text output')
}

export const testFlowDataflowConnectedValuesRgbTransforms = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'r',
        type: 'Node',
        label: 'R',
        properties: { value: 255, [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      {
        id: 'g',
        type: 'Node',
        label: 'G',
        properties: { value: 0, [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      {
        id: 'b',
        type: 'Node',
        label: 'B',
        properties: { value: 128, [FLOW_WIDGET_TYPE_ID_KEY]: 'out', [FLOW_WIDGET_FORM_ID_KEY]: 'out' },
      },
      {
        id: 'color',
        type: 'Node',
        label: 'Color',
        properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'color', [FLOW_WIDGET_FORM_ID_KEY]: 'color' },
      },
    ],
    edges: [
      {
        id: 'e-r',
        source: 'r',
        target: 'color',
        label: 'linksTo',
        properties: { 'flow:sourcePortKey': 'out', 'flow:targetPortKey': 'r' },
      },
      {
        id: 'e-g',
        source: 'g',
        target: 'color',
        label: 'linksTo',
        properties: { 'flow:sourcePortKey': 'out', 'flow:targetPortKey': 'g' },
      },
      {
        id: 'e-b',
        source: 'b',
        target: 'color',
        label: 'linksTo',
        properties: { 'flow:sourcePortKey': 'out', 'flow:targetPortKey': 'b' },
      },
    ],
  }

  const registry = [
    {
      id: 'q-out',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'out',
      formId: 'out',
      fields: [],
      ports: [{ portKey: 'out', direction: 'output' as const, schemaPath: 'properties.value' }],
      schemaMappings: [],
      updatedAt: '2026-02-08T00:00:00.000Z',
    },
    {
      id: 'q-color',
      isEnabled: true,
      nodeTypeId: 'Node',
      widgetTypeId: 'color',
      formId: 'color',
      fields: [],
      ports: [
        { portKey: 'r', direction: 'input' as const, schemaPath: 'properties.r' },
        { portKey: 'g', direction: 'input' as const, schemaPath: 'properties.g' },
        { portKey: 'b', direction: 'input' as const, schemaPath: 'properties.b' },
        { portKey: 'color', direction: 'output' as const, schemaPath: 'properties.color' },
        { portKey: 'textColor', direction: 'output' as const, schemaPath: 'properties.textColor' },
      ],
      schemaMappings: [
        { fromPath: 'in', toPath: 'properties.color', transformId: 'rgb_css' },
        { fromPath: 'in', toPath: 'properties.textColor', transformId: 'contrast_text' },
      ],
      updatedAt: '2026-02-08T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({ graphData: graphData as never, registry, targetNodeIds: new Set(['color']) })
  const color = byNodeId.get('color')
  if (!color) throw new Error('expected connected values for node color')

  const r = color['properties.r']
  if (!r) throw new Error('expected connected value at properties.r')
  if (r.value !== 255) throw new Error(`expected properties.r to be 255, got ${String(r.value)}`)

  const css = color['properties.color']
  if (!css) throw new Error('expected derived mapping at properties.color')
  if (css.value !== 'rgb(255, 0, 128)') throw new Error(`expected properties.color to be rgb(255, 0, 128), got ${String(css.value)}`)

  const textColor = color['properties.textColor']
  if (!textColor) throw new Error('expected derived mapping at properties.textColor')
  if (textColor.value !== 'white') throw new Error(`expected properties.textColor to be white, got ${String(textColor.value)}`)
}

export const testComputingDataFlowsDemoBundleParsesAndComputes = () => {
  const bundle = {
    kind: 'kg:flow:widgetBundle',
    version: 1,
    registry: [
      {
        id: 'qer-MetricInput-default-value',
        isEnabled: true,
        nodeTypeId: 'MetricInput',
        widgetTypeId: 'default',
        formId: 'value',
        fields: [{ fieldKey: 'value', fieldType: 'number', label: 'Value', schemaPath: 'properties.value' }],
        ports: [{ portKey: 'value', direction: 'output', schemaPath: 'properties.value' }],
        schemaMappings: [],
        updatedAt: '2026-02-08T00:00:00.000Z',
      },
      {
        id: 'qer-MetricMixer-default-score',
        isEnabled: true,
        nodeTypeId: 'MetricMixer',
        widgetTypeId: 'default',
        formId: 'score',
        fields: [
          { fieldKey: 'alpha', fieldType: 'number', label: 'Alpha', schemaPath: 'properties.alpha' },
          { fieldKey: 'beta', fieldType: 'number', label: 'Beta', schemaPath: 'properties.beta' },
          { fieldKey: 'gamma', fieldType: 'number', label: 'Gamma', schemaPath: 'properties.gamma' },
          { fieldKey: 'score', fieldType: 'number', label: 'Score', schemaPath: 'properties.score' },
        ],
        ports: [
          { portKey: 'alpha', direction: 'input', schemaPath: 'properties.alpha' },
          { portKey: 'beta', direction: 'input', schemaPath: 'properties.beta' },
          { portKey: 'gamma', direction: 'input', schemaPath: 'properties.gamma' },
          { portKey: 'score', direction: 'output', schemaPath: 'properties.score' },
        ],
        schemaMappings: [],
        updatedAt: '2026-02-08T00:00:00.000Z',
      },
      {
        id: 'qer-MetricSink-default-score',
        isEnabled: true,
        nodeTypeId: 'MetricSink',
        widgetTypeId: 'default',
        formId: 'score',
        fields: [{ fieldKey: 'score', fieldType: 'number', label: 'Score', schemaPath: 'properties.score' }],
        ports: [{ portKey: 'score', direction: 'input', schemaPath: 'properties.score' }],
        schemaMappings: [],
        updatedAt: '2026-02-08T00:00:00.000Z',
      },
    ],
    graph: {
      type: 'Graph',
      nodes: [
        {
          id: 'alpha',
          type: 'MetricInput',
          label: 'Alpha',
          properties: { value: 1, [FLOW_WIDGET_TYPE_ID_KEY]: 'default', [FLOW_WIDGET_FORM_ID_KEY]: 'value' },
        },
        {
          id: 'beta',
          type: 'MetricInput',
          label: 'Beta',
          properties: { value: 2, [FLOW_WIDGET_TYPE_ID_KEY]: 'default', [FLOW_WIDGET_FORM_ID_KEY]: 'value' },
        },
        {
          id: 'gamma',
          type: 'MetricInput',
          label: 'Gamma',
          properties: { value: 3, [FLOW_WIDGET_TYPE_ID_KEY]: 'default', [FLOW_WIDGET_FORM_ID_KEY]: 'value' },
        },
        {
          id: 'mixer',
          type: 'MetricMixer',
          label: 'Weighted Score',
          properties: {
            'flow:compute': '(inputs) => ({ score: Number(inputs.alpha || 0) + Number(inputs.beta || 0) * 2 + Number(inputs.gamma || 0) * 3 })',
            [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
            [FLOW_WIDGET_FORM_ID_KEY]: 'score',
          },
        },
        {
          id: 'sink',
          type: 'MetricSink',
          label: 'Score Sink',
          properties: { [FLOW_WIDGET_TYPE_ID_KEY]: 'default', [FLOW_WIDGET_FORM_ID_KEY]: 'score' },
        },
      ],
      edges: [
        { id: 'e-alpha', source: 'alpha', target: 'mixer', label: 'linksTo', properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'alpha' } },
        { id: 'e-beta', source: 'beta', target: 'mixer', label: 'linksTo', properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'beta' } },
        { id: 'e-gamma', source: 'gamma', target: 'mixer', label: 'linksTo', properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'gamma' } },
        { id: 'e-score', source: 'mixer', target: 'sink', label: 'linksTo', properties: { 'flow:sourcePortKey': 'score', 'flow:targetPortKey': 'score' } },
      ],
    },
  }

  const text = JSON.stringify(bundle)
  const res = parseGraph('computing-data-flows.json', text)
  const graphData = res.data

  const meta = graphData.metadata as unknown as Record<string, unknown> | undefined
  const registry = (meta?.[FLOW_WIDGET_REGISTRY_METADATA_KEY] as unknown[]) || []
  if (!Array.isArray(registry) || registry.length === 0) throw new Error('expected registry metadata to be present')

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry: registry as never,
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for sink')

  const score = sink['properties.score']
  if (!score) throw new Error('expected computed score at properties.score')
  if (score.value !== 14) throw new Error(`expected properties.score to be 14, got ${String(score.value)}`)
}

export const testFlowDataflowRegisteredWidgetComputePropagatesOutputPorts = () => {
  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: { frontmatterFlowSettings: { computed: true } },
    nodes: [
      {
        id: 'seed',
        type: 'Source',
        label: 'Source',
        properties: {
          seedSignalsJson: JSON.stringify([
            { label: 'Source demand', valence: 0.34, weight: 0.8, sourceRef: 'source' },
            { label: 'Review risk', valence: -0.12, weight: 0.4, sourceRef: 'review' },
          ]),
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'seed',
        },
      },
      {
        id: 'swarm',
        type: FLOW_SWARM_PREDICTION_NODE_TYPE_ID,
        label: 'Swarm',
        properties: {
          scenarioTitle: 'Neutral scenario',
          agentPopulationJson: JSON.stringify([
            { label: 'Operator', cohort: 'operator', initialBelief: 0.2, confidence: 0.7, influence: 0.6 },
            { label: 'Reviewer', cohort: 'review', initialBelief: -0.1, confidence: 0.8, influence: 0.4 },
          ]),
          interventionsJson: JSON.stringify([{ tick: 1, label: 'Review gate', effect: -0.02, targetCohort: 'review' }]),
          ticks: 3,
          output: '',
          outputSrcDoc: '',
          imageUrl: '',
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_SWARM_PREDICTION_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_SWARM_PREDICTION_FORM_ID,
        },
      },
      {
        id: 'panel',
        type: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
        label: 'Panel',
        properties: {
          outputSrcDoc: '',
          richMediaActiveTab: 'auto',
          [FLOW_WIDGET_TYPE_ID_KEY]: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
          [FLOW_WIDGET_FORM_ID_KEY]: FLOW_RICH_MEDIA_PANEL_FORM_ID,
        },
      },
    ],
    edges: [
      { id: 'e-seed', source: 'seed', target: 'swarm', properties: { 'flow:sourcePortKey': 'seedSignalsJson', 'flow:targetPortKey': 'seedSignalsJson_in' } },
      { id: 'e-panel', source: 'swarm', target: 'panel', properties: { 'flow:sourcePortKey': 'outputSrcDoc', 'flow:targetPortKey': 'outputSrcDoc' } },
    ],
  }

  const swarmDraft = buildSwarmPredictionRegistryDraft()
  const registry = [
    {
      id: 'q-source',
      isEnabled: true,
      nodeTypeId: 'Source',
      widgetTypeId: 'default',
      formId: 'seed',
      fields: [],
      ports: [{ portKey: 'seedSignalsJson', direction: 'output' as const, schemaPath: 'properties.seedSignalsJson' }],
      schemaMappings: [],
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
    { ...swarmDraft, id: 'q-swarm', updatedAt: '2026-06-05T00:00:00.000Z' },
    {
      id: 'q-panel',
      isEnabled: true,
      nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      widgetTypeId: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      formId: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      fields: [],
      ports: [{ portKey: 'outputSrcDoc', direction: 'input' as const, schemaPath: 'properties.outputSrcDoc' }],
      schemaMappings: [],
      updatedAt: '2026-06-05T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry,
    targetNodeIds: new Set(['panel']),
  })
  const panel = byNodeId.get('panel')
  const srcDoc = panel?.['properties.outputSrcDoc']?.value
  if (typeof srcDoc !== 'string' || !srcDoc.includes('<!doctype html>')) {
    throw new Error(`expected registered widget compute to feed panel outputSrcDoc, got ${String(srcDoc).slice(0, 120)}`)
  }
  if (!String(srcDoc).includes('Neutral scenario')) {
    throw new Error('expected registered widget compute to use node-local properties')
  }
  if (!String(srcDoc).includes('Prediction score') || !String(srcDoc).includes('Consensus')) {
    throw new Error('expected registered widget compute to expose renderable chart content')
  }
}

export const testFlowDataflowConnectedValuesFlowComputeFunction = () => {
  const graphData = {
    type: 'GraphData',
    nodes: [
      {
        id: 'src',
        type: 'input',
        label: 'Source',
        properties: {
          data: { urls: ['https://demo.local/a', 'https://demo.local/b'] },
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'src',
        },
      },
      {
        id: 'transform',
        type: 'default',
        label: 'Transform',
        properties: {
          'flow:compute': '(inputs) => ({ demos: (Array.isArray(inputs.urls) ? inputs.urls : [inputs.urls]).filter(Boolean).map((url) => ({ url, extracted: true })) })',
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'transform',
        },
      },
      {
        id: 'sink',
        type: 'output',
        label: 'Sink',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'sink',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'src', target: 'transform', properties: { 'flow:sourcePortKey': 'urls', 'flow:targetPortKey': 'urls' } },
      { id: 'e2', source: 'transform', target: 'sink', properties: { 'flow:sourcePortKey': 'demos', 'flow:targetPortKey': 'demos' } },
    ],
  }
  const registry = [
    {
      id: 'q-src',
      isEnabled: true,
      nodeTypeId: 'input',
      widgetTypeId: 'default',
      formId: 'src',
      fields: [],
      ports: [{ portKey: 'urls', direction: 'output' as const, schemaPath: 'properties.data.urls' }],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
    {
      id: 'q-transform',
      isEnabled: true,
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'transform',
      fields: [],
      ports: [
        { portKey: 'urls', direction: 'input' as const, schemaPath: 'properties.data.urls' },
        { portKey: 'demos', direction: 'output' as const, schemaPath: 'properties.data.demos' },
      ],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
    {
      id: 'q-sink',
      isEnabled: true,
      nodeTypeId: 'output',
      widgetTypeId: 'default',
      formId: 'sink',
      fields: [],
      ports: [{ portKey: 'demos', direction: 'input' as const, schemaPath: 'properties.data.demos' }],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry,
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for sink')
  const demos = sink['properties.data.demos']
  if (!demos) throw new Error('expected properties.data.demos value for sink')
  if (!Array.isArray(demos.value)) throw new Error('expected sink demos to be an array')
  if ((demos.value as Array<unknown>).length !== 2) throw new Error('expected sink demos length 2')
}

export const testFlowDataflowConnectedValuesFlowComputeFunctionPropagatesUnregisteredOutputPorts = () => {
  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: {
        computed: true,
      },
    },
    nodes: [
      {
        id: 'src',
        type: 'input',
        label: 'Source',
        properties: { amount: 7 },
      },
      {
        id: 'calculator',
        type: 'calculator',
        label: 'Calculator',
        properties: {
          'flow:compute': '(inputs) => ({ total: Number(inputs.amount || 0) + 5 })',
        },
      },
      {
        id: 'sink',
        type: 'output',
        label: 'Sink',
        properties: {},
      },
    ],
    edges: [
      { id: 'e1', source: 'src', target: 'calculator', properties: { 'flow:sourcePortKey': 'amount', 'flow:targetPortKey': 'amount' } },
      { id: 'e2', source: 'calculator', target: 'sink', properties: { 'flow:sourcePortKey': 'total', 'flow:targetPortKey': 'total' } },
    ],
  }

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry: [],
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for unregistered sink')
  const total = sink['properties.total']
  if (!total) throw new Error('expected unregistered computed output to propagate through the matching port key')
  if (total.value !== 12) throw new Error(`expected computed total to be 12, got ${String(total.value)}`)
}

export const testFlowDataflowConnectedValuesStopsNullBranchOutputs = () => {
  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { computed: true },
    },
    nodes: [
      { id: 'source', type: 'metric', label: 'Source', properties: { value: 140 } },
      {
        id: 'branch',
        type: 'metric',
        label: 'Branch',
        properties: {
          'flow:compute': '(inputs) => ({ pass: Number(inputs.value || 0) >= 100 ? inputs.value : null, fail: Number(inputs.value || 0) < 100 ? inputs.value : null })',
        },
      },
      { id: 'pass-sink', type: 'metric', label: 'Pass Sink', properties: {} },
      { id: 'fail-sink', type: 'metric', label: 'Fail Sink', properties: {} },
    ],
    edges: [
      { id: 'e-source', source: 'source', target: 'branch', properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'value' } },
      { id: 'e-pass', source: 'branch', target: 'pass-sink', properties: { 'flow:sourcePortKey': 'pass', 'flow:targetPortKey': 'pass' } },
      { id: 'e-fail', source: 'branch', target: 'fail-sink', properties: { 'flow:sourcePortKey': 'fail', 'flow:targetPortKey': 'fail' } },
    ],
  }

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry: [],
    targetNodeIds: new Set(['pass-sink', 'fail-sink']),
  })
  const passSink = byNodeId.get('pass-sink')
  if (!passSink) throw new Error('expected connected values for active branch sink')
  const pass = passSink['properties.pass']
  if (!pass) throw new Error('expected active branch output to propagate')
  if (pass.value !== 140) throw new Error(`expected active branch value 140, got ${String(pass.value)}`)

  const failSink = byNodeId.get('fail-sink')
  if (!failSink) throw new Error('expected connected-value map for inactive branch sink')
  if (failSink['properties.fail']) {
    throw new Error('expected null branch output to stop before downstream connected values')
  }
}

export const testFlowDataflowConnectedValuesFrontmatterComputedFalseDisablesRuntimeCompute = () => {
  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: {
        computed: false,
      },
    },
    nodes: [
      {
        id: 'src',
        type: 'input',
        label: 'Source',
        properties: {
          data: { urls: ['https://demo.local/a'] },
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'src',
        },
      },
      {
        id: 'transform',
        type: 'default',
        label: 'Transform',
        properties: {
          'flow:compute': '(inputs) => ({ demos: [{ url: "should-not-run" }] })',
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'transform',
        },
      },
      {
        id: 'sink',
        type: 'output',
        label: 'Sink',
        properties: {
          [FLOW_WIDGET_TYPE_ID_KEY]: 'default',
          [FLOW_WIDGET_FORM_ID_KEY]: 'sink',
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'src', target: 'transform', properties: { 'flow:sourcePortKey': 'urls', 'flow:targetPortKey': 'urls' } },
      { id: 'e2', source: 'transform', target: 'sink', properties: { 'flow:sourcePortKey': 'demos', 'flow:targetPortKey': 'demos' } },
    ],
  }
  const registry = [
    {
      id: 'q-src',
      isEnabled: true,
      nodeTypeId: 'input',
      widgetTypeId: 'default',
      formId: 'src',
      fields: [],
      ports: [{ portKey: 'urls', direction: 'output' as const, schemaPath: 'properties.data.urls' }],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
    {
      id: 'q-transform',
      isEnabled: true,
      nodeTypeId: 'default',
      widgetTypeId: 'default',
      formId: 'transform',
      fields: [],
      ports: [
        { portKey: 'urls', direction: 'input' as const, schemaPath: 'properties.data.urls' },
        { portKey: 'demos', direction: 'output' as const, schemaPath: 'properties.data.demos' },
      ],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
    {
      id: 'q-sink',
      isEnabled: true,
      nodeTypeId: 'output',
      widgetTypeId: 'default',
      formId: 'sink',
      fields: [],
      ports: [{ portKey: 'demos', direction: 'input' as const, schemaPath: 'properties.data.demos' }],
      schemaMappings: [],
      updatedAt: '2026-04-08T00:00:00.000Z',
    },
  ]

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry,
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for sink')
  const demos = sink['properties.data.demos']
  if (typeof demos?.value !== 'undefined') {
    throw new Error('expected runtime compute outputs to stay disabled when frontmatter flow computed=false')
  }
}

export const testFlowDataflowConnectedValuesComputesLongDirectedDagWithoutIterationCap = () => {
  const computeCount = 16
  const nodes: Array<Record<string, unknown>> = [
    { id: 'source', type: 'metric', label: 'Source', properties: { value: 1 } },
  ]
  const edges: Array<Record<string, unknown>> = []
  let prev = 'source'
  for (let i = 1; i <= computeCount; i += 1) {
    const id = `compute-${i}`
    nodes.push({
      id,
      type: 'metric',
      label: `Compute ${i}`,
      properties: {
        'flow:compute': '(inputs) => ({ value: Number(inputs.value || 0) + 1 })',
      },
    })
    edges.push({
      id: `e-${i}`,
      source: prev,
      target: id,
      properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'value' },
    })
    prev = id
  }
  nodes.push({ id: 'sink', type: 'metric', label: 'Sink', properties: {} })
  edges.push({
    id: 'e-sink',
    source: prev,
    target: 'sink',
    properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'value' },
  })

  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { computed: true },
    },
    nodes,
    edges,
  }
  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry: [],
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for sink')
  const value = sink['properties.value']
  if (!value) throw new Error('expected long DAG computed value at properties.value')
  const expected = 1 + computeCount
  if (value.value !== expected) throw new Error(`expected long DAG computed value ${expected}, got ${String(value.value)}`)
}

export const testFlowDataflowConnectedValuesPassesNeutralComputeContext = () => {
  const graphData = {
    type: 'GraphData',
    context: 'frontmatter-flow',
    metadata: {
      kind: 'frontmatter-flow',
      frontmatterFlowSettings: { computed: true },
    },
    nodes: [
      { id: 'source', type: 'metric', label: 'Source', properties: { value: 'ready' } },
      {
        id: 'compute',
        type: 'metric',
        label: 'Contextual Compute',
        properties: {
          'flow:compute': '(inputs, context) => ({ summary: `${context.node.label}:${inputs.value}` })',
        },
      },
      { id: 'sink', type: 'metric', label: 'Sink', properties: {} },
    ],
    edges: [
      { id: 'e1', source: 'source', target: 'compute', properties: { 'flow:sourcePortKey': 'value', 'flow:targetPortKey': 'value' } },
      { id: 'e2', source: 'compute', target: 'sink', properties: { 'flow:sourcePortKey': 'summary', 'flow:targetPortKey': 'summary' } },
    ],
  }

  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData: graphData as never,
    registry: [],
    targetNodeIds: new Set(['sink']),
  })
  const sink = byNodeId.get('sink')
  if (!sink) throw new Error('expected connected values for sink')
  const summary = sink['properties.summary']
  if (!summary) throw new Error('expected computed context summary at properties.summary')
  if (summary.value !== 'Contextual Compute:ready') {
    throw new Error(`expected context summary to propagate, got ${String(summary.value)}`)
  }
}

type RuntimeValidationComputingFlowInputMode = 'explicit' | 'hardcodeGuard'

function readRuntimeValidationComputingFlowPath(): { filePath: string; mode: RuntimeValidationComputingFlowInputMode } | null {
  const explicit = String(process.env.AG_TEST_VALIDATION_COMPUTING_FLOW_INPUT_PATH || '').trim()
  if (explicit) return { filePath: explicit, mode: 'explicit' }
  const hardcodeGuard = String(process.env.AG_TEST_VALIDATION_FORBID_HARDCODE_IN_REPO || '').trim()
  if (hardcodeGuard) return { filePath: hardcodeGuard, mode: 'hardcodeGuard' }
  return null
}

function readRuntimeValidationComputingFlowText(): { filePath: string; text: string } | null {
  const input = readRuntimeValidationComputingFlowPath()
  if (!input) return null
  const { filePath, mode } = input
  if (!existsSync(filePath)) {
    if (mode === 'explicit') throw new Error(`expected explicit runtime computing-flow validation input to exist: ${filePath}`)
    return null
  }
  const stat = statSync(filePath)
  if (!stat.isFile() || stat.size <= 0) {
    if (mode === 'explicit') throw new Error(`expected explicit runtime computing-flow validation input to be a non-empty file: ${filePath}`)
    return null
  }
  return { filePath, text: readFileSync(filePath, 'utf8') }
}

export const testRuntimeValidationComputingFlowInputHasNoCopiedFlowExampleHardcodes = () => {
  const runtimeInput = readRuntimeValidationComputingFlowText()
  if (!runtimeInput) return
  const text = runtimeInput.text
  const forbidden: RegExp[] = [
    /example-apps\.xyflow\.com/i,
    /reactflow\.dev\/learn\/advanced-use\/computing-flows/i,
    /@xyflow\/react/i,
    /\bNumberInput\b/,
    /\bColorPreview\b/,
    /\bcomputing-6\b/i,
  ]
  const found = forbidden.map(re => text.match(re)?.[0] || '').filter(Boolean)
  if (found.length > 0) {
    throw new Error(`runtime computing-flow validation input contains copied example hardcodes: ${found.join(', ')}`)
  }
}

export const testRuntimeValidationComputingFlowInputParsesAndPropagatesCompute = () => {
  const runtimeInput = readRuntimeValidationComputingFlowText()
  if (!runtimeInput) return
  const { filePath, text } = runtimeInput
  const parsed = tryParseMarkdownFrontmatterFlowGraph(filePath.split(/[/\\]/).pop() || 'computing-flow.md', text)
  if (!parsed) throw new Error('expected runtime computing-flow validation input to parse as frontmatter flow')
  const graphData = parsed.graphData
  const meta = (graphData.metadata || {}) as Record<string, unknown>
  const registryRaw = meta[FLOW_WIDGET_REGISTRY_METADATA_KEY]
  const registry = Array.isArray(registryRaw) ? registryRaw : []
  const computeNodeIds = new Set(
    (Array.isArray(graphData.nodes) ? graphData.nodes : [])
      .filter(node => typeof ((node.properties || {}) as Record<string, unknown>)['flow:compute'] === 'string')
      .map(node => String(node.id || '').trim())
      .filter(Boolean),
  )
  if (computeNodeIds.size === 0) throw new Error('expected runtime computing-flow validation input to declare at least one compute node')
  const byNodeId = computeFlowConnectedValuesBySchemaPath({
    graphData,
    registry: registry as never,
  })
  let propagated = 0
  for (const connected of Array.from(byNodeId.values())) {
    for (const value of Object.values(connected)) {
      const sources = Array.isArray(value?.sources) ? value.sources : []
      if (sources.some(source => computeNodeIds.has(String(source.nodeId || '').trim()))) propagated += 1
    }
  }
  if (propagated === 0) {
    throw new Error('expected runtime computing-flow validation input to propagate at least one compute-node output')
  }
}
