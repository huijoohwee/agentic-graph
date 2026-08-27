import type { AgenticGraphStorageWorkerEnv } from '../contract'
import {
  AGENTICGRAPH_KNOWLEDGE_SOURCE_ALLOWLIST_SCHEMA,
  KnowledgeSourceError,
  assertKnowledgeSourceIdentifier,
  isKnowledgeSourcePlaceholder,
  isKnowledgeSourceRecord,
  readKnowledgeSourceText,
  type KnowledgeSourceAllowlist,
  type KnowledgeSourceRegistration,
} from './knowledgeSourceContract'
import { digestKnowledgeSourceValue } from './knowledgeSourceProvenance'

const SOURCE_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u

const optionalLabel = (value: unknown): string | null => {
  const text = readKnowledgeSourceText(value)
  if (!text) return null
  if (text.length > 256 || /[\u0000-\u001f\u007f]/u.test(text)) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  return text
}

const readRequiredFieldNames = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  const names = value.map(optionalLabel)
  if (names.some(name => name == null) || new Set(names).size !== names.length) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  return names as string[]
}

const readMinimumRecordCount = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2_000) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  return Number(value)
}

const readCommon = (value: Record<string, unknown>) => {
  const sourceId = assertKnowledgeSourceIdentifier(value.sourceId)
  const workspaceId = assertKnowledgeSourceIdentifier(value.workspaceId)
  if (!SOURCE_ALIAS_PATTERN.test(sourceId) || !WORKSPACE_ID_PATTERN.test(workspaceId)) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  return { sourceId, workspaceId, provider: 'lark' as const, title: optionalLabel(value.title) }
}

const readRegistration = (value: unknown): KnowledgeSourceRegistration => {
  if (!isKnowledgeSourceRecord(value) || value.provider !== 'lark') {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  const common = readCommon(value)
  if (value.kind === 'base') {
    return {
      ...common,
      kind: 'base',
      appToken: assertKnowledgeSourceIdentifier(value.appToken),
      tableId: assertKnowledgeSourceIdentifier(value.tableId),
      viewId: assertKnowledgeSourceIdentifier(value.viewId),
      fieldNames: readRequiredFieldNames(value.fieldNames),
      minimumRecordCount: readMinimumRecordCount(value.minimumRecordCount),
      baseTitle: optionalLabel(value.baseTitle),
      tableName: optionalLabel(value.tableName),
      viewName: optionalLabel(value.viewName),
    }
  }
  if (value.kind === 'wiki') {
    return {
      ...common,
      kind: 'wiki',
      spaceId: assertKnowledgeSourceIdentifier(value.spaceId),
      nodeToken: assertKnowledgeSourceIdentifier(value.nodeToken),
      documentId: assertKnowledgeSourceIdentifier(value.documentId),
    }
  }
  if (value.kind === 'doc') {
    return { ...common, kind: 'doc', documentId: assertKnowledgeSourceIdentifier(value.documentId) }
  }
  throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
}

export const readKnowledgeSourceAllowlist = async (
  env: AgenticGraphStorageWorkerEnv,
): Promise<KnowledgeSourceAllowlist> => {
  const encoded = readKnowledgeSourceText(env.AGENTICGRAPH_STORAGE_LARK_SOURCE_ALLOWLIST_JSON)
  if (isKnowledgeSourcePlaceholder(encoded)) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(encoded)
  } catch {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  if (
    !isKnowledgeSourceRecord(parsed)
    || parsed.schema !== AGENTICGRAPH_KNOWLEDGE_SOURCE_ALLOWLIST_SCHEMA
    || isKnowledgeSourcePlaceholder(parsed.revision)
    || !Array.isArray(parsed.sources)
    || parsed.sources.length < 1
    || parsed.sources.length > 100
  ) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  const revision = assertKnowledgeSourceIdentifier(parsed.revision)
  const sources = parsed.sources.map(readRegistration)
  const keys = new Set<string>()
  for (const source of sources) {
    const key = `${source.workspaceId}\u0000${source.sourceId}`
    if (keys.has(key)) throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
    keys.add(key)
  }
  const normalized = { schema: AGENTICGRAPH_KNOWLEDGE_SOURCE_ALLOWLIST_SCHEMA, revision, sources }
  return { ...normalized, digest: await digestKnowledgeSourceValue(normalized) }
}

export const resolveKnowledgeSource = (args: {
  allowlist: KnowledgeSourceAllowlist
  workspaceId: string
  sourceId: string
}): KnowledgeSourceRegistration => {
  const source = args.allowlist.sources.find(entry =>
    entry.workspaceId === args.workspaceId && entry.sourceId === args.sourceId)
  if (!source) throw new KnowledgeSourceError({ code: 'source_not_allowlisted', status: 404 })
  return source
}
