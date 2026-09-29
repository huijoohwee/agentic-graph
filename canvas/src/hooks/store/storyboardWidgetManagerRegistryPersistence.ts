import { LS_KEYS } from '@/lib/config.ls.keys'; import { getLocalStorage } from '@/lib/persistence'; import { createUniqueId } from '@/lib/ids'
import {
  buildStoryboardElementRegistryDraft,
  buildGenerateImageRegistryDraft,
  buildGenerateTextRegistryDraft,
  buildGenerateVideoRegistryDraft,
  buildVideoTranscriberRegistryDraft,
  buildTextGenerationRegistryDraft,
} from '@/features/storyboard-widget-manager/registryTemplates'
import { buildAnnotationEngineRegistryDraft } from '@/features/visual-annotation-engine/annotationWidget'
import { buildRichMediaPanelRegistryDraft } from '@/features/storyboard-widget-manager/richMediaPanelRegistryDraft'
import {
  buildGrabMapsDiscoveryRegistryDraft,
  FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID,
  FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID,
} from '@/features/storyboard-widget-manager/grabMapsDiscoveryWidget'
import {
  FLOW_IMAGE_GENERATION_NODE_TYPE_ID, FLOW_ANNOTATION_ENGINE_FORM_ID,
  FLOW_HTML_VIDEO_RENDERER_FORM_ID,
  FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID,
  FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_FORM_ID,
  FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
  FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_FORM_ID,
  FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID,
  FLOW_STORYBOARD_ELEMENT_WIDGET_TYPE_ID,
  FLOW_TEXT_GENERATION_NODE_TYPE_ID,
  FLOW_VIDEO_TRANSCRIBER_FORM_ID,
  FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID,
  FLOW_VIDEO_SCRIPT_FORM_ID,
  FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
  readWidgetRegistryMetadataEntries,
} from '@/lib/config.storyboard-widget'
import type {
  WidgetRegistryEntry,
  WidgetRegistryField,
  WidgetRegistryPort,
  WidgetRegistrySchemaMapping,
} from '@/features/storyboard-widget-manager/widgetRegistryTypes'

export const trimOrEmpty = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

export function validateWidgetRegistryEntry(raw: unknown): WidgetRegistryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>

  const id = trimOrEmpty(record.id)
  const nodeTypeId = trimOrEmpty(record.nodeTypeId)
  const widgetTypeId = trimOrEmpty(record.widgetTypeId)
  const formId = trimOrEmpty(record.formId)
  const updatedAt = trimOrEmpty(record.updatedAt)
  const isEnabled = typeof record.isEnabled === 'boolean' ? record.isEnabled : true

  if (!id || !nodeTypeId || !widgetTypeId || !formId) return null

  const fieldsRaw = Array.isArray(record.fields) ? record.fields : []
  const portsRaw = Array.isArray(record.ports) ? record.ports : []
  const schemaMappingsRaw = Array.isArray(record.schemaMappings) ? record.schemaMappings : null

  const fields: WidgetRegistryField[] = []
  const fieldKeySet = new Set<string>()
  for (let i = 0; i < fieldsRaw.length; i += 1) {
    const item = fieldsRaw[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const field = item as Record<string, unknown>
    const fieldKey = trimOrEmpty(field.fieldKey)
    const fieldType = trimOrEmpty(field.fieldType)
    if (!fieldKey || !fieldType) continue
    if (fieldKeySet.has(fieldKey)) continue
    fieldKeySet.add(fieldKey)
    const label = trimOrEmpty(field.label) || undefined
    const schemaPath = trimOrEmpty(field.schemaPath) || undefined
    const required = typeof field.required === 'boolean' ? field.required : undefined
    const isHidden = typeof field.isHidden === 'boolean' ? field.isHidden : undefined
    const options = Array.isArray(field.options)
      ? field.options
          .map(option => {
            if (!option || typeof option !== 'object' || Array.isArray(option)) return null
            const optionRecord = option as Record<string, unknown>
            const rawValue = optionRecord.value
            const value =
              typeof rawValue === 'string' || typeof rawValue === 'number'
                ? rawValue
                : typeof rawValue === 'boolean'
                  ? String(rawValue)
                  : null
            if (value == null || (typeof value === 'string' && !value.trim())) return null
            const optionLabel = trimOrEmpty(optionRecord.label) || undefined
            return { value, ...(optionLabel ? { label: optionLabel } : {}) }
          })
          .filter((option): option is NonNullable<typeof option> => !!option)
      : undefined
    fields.push({
      fieldKey,
      fieldType,
      ...(label ? { label } : {}),
      ...(schemaPath ? { schemaPath } : {}),
      ...(required != null ? { required } : {}),
      ...(isHidden === true ? { isHidden: true } : {}),
      ...(options && options.length > 0 ? { options } : {}),
    })
  }

  const ports: WidgetRegistryPort[] = []
  const portKeySet = new Set<string>()
  for (let i = 0; i < portsRaw.length; i += 1) {
    const item = portsRaw[i]
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const port = item as Record<string, unknown>
    const portKey = trimOrEmpty(port.portKey)
    const direction = trimOrEmpty(port.direction)
    if (!portKey || (direction !== 'input' && direction !== 'output')) continue
    const uniqueKey = `${direction}:${portKey}`
    if (portKeySet.has(uniqueKey)) continue
    portKeySet.add(uniqueKey)
    const schemaPath = trimOrEmpty(port.schemaPath) || undefined
    const isHidden = typeof port.isHidden === 'boolean' ? port.isHidden : undefined
    ports.push({
      portKey,
      direction: direction as 'input' | 'output',
      ...(schemaPath ? { schemaPath } : {}),
      ...(isHidden === true ? { isHidden: true } : {}),
    })
  }

  const schemaMappings = schemaMappingsRaw
    ? schemaMappingsRaw
        .map(item => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return null
          const mapping = item as Record<string, unknown>
          const fromPath = trimOrEmpty(mapping.fromPath)
          const toPath = trimOrEmpty(mapping.toPath)
          if (!fromPath || !toPath) return null
          const transformId = trimOrEmpty(mapping.transformId) || undefined
          const reduceId = trimOrEmpty(mapping.reduceId) || undefined
          return {
            fromPath,
            toPath,
            ...(transformId ? { transformId } : {}),
            ...(reduceId ? { reduceId } : {}),
          } satisfies WidgetRegistrySchemaMapping
        })
        .filter((mapping): mapping is WidgetRegistrySchemaMapping => !!mapping)
    : undefined

  if (fields.length === 0 && ports.length === 0) return null

  return {
    id,
    nodeTypeId,
    widgetTypeId,
    formId,
    updatedAt: updatedAt || new Date().toISOString(),
    isEnabled,
    fields,
    ports,
    ...(schemaMappings && schemaMappings.length > 0 ? { schemaMappings } : {}),
  }
}

export function readValidatedWidgetRegistryMetadataEntries(metadata: unknown): WidgetRegistryEntry[] {
  return readWidgetRegistryMetadataEntries(metadata)
    .map(item => validateWidgetRegistryEntry(item))
    .filter((entry): entry is WidgetRegistryEntry => !!entry)
}

export function readWidgetRegistryFromStorage(storage: Storage | null): WidgetRegistryEntry[] {
  const parse = (value: unknown): WidgetRegistryEntry[] | null => {
    if (!Array.isArray(value)) return []
    const out: WidgetRegistryEntry[] = []
    const seen = new Set<string>()
    for (let i = 0; i < value.length; i += 1) {
      const entry = validateWidgetRegistryEntry(value[i])
      if (!entry) continue
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      out.push(entry)
    }
    return out
  }

  if (!storage) return []
  try {
    const raw = storage.getItem(LS_KEYS.storyboardWidgetManagerWidgetRegistry)
    if (!raw) return []
    return parse(JSON.parse(raw) as unknown) || []
  } catch {
    return []
  }
}

export function writeWidgetRegistryToStorage(storage: Storage | null, entries: WidgetRegistryEntry[]): void {
  if (!storage) return
  try {
    storage.setItem(LS_KEYS.storyboardWidgetManagerWidgetRegistry, JSON.stringify(entries))
  } catch {
    void 0
  }
}

export function normalizeWidgetRegistryEntries(entries: WidgetRegistryEntry[]): WidgetRegistryEntry[] {
  const out: WidgetRegistryEntry[] = []
  const ids = new Set<string>()
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (!entry) continue
    const validated = validateWidgetRegistryEntry(entry)
    if (!validated) continue
    if (ids.has(validated.id)) continue
    ids.add(validated.id)
    out.push(validated)
  }

  const richEntries = out.filter(entry => entry.nodeTypeId === FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
  if (richEntries.length > 1) {
    const canonicalTemplate = buildRichMediaPanelRegistryDraft()
    const preferred = richEntries.find(
      entry => entry.widgetTypeId === FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID && entry.formId === FLOW_RICH_MEDIA_PANEL_FORM_ID,
    ) || richEntries[0]!

    const fieldKey = (field: WidgetRegistryField): string => {
      const schemaPath = trimOrEmpty(field.schemaPath)
      if (schemaPath) return schemaPath
      return trimOrEmpty(field.fieldKey)
    }
    const portKey = (port: WidgetRegistryPort): string => {
      const schemaPath = trimOrEmpty(port.schemaPath)
      const key = trimOrEmpty(port.portKey)
      return `${port.direction}:${schemaPath || key}`
    }
    const mappingKey = (mapping: WidgetRegistrySchemaMapping): string =>
      `${trimOrEmpty(mapping.fromPath)}->${trimOrEmpty(mapping.toPath)}:${trimOrEmpty(mapping.transformId)}:${trimOrEmpty(mapping.reduceId)}`

    const fields: WidgetRegistryField[] = []
    const ports: WidgetRegistryPort[] = []
    const schemaMappings: WidgetRegistrySchemaMapping[] = []
    const seenFields = new Set<string>()
    const seenPorts = new Set<string>()
    const seenMappings = new Set<string>()

    const pushField = (field: WidgetRegistryField) => {
      const key = fieldKey(field)
      if (!key || seenFields.has(key)) return
      seenFields.add(key)
      fields.push(field)
    }
    const pushPort = (port: WidgetRegistryPort) => {
      const key = portKey(port)
      if (!key || seenPorts.has(key)) return
      seenPorts.add(key)
      ports.push(port)
    }
    const pushMapping = (mapping: WidgetRegistrySchemaMapping) => {
      const key = mappingKey(mapping)
      if (!key || seenMappings.has(key)) return
      seenMappings.add(key)
      schemaMappings.push(mapping)
    }

    for (const field of canonicalTemplate.fields || []) pushField(field)
    for (const port of canonicalTemplate.ports || []) pushPort(port)
    for (const mapping of canonicalTemplate.schemaMappings || []) pushMapping(mapping)

    for (let i = 0; i < richEntries.length; i += 1) {
      const entry = richEntries[i]!
      for (const field of entry.fields || []) pushField(field)
      for (const port of entry.ports || []) pushPort(port)
      for (const mapping of entry.schemaMappings || []) pushMapping(mapping)
    }

    const merged: WidgetRegistryEntry = {
      ...preferred,
      nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
      widgetTypeId: FLOW_RICH_MEDIA_PANEL_WIDGET_TYPE_ID,
      formId: FLOW_RICH_MEDIA_PANEL_FORM_ID,
      fields,
      ports,
      schemaMappings,
    }
    const validatedMerged = validateWidgetRegistryEntry(merged)
    const kept = validatedMerged || preferred
    const next = out.filter(entry => entry.nodeTypeId !== FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID)
    next.push(kept)
    out.length = 0
    out.push(...next)
  }

  const canonicalizeBuiltInForm = (args: {
    formId: string
    draft: Omit<WidgetRegistryEntry, 'updatedAt'>
  }) => {
    const formId = trimOrEmpty(args.formId)
    if (!formId) return
    const matches = out.filter(entry => entry.formId === formId)
    if (matches.length === 0) return
    const preferred = matches.find(
      entry => entry.nodeTypeId === args.draft.nodeTypeId
        && entry.widgetTypeId === args.draft.widgetTypeId
        && entry.formId === formId,
    ) || matches[0]!
    const canonical: WidgetRegistryEntry = {
      ...preferred,
      nodeTypeId: args.draft.nodeTypeId,
      widgetTypeId: args.draft.widgetTypeId,
      formId,
      fields: Array.isArray(args.draft.fields) ? args.draft.fields : [],
      ports: Array.isArray(args.draft.ports) ? args.draft.ports : [],
      ...(Array.isArray(args.draft.schemaMappings) ? { schemaMappings: args.draft.schemaMappings } : {}),
    }
    const validatedCanonical = validateWidgetRegistryEntry(canonical)
    const kept = validatedCanonical || preferred
    const next = out.filter(entry => entry.formId !== formId)
    next.push(kept)
    out.length = 0
    out.push(...next)
  }

  const discoveryEntries = out.filter(
    entry =>
      entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID
      || entry.formId === FLOW_GRABMAPS_DISCOVERY_FORM_ID,
  )
  if (discoveryEntries.length > 0) {
    const canonicalTemplate = buildGrabMapsDiscoveryRegistryDraft()
    const preferred = discoveryEntries.find(
      entry =>
        entry.nodeTypeId === FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID
        && entry.widgetTypeId === FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID
        && entry.formId === FLOW_GRABMAPS_DISCOVERY_FORM_ID,
    ) || discoveryEntries[0]!
    const canonical: WidgetRegistryEntry = {
      ...preferred,
      nodeTypeId: FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID,
      widgetTypeId: FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID,
      formId: FLOW_GRABMAPS_DISCOVERY_FORM_ID,
      fields: canonicalTemplate.fields,
      ports: canonicalTemplate.ports,
      ...(Array.isArray(canonicalTemplate.schemaMappings) ? { schemaMappings: canonicalTemplate.schemaMappings } : {}),
    }
    const validatedCanonical = validateWidgetRegistryEntry(canonical)
    const kept = validatedCanonical || preferred
    const next = out.filter(
      entry =>
        entry.nodeTypeId !== FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID
        && entry.formId !== FLOW_GRABMAPS_DISCOVERY_FORM_ID,
    )
    next.push(kept)
    out.length = 0
    out.push(...next)
  }

  canonicalizeBuiltInForm({
    formId: 'imageGeneration',
    draft: buildGenerateImageRegistryDraft(),
  })
  canonicalizeBuiltInForm({
    formId: 'videoGeneration',
    draft: buildGenerateVideoRegistryDraft(),
  })
  canonicalizeBuiltInForm({
    formId: 'textGeneration',
    draft: buildGenerateTextRegistryDraft(),
  })
  canonicalizeBuiltInForm({
    formId: 'textGeneration.openai',
    draft: buildTextGenerationRegistryDraft({
      providerFamily: 'openai',
      widgetTypeId: 'default',
      formId: 'textGeneration.openai',
    }),
  })
  canonicalizeBuiltInForm({
    formId: FLOW_VIDEO_TRANSCRIBER_FORM_ID,
    draft: buildVideoTranscriberRegistryDraft(),
  })
  canonicalizeBuiltInForm({
    formId: FLOW_STORYBOARD_ELEMENT_FORM_ID,
    draft: buildStoryboardElementRegistryDraft(),
  })
  canonicalizeBuiltInForm({ formId: FLOW_ANNOTATION_ENGINE_FORM_ID, draft: buildAnnotationEngineRegistryDraft() })

  out.sort((a, b) => {
    const nodeTypeComparison = a.nodeTypeId.localeCompare(b.nodeTypeId)
    if (nodeTypeComparison !== 0) return nodeTypeComparison
    const widgetTypeComparison = a.widgetTypeId.localeCompare(b.widgetTypeId)
    if (widgetTypeComparison !== 0) return widgetTypeComparison
    return a.formId.localeCompare(b.formId)
  })
  return out
}

const DEPRECATED_GLOBAL_DEFAULT_WIDGET_REGISTRY_KEYS = new Set<string>([
  `${FLOW_HTML_VIDEO_RENDERER_NODE_TYPE_ID}:default:${FLOW_HTML_VIDEO_RENDERER_FORM_ID}`,
  `${FLOW_TEXT_GENERATION_NODE_TYPE_ID}:default:${FLOW_VIDEO_SCRIPT_FORM_ID}`,
  `${FLOW_TEXT_GENERATION_NODE_TYPE_ID}:default:${FLOW_OPENAI_VIDEO_SCRIPT_FORM_ID}`,
  `${FLOW_TEXT_GENERATION_NODE_TYPE_ID}:default:textGeneration.openai`,
  `${FLOW_VIDEO_TRANSCRIBER_NODE_TYPE_ID}:default:${FLOW_VIDEO_TRANSCRIBER_FORM_ID}`,
  `${FLOW_STORYBOARD_ELEMENT_NODE_TYPE_ID}:default:${FLOW_STORYBOARD_ELEMENT_FORM_ID}`,
  `${FLOW_GRABMAPS_DISCOVERY_NODE_TYPE_ID}:${FLOW_GRABMAPS_DISCOVERY_WIDGET_TYPE_ID}:${FLOW_GRABMAPS_DISCOVERY_FORM_ID}`,
])

function buildWidgetRegistryShapeKey(entry: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId'>): string {
  return `${trimOrEmpty(entry.nodeTypeId)}:${trimOrEmpty(entry.widgetTypeId)}:${trimOrEmpty(entry.formId)}`
}

function pruneDeprecatedGlobalDefaultWidgetRegistryEntries(entries: WidgetRegistryEntry[]): {
  entries: WidgetRegistryEntry[]
  changed: boolean
} {
  const prev = Array.isArray(entries) ? entries : []
  const next = prev.filter(entry => !DEPRECATED_GLOBAL_DEFAULT_WIDGET_REGISTRY_KEYS.has(buildWidgetRegistryShapeKey(entry)))
  return {
    entries: next,
    changed: next.length !== prev.length,
  }
}

function ensureDefaultRegistryEntry(args: {
  entries: WidgetRegistryEntry[]
  nodeTypeId: string
  formId: string
  draft: Omit<WidgetRegistryEntry, 'updatedAt'>
  nowIso?: string
}): { entries: WidgetRegistryEntry[]; changed: boolean } {
  const prev = Array.isArray(args.entries) ? args.entries : []
  const targetWidgetTypeId = trimOrEmpty(args.draft.widgetTypeId) || 'default'
  const existingIndex = prev.findIndex(entry =>
    !!entry && entry.nodeTypeId === args.nodeTypeId && entry.widgetTypeId === targetWidgetTypeId && entry.formId === args.formId,
  )
  const updatedAt = String(args.nowIso || '').trim() || new Date().toISOString()
  const normalizeComparableEntry = (
    entry: Pick<WidgetRegistryEntry, 'nodeTypeId' | 'widgetTypeId' | 'formId' | 'fields' | 'ports' | 'schemaMappings'>,
  ) =>
    JSON.stringify({
      nodeTypeId: entry.nodeTypeId,
      widgetTypeId: entry.widgetTypeId,
      formId: entry.formId,
      fields: (Array.isArray(entry.fields) ? entry.fields : []).map(field => ({
        fieldKey: String(field?.fieldKey || '').trim(),
        fieldType: String(field?.fieldType || '').trim(),
        label: trimOrEmpty(field?.label) || null,
        schemaPath: trimOrEmpty(field?.schemaPath) || null,
        required: typeof field?.required === 'boolean' ? field.required : null,
        isHidden: field?.isHidden === true ? true : null,
        options: (Array.isArray(field?.options) ? field.options : []).map(option => ({
          value: typeof option?.value === 'number' ? option.value : String(option?.value ?? '').trim(),
          label: trimOrEmpty(option?.label) || null,
        })),
      })),
      ports: (Array.isArray(entry.ports) ? entry.ports : []).map(port => ({
        portKey: String(port?.portKey || '').trim(),
        direction: port?.direction === 'output' ? 'output' : 'input',
        schemaPath: trimOrEmpty(port?.schemaPath) || null,
        isHidden: port?.isHidden === true ? true : null,
      })),
      schemaMappings: (Array.isArray(entry.schemaMappings) ? entry.schemaMappings : []).map(mapping => ({
        fromPath: trimOrEmpty(mapping?.fromPath),
        toPath: trimOrEmpty(mapping?.toPath),
        transformId: trimOrEmpty(mapping?.transformId) || null,
        reduceId: trimOrEmpty(mapping?.reduceId) || null,
      })),
    })
  if (existingIndex >= 0) {
    const existing = prev[existingIndex]
    if (!existing) return { entries: prev, changed: false }
    const canonicalComparable = normalizeComparableEntry({
      nodeTypeId: args.nodeTypeId,
      widgetTypeId: targetWidgetTypeId,
      formId: args.formId,
      fields: Array.isArray(args.draft.fields) ? (args.draft.fields as WidgetRegistryField[]) : [],
      ports: Array.isArray(args.draft.ports) ? (args.draft.ports as WidgetRegistryPort[]) : [],
      schemaMappings: Array.isArray(args.draft.schemaMappings) ? (args.draft.schemaMappings as WidgetRegistrySchemaMapping[]) : [],
    })
    const existingComparable = normalizeComparableEntry(existing)
    if (existingComparable === canonicalComparable) return { entries: prev, changed: false }
    const nextEntry: WidgetRegistryEntry = {
      ...existing,
      nodeTypeId: args.nodeTypeId,
      widgetTypeId: targetWidgetTypeId,
      formId: args.formId,
      fields: Array.isArray(args.draft.fields) ? (args.draft.fields as WidgetRegistryField[]) : [],
      ports: Array.isArray(args.draft.ports) ? (args.draft.ports as WidgetRegistryPort[]) : [],
      ...(Array.isArray(args.draft.schemaMappings) ? { schemaMappings: args.draft.schemaMappings as WidgetRegistrySchemaMapping[] } : {}),
      updatedAt,
    }
    const validated = validateWidgetRegistryEntry(nextEntry)
    if (!validated) return { entries: prev, changed: false }
    return {
      entries: normalizeWidgetRegistryEntries(prev.map((entry, index) => (index === existingIndex ? validated : entry))),
      changed: true,
    }
  }

  const usedIds = new Set(prev.map(entry => String(entry?.id || '')).filter(Boolean))
  const nextEntry: WidgetRegistryEntry = {
    id: createUniqueId('qer', usedIds),
    isEnabled: true,
    nodeTypeId: args.nodeTypeId,
    widgetTypeId: targetWidgetTypeId,
    formId: args.formId,
    fields: Array.isArray(args.draft.fields) ? (args.draft.fields as WidgetRegistryField[]) : [],
    ports: Array.isArray(args.draft.ports) ? (args.draft.ports as WidgetRegistryPort[]) : [],
    ...(Array.isArray(args.draft.schemaMappings) ? { schemaMappings: args.draft.schemaMappings as WidgetRegistrySchemaMapping[] } : {}),
    updatedAt,
  }
  const validated = validateWidgetRegistryEntry(nextEntry)
  if (!validated) return { entries: prev, changed: false }
  return {
    entries: normalizeWidgetRegistryEntries([...prev, validated]),
    changed: true,
  }
}

export function ensureDefaultWidgetRegistryEntries(
  entries: WidgetRegistryEntry[],
  nowIso?: string,
): { entries: WidgetRegistryEntry[]; changed: boolean } {
  const pruned = pruneDeprecatedGlobalDefaultWidgetRegistryEntries(entries)
  const seededImage = ensureDefaultRegistryEntry({
    entries: pruned.entries,
    nodeTypeId: FLOW_IMAGE_GENERATION_NODE_TYPE_ID,
    formId: 'imageGeneration',
    draft: buildGenerateImageRegistryDraft(),
    nowIso,
  })
  const seededVideo = ensureDefaultRegistryEntry({
    entries: seededImage.entries,
    nodeTypeId: FLOW_VIDEO_GENERATION_NODE_TYPE_ID,
    formId: 'videoGeneration',
    draft: buildGenerateVideoRegistryDraft(),
    nowIso,
  })
  const seededText = ensureDefaultRegistryEntry({
    entries: seededVideo.entries,
    nodeTypeId: FLOW_TEXT_GENERATION_NODE_TYPE_ID,
    formId: 'textGeneration',
    draft: buildGenerateTextRegistryDraft(),
    nowIso,
  })
  const seededRichMediaPanel = ensureDefaultRegistryEntry({
    entries: seededText.entries,
    nodeTypeId: FLOW_RICH_MEDIA_PANEL_NODE_TYPE_ID,
    formId: FLOW_RICH_MEDIA_PANEL_FORM_ID,
    draft: buildRichMediaPanelRegistryDraft(),
    nowIso,
  })
  return {
    entries: seededRichMediaPanel.entries,
    changed:
      pruned.changed
      || seededImage.changed
      || seededVideo.changed
      || seededText.changed
      || seededRichMediaPanel.changed,
  }
}

export function ensureDefaultGenerateVideoRegistryEntry(
  entries: WidgetRegistryEntry[],
  nowIso?: string,
): { entries: WidgetRegistryEntry[]; changed: boolean } {
  return ensureDefaultWidgetRegistryEntries(entries, nowIso)
}

export const planStoryboardWidgetManagerDefaultRegistrySeed = (storage: Storage | null = getLocalStorage()) => {
  const rawInitial = readWidgetRegistryFromStorage(storage)
  const seeded = ensureDefaultWidgetRegistryEntries(rawInitial)
  return {
    storage,
    entries: seeded.entries,
    changed: seeded.changed,
  }
}

export const applyStoryboardWidgetManagerDefaultRegistrySeed = (storage: Storage | null = getLocalStorage()): boolean => {
  const plan = planStoryboardWidgetManagerDefaultRegistrySeed(storage)
  if (!plan.changed) return false
  writeWidgetRegistryToStorage(plan.storage, plan.entries)
  return true
}
