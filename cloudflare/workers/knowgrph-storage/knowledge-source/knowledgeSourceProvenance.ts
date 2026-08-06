import {
  KNOWGRPH_KNOWLEDGE_SOURCE_API_VERSION,
  digestKnowledgeSourceValue,
  type KnowgrphKnowledgeSourceIdentityMode,
  type KnowgrphKnowledgeSourceSnapshotEnvelope,
} from '../contract'
import type { KnowledgeSourceAllowlist, KnowledgeSourceReadResult, KnowledgeSourceRegistration } from './knowledgeSourceContract'

export {
  digestKnowledgeSourceValue,
  stringifyCanonicalKnowledgeSourceJson,
} from '../contract'

export const buildKnowledgeSourceSnapshotEnvelope = async (args: {
  allowlist: KnowledgeSourceAllowlist
  identityMode: KnowgrphKnowledgeSourceIdentityMode
  source: KnowledgeSourceRegistration
  result: KnowledgeSourceReadResult
  now?: () => number
}): Promise<KnowgrphKnowledgeSourceSnapshotEnvelope> => {
  const contentDigest = await digestKnowledgeSourceValue(args.result.snapshot)
  const unsigned: Omit<KnowgrphKnowledgeSourceSnapshotEnvelope, 'envelopeDigest'> = {
    ok: true as const,
    apiVersion: KNOWGRPH_KNOWLEDGE_SOURCE_API_VERSION,
    schema: 'knowgrph-knowledge-source-snapshot/v1' as const,
    complete: true as const,
    provider: 'lark' as const,
    kind: args.source.kind,
    sourceId: args.source.sourceId,
    identityMode: args.identityMode,
    allowlistRevision: args.allowlist.revision,
    allowlistDigest: args.allowlist.digest,
    providerRevision: args.result.providerRevision,
    fetchedAt: new Date((args.now ?? Date.now)()).toISOString(),
    counts: args.result.counts,
    contentDigest,
    snapshot: args.result.snapshot,
    warnings: [...args.result.warnings],
  }
  return {
    ...unsigned,
    envelopeDigest: await digestKnowledgeSourceValue(unsigned),
  }
}
