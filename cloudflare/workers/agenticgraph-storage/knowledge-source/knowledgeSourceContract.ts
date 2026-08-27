import type {
  AgenticGraphKnowledgeSourceIdentityMode,
  AgenticGraphKnowledgeSourceKind,
  AgenticGraphKnowledgeSourceSnapshot,
  AgenticGraphKnowledgeSourceErrorCode,
} from '../contract'
import type { StorageRelayOperation } from '../storage-relay/storageRelaySafety'

export const AGENTICGRAPH_KNOWLEDGE_SOURCE_ALLOWLIST_SCHEMA =
  'agenticgraph-knowledge-source-allowlist/v1' as const

export type KnowledgeSourceErrorCode = AgenticGraphKnowledgeSourceErrorCode

export class KnowledgeSourceError extends Error {
  readonly code: KnowledgeSourceErrorCode
  readonly status: number
  readonly retryable: boolean

  constructor(args: { code: KnowledgeSourceErrorCode; status: number; retryable?: boolean }) {
    super(args.code)
    this.name = 'KnowledgeSourceError'
    this.code = args.code
    this.status = args.status
    this.retryable = Boolean(args.retryable)
  }
}

type KnowledgeSourceRegistrationBase = {
  sourceId: string
  workspaceId: string
  provider: 'lark'
  kind: AgenticGraphKnowledgeSourceKind
  title: string | null
}

export type LarkBaseKnowledgeSourceRegistration = KnowledgeSourceRegistrationBase & {
  kind: 'base'
  appToken: string
  tableId: string
  viewId: string
  fieldNames: readonly string[]
  minimumRecordCount: number
  baseTitle: string | null
  tableName: string | null
  viewName: string | null
}

export type LarkWikiKnowledgeSourceRegistration = KnowledgeSourceRegistrationBase & {
  kind: 'wiki'
  spaceId: string
  nodeToken: string
  documentId: string
}

export type LarkDocKnowledgeSourceRegistration = KnowledgeSourceRegistrationBase & {
  kind: 'doc'
  documentId: string
}

export type KnowledgeSourceRegistration =
  | LarkBaseKnowledgeSourceRegistration
  | LarkWikiKnowledgeSourceRegistration
  | LarkDocKnowledgeSourceRegistration

export type KnowledgeSourceAllowlist = {
  schema: typeof AGENTICGRAPH_KNOWLEDGE_SOURCE_ALLOWLIST_SCHEMA
  revision: string
  digest: string
  sources: readonly KnowledgeSourceRegistration[]
}

export type KnowledgeSourceReadResult = {
  snapshot: AgenticGraphKnowledgeSourceSnapshot
  providerRevision: string | null
  counts: { pages: number; fields: number; records: number; documents: number; bytes: number }
  warnings: string[]
}

export interface KnowledgeSourceProvider {
  readonly providerType: 'lark'
  readonly identityMode: AgenticGraphKnowledgeSourceIdentityMode
  read(args: {
    source: KnowledgeSourceRegistration
    operation: StorageRelayOperation
  }): Promise<KnowledgeSourceReadResult>
}

export const isKnowledgeSourceRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const readKnowledgeSourceText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

export const isKnowledgeSourcePlaceholder = (value: unknown): boolean => {
  const text = readKnowledgeSourceText(value)
  return !text
    || /^<[^>]+>$/u.test(text)
    || /^replace-with(?:-|$)/iu.test(text)
    || /^todo$/iu.test(text)
}

export const assertKnowledgeSourceIdentifier = (value: unknown): string => {
  const text = readKnowledgeSourceText(value)
  if (
    isKnowledgeSourcePlaceholder(text)
    || text.length > 512
    || /[\u0000-\u001f\u007f]/u.test(text)
  ) {
    throw new KnowledgeSourceError({ code: 'resources_unresolved', status: 503 })
  }
  return text
}
