import { performance } from 'node:perf_hooks'

import {
  auditRegistry,
  createExecutionEvidenceRecorder,
  withNetworkObservation,
} from './audit-report.mjs'
import { prepareAuditEvidence } from './estate-audit.mjs'
import { diffGeneratedAgainstTracked } from './staging-diff.mjs'

const emptyDiff = () => ({ added: [], removed: [], changed: [], identical: [] })
const DEFAULT_AUDIT_DEADLINE_MS = 60_000

class RuntimeAuditDeadlineError extends Error {
  constructor(stage) {
    super(`runtime audit deadline exceeded during ${stage}`)
    this.name = 'RuntimeAuditDeadlineError'
    this.stage = stage
  }
}

const runBoundedStage = async ({ operation, remainingMs, stage }) => {
  if (remainingMs <= 0) throw new RuntimeAuditDeadlineError(stage)

  const controller = new AbortController()
  let timer
  const operationPromise = Promise.resolve()
    .then(() => operation({
      signal: controller.signal,
      deadlineMs: remainingMs,
    }))
    .catch(error => {
      if (error?.code === 'FC-AUDIT-DEADLINE') {
        throw new RuntimeAuditDeadlineError(stage)
      }
      throw error
    })
  const timeoutPromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new RuntimeAuditDeadlineError(stage)
      controller.abort(error)
      reject(error)
    }, Math.max(0, Math.ceil(remainingMs)))
  })
  try {
    return await Promise.race([operationPromise, timeoutPromise])
  } finally {
    clearTimeout(timer)
  }
}

const publicDiffReport = (liveDiff, evaluated = true) => {
  const drift = (
    liveDiff.added.length > 0
    || liveDiff.removed.length > 0
    || liveDiff.changed.length > 0
  )
  return {
    added: liveDiff.added,
    removed: liveDiff.removed,
    changed: liveDiff.changed.map(change => change.path),
    identical: liveDiff.identical,
    drift,
    evaluated,
    publicOriginMutated: false,
  }
}

const deadlineFailure = ({
  stage,
  elapsedMs,
  unevaluatedCount,
  deadlineMs,
}) => ({
  code: 'FC-AUDIT-DEADLINE',
  stage,
  elapsedMs,
  unevaluatedCount,
  detail: `runtime audit exceeded ${deadlineMs} ms`,
})

const deadlineReadiness = ({
  evidence,
  liveDiff,
  auditResult,
  failure,
  diffEvaluated,
}) => ({
  exitStatus: 1,
  status: 'blocked',
  authorityDigestPair: {
    before: evidence?.beforeAuthorityDigests ?? [],
    after: [],
    equal: false,
    evaluated: false,
  },
  publicOriginDiff: publicDiffReport(liveDiff, diffEvaluated),
  readinessFailures: [failure],
  audit: auditResult?.report ?? null,
})

const evaluateRuntimeReadinessUnsafe = async (
  { authority, candidate },
  options = {},
) => {
  const deadlineMs = Number.isFinite(options.deadlineMs)
    ? Math.max(0, Number(options.deadlineMs))
    : DEFAULT_AUDIT_DEADLINE_MS
  const logicalNow = typeof options.now === 'function'
    ? options.now
    : () => performance.now()
  const dependencies = {
    auditRegistry: options.dependencies?.auditRegistry ?? auditRegistry,
    prepareAuditEvidence: (
      options.dependencies?.prepareAuditEvidence
      ?? prepareAuditEvidence
    ),
    diffGeneratedAgainstTracked: (
      options.dependencies?.diffGeneratedAgainstTracked
      ?? diffGeneratedAgainstTracked
    ),
  }
  const logicalStartedAt = Number(options.invocationLogicalStartedAt)
  const hardStartedAt = Number(options.invocationHardStartedAt)
  if (!Number.isFinite(logicalStartedAt)) {
    throw new TypeError('runtime audit clock returned a non-finite value')
  }
  const elapsed = () => Math.max(
    0,
    Number(logicalNow()) - logicalStartedAt,
    performance.now() - hardStartedAt,
  )
  const remaining = () => Math.max(0, deadlineMs - elapsed())
  const entryCount = Array.isArray(authority?.registry?.entries)
    ? authority.registry.entries.length
    : 0
  let evidence = null
  let liveDiff = emptyDiff()
  let auditResult = { ok: false, report: null }
  let diffEvaluated = !authority.generationReady

  try {
    evidence = authority.registry
      ? await runBoundedStage({
          operation: context => dependencies.prepareAuditEvidence(authority, context),
          remainingMs: remaining(),
          stage: 'prepare-audit-evidence',
        })
      : null
    if (authority.generationReady) {
      liveDiff = await runBoundedStage({
        operation: context => dependencies.diffGeneratedAgainstTracked(
          new Map((candidate.candidateFiles ?? []).map(file => [file.path, file.bytes])),
          authority.paths.publicOriginRoot,
          context,
        ),
        remainingMs: remaining(),
        stage: 'public-origin-diff',
      })
      diffEvaluated = true
    }
    if (authority.registry) {
      const auditDeadlineMs = remaining()
      auditResult = await runBoundedStage({
        operation: () => dependencies.auditRegistry(authority.registry, {
          deadlineMs: auditDeadlineMs,
          digestEntry: evidence?.digestEntry,
          executionRecorder: options.executionRecorder,
          inspectEntry: evidence?.inspectEntry,
          networkObservation: false,
          resolvePermittedRepository: evidence?.resolvePermittedRepository,
        }),
        remainingMs: auditDeadlineMs,
        stage: 'registry-audit',
      })
      const nestedDeadline = auditResult.report?.failures?.find(
        failure => failure.code === 'FC-AUDIT-DEADLINE',
      )
      if (nestedDeadline) {
        return deadlineReadiness({
          evidence,
          liveDiff,
          auditResult,
          diffEvaluated,
          failure: deadlineFailure({
            stage: `registry-audit:${nestedDeadline.stage || 'unknown'}`,
            elapsedMs: elapsed(),
            unevaluatedCount: nestedDeadline.unevaluatedCount ?? entryCount,
            deadlineMs,
          }),
        })
      }
    }
    const beforeAuthorityDigests = evidence?.beforeAuthorityDigests ?? []
    const afterAuthorityDigests = evidence
      ? await runBoundedStage({
          operation: context => evidence.readAfterAuthorityDigests(context),
          remainingMs: remaining(),
          stage: 'post-authority-digest',
        })
      : []
    const authorityDigestsEqual = (
      JSON.stringify(beforeAuthorityDigests) === JSON.stringify(afterAuthorityDigests)
    )
    const publicOriginDiff = publicDiffReport(liveDiff, diffEvaluated)
    const ready = authority.ok
      && candidate.gate.decision === 'permit'
      && auditResult.ok
      && authorityDigestsEqual
      && !publicOriginDiff.drift

    return {
      exitStatus: ready ? 0 : 1,
      status: ready ? 'ready' : 'blocked',
      authorityDigestPair: {
        before: beforeAuthorityDigests,
        after: afterAuthorityDigests,
        equal: authorityDigestsEqual,
        evaluated: true,
      },
      publicOriginDiff,
      readinessFailures: [
        ...(authorityDigestsEqual
          ? []
          : [{ code: 'AUDIT_INPUT_MUTATION', subject: 'authority-files' }]),
        ...(publicOriginDiff.drift
          ? [{
              code: 'PUBLIC_DISCOVERY_DRIFT',
              subject: 'public-origin',
              added: liveDiff.added,
              removed: liveDiff.removed,
              changed: liveDiff.changed.map(change => change.path),
            }]
          : []),
      ],
      audit: auditResult.report,
    }
  } catch (error) {
    if (!(error instanceof RuntimeAuditDeadlineError)) {
      if (error?.code === 'FC-AUDIT-EGRESS') {
        return deadlineReadiness({
          evidence,
          liveDiff,
          auditResult,
          diffEvaluated,
          failure: {
            code: 'FC-AUDIT-EGRESS',
            stage: error.stage ?? 'runtime-audit',
            observedCalls: options.executionRecorder.snapshot().networkCalls,
            detail: 'runtime audit blocked an outbound network primitive',
          },
        })
      }
      throw error
    }
    const unevaluatedCount = (
      error.stage === 'post-authority-digest' ? 0 : entryCount
    )
    return deadlineReadiness({
      evidence,
      liveDiff,
      auditResult,
      diffEvaluated,
      failure: deadlineFailure({
        stage: error.stage,
        elapsedMs: elapsed(),
        unevaluatedCount,
        deadlineMs,
      }),
    })
  }
}

export async function evaluateRuntimeReadiness(input, options = {}) {
  const invocationHardStartedAt = Number.isFinite(options.invocationHardStartedAt)
    ? Number(options.invocationHardStartedAt)
    : performance.now()
  const logicalNow = typeof options.now === 'function'
    ? options.now
    : () => performance.now()
  const invocationLogicalStartedAt = Number.isFinite(options.invocationLogicalStartedAt)
    ? Number(options.invocationLogicalStartedAt)
    : Number(logicalNow())
  const executionRecorder = (
    options.executionRecorder
    ?? createExecutionEvidenceRecorder()
  )
  return withNetworkObservation(executionRecorder, () => (
    evaluateRuntimeReadinessUnsafe(input, {
      ...options,
      executionRecorder,
      invocationHardStartedAt,
      invocationLogicalStartedAt,
    })
  ))
}
