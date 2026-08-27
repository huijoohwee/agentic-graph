import type { SettingMeta } from '@/features/settings/types'
import {
  GRAPH_FIELD_TYPES,
  getAgenticRagFieldKind,
  parseGraphFieldId,
  type GraphField,
  type GraphFieldId,
  type GraphFieldSettings,
  type GraphFieldSettingsById,
  type GraphFieldType,
} from '@/features/graph-fields/graphFields'
import type { GraphData, JSONValue } from '@/lib/graph/types'
import { isJsonValue } from '@/lib/graph/jsonValue'
import type { SourceFile } from '@/hooks/store/types'
import type { VersionHistoryEntry, VersionHistorySource } from '@/features/history/versionHistoryTypes'

type JsonObject = { [key: string]: JSONValue }

type WritablePartial<T> = { -readonly [K in keyof T]?: T[K] }

export const AGENTIC_RAG_RACI_CATALOG_ID = 'docs/agenticgraph-raci-document.md'
export const AGENTIC_RAG_EXPORT_PIPELINE_PHASE = 'Phase 2: PRODUCE – 2.1 Export to JSON/JSON-LD'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const compareText = (a: unknown, b: unknown): number => String(a || '').localeCompare(String(b || ''))

const compareGraphFieldIds = (a: GraphFieldId, b: GraphFieldId): number => {
  const pa = parseGraphFieldId(a)
  const pb = parseGraphFieldId(b)
  const scopeRank = (scope: string | undefined): number => scope === 'node' ? 0 : scope === 'edge' ? 1 : 2
  return scopeRank(pa?.scope) - scopeRank(pb?.scope) || compareText(pa?.key || a, pb?.key || b) || compareText(a, b)
}

function normalizeGraphFieldType(value: unknown): GraphFieldType | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return GRAPH_FIELD_TYPES.includes(trimmed as GraphFieldType) ? (trimmed as GraphFieldType) : undefined
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const next: string[] = []
  const seen = new Set<string>()
  value.forEach((v) => {
    if (typeof v !== 'string') return
    const cleaned = v.trim()
    if (!cleaned) return
    if (seen.has(cleaned)) return
    seen.add(cleaned)
    next.push(cleaned)
  })
  return next.length > 0 ? next : undefined
}

type GraphFieldSettingsJsonCandidate = Record<string, unknown> & {
  displayName?: unknown
  isHidden?: unknown
  fieldType?: unknown
  isCustom?: unknown
  description?: unknown
  defaultValue?: unknown
  selectOptions?: unknown
  decimalPlaces?: unknown
  currencyCode?: unknown
  urlProtocol?: unknown
  dateTimeFormat?: unknown
}

function normalizeGraphFieldId(value: unknown): GraphFieldId | null {
  if (typeof value !== 'string') return null
  const parsed = parseGraphFieldId(value)
  if (!parsed) return null
  return `${parsed.scope}:${parsed.key}` as GraphFieldId
}

function normalizeGraphFieldIdFromScopeKey(scopeRaw: unknown, keyRaw: unknown): GraphFieldId | null {
  if (scopeRaw !== 'node' && scopeRaw !== 'edge') return null
  if (typeof keyRaw !== 'string') return null
  const cleanedKey = keyRaw.trim()
  if (!cleanedKey) return null
  return `${scopeRaw}:${cleanedKey}` as GraphFieldId
}

function coerceGraphFieldSettingsFromRecord(value: Record<string, unknown>): GraphFieldSettings {
  const v: GraphFieldSettingsJsonCandidate = value
  const displayName = typeof v.displayName === 'string' ? v.displayName.trim() : ''
  const isHidden = typeof v.isHidden === 'boolean' ? v.isHidden : false

  const fieldType = normalizeGraphFieldType(v.fieldType)
  const isCustom = typeof v.isCustom === 'boolean' ? v.isCustom : undefined
  const descriptionRaw = typeof v.description === 'string' ? v.description.trim() : ''
  const description = descriptionRaw ? descriptionRaw : undefined
  const defaultValue: JSONValue | null | undefined =
    v.defaultValue === null || isJsonValue(v.defaultValue) ? (v.defaultValue as JSONValue | null) : undefined
  const selectOptions = normalizeStringArray(v.selectOptions)
  const decimalPlaces =
    typeof v.decimalPlaces === 'number' && Number.isFinite(v.decimalPlaces)
      ? Math.min(10, Math.max(0, Math.floor(v.decimalPlaces)))
      : undefined
  const currencyCodeRaw = typeof v.currencyCode === 'string' ? v.currencyCode.trim() : ''
  const currencyCode = currencyCodeRaw ? currencyCodeRaw : undefined
  const urlProtocol =
    v.urlProtocol === 'any' || v.urlProtocol === 'http' || v.urlProtocol === 'https'
      ? v.urlProtocol
      : undefined
  const dateTimeFormat = v.dateTimeFormat === 'ISO' || v.dateTimeFormat === 'Local' ? v.dateTimeFormat : undefined

  return {
    displayName,
    isHidden,
    ...(fieldType ? { fieldType } : null),
    ...(typeof isCustom === 'boolean' ? { isCustom } : null),
    ...(typeof description === 'string' ? { description } : null),
    ...(defaultValue !== undefined ? { defaultValue } : null),
    ...(selectOptions ? { selectOptions } : null),
    ...(typeof decimalPlaces === 'number' ? { decimalPlaces } : null),
    ...(typeof currencyCode === 'string' ? { currencyCode } : null),
    ...(urlProtocol ? { urlProtocol } : null),
    ...(dateTimeFormat ? { dateTimeFormat } : null),
  }
}

function toGraphFieldSettingsJson(settings: GraphFieldSettings): JsonObject {
  const out: JsonObject = {
    displayName: settings.displayName.trim(),
    isHidden: settings.isHidden,
  }
  if (settings.fieldType) out.fieldType = settings.fieldType
  if (typeof settings.isCustom === 'boolean') out.isCustom = settings.isCustom
  if (typeof settings.description === 'string' && settings.description.trim()) out.description = settings.description.trim()
  if (typeof settings.decimalPlaces === 'number') out.decimalPlaces = settings.decimalPlaces
  if (typeof settings.currencyCode === 'string' && settings.currencyCode.trim()) out.currencyCode = settings.currencyCode.trim()
  if (settings.urlProtocol) out.urlProtocol = settings.urlProtocol
  if (settings.dateTimeFormat) out.dateTimeFormat = settings.dateTimeFormat
  if (settings.defaultValue === null || isJsonValue(settings.defaultValue)) {
    out.defaultValue = settings.defaultValue
  }
  if (Array.isArray(settings.selectOptions)) {
    const normalized = normalizeStringArray(settings.selectOptions)
    if (normalized) out.selectOptions = normalized
  }
  return out
}

const isGraphData = (value: unknown): value is GraphData => {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) return false
  if (typeof value.type !== 'string') return false
  return true
}

export function buildSettingsJsonLdDocument(registry: SettingMeta[]): JsonObject {
  const items = registry
    .map((meta) => {
      const value = meta.read()
      if (value === null) return null
      return {
        '@type': 'kg:Setting',
        'kg:key': meta.key,
        'kg:value': value,
        'kg:valueType': meta.type,
        'kg:source': meta.source,
      } as JsonObject
    })
    .filter((x): x is JsonObject => x !== null)

  return {
    '@context': { kg: 'http://example.org/kg#' },
    '@type': 'kg:SettingsExport',
    'kg:exportedAt': Date.now(),
    'kg:settings': items,
  }
}

export function parseSettingsDocumentToValues(doc: unknown): Record<string, string | number | boolean> | null {
  if (!isRecord(doc)) return null

  const values: Record<string, string | number | boolean> = {}

  const settingsArray = (() => {
    const kgSettings = doc['kg:settings']
    if (Array.isArray(kgSettings)) return kgSettings
    const plainSettings = doc.settings
    if (Array.isArray(plainSettings)) return plainSettings
    const graph = doc['@graph']
    if (Array.isArray(graph)) return graph
    return null
  })()

  if (Array.isArray(settingsArray)) {
    settingsArray.forEach((entry) => {
      if (!isRecord(entry)) return
      const keyRaw = entry['kg:key'] ?? entry.key
      if (typeof keyRaw !== 'string' || !keyRaw.trim()) return
      const valueRaw = entry['kg:value'] ?? entry.value
      if (!isScalar(valueRaw)) return
      values[keyRaw] = valueRaw
    })
    return Object.keys(values).length > 0 ? values : {}
  }

  const directValuesRaw = doc['kg:values'] ?? doc.values
  if (isRecord(directValuesRaw)) {
    Object.entries(directValuesRaw).forEach(([key, value]) => {
      if (!key.trim()) return
      if (!isScalar(value)) return
      values[key] = value
    })
    return values
  }

  const looksLikeDirectMap = Object.values(doc).every(v => isScalar(v))
  if (looksLikeDirectMap) {
    Object.entries(doc).forEach(([key, value]) => {
      if (!key.trim()) return
      if (!isScalar(value)) return
      values[key] = value
    })
    return values
  }

  return null
}

export function applySettingsValuesToRegistry(
  values: Record<string, string | number | boolean>,
  registry: SettingMeta[],
): { wrote: number; skipped: number } {
  const registryByKey = new Map(registry.map((meta) => [meta.key, meta]))
  let wrote = 0
  let skipped = 0

  Object.entries(values).forEach(([key, value]) => {
    const meta = registryByKey.get(key)
    if (!meta || typeof meta.write !== 'function') {
      skipped += 1
      return
    }
    try {
      meta.write(value)
      wrote += 1
    } catch {
      skipped += 1
    }
  })

  return { wrote, skipped }
}

export function buildHistoryJsonLdDocument(history: VersionHistoryEntry[], historyIndex: number): JsonObject {
  const items: JsonObject[] = history.map((h) => {
    const graphData = isJsonValue(h.graphData) ? h.graphData : null
    const base: JsonObject = {
      '@type': 'kg:HistoryEntry',
      '@id': h.id,
      'kg:label': h.label,
      'kg:timestamp': h.timestamp,
      'kg:parentId': h.parentId,
      'kg:source': h.source,
      'kg:contentSignature': h.contentSignature,
      'kg:data': graphData,
      'kg:markdownDocumentName': h.markdownDocumentName,
      'kg:markdownDocumentText': h.markdownDocumentText,
      'kg:activeSourceFileSnapshot': isJsonValue(h.activeSourceFileSnapshot) ? h.activeSourceFileSnapshot : null,
    }
    const rawSettings = h.graphFieldSettingsById || {}
    const hasSettings = rawSettings && typeof rawSettings === 'object' && Object.keys(rawSettings).length > 0
    if (hasSettings) {
      const settingsValue = isJsonValue(rawSettings) ? rawSettings : null
      if (settingsValue !== null) base['kg:graphFieldSettings'] = settingsValue
    }
    return base
  })

  return {
    '@context': { kg: 'http://example.org/kg#' },
    '@type': 'kg:HistoryExport',
    'kg:exportedAt': Date.now(),
    'kg:historyIndex': historyIndex,
    'kg:history': items,
    '@graph': items,
    'kg:raciCatalog': AGENTIC_RAG_RACI_CATALOG_ID,
    'kg:pipelinePhase': AGENTIC_RAG_EXPORT_PIPELINE_PHASE,
  }
}

export function parseHistoryDocument(doc: unknown): { history: VersionHistoryEntry[]; historyIndex: number } | null {
  if (!isRecord(doc)) return null
  const rawHistory = doc['kg:history'] ?? doc.history
  if (!Array.isArray(rawHistory)) return null

  const rawIndex = doc['kg:historyIndex'] ?? doc.historyIndex
  const historyIndex = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : -1

  const history: VersionHistoryEntry[] = []
  rawHistory.forEach((entry) => {
    if (!isRecord(entry)) return
    const idRaw = entry['@id'] ?? entry.id
    const labelRaw = entry['kg:label'] ?? entry.label
    const timestampRaw = entry['kg:timestamp'] ?? entry.timestamp
    const dataRaw = entry['kg:data'] ?? entry.data
    const parentIdRaw = Object.prototype.hasOwnProperty.call(entry, 'kg:parentId')
      ? entry['kg:parentId']
      : entry.parentId
    const sourceRaw = entry['kg:source'] ?? entry.source
    const contentSignatureRaw = entry['kg:contentSignature'] ?? entry.contentSignature
    if (typeof idRaw !== 'string' || !idRaw.trim()) return
    if (typeof labelRaw !== 'string') return
    if (typeof timestampRaw !== 'number' || !Number.isFinite(timestampRaw)) return
    if (!isGraphData(dataRaw)) return
    if (parentIdRaw !== null && typeof parentIdRaw !== 'string') return
    const parentId: string | null = typeof parentIdRaw === 'string' ? parentIdRaw : null
    const validSources: VersionHistorySource[] = ['graph', 'gitGraph', 'manual', 'import', 'runtime']
    if (typeof sourceRaw !== 'string' || !validSources.includes(sourceRaw as VersionHistorySource)) return
    if (typeof contentSignatureRaw !== 'string' || !contentSignatureRaw.trim()) return
    const settingsRaw = entry['kg:graphFieldSettings'] ?? entry.graphFieldSettings
    const graphFieldSettingsById: GraphFieldSettingsById =
      isRecord(settingsRaw) && Object.keys(settingsRaw).length > 0
        ? (Object.entries(settingsRaw).reduce((acc, [key, value]) => {
            if (!isRecord(value)) return acc
            const id = normalizeGraphFieldId(key)
            if (!id) return acc
            acc[id] = coerceGraphFieldSettingsFromRecord(value)
            return acc
          }, {} as GraphFieldSettingsById))
        : {}
    history.push({
      id: idRaw,
      parentId,
      label: labelRaw,
      timestamp: Math.floor(timestampRaw),
      source: sourceRaw as VersionHistorySource,
      contentSignature: contentSignatureRaw,
      graphData: dataRaw,
      graphFieldSettingsById,
      markdownDocumentName: typeof (entry['kg:markdownDocumentName'] ?? entry.markdownDocumentName) === 'string'
        ? String(entry['kg:markdownDocumentName'] ?? entry.markdownDocumentName)
        : null,
      markdownDocumentText: typeof (entry['kg:markdownDocumentText'] ?? entry.markdownDocumentText) === 'string'
        ? String(entry['kg:markdownDocumentText'] ?? entry.markdownDocumentText)
        : null,
      activeSourceFileSnapshot: (() => {
        const value = entry['kg:activeSourceFileSnapshot'] ?? entry.activeSourceFileSnapshot
        if (!isRecord(value)) return null
        if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.text !== 'string') return null
        if (typeof value.enabled !== 'boolean') return null
        if (!['idle', 'loading', 'parsed', 'error'].includes(String(value.status || ''))) return null
        return value as unknown as SourceFile
      })(),
    })
  })

  return { history, historyIndex }
}

export function buildGraphFieldSettingsJsonLdDocument(
  graphId: string,
  settingsById: GraphFieldSettingsById,
): JsonObject {
  const items: JsonObject[] = []

  const entries = Object.entries(settingsById)
    .map(([id, settings]) => ({ id: normalizeGraphFieldId(id), settings }))
    .filter((entry): entry is { id: GraphFieldId; settings: GraphFieldSettings } => !!entry.id && !!entry.settings)
    .sort((a, b) => compareGraphFieldIds(a.id, b.id))

  entries.forEach(({ id, settings }) => {
    const parsed = parseGraphFieldId(id)
    if (!parsed) return
    const fieldType = settings.fieldType
    const description = settings.description
    const fieldForAgentic: GraphField = {
      id,
      scope: parsed.scope,
      key: parsed.key,
      kind: 'unknown',
      samples: 0,
    }
    const agenticKind = getAgenticRagFieldKind(fieldForAgentic)
    const entry: JsonObject = {
      '@type': 'kg:GraphFieldSetting',
      'kg:graphId': graphId,
      'kg:fieldId': id,
      'kg:scope': parsed.scope,
      'kg:key': parsed.key,
      'kg:settings': toGraphFieldSettingsJson(settings),
    }
    if (typeof settings.isCustom === 'boolean') {
      entry['kg:isCustom'] = settings.isCustom
    }
    if (typeof fieldType === 'string' && fieldType.trim()) {
      entry['kg:fieldType'] = fieldType
    }
    if (typeof description === 'string' && description.trim()) {
      entry['kg:description'] = description
    }
    if (typeof agenticKind === 'string' && agenticKind.trim()) {
      entry['kg:agenticRagFieldKind'] = agenticKind
    }
    items.push(entry)
  })

  return {
    '@context': { kg: 'http://example.org/kg#' },
    '@type': 'kg:GraphFieldSettingsExport',
    'kg:exportedAt': Date.now(),
    'kg:graphId': graphId,
    'kg:fields': items,
    '@graph': items,
    'kg:raciCatalog': AGENTIC_RAG_RACI_CATALOG_ID,
    'kg:pipelinePhase': AGENTIC_RAG_EXPORT_PIPELINE_PHASE,
  }
}

export function buildGraphRagWorkflowJsonLdDocument(graphId: string | null | undefined): JsonObject {
  const safeGraphId = typeof graphId === 'string' && graphId.trim() ? graphId : 'graph'

  const workflow: JsonObject = {
    '@type': 'rag:GraphRAGWorkflow',
    '@id': `example:graphrag-config-${safeGraphId}`,
    'graphId': safeGraphId,
    'name': 'GraphRAG Workflow',
    'retrievalMethod': 'graph-traversal',
    'maxHops': 3,
    'traversalRules': [],
    'contextWindow': {
      '@type': 'rag:ContextWindow',
      'contextSize': 8192,
      'contextStrategy': 'ranked-by-relevance',
    },
  }

  return {
    '@context': {
      rag: 'http://example.org/rag#',
      kg: 'http://example.org/kg#',
    },
    '@type': 'rag:GraphRAGWorkflow',
    '@id': workflow['@id'],
    'graphId': workflow.graphId,
    'name': workflow.name,
    'retrievalMethod': workflow.retrievalMethod,
    'maxHops': workflow.maxHops,
    'traversalRules': workflow.traversalRules,
    'contextWindow': workflow.contextWindow,
    'kg:exportedAt': Date.now(),
    'kg:raciCatalog': AGENTIC_RAG_RACI_CATALOG_ID,
    'kg:pipelinePhase': AGENTIC_RAG_EXPORT_PIPELINE_PHASE,
  }
}

export function validateGraphRagWorkflowJsonLdObject(obj: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = []

  if (!isRecord(obj)) {
    errors.push('GraphRAG workflow JSON-LD root must be an object')
    return { ok: false, errors }
  }

  const typeValue = obj['@type']
  if (typeValue !== 'rag:GraphRAGWorkflow') {
    errors.push('Expected @type "rag:GraphRAGWorkflow"')
  }

  const ctx = obj['@context']
  if (!isRecord(ctx) || !('rag' in ctx)) {
    errors.push('Expected @context with rag prefix')
  }

  if (!('contextWindow' in obj)) {
    errors.push('Expected contextWindow block')
  }

  return { ok: errors.length === 0, errors }
}

export function parseGraphFieldSettingsDocument(
  doc: unknown,
): { graphId: string | null; settingsById: GraphFieldSettingsById } | null {
  if (!isRecord(doc)) return null

  const rootGraphIdRaw = doc['kg:graphId'] ?? doc.graphId
  const rootGraphId = typeof rootGraphIdRaw === 'string' && rootGraphIdRaw.trim() ? rootGraphIdRaw : null

  const fieldsArray = (() => {
    const kgFields = doc['kg:fields']
    if (Array.isArray(kgFields)) return kgFields
    const plainFields = doc.fields
    if (Array.isArray(plainFields)) return plainFields
    const graph = doc['@graph']
    if (Array.isArray(graph)) return graph
    return null
  })()

  if (!Array.isArray(fieldsArray)) return null

  const settingsById: GraphFieldSettingsById = {}

  fieldsArray
    .filter(isRecord)
    .sort((a, b) => {
      const getId = (entry: Record<string, unknown>): GraphFieldId | null => {
        const fieldIdRaw = entry['kg:fieldId'] ?? entry.fieldId ?? entry.id ?? entry['@id']
        const scopeRaw = entry['kg:scope'] ?? entry.scope
        const keyRaw = entry['kg:key'] ?? entry.key
        return typeof fieldIdRaw === 'string' && fieldIdRaw.includes(':')
          ? normalizeGraphFieldId(fieldIdRaw)
          : normalizeGraphFieldIdFromScopeKey(scopeRaw, keyRaw)
      }
      const idA = getId(a)
      const idB = getId(b)
      if (idA && idB) return compareGraphFieldIds(idA, idB)
      return compareText(idA || '', idB || '')
    })
    .forEach((entry) => {
    const fieldIdRaw = entry['kg:fieldId'] ?? entry.fieldId ?? entry.id ?? entry['@id']
    const scopeRaw = entry['kg:scope'] ?? entry.scope
    const keyRaw = entry['kg:key'] ?? entry.key

    const fieldId =
      typeof fieldIdRaw === 'string' && fieldIdRaw.includes(':')
        ? normalizeGraphFieldId(fieldIdRaw)
        : normalizeGraphFieldIdFromScopeKey(scopeRaw, keyRaw)

    if (!fieldId) return

    const settingsRaw = entry['kg:settings'] ?? entry.settings
    if (!isRecord(settingsRaw)) return

    const baseSettings = coerceGraphFieldSettingsFromRecord(settingsRaw)
    const fieldTypeRaw = entry['kg:fieldType'] ?? entry.fieldType
    const descriptionRaw = entry['kg:description'] ?? entry.description
    const isCustomRaw = entry['kg:isCustom'] ?? entry.isCustom
    const patch: WritablePartial<GraphFieldSettings> = {}
    const normalizedFieldType = normalizeGraphFieldType(fieldTypeRaw)
    if (normalizedFieldType) {
      patch.fieldType = normalizedFieldType
    }
    if (typeof descriptionRaw === 'string') {
      patch.description = descriptionRaw
    }
    if (typeof isCustomRaw === 'boolean') {
      patch.isCustom = isCustomRaw
    }

    const merged: GraphFieldSettings = { ...baseSettings, ...patch }
    settingsById[fieldId] = merged
  })

  return { graphId: rootGraphId, settingsById }
}
