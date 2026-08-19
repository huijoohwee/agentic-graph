import { stableJson } from '../bundle/bundle-runtime'
import type { RuntimeCascadeOutcome } from '../bundle/bundle-types'

export type ArchiveResult = Readonly<{ kind: 'written' | 'idempotent'; key: string; digest: string }>

export class ArchiveConflictError extends Error {
  readonly code = 'archive-immutable'

  constructor() {
    super('archive-immutable')
    this.name = 'ArchiveConflictError'
  }
}

export async function archiveCascade(
  bucket: R2Bucket,
  bundleSnapshot: unknown,
  outcome: RuntimeCascadeOutcome,
): Promise<ArchiveResult> {
  const key = `provenance/${encodeURIComponent(outcome.bundleId)}/${encodeURIComponent(outcome.cascadeId)}.json`
  const body = stableJson({ schema: 'knowgrph-travel-commerce-provenance/v1', bundleSnapshot, outcome })
  const digest = await sha256(body)
  const written = await bucket.put(key, body, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { digest, cascadeId: outcome.cascadeId },
  })
  if (written) return Object.freeze({ kind: 'written', key, digest })
  const existing = await bucket.head(key)
  if (existing?.customMetadata?.digest === digest) return Object.freeze({ kind: 'idempotent', key, digest })
  throw new ArchiveConflictError()
}

export function isArchiveConflict(error: unknown): error is ArchiveConflictError {
  return error instanceof ArchiveConflictError
    || Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'archive-immutable')
}

async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
