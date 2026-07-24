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
  WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS,
  buildWidgetCardLayoutSeed,
  readWidgetCardLayoutVariantDescriptor,
  type WidgetCardLayoutVariantDescriptor,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'
import { readFirstString, toJsonValue } from './chatResponseStructuredRecord'

export type ChatResponseStructuredRole = 'widget' | 'panel' | 'card' | 'media' | 'table' | 'node'
export type ChatResponseSurfaceKind = 'text' | 'image' | 'audio' | 'video' | 'html'

export const CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS = [
  'layoutVariantId',
] as const

const PALETTE_LAYOUT_LIST = WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS
  .map(descriptor => `\`${descriptor.id}\` (${descriptor.label})`)
  .join(', ')

export const CHAT_RESPONSE_WIDGET_PALETTE_CONTRACT_PROMPT = [
  'FloatingPanel Props Panel Widgets response contract:',
  `- Canonical Widget Card layoutVariantId values, in palette order: ${PALETTE_LAYOUT_LIST}.`,
  '- A widgets record may declare one canonical layoutVariantId plus request-specific semantic fields; the shared extractor supplies its TextGeneration/default/textGeneration identity and palette-owned seed.',
  '- Request-specific fields override seed defaults. Do not repeat or contradict nodeTypeId, widgetTypeId, or formId for a canonical layout.',
  '- Keep Rich Media output in panels or media records so it reuses Rich Media Panel; do not invent Image Widget or Video Widget palette duplicates.',
].join('\n')

export type ResolvedChatResponseWidgetPaletteLayout = {
  descriptor: WidgetCardLayoutVariantDescriptor
  seedLabel: string
  seedProperties: Record<string, unknown>
}

export function applyChatResponseWidgetPaletteLayout(
  authoredRecord: Record<string, unknown>,
): {
  record: Record<string, unknown>
  layout: ResolvedChatResponseWidgetPaletteLayout | null
} {
  const descriptor = readWidgetCardLayoutVariantDescriptor(
    readFirstString(authoredRecord, CHAT_RESPONSE_WIDGET_LAYOUT_META_KEYS),
  )
  if (!descriptor) return { record: authoredRecord, layout: null }
  const seed = buildWidgetCardLayoutSeed(descriptor.id)
  if (!seed) return { record: authoredRecord, layout: null }
  return {
    record: {
      ...seed.properties,
      ...authoredRecord,
    },
    layout: {
      descriptor,
      seedLabel: seed.label,
      seedProperties: seed.properties,
    },
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
  const targetHandle = readConfiguredHandle(args.record, ['targetHandle', 'target_handle', 'targetPort', 'target_port', 'inputHandle', 'input_handle', 'inputPort', 'input_port'])
    || (
      args.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
      || args.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
      || args.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
        ? 'prompt_in'
        : args.nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
          ? 'sourceUrl_in'
          : resolveChatResponseTargetHandleForKind(args.kind)
    )
  const sourceHandle = readConfiguredHandle(args.record, ['sourceHandle', 'source_handle', 'sourcePort', 'source_port', 'outputHandle', 'output_handle', 'outputPort', 'output_port'])
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
