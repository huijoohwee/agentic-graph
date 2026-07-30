import type { GraphNode, JSONValue } from '@/lib/graph/types'
import { unwrapGraphCellValue } from '@/lib/graph/nodeProperties'
import { isPlainObject } from '@/lib/graph/value'

export const GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS = ['title', 'name', 'heading', 'scene', 'shot'] as const
export const GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS = ['summary', 'description', 'caption', 'content', 'text', 'note', 'notes'] as const
export const GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS = ['action', 'direction', 'beats', 'blocking', 'instructions', 'steps', 'workflow', 'task'] as const
export const GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS = ['dialogue', 'voiceover', 'vo', 'quote', 'line', 'speakerLine', 'speaker_line', 'narration', 'narrationText', 'voiceOver'] as const
export const GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS = ['prompt', 'imagePrompt', 'visualPrompt', 'brief', 'visualBrief', 'visual_brief', 'artDirection'] as const
export const GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS = ['output', 'result', 'response', 'transcript', 'outputText', 'output_text'] as const
export const GRAPH_NODE_CARD_STYLE_PROPERTY_KEYS = ['style', 'look', 'treatment', 'theme', 'preset', 'variant'] as const
export const GRAPH_NODE_CARD_REQUEST_PROPERTY_KEYS = [
  ...GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
  ...GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS,
  ...GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
] as const

type GraphNodeProperties = Record<string, JSONValue>

export type GraphNodeCardTextFieldId = 'summary' | 'output' | 'action' | 'dialogue' | 'prompt' | 'style'

export type GraphNodeCardTextFieldSpec = {
  id: GraphNodeCardTextFieldId
  label: string
  canonicalKey: string
  propertyKeys: readonly string[]
  placeholder: string
}

export const GRAPH_NODE_CARD_TEXT_FIELDS: readonly GraphNodeCardTextFieldSpec[] = [
  {
    id: 'summary',
    label: 'Summary',
    canonicalKey: 'summary',
    propertyKeys: GRAPH_NODE_CARD_SUMMARY_PROPERTY_KEYS,
    placeholder: 'Add summary',
  },
  {
    id: 'output',
    label: 'Output',
    canonicalKey: 'output',
    propertyKeys: GRAPH_NODE_CARD_OUTPUT_PROPERTY_KEYS,
    placeholder: 'Add output',
  },
  {
    id: 'action',
    label: 'Action',
    canonicalKey: 'action',
    propertyKeys: GRAPH_NODE_CARD_ACTION_PROPERTY_KEYS,
    placeholder: 'Add action',
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    canonicalKey: 'dialogue',
    propertyKeys: GRAPH_NODE_CARD_DIALOGUE_PROPERTY_KEYS,
    placeholder: 'Add dialogue',
  },
  {
    id: 'prompt',
    label: 'Prompt',
    canonicalKey: 'prompt',
    propertyKeys: GRAPH_NODE_CARD_PROMPT_PROPERTY_KEYS,
    placeholder: 'Add prompt',
  },
  {
    id: 'style',
    label: 'Style',
    canonicalKey: 'style',
    propertyKeys: GRAPH_NODE_CARD_STYLE_PROPERTY_KEYS,
    placeholder: 'Add style',
  },
] as const

const normalizeCardText = (value: unknown, options?: { preserveFormatting?: boolean }): string => {
  const scalar = unwrapGraphCellValue(value)
  const preserveFormatting = options?.preserveFormatting === true
  if (typeof scalar === 'string') return preserveFormatting ? scalar.replace(/\r/g, '') : scalar.replace(/\r/g, '').trim()
  if (typeof scalar === 'number' || typeof scalar === 'boolean') return String(scalar).trim()
  return ''
}

export function readGraphNodeProperties(node: Pick<GraphNode, 'properties'> | null | undefined): Record<string, unknown> {
  const properties = node?.properties
  if (!isPlainObject(properties)) return {}
  const typedValues = (Object.prototype.hasOwnProperty.call(properties, 'key')
    || Object.prototype.hasOwnProperty.call(properties, 'type'))
    ? unwrapGraphCellValue(properties.value)
    : null
  return isPlainObject(typedValues) ? typedValues : properties
}

export function readGraphNodeCardTitle(node: Pick<GraphNode, 'id' | 'label' | 'properties'> | null | undefined): string {
  const label = normalizeCardText(node?.label)
  if (label) return label
  const properties = readGraphNodeProperties(node)
  const propertyTitle = readGraphNodeCanonicalTextProperty(properties, GRAPH_NODE_CARD_TITLE_PROPERTY_KEYS)
  if (propertyTitle) return propertyTitle
  return normalizeCardText(node?.id) || 'Untitled'
}

export function readGraphNodeCanonicalTextProperty(
  properties: Record<string, unknown>,
  propertyKeys: readonly string[],
): string {
  for (const key of propertyKeys) {
    const value = unwrapGraphCellValue(properties[key])
    const text = normalizeCardText(value)
    if (text) return text
    if (Array.isArray(value) && value.length > 0) {
      const first = normalizeCardText(value[0])
      if (first) return first
    }
  }
  return ''
}

export function readGraphNodeAuthoredTextProperty(
  properties: Record<string, unknown>,
  propertyKeys: readonly string[],
): string {
  for (const key of propertyKeys) {
    const value = unwrapGraphCellValue(properties[key])
    const text = normalizeCardText(value, { preserveFormatting: true })
    if (text.trim()) return text
    if (Array.isArray(value) && value.length > 0) {
      const first = normalizeCardText(value[0], { preserveFormatting: true })
      if (first.trim()) return first
    }
  }
  return ''
}

export function buildGraphNodeCanonicalTextPatch(args: {
  currentProperties: Record<string, unknown>
  propertyKeys: readonly string[]
  canonicalKey: string
  nextValue: string
  preserveFormatting?: boolean
}): Record<string, unknown> {
  const nextProperties: Record<string, unknown> = { ...args.currentProperties }
  const nestedProperties = isPlainObject(nextProperties.properties)
    ? { ...nextProperties.properties }
    : null
  for (const key of args.propertyKeys) delete nextProperties[key]
  if (nestedProperties) {
    for (const key of args.propertyKeys) delete nestedProperties[key]
  }
  const normalizedValue = normalizeCardText(args.nextValue, { preserveFormatting: args.preserveFormatting })
  if (normalizedValue.trim()) {
    nextProperties[args.canonicalKey] = normalizedValue
    if (nestedProperties) nestedProperties[args.canonicalKey] = normalizedValue
  }
  if (nestedProperties) nextProperties.properties = nestedProperties
  return nextProperties
}
