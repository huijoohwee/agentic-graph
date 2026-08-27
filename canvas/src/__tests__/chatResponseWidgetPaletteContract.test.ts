import yaml from 'js-yaml'
import { ensureDefaultWidgetRegistryEntries } from '@/hooks/store/storyboardWidgetManagerSlice'
import { isPropsPanelWidgetPaletteEntry } from '@/features/storyboard-widget-manager/registryTemplates'
import { listWidgetPaletteLayoutVariants } from '@/features/toolbar/widgetPaletteLayoutVariants'
import {
  CHAT_RESPONSE_WIDGET_PALETTE_CONTRACT_PROMPT,
} from '@/features/chat/chatResponseWidgetPaletteContract'
import {
  CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT,
  CHAT_BASE_RESPONSE_CONTRACT_PROMPT,
} from '@/features/chat/chatResponseBaseContract'
import { buildChatSubmitRequestContext } from '@/features/chat/floatingPanelChat/floatingPanelChatSubmitRequest'
import { buildSubmitArgsFixture } from '@/__tests__/helpers/chatSubmitArgsFixture'
import {
  extractChatResponseStructuredSurface,
  projectChatResponseStructuredSurfaceIntoKgcFrontmatter,
} from '@/features/chat/chatResponseStructuredContent'
import {
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_WIDGET_REGISTRY_METADATA_KEY,
} from '@/lib/config.storyboard-widget'
import {
  WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS,
  buildWidgetCardLayoutSeed,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'

const countOccurrences = (text: string, needle: string): number =>
  text.split(needle).length - 1

const buildPaletteStructuredResponse = (): string => JSON.stringify({
  response: {
    structuredContent: {
      widgets: WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.map((descriptor, index) => ({
        id: `palette-layout-${index + 1}`,
        label: `Chat ${descriptor.label}`,
        layoutVariantId: descriptor.id,
        prompt: `Authored prompt ${index + 1}`,
        ...(index === 0
          ? { nodeTypeId: 'ImageGeneration', widgetTypeId: 'provider-copy', formId: 'imageGeneration' }
          : {}),
        ...(descriptor.id === 'probe-tree-type-2'
          ? { selectionOptions: ['Prefer a bounded near-term choice', 'Prefer a broader long-term choice'] }
          : {}),
      })),
    },
  },
})

const PROJECTOR_BASE_FRONTMATTER = [
  'graph_meta:',
  '  node_count: 1',
  '  edge_count: 1',
  '  phase_count: 1',
  '  phases:',
  '    - id: P3',
  '      label: "Deliver + Persist"',
  '      seq_range: "S05"',
  '      nodes: [n-deliver]',
  'widget_bundle:',
  '  graph:',
  '    nodes_ref: [n-deliver]',
  'flow:',
  '  nodes:',
  '    - {id: n-deliver, type: RuntimeGateWidget, label: Deliver}',
  '  subgraphs:',
  '    - {id: sg-p3, kind: subgraph, label: "Deliver + Persist", memberNodeIds: [n-deliver], parentId: null}',
  '  edges:',
  '    - {id: e-base, source: n-deliver, sourceHandle: rendered, target: n-deliver, targetHandle: input, label: base, animated: false}',
].join('\n')

export async function testChatResponseContractReusesPropsPanelWidgetLayouts() {
  const defaultEntries = ensureDefaultWidgetRegistryEntries([], '2026-07-24T00:00:00.000Z').entries
  const cardLayouts = listWidgetPaletteLayoutVariants(
    defaultEntries.filter(isPropsPanelWidgetPaletteEntry),
    '16:9',
  ).slice(0, WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.length)
  const actual = cardLayouts.map(layout => ({
    id: layout.id,
    label: layout.label,
    nodeTypeId: layout.entry.nodeTypeId,
    widgetTypeId: layout.entry.widgetTypeId,
    formId: layout.entry.formId,
  }))
  const expected = WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.map(descriptor => ({
    id: descriptor.id,
    label: descriptor.label,
    nodeTypeId: descriptor.nodeTypeId,
    widgetTypeId: descriptor.widgetTypeId,
    formId: descriptor.formId,
  }))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected Chat and Props Panel to share canonical layout descriptors, got ${JSON.stringify(actual)}`)
  }

  for (const prompt of [CHAT_BASE_RESPONSE_CONTRACT_PROMPT, CHAT_BASE_KGC_RESPONSE_CONTRACT_PROMPT]) {
    if (countOccurrences(prompt, CHAT_RESPONSE_WIDGET_PALETTE_CONTRACT_PROMPT) !== 1) {
      throw new Error('expected each existing Chat response contract to include the shared Props Panel Widgets fragment exactly once')
    }
    for (const descriptor of WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS) {
      if (!prompt.includes(`\`${descriptor.id}\` (${descriptor.label})`)) {
        throw new Error(`expected Chat response contract to expose canonical palette layout ${descriptor.id}`)
      }
    }
  }

  const userQuery = 'Create a bounded comparison card for the selected evidence.'
  const context = await buildChatSubmitRequestContext({
    submitArgs: buildSubmitArgsFixture({ chatStorageTarget: 'chatAgenticGraph' }),
    nextMessages: [{ id: 'user-palette-contract', role: 'user', content: userQuery }],
    assistantMessageId: 'assistant-palette-contract',
  })
  if (context.systemMessages[0]?.content !== CHAT_BASE_RESPONSE_CONTRACT_PROMPT) {
    throw new Error('expected ordinary natural language to keep the existing plain Chat response contract')
  }
  const providerUserMessage = context.conversationMessages.find(message => message.role === 'user')
  if (providerUserMessage?.content !== userQuery) {
    throw new Error(`expected palette prompt reuse not to alter no-slash provider text, got ${JSON.stringify(providerUserMessage)}`)
  }
}

export function testChatResponseWidgetsReuseCanonicalLayoutSeedsDeterministically() {
  const assistantText = buildPaletteStructuredResponse()
  const first = extractChatResponseStructuredSurface(assistantText)
  const second = extractChatResponseStructuredSurface(assistantText)
  if (!first || !second || JSON.stringify(first) !== JSON.stringify(second)) {
    throw new Error('expected repeated palette structured-response extraction to be deterministic')
  }
  if (first.nodes.length !== WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.length) {
    throw new Error(`expected one Chat widget per canonical palette layout, got ${first.nodes.length}`)
  }

  first.nodes.forEach((node, index) => {
    const descriptor = WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS[index]
    if (!descriptor) throw new Error(`expected a shared descriptor for projected node ${node.id}`)
    const seed = buildWidgetCardLayoutSeed(descriptor.id)
    if (
      !seed
      || node.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || node.properties['flow:widgetTypeId'] !== descriptor.widgetTypeId
      || node.properties['flow:widgetFormId'] !== descriptor.formId
      || node.sourceHandle !== 'text_out'
      || node.targetHandle !== 'prompt_in'
    ) {
      throw new Error(`expected ${descriptor.id} to resolve through its canonical Widget Card identity, got ${JSON.stringify(node)}`)
    }
    for (const [key, expectedValue] of Object.entries(seed.properties)) {
      if (key === 'title' || key === 'prompt' || key === 'selectionOptions') continue
      if (JSON.stringify(node.properties[key]) !== JSON.stringify(expectedValue)) {
        throw new Error(`expected ${descriptor.id} to reuse seed property ${key}, got ${JSON.stringify(node.properties[key])}`)
      }
    }
    if (
      node.label !== `Chat ${descriptor.label}`
      || node.properties.title !== node.label
      || node.properties.prompt !== `Authored prompt ${index + 1}`
      || Object.prototype.hasOwnProperty.call(node.properties, 'layoutVariantId')
    ) {
      throw new Error(`expected authored fields to override ${descriptor.id} seed without persisting a second layout identity, got ${JSON.stringify(node)}`)
    }
  })

  const typeTwo = first.nodes[2]
  if (JSON.stringify(typeTwo?.properties.selectionOptions) !== JSON.stringify([
    {
      id: 'option-1-prefer-a-bounded-near-term-choice',
      label: 'Prefer a bounded near-term choice',
    },
    {
      id: 'option-2-prefer-a-broader-long-term-choice',
      label: 'Prefer a broader long-term choice',
    },
  ])) {
    throw new Error(`expected authored Type 2 options to override placeholder seed options, got ${JSON.stringify(typeTwo?.properties.selectionOptions)}`)
  }

  const unknownSurface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        widgets: [{
          id: 'unknown-layout',
          layoutVariantId: 'provider-invented-layout',
          output: 'Readable neutral fallback.',
        }],
      },
    },
  }))
  const unknownNode = unknownSurface?.nodes[0]
  if (
    !unknownNode
    || unknownNode.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
    || unknownNode.properties.output !== 'Readable neutral fallback.'
    || Object.prototype.hasOwnProperty.call(unknownNode.properties, 'layoutVariantId')
    || Object.prototype.hasOwnProperty.call(unknownNode.properties, 'cardTypeLabel')
  ) {
    throw new Error(`expected unknown layout IDs to receive no canonical seed while preserving neutral output, got ${JSON.stringify(unknownNode)}`)
  }
}

export function testChatResponseCanonicalLayoutsRejectProviderRuntimeAuthority() {
  const surface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        widgets: [
          {
            id: 'canonical-adversarial',
            label: 'Safe authored label',
            layoutVariantId: 'widget-card-type-0',
            prompt: 'Safe authored prompt',
            summary: 'Safe authored summary',
            output: 'Safe authored output',
            nodeTypeId: 'ImageGeneration',
            widgetTypeId: 'provider-widget',
            formId: 'imageGeneration',
            sourceHandle: 'provider_out',
            targetHandle: 'provider_in',
            properties: {
              chatAuthMode: 'byok',
              chatApiKey: 'provider-authored-secret',
              chatProvider: 'provider-authored',
              chatEndpointUrl: 'https://provider-authored.invalid/v1',
              chatModel: 'provider-authored-model',
              ports: [{ portKey: 'provider-port' }],
              schemaMapping: { output: 'provider.schema.path' },
              position: { x: 999, y: 999 },
              x: 999,
              y: 999,
              updatedAt: '2099-01-01T00:00:00.000Z',
              imageUrl: 'https://provider-authored.invalid/image.png',
              'flow:compute': 'provider-authored-runtime-source',
            },
          },
          {
            id: 'neutral-authored-handles',
            label: 'Neutral authored handles',
            nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
            widgetTypeId: 'default',
            formId: 'textGeneration',
            prompt: 'Keep neutral authored handle behavior.',
            sourceHandle: 'neutral_out',
            targetHandle: 'neutral_in',
          },
          {
            id: 'canonical-probe-tree',
            label: 'Canonical Probe-Tree',
            layoutVariantId: 'probe-tree-type-2',
            prompt: 'Choose a bounded response.',
            selectionOptions: ['Prefer the bounded option', 'Prefer the broader option'],
            probeTreeCardVariant: 'provider-invented-variant',
            selectionMode: 'single',
            allowOther: false,
            output: 'Provider-authored output must not replace user-owned output.',
          },
          {
            id: 'canonical-probe-tree-invalid-options',
            layoutVariantId: 'probe-tree-type-2',
            selectionOptions: ['Only one provider option'],
          },
        ],
      },
    },
  }))
  if (!surface || surface.nodes.length !== 4) {
    throw new Error(`expected adversarial canonical and neutral Widget records, got ${JSON.stringify(surface)}`)
  }

  const canonical = surface.nodes[0]
  if (
    !canonical
    || canonical.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || canonical.properties['flow:widgetTypeId'] !== 'default'
    || canonical.properties['flow:widgetFormId'] !== 'textGeneration'
    || canonical.sourceHandle !== 'text_out'
    || canonical.targetHandle !== 'prompt_in'
    || canonical.label !== 'Safe authored label'
    || canonical.properties.prompt !== 'Safe authored prompt'
    || canonical.properties.summary !== 'Safe authored summary'
    || canonical.properties.output !== 'Safe authored output'
  ) {
    throw new Error(`expected canonical descriptor authority with authored semantic content, got ${JSON.stringify(canonical)}`)
  }
  for (const forbiddenKey of [
    'chatAuthMode',
    'chatApiKey',
    'chatProvider',
    'chatEndpointUrl',
    'chatModel',
    'ports',
    'schemaMapping',
    'position',
    'x',
    'y',
    'updatedAt',
    'imageUrl',
    'flow:compute',
  ]) {
    if (Object.prototype.hasOwnProperty.call(canonical.properties, forbiddenKey)) {
      throw new Error(`expected canonical layout field policy to discard ${forbiddenKey}, got ${JSON.stringify(canonical.properties)}`)
    }
  }

  const neutral = surface.nodes[1]
  if (
    !neutral
    || neutral.nodeTypeId !== FLOW_TEXT_GENERATION_NODE_TYPE_ID
    || neutral.sourceHandle !== 'neutral_out'
    || neutral.targetHandle !== 'neutral_in'
  ) {
    throw new Error(`expected neutral non-palette Widget records to retain authored handles, got ${JSON.stringify(neutral)}`)
  }

  const probeTree = surface.nodes[2]
  if (
    !probeTree
    || probeTree.properties.probeTreeCardVariant !== 'probe-tree-type-2'
    || probeTree.properties.selectionMode !== 'multiple'
    || probeTree.properties.allowOther !== true
    || probeTree.properties.output !== ''
    || JSON.stringify(probeTree.properties.selectionOptions) !== JSON.stringify([
      {
        id: 'option-1-prefer-the-bounded-option',
        label: 'Prefer the bounded option',
      },
      {
        id: 'option-2-prefer-the-broader-option',
        label: 'Prefer the broader option',
      },
    ])
  ) {
    throw new Error(`expected canonical Probe-Tree structure and user-owned output to remain authoritative, got ${JSON.stringify(probeTree)}`)
  }
  const invalidOptionsProbeTree = surface.nodes[3]
  if (JSON.stringify(invalidOptionsProbeTree?.properties.selectionOptions) !== JSON.stringify([
    { id: 'option-1', label: 'Option 1' },
    { id: 'option-2', label: 'Option 2' },
  ])) {
    throw new Error(`expected invalid Type 2 authored choices to retain the canonical seed, got ${JSON.stringify(invalidOptionsProbeTree)}`)
  }
}

export function testChatResponseCanonicalLayoutsRespectStructuredRoles() {
  const surface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        panels: [{
          id: 'role-panel',
          layoutVariantId: 'widget-card-type-0',
          output: 'Panel output stays Rich Media.',
        }],
        media: [{
          id: 'role-media',
          layoutVariantId: 'probe-tree-type-1',
          output: 'Media output stays Rich Media.',
        }],
        cards: [{
          id: 'role-card',
          layoutVariantId: 'rich-media-deliverables',
          output: 'A neutral card does not become a Widget.',
        }],
      },
    },
  }))
  const roleNodes = surface?.nodes.filter(node => node.id.startsWith('mcp-response-role-')) || []
  if (!surface || roleNodes.length !== 3) {
    throw new Error(`expected three neutral role-owned records, got ${JSON.stringify(surface)}`)
  }
  for (const node of roleNodes) {
    if (
      node.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
      || Object.prototype.hasOwnProperty.call(node.properties, 'cardTypeLabel')
      || Object.prototype.hasOwnProperty.call(node.properties, 'layoutVariantId')
    ) {
      throw new Error(`expected ${String(node.properties['chat:structuredRole'])} to reject Widget layout authority, got ${JSON.stringify(node)}`)
    }
  }
}

export function testChatResponseCanonicalLayoutMatchesLiteralMcpProjection() {
  const widget = {
    id: 'canonical-envelope-parity',
    label: 'Canonical envelope parity',
    layoutVariantId: 'probe-tree-type-1',
    prompt: 'Compare the same semantic payload across both supported envelopes.',
    summary: 'The LLM and literal MCP paths must normalize identically.',
  }
  const llmSurface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        widgets: [widget],
      },
    },
  }))
  const literalMcpSurface = extractChatResponseStructuredSurface(JSON.stringify({
    jsonrpc: '2.0',
    id: 'canonical-envelope-parity-call',
    result: {
      structuredContent: {
        response: {
          structuredContent: {
            widgets: [widget],
          },
        },
      },
    },
  }), { trustedSource: 'literal-mcp' })
  if (!llmSurface || !literalMcpSurface || JSON.stringify(llmSurface) !== JSON.stringify(literalMcpSurface)) {
    throw new Error(`expected LLM and literal MCP canonical layout envelopes to share one adapter projection, got ${JSON.stringify({ llmSurface, literalMcpSurface })}`)
  }
}

export function testChatResponseCanonicalProbeTreeTypeTwoPreservesValidatedLiteralMcpInputs() {
  const card = {
    id: 'canonical-probe-tree-type-two-parity',
    layoutVariantId: 'probe-tree-type-2',
    question: 'Which runtime acceptance evidence should own the selected child?',
    rationale: 'Keeps the branch grounded in the exact accepted runtime evidence.',
    evidenceNeeded: 'the integrated browser-proof ledger',
    selectionOptions: [
      'Prefer exact-SHA browser evidence before continuing',
      'Prefer protected integration evidence before continuing',
    ],
    parentNodeId: 'selected-probe-child',
    candidateOptionId: 'runtime-acceptance-evidence',
    probeTreeDepth: 99,
    nextAction: 'agenticgraph.probe.select',
    contextAnchors: [
      'selected child evidence',
      ' Selected child evidence ',
      'runtime acceptance',
    ],
    'flow:compute': 'provider-authored-runtime-source',
  }
  const llmSurface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        cards: [card],
      },
    },
  }))
  const literalMcpSurface = extractChatResponseStructuredSurface(JSON.stringify({
    jsonrpc: '2.0',
    id: 'canonical-probe-tree-type-two-call',
    result: {
      structuredContent: {
        response: {
          structuredContent: {
            cards: [card],
          },
        },
      },
    },
  }), { trustedSource: 'literal-mcp' })
  const llmNode = llmSurface?.nodes[0]
  if (
    !llmNode
    || llmNode.properties.parentNodeId !== ''
    || llmNode.properties.parentGraphNodeId !== ''
    || llmNode.properties.probeTreeCandidateKey !== 'candidate-1'
    || llmNode.properties.probeTreeDepth !== 1
    || JSON.stringify(llmNode.properties.contextAnchors) !== '[]'
    || Object.prototype.hasOwnProperty.call(llmNode.properties, 'flow:compute')
  ) {
    throw new Error(`expected ordinary LLM Type 2 runtime authority to be discarded, got ${JSON.stringify(llmNode)}`)
  }
  const node = literalMcpSurface?.nodes[0]
  if (
    !node
    || node.properties.parentNodeId !== 'selected-probe-child'
    || node.properties.parentGraphNodeId !== 'selected-probe-child'
    || node.properties.probeTreeCandidateKey !== 'runtime-acceptance-evidence'
    || node.properties.probeTreeDepth !== 8
    || node.properties.nextAction !== 'agenticgraph.probe.select'
    || JSON.stringify(node.properties.contextAnchors) !== JSON.stringify([
      'selected child evidence',
      'runtime acceptance',
    ])
    || Object.prototype.hasOwnProperty.call(node.properties, 'flow:compute')
  ) {
    throw new Error(`expected Type 2 validator-owned inputs to be preserved and normalized without provider runtime authority, got ${JSON.stringify(node)}`)
  }
  if (JSON.stringify(llmSurface) === JSON.stringify(literalMcpSurface)) {
    throw new Error('expected exact literal MCP provenance to be the only path that retains runtime-owned Type 2 inputs')
  }

  const { selectionOptions: _selectionOptions, ...cardWithoutDynamicOptions } = card
  const invalidSurface = extractChatResponseStructuredSurface(JSON.stringify({
    response: {
      structuredContent: {
        cards: [
          {
            ...card,
            id: 'invalid-canonical-probe-tree-type-two',
            rationale: '',
          },
          {
            ...cardWithoutDynamicOptions,
            id: 'missing-options-canonical-probe-tree-type-two',
          },
        ],
      },
    },
  }))
  if (invalidSurface) {
    throw new Error(`expected failed Type 2 validation or missing dynamic options to fail closed, got ${JSON.stringify(invalidSurface)}`)
  }
}

export function testChatResponseStructuredProjectorIsByteIdempotentForPaletteWidgets() {
  const surface = extractChatResponseStructuredSurface(buildPaletteStructuredResponse())
  if (!surface) throw new Error('expected palette structured response surface')
  const once = projectChatResponseStructuredSurfaceIntoKgcFrontmatter({
    frontmatter: PROJECTOR_BASE_FRONTMATTER,
    surface,
  })
  const twice = projectChatResponseStructuredSurfaceIntoKgcFrontmatter({
    frontmatter: once,
    surface,
  })
  if (twice !== once) {
    throw new Error('expected repeated shared structured-response projection to be byte-idempotent')
  }

  const parsed = yaml.load(once) as Record<string, unknown>
  const registry = Array.isArray(parsed?.[FLOW_WIDGET_REGISTRY_METADATA_KEY])
    ? parsed[FLOW_WIDGET_REGISTRY_METADATA_KEY] as Array<Record<string, unknown>>
    : []
  if (registry.length !== 1) {
    throw new Error(`expected four palette layouts to reuse one canonical document registry shape, got ${registry.length}`)
  }
  const signatures = new Set(registry.map(entry => `${entry.nodeTypeId}:${entry.widgetTypeId}:${entry.formId}`))
  if (signatures.size !== registry.length) {
    throw new Error(`expected unique document registry signatures, got ${JSON.stringify([...signatures])}`)
  }
  const flow = parsed?.flow && typeof parsed.flow === 'object' && !Array.isArray(parsed.flow)
    ? parsed.flow as { nodes?: Array<{ id?: unknown }>; subgraphs?: Array<{ id?: unknown }> }
    : {}
  const projectedNodeIds = Array.isArray(flow.nodes)
    ? flow.nodes.map(node => String(node?.id || ''))
    : []
  for (const node of surface.nodes) {
    if (projectedNodeIds.filter(id => id === node.id).length !== 1) {
      throw new Error(`expected one projected node for ${node.id}`)
    }
  }
  const projectedSubgraphIds = Array.isArray(flow.subgraphs)
    ? flow.subgraphs.map(subgraph => String(subgraph?.id || ''))
    : []
  if (projectedSubgraphIds.filter(id => id === 'sg-mcp-response').length !== 1) {
    throw new Error('expected exactly one shared structured-response subgraph')
  }
}
