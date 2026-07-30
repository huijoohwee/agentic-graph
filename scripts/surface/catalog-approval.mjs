import {
  lstat,
  readFile,
} from 'node:fs/promises'
import {
  readInstruction,
  validateOperatorInstruction,
} from './ledger.mjs'

const APPROVAL_ARTIFACT_PREFIX = 'invocation.catalog.'

export const catalogApprovalArtifactId = catalogId => (
  `${APPROVAL_ARTIFACT_PREFIX}${String(catalogId ?? '')}`
)

const canonicalTimestamp = now => {
  const value = typeof now === 'function' ? now() : new Date().toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.valueOf()) ? date.toISOString() : ''
}

const approvalFailure = (source, code, detail) => ({
  code,
  sourceCatalog: source.catalogId,
  instructionId: source.approvalInstructionId,
  detail,
})

export async function resolveCatalogApprovals(
  catalogSources,
  ledgerRoot,
  {
    now,
    readRecordedInstruction,
    signal,
  } = {},
) {
  const attemptedAt = canonicalTimestamp(now)
  const approvedCatalogIds = []
  const failures = []
  const sources = Array.isArray(catalogSources)
    ? [...catalogSources].sort((left, right) => (
        String(left?.catalogId ?? '').localeCompare(String(right?.catalogId ?? ''))
      ))
    : []
  const readRecord = readRecordedInstruction ?? ((
    recordRoot,
    instructionId,
  ) => readInstruction(recordRoot, instructionId, {
    lstat,
    readFile: (filePath, encoding) => readFile(filePath, {
      encoding,
      signal,
    }),
  }))

  for (const source of sources) {
    if (signal?.aborted) throw signal.reason
    if (!source?.approvalInstructionId) continue
    const instruction = await readRecord(
      ledgerRoot,
      source.approvalInstructionId,
      source,
    )
    if (!instruction) {
      failures.push(approvalFailure(
        source,
        'CATALOG_APPROVAL_NOT_RECORDED',
        'approvalInstructionId does not resolve to a valid append-only record',
      ))
      continue
    }
    const validation = validateOperatorInstruction(instruction, { attemptedAt })
    if (!attemptedAt || !validation.ok) {
      failures.push(approvalFailure(
        source,
        'CATALOG_APPROVAL_INVALID',
        'catalog approval must be a valid instruction recorded before assembly',
      ))
      continue
    }
    if (
      instruction.destination !== 'prod'
      || !instruction.artifactIds.includes(
        catalogApprovalArtifactId(source.catalogId),
      )
    ) {
      failures.push(approvalFailure(
        source,
        'CATALOG_APPROVAL_SCOPE_MISMATCH',
        'recorded instruction does not authorise this catalog for prod',
      ))
      continue
    }
    approvedCatalogIds.push(source.catalogId)
  }

  return {
    approvedCatalogIds,
    failures,
  }
}
