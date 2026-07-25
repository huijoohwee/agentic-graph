import type { JSONValue } from '@/lib/graph/types'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_FORM_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import {
  PROBE_TREE_TYPE_TWO_LAYOUT_ID,
  WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS,
  buildWidgetCardLayoutSeed,
  readWidgetCardLayoutVariantDescriptor,
  type WidgetCardLayoutVariantDescriptor,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'
import { normalizeProbeTreeSelectionOptions } from '@/features/agent-ready/probeTreeContract.mjs'
import { readFirstString, toJsonValue } from './chatResponseStructuredRecord'

export type ChatResponseStructuredRole = 'widget' | 'panel' | 'card' | 'media' | 'table' | 'node'
export type ChatResponseStructuredSource = 'assistant' | 'literal-mcp'
export type ChatResponseSurfaceKind = 'text' | 'image' | 'audio' | 'video' | 'html'

export const CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS = [
  'layoutVariantId',
] as const

const CHAT_RESPONSE_WIDGET_PALETTE_RECORD_META_KEYS = new Set([
  'id',
  'nodeId',
  'node_id',
  'label',
  'title',
  'name',
  ...CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS,
])

const CHAT_RESPONSE_WIDGET_PALETTE_SEMANTIC_KEYS = new Set([
  'prompt',
  'input',
  'instructions',
  'systemPrompt',
  'system_prompt',
  'summary',
  'output',
  'result',
  'response',
  'transcript',
  'text',
  'content',
  'markdown',
  'description',
  'question',
  'rationale',
  'evidenceNeeded',
  'evidence_needed',
  'selectionOptions',
  'confidence',
])

const CHAT_RESPONSE_WIDGET_PALETTE_OUTPUT_KEYS = new Set([
  'output',
  'result',
  'response',
  'transcript',
  'text',
  'content',
  'markdown',
  'description',
])

const CHAT_RESPONSE_PROBE_TREE_VALIDATOR_KEYS = new Set([
  'parentNodeId',
  'parent_node_id',
  'parentId',
  'parent_id',
  'candidateOptionId',
  'candidate_option_id',
  'probeTreeDepth',
  'probe_tree_depth',
  'nextAction',
  'next_action',
  'contextAnchors',
])

const pickCanonicalLayoutAuthoredFields = (
  authoredRecord: Record<string, unknown>,
  descriptor: WidgetCardLayoutVariantDescriptor,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(authoredRecord)) {
    if (
      !CHAT_RESPONSE_WIDGET_PALETTE_RECORD_META_KEYS.has(key)
      && !CHAT_RESPONSE_WIDGET_PALETTE_SEMANTIC_KEYS.has(key)
    ) continue
    if (
      descriptor.id === PROBE_TREE_TYPE_TWO_LAYOUT_ID
      && CHAT_RESPONSE_WIDGET_PALETTE_OUTPUT_KEYS.has(key)
    ) continue
    if (descriptor.id === PROBE_TREE_TYPE_TWO_LAYOUT_ID && key === 'selectionOptions') {
      const selectionOptions = normalizeProbeTreeSelectionOptions(value)
      if (selectionOptions.length >= 2) out[key] = selectionOptions
      continue
    }
    out[key] = value
  }
  return out
}

const pickCanonicalProbeTreeValidatorInputs = (
  authoredRecord: Record<string, unknown>,
  descriptor: WidgetCardLayoutVariantDescriptor,
  role: ChatResponseStructuredRole,
  source: ChatResponseStructuredSource,
): Record<string, unknown> => {
  if (
    descriptor.id !== PROBE_TREE_TYPE_TWO_LAYOUT_ID
    || role !== 'card'
    || source !== 'literal-mcp'
  ) return {}
  return Object.fromEntries(
    Object.entries(authoredRecord)
      .filter(([key]) => CHAT_RESPONSE_PROBE_TREE_VALIDATOR_KEYS.has(key)),
  )
}

const buildCanonicalLayoutRecordSeed = (
  seedProperties: Record<string, unknown>,
  descriptor: WidgetCardLayoutVariantDescriptor,
  role: ChatResponseStructuredRole,
): Record<string, unknown> => {
  if (descriptor.id !== PROBE_TREE_TYPE_TWO_LAYOUT_ID || role !== 'card') return seedProperties
  return Object.fromEntries(
    Object.entries(seedProperties).filter(([key]) => key !== 'selectionOptions'),
  )
}

const discardUntrustedProbeTreeRuntimeInputs = (
  authoredRecord: Record<string, unknown>,
  role: ChatResponseStructuredRole,
  source: ChatResponseStructuredSource,
): Record<string, unknown> => {
  if (
    role !== 'card'
    || source === 'literal-mcp'
    || readFirstString(authoredRecord, ['probeTreeCardVariant']) !== PROBE_TREE_TYPE_TWO_LAYOUT_ID
  ) return authoredRecord
  return Object.fromEntries(
    Object.entries(authoredRecord)
      .filter(([key]) => !CHAT_RESPONSE_PROBE_TREE_VALIDATOR_KEYS.has(key)),
  )
}

const PALETTE_LAYOUT_LIST = WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS
  .map(descriptor => `\`${descriptor.id}\` (${descriptor.label})`)
  .join(', ')

export const CHAT_RESPONSE_WIDGET_PALETTE_CONTRACT_PROMPT = [
  'FloatingPanel Props Panel Widgets response contract:',
  `- Canonical Widget Card layoutVariantId values, in palette order: ${PALETTE_LAYOUT_LIST}.`,
  '- A widgets record may declare one canonical layoutVariantId plus request-specific semantic fields; the shared extractor supplies its TextGeneration/default/textGeneration identity and palette-owned seed.',
  '- Request-specific label, prompt, summary, output, question, rationale, evidence, and valid selection content may override seed placeholders. Probe-Tree Type 2 output remains empty and user-owned.',
  '- The runtime discards provider-authored Widget identity, handles, registry/schema fields, timestamps, credentials, provider configuration, renderer geometry, and media endpoints for a canonical layout.',
  '- Keep Rich Media output in panels or media records so it reuses Rich Media Panel; do not invent Image Widget or Video Widget palette duplicates.',
].join('\n')

export type ResolvedChatResponseWidgetPaletteLayout = {
  descriptor: WidgetCardLayoutVariantDescriptor
  seedLabel: string
  seedProperties: Record<string, unknown>
}

export function applyChatResponseWidgetPaletteLayout(
  authoredRecord: Record<string, unknown>,
  role: ChatResponseStructuredRole,
  source: ChatResponseStructuredSource = 'assistant',
): {
  record: Record<string, unknown>
  layout: ResolvedChatResponseWidgetPaletteLayout | null
  probeTreeValidatorInputs: Record<string, unknown>
} {
  const authoritySafeRecord = discardUntrustedProbeTreeRuntimeInputs(authoredRecord, role, source)
  const descriptor = readWidgetCardLayoutVariantDescriptor(
    readFirstString(authoritySafeRecord, CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS),
  )
  const roleAcceptsLayout = role === 'widget'
    || (role === 'card' && descriptor?.id === PROBE_TREE_TYPE_TWO_LAYOUT_ID)
  if (!descriptor || !roleAcceptsLayout) {
    return { record: authoritySafeRecord, layout: null, probeTreeValidatorInputs: {} }
  }
  const seed = buildWidgetCardLayoutSeed(descriptor.id)
  if (!seed) return { record: authoritySafeRecord, layout: null, probeTreeValidatorInputs: {} }
  const authoredFields = pickCanonicalLayoutAuthoredFields(authoritySafeRecord, descriptor)
  return {
    record: {
      ...buildCanonicalLayoutRecordSeed(seed.properties, descriptor, role),
      ...authoredFields,
    },
    layout: {
      descriptor,
      seedLabel: seed.label,
      seedProperties: seed.properties,
    },
    probeTreeValidatorInputs: pickCanonicalProbeTreeValidatorInputs(authoredRecord, descriptor, role, source),
  }
}

const isKnownWidgetNodeType = (value: string): boolean =>
  value === FLOW_TEXT_GENERATION_NODE_TYPE_ID
  || value === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
  || value === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
  || value === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
  || value === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID

const readAuthoredWidgetFormId = (record: Record<string, unknown>): string =>
  readFirstString(record, ['flow:widgetFormId', 'widgetFormId', 'widget_form_id', 'formId', 'form_id'])

export function inferChatResponseWidgetNodeTypeId(args: {
  record: Record<string, unknown>
  role: ChatResponseStructuredRole
  layout: ResolvedChatResponseWidgetPaletteLayout | null
}): string {
  if (args.layout) return args.layout.descriptor.nodeTypeId
  const explicit = readFirstString(args.record, ['nodeTypeId', 'node_type_id', 'nodeType', 'widgetNodeType', 'widget_node_type'])
  if (isKnownWidgetNodeType(explicit)) return explicit
  const rawType = readFirstString(args.record, ['type'])
  if (isKnownWidgetNodeType(rawType)) return rawType
  const formId = readAuthoredWidgetFormId(args.record)
  const normalized = formId.toLowerCase()
  if (normalized === FLOW_RICH_MEDIA_PANEL_FORM_ID.toLowerCase()) return FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  if (normalized === FLOW_VIDEO_TRANSCRIBER_FORM_ID.toLowerCase()) return FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
  if (normalized.startsWith('textgeneration') || normalized.startsWith('videoscript')) return FLOW_TEXT_GENERATION_NODE_TYPE_ID
  if (normalized.startsWith('imagegeneration')) return FLOW_IMAGE_GENERATION_NODE_TYPE_ID
  if (normalized.startsWith('videogeneration')) return FLOW_VIDEO_GENERATION_NODE_TYPE_ID
  return args.role === 'widget' && formId ? FLOW_TEXT_GENERATION_NODE_TYPE_ID : FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
}

const defaultWidgetFormIdForNodeType = (nodeTypeId: string): string => {
  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) return 'textGeneration'
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) return 'imageGeneration'
  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) return 'videoGeneration'
  if (nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID) return FLOW_VIDEO_TRANSCRIBER_FORM_ID
  if (nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return FLOW_RICH_MEDIA_PANEL_FORM_ID
  return ''
}

const readConfiguredHandle = (record: Record<string, unknown>, keys: readonly string[]): string =>
  readFirstString(record, keys)

export const resolveChatResponseTargetHandleForKind = (kind: ChatResponseSurfaceKind): string => {
  if (kind === 'image') return 'imageUrl'
  if (kind === 'audio') return 'audioUrl'
  if (kind === 'video') return 'videoUrl'
  if (kind === 'html') return 'outputSrcDoc'
  return 'output'
}

export function resolveChatResponseWidgetProjection(args: {
  record: Record<string, unknown>
  nodeTypeId: string
  kind: ChatResponseSurfaceKind
  hasGeospatialPayload: boolean
  layout: ResolvedChatResponseWidgetPaletteLayout | null
}): {
  formId: string
  widgetTypeId: string
  sourceHandle: string
  targetHandle: string
} {
  const formId = args.layout?.descriptor.formId
    || readAuthoredWidgetFormId(args.record)
    || defaultWidgetFormIdForNodeType(args.nodeTypeId)
  const widgetTypeId = args.layout?.descriptor.widgetTypeId
    || readFirstString(args.record, ['flow:widgetTypeId', 'widgetTypeId', 'widget_type_id'])
    || (args.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID ? FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID : 'default')
  const targetHandle = (
    args.layout
      ? ''
      : readConfiguredHandle(args.record, ['targetHandle', 'target_handle', 'targetPort', 'target_port', 'inputHandle', 'input_handle', 'inputPort', 'input_port'])
  )
    || (
      args.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || args.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
      || args.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
        ? 'prompt_in'
        : args.nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
          ? 'sourceUrl_in'
          : resolveChatResponseTargetHandleForKind(args.kind)
    )
  const sourceHandle = (
    args.layout
      ? ''
      : readConfiguredHandle(args.record, ['sourceHandle', 'source_handle', 'sourcePort', 'source_port', 'outputHandle', 'output_handle', 'outputPort', 'output_port'])
  )
    || (
      args.hasGeospatialPayload
        ? 'geoJson'
        : args.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID || args.nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
          ? 'text_out'
          : args.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
            ? 'imageUrl'
            : args.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
              ? 'videoUrl'
              : resolveChatResponseTargetHandleForKind(args.kind)
    )
  return { formId, widgetTypeId, sourceHandle, targetHandle }
}

export function toChatResponseWidgetSeedProperties(
  layout: ResolvedChatResponseWidgetPaletteLayout | null,
): Record<string, JSONValue> {
  const out: Record<string, JSONValue> = {}
  for (const [key, rawValue] of Object.entries(layout?.seedProperties || {})) {
    const value = toJsonValue(rawValue)
    if (typeof value !== 'undefined') out[key] = value
  }
  return out
}
