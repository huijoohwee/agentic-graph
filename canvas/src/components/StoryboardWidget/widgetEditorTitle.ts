import type { GraphNode } from '@/lib/graph/types'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import { parseMarkdownSigil } from '@/features/markdown/ui/markdownSigil'
import {
  FLOW_IMAGE_GENERATION_NODE_LABEL,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_LABEL,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_LABEL,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  getStoryboardWidgetSmartWidgetLabel,
} from '@/lib/config.storyboard-widget'
import { getWidgetRegistryEntryLabel } from '@/features/storyboard-widget-manager/registryTemplates'
import { isGrabMapsDiscoveryWidgetEntry } from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import {
  resolveWidgetIdentity,
} from '@/features/storyboard-widget-manager/resolveWidgetRegistry'

const normalizeWidgetLabelText = (raw: unknown): string => {
  const source = String(raw || '').trim()
  if (!source) return ''
  const sigil = parseMarkdownSigil(source)
  if (sigil && String(sigil.text || '').trim()) return String(sigil.text || '').trim()
  const unwrapped = source.startsWith('`') && source.endsWith('`') ? source.slice(1, -1).trim() : source
  return unwrapped
}

const normalizeExplicitTitleText = (raw: unknown): string => {
  return normalizeWidgetLabelText(raw).replace(/\s+/g, ' ').trim()
}

const humanizeKeyLikeText = (raw: unknown): string => {
  const source = String(raw || '').trim()
  if (!source) return ''
  const tail = source
    .split(/[.\[\]]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .pop() || source
  const words = tail
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return ''
  return words.replace(/\b[a-z]/g, c => c.toUpperCase())
}

const readNodeData = (node: GraphNode): Record<string, unknown> => {
  const properties = (node.properties || null) as Record<string, unknown> | null
  const raw = properties && typeof properties.data === 'object' && properties.data !== null && !Array.isArray(properties.data)
    ? (properties.data as Record<string, unknown>)
    : null
  return raw || {}
}

function resolveSpecificWidgetTitle(args: {
  node: GraphNode
  registryEntry?: WidgetRegistryEntry | null
}): string | null {
  const properties = (args.node.properties || {}) as Record<string, unknown>
  const registryEntry = args.registryEntry || null
  const widgetIdentity = resolveWidgetIdentity({ node: args.node, registryEntry })
  const nodeTypeId = String(registryEntry?.nodeTypeId || args.node.type || '').trim()
  if (registryEntry && isGrabMapsDiscoveryWidgetEntry(registryEntry)) {
    const registryLabel = getWidgetRegistryEntryLabel({
      nodeTypeId: registryEntry.nodeTypeId,
      widgetTypeId: registryEntry.widgetTypeId,
      formId: registryEntry.formId,
    })
    if (registryLabel) return registryLabel
  }
  if (nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) {
    return getWidgetRegistryEntryLabel({
      nodeTypeId,
      widgetTypeId: widgetIdentity.widgetTypeId,
      formId: widgetIdentity.formId,
    })
  }
  if (nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID) {
    return getStoryboardWidgetSmartWidgetLabel({
      mode: 'image',
      model: properties.model,
    })
  }
  if (nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID) {
    return getStoryboardWidgetSmartWidgetLabel({
      mode: 'video',
      model: properties.model,
    })
  }
  if (nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) {
    return FLOW_RICH_MEDIA_PANEL_NODE_LABEL
  }
  return null
}

export function resolveWidgetNodeTitle(args: {
  node: GraphNode
  graphMetaKind?: string | null
  registryEntry?: WidgetRegistryEntry | null
}): string {
  const node = args.node
  const fallback = normalizeWidgetLabelText(node.label) || String(node.id || '').trim() || 'Node'
  const specificTitle = resolveSpecificWidgetTitle(args)
  const isLegacyProviderTextWidgetLabel = node.type === FLOW_TEXT_GENERATION_NODE_TYPE_ID
    && /^(?:openai|byteplus|miromind|agnes|sealion|qwen|google(?: cloud)?)\s+text widget$/i.test(fallback)
  const genericFallbacks = new Set([
    '',
    String(node.id || '').trim(),
    FLOW_TEXT_GENERATION_NODE_LABEL,
    FLOW_IMAGE_GENERATION_NODE_LABEL,
    FLOW_RICH_MEDIA_PANEL_NODE_LABEL,
    FLOW_VIDEO_GENERATION_NODE_LABEL,
  ])
  if (String(args.graphMetaKind || '').trim() !== 'frontmatter-flow') {
    return specificTitle && (genericFallbacks.has(fallback) || isLegacyProviderTextWidgetLabel) ? specificTitle : fallback
  }
  const data = readNodeData(node)
  const type = String(node.type || '').trim().toLowerCase()
  const dataTitle = normalizeExplicitTitleText(data.title) || normalizeExplicitTitleText(data.label)
  if (dataTitle) return dataTitle
  if (type === 'input' || type === 'default') return fallback
  if (type === 'output') {
    const readsTitle = humanizeKeyLikeText(data.reads)
    if (readsTitle) return readsTitle
    return fallback
  }
  return fallback
}
