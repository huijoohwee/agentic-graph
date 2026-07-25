import {
  getWidgetRegistryEntryLabel,
} from '@/features/storyboard-widget-manager/registryTemplates'
import type { WidgetRegistryEntry } from '@/features/storyboard-widget-manager/widgetRegistryTypes'
import {
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
} from '@/lib/config.storyboard-widget'
import {
  WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS,
} from '@/lib/storyboardWidget/widgetCardLayoutVariants'

export type WidgetPaletteAspectRatio = '16:9' | '9:16'
export type WidgetPaletteLayoutKind = 'card-media' | 'card-output' | 'card-multi-select' | 'flow-editor' | 'rich-media' | 'video'

export type WidgetPaletteLayoutVariant = {
  id: string
  label: string
  entry: WidgetRegistryEntry
  aspectRatio: WidgetPaletteAspectRatio
  layoutKind: WidgetPaletteLayoutKind
}

function isCanonicalWidgetCardEntry(entry: WidgetRegistryEntry): boolean {
  return (
    entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
    && entry.widgetTypeId === 'default'
    && entry.formId === 'textGeneration'
  )
}

function resolveLayoutKind(entry: WidgetRegistryEntry): WidgetPaletteLayoutKind {
  if (entry.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID) return 'rich-media'
  if (
    entry.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
    || entry.nodeTypeId === FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID
    || entry.nodeTypeId === FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID
  ) return 'video'
  if (entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID) return 'card-media'
  return 'flow-editor'
}

function isConsolidatedMediaGeneratorEntry(entry: WidgetRegistryEntry): boolean {
  return (
    entry.nodeTypeId === FLOW_IMAGE_GENERATION_NODE_TYPE_ID
    || entry.nodeTypeId === FLOW_VIDEO_GENERATION_NODE_TYPE_ID
  )
}

function isLegacyWidgetCardAlias(entry: WidgetRegistryEntry): boolean {
  return (
    entry.nodeTypeId === FLOW_TEXT_GENERATION_NODE_TYPE_ID
    && !isCanonicalWidgetCardEntry(entry)
    && getWidgetRegistryEntryLabel(entry) === 'Widget Card'
  )
}

function deduplicateRegistryShapes(entries: ReadonlyArray<WidgetRegistryEntry>): WidgetRegistryEntry[] {
  const seen = new Set<string>()
  return entries.filter(entry => {
    const key = `${entry.nodeTypeId}:${entry.widgetTypeId}:${entry.formId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function pickRichMediaEntry(entries: ReadonlyArray<WidgetRegistryEntry>): WidgetRegistryEntry | null {
  const candidates = entries.filter(entry => entry.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  return candidates.find(entry => (
    entry.widgetTypeId === FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID
    && entry.formId === FLOW_RICH_MEDIA_PANEL_FORM_ID
  )) || candidates[0] || null
}

function sanitizeLayoutId(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildEntryLayoutId(entry: WidgetRegistryEntry): string {
  const stableKey = sanitizeLayoutId(entry.id)
    || sanitizeLayoutId(`${entry.nodeTypeId}-${entry.widgetTypeId}-${entry.formId}`)
  return `widget-registry-layout-${stableKey}`
}

function buildDisplayLabels(entries: ReadonlyArray<WidgetRegistryEntry>): Map<string, string> {
  const baseLabelById = new Map<string, string>()
  const countByLabel = new Map<string, number>()
  for (const entry of entries) {
    const label = getWidgetRegistryEntryLabel(entry)
    baseLabelById.set(entry.id, label)
    countByLabel.set(label, (countByLabel.get(label) || 0) + 1)
  }
  const labels = new Map<string, string>()
  for (const entry of entries) {
    const label = baseLabelById.get(entry.id) || getWidgetRegistryEntryLabel(entry)
    labels.set(entry.id, (countByLabel.get(label) || 0) > 1 ? `${label} · ${entry.formId}` : label)
  }
  return labels
}

export function listWidgetPaletteLayoutVariants(
  entries: ReadonlyArray<WidgetRegistryEntry>,
  aspectRatio: WidgetPaletteAspectRatio,
): WidgetPaletteLayoutVariant[] {
  const enabledEntries = deduplicateRegistryShapes(
    (Array.isArray(entries) ? entries : []).filter(entry => (
      entry?.isEnabled === true
      && !isConsolidatedMediaGeneratorEntry(entry)
      && !isLegacyWidgetCardAlias(entry)
    )),
  )
  const labels = buildDisplayLabels(enabledEntries)
  const variants: WidgetPaletteLayoutVariant[] = []
  const canonicalCardEntry = enabledEntries.find(isCanonicalWidgetCardEntry)
  const richMediaEntry = pickRichMediaEntry(enabledEntries)
  const remainingEntries = enabledEntries.filter(entry => (
    entry !== canonicalCardEntry
    && entry.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID
  ))
  const orderedEntries = [
    ...(canonicalCardEntry ? [canonicalCardEntry] : []),
    ...(richMediaEntry ? [richMediaEntry] : []),
    ...remainingEntries,
  ]

  for (const entry of orderedEntries) {
    if (isCanonicalWidgetCardEntry(entry)) {
      variants.push(...WIDGET_CARD_LAYOUT_VARIANT_DESCRIPTORS.map(descriptor => ({
        id: descriptor.id,
        label: descriptor.label,
        entry,
        aspectRatio,
        layoutKind: descriptor.layoutKind,
      })))
      continue
    }
    variants.push({
      id: buildEntryLayoutId(entry),
      label: labels.get(entry.id) || getWidgetRegistryEntryLabel(entry),
      entry,
      aspectRatio,
      layoutKind: resolveLayoutKind(entry),
    })
  }
  return variants
}
