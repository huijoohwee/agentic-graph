const readViteEnvString = (key: string): string => {
  if (typeof import.meta === 'undefined') return ''
  const meta = import.meta as unknown as { env?: Record<string, unknown> }
  const env = meta.env
  const val = env && env[key]
  return typeof val === 'string' ? val : ''
}

const normalizeUrlBase = (value: string): string => value.replace(/\/+$/, '')

const resolveAgenticRagSchemaBase = (): string => {
  const envValue = readViteEnvString('VITE_AGENTIC_RAG_SCHEMA_URL')
  if (envValue) return envValue
  const maybeLocation = (globalThis as { location?: { origin?: string } }).location
  if (maybeLocation && typeof maybeLocation.origin === 'string' && maybeLocation.origin) {
    return `${maybeLocation.origin}/schema/AgenticRAG`
  }
  return '/schema/AgenticRAG'
}

const agenticRagSchemaBase = normalizeUrlBase(resolveAgenticRagSchemaBase())

export const AGENTIC_RAG_SCHEMA_URL = agenticRagSchemaBase

export const AGENTIC_RAG_CONTEXT_URL = `${agenticRagSchemaBase}/v1/context.jsonld`

export const AGENTIC_RAG_NODE_SCHEMA_URL = `${agenticRagSchemaBase}/node-schema.jsonld`

export const AGENTIC_RAG_EDGE_SCHEMA_URL = `${agenticRagSchemaBase}/edge-schema.jsonld`

export const AGENTIC_RAG_GRAPH_SCHEMA_URL = `${agenticRagSchemaBase}/graph-schema.jsonld`

export const AGENTIC_RAG_GRAPH_RAG_PATH_IRI = `${agenticRagSchemaBase}/v1/rag#graphRAGPath`

export const AGENTIC_RAG_NODE_TYPE_IRI = 'kg:Node'

export const AGENTIC_RAG_EDGE_TYPE_IRI = 'kg:Edge'

export const AG_PREFIX = 'kg:'
export const AG_CLASS_PREFIX = 'kg:class:'
export const AG_PROP_PREFIX = 'kg:prop:'
export const AG_NODE_TYPE_CLASS = 'kg:NodeType'
export const AG_EDGE_LABEL_CLASS = 'kg:EdgeLabel'
export const AG_PROPERTY_CLASS = 'kg:Property'
export const AG_SUBJECT = 'kg:subject'
export const AG_PREDICATE = 'kg:predicate'
export const AG_OBJECT = 'kg:object'
