import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { performance } from 'node:perf_hooks'

import { AUDIT_REPORT_SCHEMA } from './constants.mjs'
export { AUDIT_REPORT_SCHEMA }
export const AUDIT_TIER_NAMES = Object.freeze([
  'public-discoverable',
  'public-artifact',
  'gated',
  'private',
])

const emptyTierCounts = () => Object.fromEntries(AUDIT_TIER_NAMES.map(tier => [tier, 0]))
const NETWORK_SOCKET_PROTOTYPE = net.Socket.prototype
let activeNetworkObservation = null

const networkPrimitiveTargets = () => [
  [globalThis, 'fetch', 'fetch'],
  [http, 'request', 'http.request'],
  [http, 'get', 'http.get'],
  [https, 'request', 'https.request'],
  [https, 'get', 'https.get'],
  [NETWORK_SOCKET_PROTOTYPE, 'connect', 'net.Socket.connect'],
  [net, 'connect', 'net.connect'],
  [net, 'createConnection', 'net.createConnection'],
  [dns, 'lookup', 'dns.lookup'],
  [dns, 'resolve', 'dns.resolve'],
  [dns, 'reverse', 'dns.reverse'],
  [dns.promises, 'lookup', 'dns.promises.lookup'],
  [dns.promises, 'resolve', 'dns.promises.resolve'],
  [dns.promises, 'reverse', 'dns.promises.reverse'],
]

const restoreNetworkPrimitives = observation => {
  for (const target of observation.targets.reverse()) {
    if (target.hadOwn) target.owner[target.key] = target.original
    else delete target.owner[target.key]
  }
}

export const withNetworkObservation = async (executionRecorder, operation) => {
  if (!executionRecorder || typeof executionRecorder.recordNetworkCall !== 'function') {
    throw new TypeError('network observation requires an execution recorder')
  }
  if (typeof operation !== 'function') {
    throw new TypeError('network observation requires an operation')
  }

  if (!activeNetworkObservation) {
    const observation = {
      recorders: new Map(),
      targets: [],
    }
    try {
      for (const [owner, key, primitive] of networkPrimitiveTargets()) {
        const target = {
          owner,
          key,
          primitive,
          original: owner[key],
          hadOwn: Object.hasOwn(owner, key),
        }
        const blockedPrimitive = () => {
          for (const recorder of observation.recorders.keys()) {
            recorder.recordNetworkCall({ primitive })
          }
          const error = new Error(`outbound network primitive blocked: ${primitive}`)
          error.code = 'FC-AUDIT-EGRESS'
          error.primitive = primitive
          throw error
        }
        target.blocked = blockedPrimitive
        owner[key] = blockedPrimitive
        observation.targets.push(target)
      }
      activeNetworkObservation = observation
    } catch (error) {
      restoreNetworkPrimitives(observation)
      throw error
    }
  }

  const observation = activeNetworkObservation
  observation.recorders.set(
    executionRecorder,
    (observation.recorders.get(executionRecorder) ?? 0) + 1,
  )
  try {
    return await operation()
  } finally {
    const remainingUses = (observation.recorders.get(executionRecorder) ?? 1) - 1
    if (remainingUses > 0) observation.recorders.set(executionRecorder, remainingUses)
    else observation.recorders.delete(executionRecorder)
    if (observation.recorders.size === 0 && activeNetworkObservation === observation) {
      activeNetworkObservation = null
      restoreNetworkPrimitives(observation)
    }
  }
}

const nonNegativeNumber = value => {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

const normalizeExecutionEvidence = (value, source = 'audit-execution-recorder') => ({
  source,
  observed: true,
  modelInvocations: Math.trunc(nonNegativeNumber(value?.modelInvocations)),
  networkCalls: Math.trunc(nonNegativeNumber(value?.networkCalls)),
  promptTokens: Math.trunc(nonNegativeNumber(value?.promptTokens)),
  completionTokens: Math.trunc(nonNegativeNumber(value?.completionTokens)),
  estimatedCostUsd: nonNegativeNumber(value?.estimatedCostUsd),
})

export const createExecutionEvidenceRecorder = (initial = {}) => {
  const counts = normalizeExecutionEvidence(initial)
  const recorder = {
    recordNetworkCall(event = 1) {
      const increment = typeof event === 'object' ? event?.count : event
      counts.networkCalls += Math.max(1, Math.trunc(nonNegativeNumber(increment) || 1))
    },
    recordModelInvocation(event = {}) {
      counts.modelInvocations += Math.max(
        1,
        Math.trunc(nonNegativeNumber(event?.count) || 1),
      )
      counts.promptTokens += Math.trunc(nonNegativeNumber(event?.promptTokens))
      counts.completionTokens += Math.trunc(nonNegativeNumber(event?.completionTokens))
      counts.estimatedCostUsd += nonNegativeNumber(event?.estimatedCostUsd)
    },
    snapshot() {
      return normalizeExecutionEvidence(counts)
    },
  }
  return Object.freeze(recorder)
}

const resolveExecutionRecorder = value => (
  value && typeof value.snapshot === 'function'
    ? value
    : createExecutionEvidenceRecorder(value)
)

const snapshotExecutionEvidence = recorder => {
  try {
    const snapshot = recorder.snapshot()
    if (snapshot && typeof snapshot.then === 'function') {
      throw new TypeError('execution evidence snapshot must be synchronous')
    }
    const requiredFields = [
      'modelInvocations',
      'networkCalls',
      'promptTokens',
      'completionTokens',
      'estimatedCostUsd',
    ]
    if (
      !snapshot
      || typeof snapshot !== 'object'
      || requiredFields.some(field => (
        !Object.hasOwn(snapshot, field)
        || !Number.isFinite(Number(snapshot[field]))
        || Number(snapshot[field]) < 0
      ))
    ) {
      throw new TypeError('execution evidence snapshot is incomplete')
    }
    return {
      ok: true,
      evidence: normalizeExecutionEvidence(snapshot),
    }
  } catch (error) {
    return {
      ok: false,
      evidence: {
        ...normalizeExecutionEvidence({}, 'unavailable'),
        observed: false,
      },
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

class AuditDeadlineError extends Error {
  constructor(stage) {
    super(`audit deadline exceeded during ${stage}`)
    this.name = 'AuditDeadlineError'
    this.stage = stage
  }
}

const runWithDeadline = async ({
  operation,
  remainingMs,
  stage,
  executionRecorder,
}) => {
  if (remainingMs <= 0) throw new AuditDeadlineError(stage)

  const controller = new AbortController()
  let timer
  const operationPromise = Promise.resolve().then(() => operation({
    signal: controller.signal,
    deadlineMs: remainingMs,
    executionRecorder,
  }))
  const deadlinePromise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new AuditDeadlineError(stage)
      controller.abort(error)
      reject(error)
    }, Math.max(0, Math.ceil(remainingMs)))
  })

  try {
    return await Promise.race([operationPromise, deadlinePromise])
  } finally {
    clearTimeout(timer)
  }
}

const asEntries = registry => {
  const candidate = registry?.registry ?? registry
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  const entries = candidate.entries ?? candidate.artifacts
  return Array.isArray(entries) ? entries : null
}

const normalizeDigestRecords = (value, entry) => {
  if (value === undefined || value === null) return []
  const values = Array.isArray(value) ? value : [value]
  return values.map((item, index) => {
    if (typeof item === 'string') {
      return { path: String(entry?.path || entry?.artifactId || index), digest: item }
    }
    return {
      path: String(item?.path || entry?.path || entry?.artifactId || index),
      digest: String(item?.digest ?? ''),
    }
  })
}

const defaultInspection = entry => ({
  containingRepository: entry?.owningRepository,
  derivedTier: entry?.surfaceTier,
})

const defaultPermittedRepository = entry => String(entry?.owningRepository || '')

const defaultPublicationState = entry => (
  entry?.surfaceTier === 'public-discoverable' || entry?.surfaceTier === 'public-artifact'
    ? 'permitted'
    : 'blocked'
)

const compareDigestRecords = (beforeRecords, afterRecords, artifactId) => {
  const before = new Map(beforeRecords.map(record => [record.path, record.digest]))
  const after = new Map(afterRecords.map(record => [record.path, record.digest]))
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort()
  return paths
    .filter(filePath => before.get(filePath) !== after.get(filePath))
    .map(filePath => ({
      code: 'FC-AUDIT-MUTATION',
      artifactId,
      path: filePath,
      detail: 'post-audit digest differs from the pre-audit digest',
    }))
}

const unreadableResult = detail => ({
  ok: false,
  report: null,
  error: {
    code: 'FC-REGISTRY-UNREADABLE',
    detail,
  },
  exitStatus: 1,
})

const auditRegistryUnsafe = async (registry, options = {}) => {
  const entries = asEntries(registry)
  if (!entries) return unreadableResult('Surface Registry is unreadable or has no entries array')
  if (registry?.ok === false) return unreadableResult('Surface Registry reader reported failure')

  const deadlineMs = Number.isFinite(options.deadlineMs)
    ? Math.max(0, Number(options.deadlineMs))
    : 60_000
  const maxEntries = Number.isInteger(options.maxEntries)
    ? Math.max(0, options.maxEntries)
    : 5_000
  const now = typeof options.now === 'function' ? options.now : Date.now
  const hardNow = typeof options.hardNow === 'function'
    ? options.hardNow
    : () => performance.now()
  const inspectEntry = typeof options.inspectEntry === 'function'
    ? options.inspectEntry
    : defaultInspection
  const resolvePermittedRepository = typeof options.resolvePermittedRepository === 'function'
    ? options.resolvePermittedRepository
    : defaultPermittedRepository
  const digestEntry = typeof options.digestEntry === 'function'
    ? options.digestEntry
    : async (entry, phase) => entry?.digests?.[phase]
  const executionRecorder = resolveExecutionRecorder(
    options.executionRecorder ?? options.executionEvidence,
  )

  const startedAt = Number(now())
  const hardStartedAt = Number(hardNow())
  if (!Number.isFinite(startedAt) || !Number.isFinite(hardStartedAt)) {
    return unreadableResult('Audit clock returned a non-finite value')
  }
  const elapsed = () => Math.max(
    0,
    Number(now()) - startedAt,
    Number(hardNow()) - hardStartedAt,
  )
  const remaining = () => Math.max(0, deadlineMs - elapsed())
  const tierCounts = emptyTierCounts()
  for (const entry of entries) {
    if (Object.hasOwn(tierCounts, entry?.surfaceTier)) tierCounts[entry.surfaceTier] += 1
  }

  const reportEntries = []
  const warnings = []
  const failures = []
  const digestPairs = []
  let deadlineExceeded = false
  let deadlineStage = ''
  let deadlineArtifactId = ''
  let unevaluatedCount = 0

  if (entries.length > maxEntries) {
    failures.push({
      code: 'FC-AUDIT-LIMIT',
      detail: `registry contains ${entries.length} entries; maximum is ${maxEntries}`,
      unevaluatedCount: entries.length,
    })
    unevaluatedCount = entries.length
  } else {
    for (let index = 0; index < entries.length; index += 1) {
      if (remaining() <= 0) {
        deadlineExceeded = true
        deadlineStage = 'entry-start'
        deadlineArtifactId = String(entries[index]?.artifactId || '')
        unevaluatedCount = entries.length - index
        break
      }

      const entry = entries[index] ?? {}
      const artifactId = String(entry.artifactId || '')
      const surfaceTier = String(entry.surfaceTier || '')
      const licenseId = String(entry.licenseId || '')
      let inspection = {}
      let beforeDigests = []
      let afterDigests = []

      try {
        beforeDigests = normalizeDigestRecords(await runWithDeadline({
          operation: context => digestEntry(entry, 'before', index, context),
          remainingMs: remaining(),
          stage: 'before-digest',
          executionRecorder,
        }), entry)
        inspection = await runWithDeadline({
          operation: context => inspectEntry(entry, index, context),
          remainingMs: remaining(),
          stage: 'inspection',
          executionRecorder,
        }) ?? {}
        afterDigests = normalizeDigestRecords(await runWithDeadline({
          operation: context => digestEntry(entry, 'after', index, context),
          remainingMs: remaining(),
          stage: 'after-digest',
          executionRecorder,
        }), entry)
      } catch (error) {
        if (error instanceof AuditDeadlineError) {
          deadlineExceeded = true
          deadlineStage = error.stage
          deadlineArtifactId = artifactId
          unevaluatedCount = entries.length - index
          break
        }
        failures.push({
          code: 'FC-AUDIT-INSPECTION',
          artifactId,
          detail: error instanceof Error ? error.message : String(error),
        })
      }

      let permittedRepository = ''
      try {
        permittedRepository = String(
          inspection.permittedRepository
          ?? await runWithDeadline({
            operation: context => resolvePermittedRepository(entry, index, context),
            remainingMs: remaining(),
            stage: 'repository-resolution',
            executionRecorder,
          })
          ?? '',
        )
      } catch (error) {
        if (error instanceof AuditDeadlineError) {
          deadlineExceeded = true
          deadlineStage = error.stage
          deadlineArtifactId = artifactId
          unevaluatedCount = entries.length - index
          break
        }
        failures.push({
          code: 'FC-AUDIT-INSPECTION',
          artifactId,
          detail: error instanceof Error ? error.message : String(error),
        })
      }
      const containingRepository = String(inspection.containingRepository ?? '')
      const locatedCorrectly = Boolean(
        permittedRepository
        && containingRepository
        && permittedRepository === containingRepository,
      )
      if (!locatedCorrectly) {
        failures.push({
          code: 'FC-AUDIT-LOCATION',
          artifactId,
          permittedRepository,
          containingRepository,
          detail: containingRepository
            ? 'artifact is located outside the repository permitted by its tier'
            : 'artifact containing repository could not be established',
        })
      }

      const derivedTier = String(inspection.derivedTier ?? surfaceTier)
      if (locatedCorrectly && derivedTier && derivedTier !== surfaceTier) {
        warnings.push({
          code: 'TIER_MISMATCH',
          artifactId,
          recordedTier: surfaceTier,
          derivedTier,
        })
      }

      const state = inspection.publicationState === 'permitted' || inspection.publicationState === 'blocked'
        ? inspection.publicationState
        : defaultPublicationState(entry)
      reportEntries.push({ artifactId, surfaceTier, licenseId, state })
      const mutations = compareDigestRecords(beforeDigests, afterDigests, artifactId)
      failures.push(...mutations)
      digestPairs.push({
        artifactId,
        before: beforeDigests,
        after: afterDigests,
        equal: mutations.length === 0,
      })

      if (remaining() <= 0) {
        deadlineExceeded = true
        deadlineStage = 'entry-complete'
        deadlineArtifactId = artifactId
        unevaluatedCount = entries.length - index - 1
        break
      }
    }
  }

  const elapsedMs = elapsed()
  if (deadlineExceeded) {
    failures.push({
      code: 'FC-AUDIT-DEADLINE',
      artifactId: deadlineArtifactId,
      stage: deadlineStage,
      elapsedMs,
      unevaluatedCount,
      detail: `audit exceeded ${deadlineMs} ms`,
    })
  }
  const executionSnapshot = snapshotExecutionEvidence(executionRecorder)
  if (!executionSnapshot.ok) {
    failures.push({
      code: 'FC-AUDIT-EVIDENCE',
      detail: executionSnapshot.detail,
    })
  }
  if (executionSnapshot.evidence.networkCalls > 0) {
    failures.push({
      code: 'FC-AUDIT-EGRESS',
      observedCalls: executionSnapshot.evidence.networkCalls,
      detail: 'audit execution evidence recorded outbound network calls',
    })
  }
  if (
    executionSnapshot.evidence.modelInvocations > 0
    || executionSnapshot.evidence.promptTokens > 0
    || executionSnapshot.evidence.completionTokens > 0
    || executionSnapshot.evidence.estimatedCostUsd > 0
  ) {
    failures.push({
      code: 'FC-AUDIT-MODEL',
      observedInvocations: executionSnapshot.evidence.modelInvocations,
      detail: 'audit execution evidence recorded model use or spend',
    })
  }
  const blockedCandidateCount = reportEntries.filter(entry => entry.state === 'blocked').length
  const exitStatus = failures.length > 0 ? 1 : 0
  const report = {
    schema: AUDIT_REPORT_SCHEMA,
    entries: reportEntries,
    tierCounts,
    blockedCandidateCount,
    warnings,
    failures,
    digestPairs,
    executionEvidence: executionSnapshot.evidence,
    elapsedMs,
    unevaluatedCount,
    exitStatus,
  }
  return {
    ok: exitStatus === 0,
    report,
    ...report,
  }
}

export const auditRegistry = async (registry, options = {}) => {
  const executionRecorder = resolveExecutionRecorder(
    options.executionRecorder ?? options.executionEvidence,
  )
  const runAudit = () => auditRegistryUnsafe(registry, {
    ...options,
    executionRecorder,
  })
  try {
    return options.networkObservation === false
      ? await runAudit()
      : await withNetworkObservation(executionRecorder, runAudit)
  } catch (error) {
    if (error?.code === 'FC-AUDIT-EGRESS') {
      const entries = asEntries(registry) ?? []
      const tierCounts = emptyTierCounts()
      for (const entry of entries) {
        if (Object.hasOwn(tierCounts, entry?.surfaceTier)) {
          tierCounts[entry.surfaceTier] += 1
        }
      }
      const executionSnapshot = snapshotExecutionEvidence(executionRecorder)
      const failure = {
        code: 'FC-AUDIT-EGRESS',
        observedCalls: executionSnapshot.evidence.networkCalls,
        detail: 'audit blocked an outbound network primitive',
      }
      const report = {
        schema: AUDIT_REPORT_SCHEMA,
        entries: [],
        tierCounts,
        blockedCandidateCount: 0,
        warnings: [],
        failures: [failure],
        digestPairs: [],
        executionEvidence: executionSnapshot.evidence,
        elapsedMs: 0,
        unevaluatedCount: entries.length,
        exitStatus: 1,
      }
      return { ok: false, report, ...report }
    }
    return unreadableResult(error instanceof Error ? error.message : String(error))
  }
}

export const audit = auditRegistry
