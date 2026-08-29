import { GraphSchema, PropertySpec } from '@/lib/graph/schema'
import type { JSONValue } from '@/lib/graph/types'
import {
  AG_CLASS_PREFIX,
  AG_PROP_PREFIX,
  AG_NODE_TYPE_CLASS,
  AG_EDGE_LABEL_CLASS,
  AG_PROPERTY_CLASS,
} from '@/lib/agenticrag'
import { canonicalizeSchemaForPersistence } from './schemaCanonical'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const sortStrings = (value: unknown): string[] => {
  return Array.isArray(value)
    ? value.map(v => String(v || '').trim()).filter(Boolean).sort((a, b) => a.localeCompare(b))
    : []
}

const getSortedRecordEntries = <T>(value: Record<string, T> | null | undefined): Array<[string, T]> => {
  return Object.entries(value || {}).sort((a, b) => a[0].localeCompare(b[0]))
}

const getTypeTags = (raw: Record<string, unknown>): string[] => {
  const value = raw['@type']
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean)
  const single = String(value || '').trim()
  return single ? [single] : []
}

const hasTypeTag = (raw: Record<string, unknown>, expected: string): boolean => {
  return getTypeTags(raw).includes(expected)
}

const buildPropertyEntry = (
  owner: string,
  propertyName: string,
  spec: PropertySpec | null | undefined,
): Record<string, unknown> => {
  return {
    '@id': `${AG_PROP_PREFIX}${propertyName}`,
    '@type': AG_PROPERTY_CLASS,
    name: propertyName,
    owner,
    range: asPropType(spec?.type),
  }
}

export function schemaToJsonLd(schema: GraphSchema): {
  '@context': Record<string, unknown>
  '@graph': Array<Record<string, unknown>>
  metadata?: Record<string, unknown>
} {
  const canonical = canonicalizeSchemaForPersistence(schema) || schema
  const ctx: Record<string, unknown> = { kg: 'http://example.org/kg#' }
  const schemaContext = canonical.serialization?.context
  if (schemaContext && typeof schemaContext === 'object' && !Array.isArray(schemaContext)) {
    Object.assign(ctx, schemaContext)
  }
  const graph: Array<Record<string, unknown>> = []
  const nodeTypes = sortStrings(canonical.catalog?.nodeTypes)
  const edgeLabels = sortStrings(canonical.catalog?.edgeLabels)
  nodeTypes.forEach((nt) => {
    graph.push({ '@id': `${AG_CLASS_PREFIX}${nt}`, '@type': AG_NODE_TYPE_CLASS, name: nt })
  })
  edgeLabels.forEach((el) => {
    graph.push({ '@id': `${AG_PROP_PREFIX}${el}`, '@type': AG_EDGE_LABEL_CLASS, name: el })
  })
  const nodeProps = canonical.propertySchemas?.node || {}
  getSortedRecordEntries(nodeProps).forEach(([owner, propsForOwner]) => {
    getSortedRecordEntries(propsForOwner || {}).forEach(([propertyName, spec]) => {
      graph.push(buildPropertyEntry(owner, propertyName, spec))
    })
  })
  const edgeProps = canonical.propertySchemas?.edge || {}
  getSortedRecordEntries(edgeProps).forEach(([owner, propsForOwner]) => {
    getSortedRecordEntries(propsForOwner || {}).forEach(([propertyName, spec]) => {
      graph.push(buildPropertyEntry(owner, propertyName, spec))
    })
  })
  const metadata = canonical.metadata
  const doc: {
    '@context': Record<string, unknown>
    '@graph': Array<Record<string, unknown>>
    metadata?: Record<string, unknown>
  } = { '@context': ctx, '@graph': graph }
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) && Object.keys(metadata).length > 0) {
    doc.metadata = metadata as unknown as Record<string, unknown>
  }
  return doc
}

const asPropType = (t: unknown): PropertySpec['type'] => {
  const s = String(t || '').trim()
  if (s === 'number' || s === 'boolean' || s === 'array' || s === 'object') return s
  return 'string'
}

export function schemaFromJsonLd(jsonld: unknown): GraphSchema {
  const root = isRecord(jsonld) ? jsonld : null
  const graphArray: unknown[] = (() => {
    if (Array.isArray(jsonld)) return jsonld
    if (isRecord(jsonld)) {
      const rawGraph = jsonld['@graph']
      if (Array.isArray(rawGraph)) return rawGraph
    }
    return []
  })()

  const base: GraphSchema = {
    nodeStyles: {},
    edgeStyles: {},
    metadata: {},
    labelStyles: {},
    behavior: { allowEdgeCreation: true, allowNodeDrag: true },
    layout: { forces: {} },
    endpointMatrix: {},
    cardinality: { nodeType: {}, edgeLabel: {} },
    templates: { node: {}, edge: {} },
    performance: { lod: {}, caps: {} },
    accessibility: {},
    legend: {},
    rules: [],
    nodeShapes: {},
    nodeSizes: {},
    nodeStroke: {},
    edgeRouting: { curvatureByLabel: {}, mode: 'straight' },
    catalog: { nodeTypes: [], edgeLabels: [] },
    propertySchemas: { node: {}, edge: {} },
    serialization: {},
  }

  const rawContext = root ? root['@context'] : null
  if (rawContext && typeof rawContext === 'object' && !Array.isArray(rawContext)) {
    base.serialization = { ...(base.serialization || {}), context: rawContext as unknown as Record<string, JSONValue> }
  }
  const rawMetadata = root ? root.metadata : null
  if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    base.metadata = rawMetadata as unknown as Record<string, JSONValue>
  }

  const nodeSchemas = base.propertySchemas?.node || {}
  const edgeSchemas = base.propertySchemas?.edge || {}

  const nodeTypeOwners = new Set<string>()
  const edgeLabelOwners = new Set<string>()
  const propertyEntries: Array<{ owner: string; name: string; range: PropertySpec['type'] }> = []

  for (const raw of graphArray) {
    if (!isRecord(raw)) continue
    const name = String(raw.name ?? '').trim()
    if (!name) continue
    if (hasTypeTag(raw, AG_NODE_TYPE_CLASS)) {
      base.catalog?.nodeTypes.push(name)
      nodeTypeOwners.add(name)
      continue
    }
    if (hasTypeTag(raw, AG_EDGE_LABEL_CLASS)) {
      base.catalog?.edgeLabels.push(name)
      edgeLabelOwners.add(name)
      continue
    }
    if (hasTypeTag(raw, AG_PROPERTY_CLASS)) {
      const owner = String(raw.owner ?? '').trim()
      const range = asPropType(raw.range)
      if (!owner) continue
      propertyEntries.push({ owner, name, range })
    }
  }

  propertyEntries
    .sort((a, b) => a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name))
    .forEach(({ owner, name, range }) => {
      const isEdgeOwner = edgeLabelOwners.has(owner)
      const target = isEdgeOwner ? edgeSchemas : nodeSchemas
      if (!target[owner]) {
        target[owner] = {}
      }
      target[owner]![name] = { type: range }
    })

  if (base.catalog) {
    base.catalog.nodeTypes = sortStrings(base.catalog.nodeTypes)
    base.catalog.edgeLabels = sortStrings(base.catalog.edgeLabels)
  }

  base.propertySchemas = {
    node: nodeSchemas,
    edge: edgeSchemas,
  }

  return canonicalizeSchemaForPersistence(base) || base
}
