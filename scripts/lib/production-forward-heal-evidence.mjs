import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const FORWARD_HEAL_ATTESTATION_SCHEMA = 'agentic-graph-production-forward-heal-baseline-attestation/v1'
const ROLLBACK_IDENTITY_SCHEMA = 'agentic-graph-production-rollback-identity/v1'
const ROLLBACK_RECAPTURE_SCHEMA = 'agentic-graph-production-rollback-recapture/v1'
const RELEASE_EVIDENCE_SCHEMA = 'agentic-graph-production-release-evidence/v1'
const D1_STATE_SNAPSHOT_SCHEMA = 'agentic-graph-d1-state-snapshot/v1'
const OBSERVED_MIRROR_SCHEMA = 'agentic-graph-production-observed-mirror-identity/v1'
const FAILURE_OBSERVATION_SCHEMA = 'agentic-graph-production-release-failure-observation/v1'
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const STATE_COUNT_FIELDS = ['documentCount', 'chunkCount', 'graphCount']
const COLLABORATION_FIELDS = [
  'actorId', 'deviceId', 'sessionId', 'worktreeId', 'branchId', 'scopeId', 'leaseEpoch', 'fenceRevision',
]
const RECEIPT_FIELDS = {
  preservation: ['convergenceBaseDigest', 'protectedTipDigest', 'captureAdapterId', 'entries', 'capturedAt'],
  disposition: ['preservationReceiptDigest', 'convergenceBaseDigest', 'protectedTipDigest', 'observations', 'observedAt'],
  integration: [
    'preservationReceiptDigest', 'overlapDispositionReceiptDigest', 'sourceRevision', 'sourceDigest',
    'dependencyClosureDigest', 'checksDigest', 'evaluatorId', 'collaboration', 'integrationTargetDigest', 'integratedAt',
  ],
  review: [
    'integrationReceiptDigest', 'sourceDigest', 'dependencyClosureDigest', 'reviewSurfaceDigest',
    'policyDigest', 'probesDigest', 'reviewerId', 'issuedAt', 'expiresAt',
  ],
  candidate: [
    'runtimeReviewReceiptDigest', 'sourceDigest', 'dependencyClosureDigest', 'policyDigest', 'targetDigest',
    'artifactDigest', 'manifestDigest', 'rollbackTargetDigest', 'builtAt',
  ],
  authorizationInteraction: [
    'candidateDigest', 'targetDigest', 'humanActorId', 'interactionAdapterId', 'transportClass',
    'browserRequired', 'challengeDigest', 'responseDigest', 'recordedAt',
  ],
  authorizedHuman: [
    'candidateDigest', 'targetDigest', 'releaseKey', 'decisionKind', 'humanActorId', 'decisionRef',
    'authorityAdapterId', 'interactionReceiptDigest', 'issuedAt', 'expiresAt', 'consumedAt',
  ],
  authorization: [
    'candidateDigest', 'targetDigest', 'decisionKind', 'humanActorId', 'decisionRef', 'authorityAdapterId',
    'interactionReceiptDigest', 'issuedAt', 'expiresAt', 'consumedAt', 'controllerId',
    'authorizationReceiptDigest', 'releaseKey',
  ],
  deployment: [
    'consumedAuthorizationReceiptDigest', 'candidateDigest', 'targetDigest', 'releaseKey', 'controllerId',
    'deploymentAdapterId', 'deployedArtifactDigest', 'immutableDeploymentId', 'immutableDeploymentOrigin',
    'rollbackTargetDigest', 'deployedAt',
  ],
  state: [
    'deploymentReceiptDigest', 'candidateDigest', 'targetDigest', 'controllerId', 'stateContractDigest',
    'operationsDigest', 'operationCount', 'operationLimit', 'readbackAdapterId', 'readbackKind', 'readbackDigest',
    'expectedCounts', 'observedCounts', 'pathHashParity', 'contentParity', 'reconciledAt',
  ],
}

const canonicalJson = value => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value)
const digestBytes = value => createHash('sha256').update(value).digest('hex')
const digestValue = value => digestBytes(canonicalJson(value))
const normalizeTransportInstant = (value, label) => {
  const instant = new Date(String(value || ''))
  assert.ok(!Number.isNaN(instant.getTime()), `${label} must be an ISO timestamp`)
  return instant.toISOString()
}
const exactInstant = (value, label) => normalizeTransportInstant(value, label)
const normalizeOrigin = value => {
  const url = new URL(String(value || ''))
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`production transport must be an HTTPS origin: ${value}`)
  }
  return url.origin
}

const requireRecord = (value, label) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`)
  return value
}
const requireExactFields = (value, fields, label) => {
  requireRecord(value, label)
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), `${label} contains missing or unknown fields`)
}
const requireText = (value, label) => assert.ok(typeof value === 'string' && value.trim(), `${label} must be non-empty`)
const requireDigest = (value, label) => assert.match(String(value || ''), DIGEST_PATTERN, `${label} must be a SHA-256 digest`)
const requireSha = (value, label) => assert.match(String(value || ''), SHA_PATTERN, `${label} must be an exact Git SHA`)
const requireCanonicalInstant = (value, label) => {
  const normalized = exactInstant(value, label)
  assert.equal(value, normalized, `${label} must be a canonical ISO timestamp`)
  return normalized
}
const requireChronology = (earlier, later, label) => {
  assert.ok(Date.parse(later) >= Date.parse(earlier), label)
}
const normalizeCounts = (value, label) => {
  requireExactFields(value, STATE_COUNT_FIELDS, label)
  for (const field of STATE_COUNT_FIELDS) {
    assert.ok(Number.isSafeInteger(value[field]) && value[field] >= 0, `${label}.${field} must be a non-negative integer`)
  }
  assert.equal(value.graphCount, 0, `${label}.graphCount must remain zero`)
  return { ...value }
}
const normalizeSealedReceipt = (value, { schema, status, fields, label }) => {
  requireExactFields(value, ['schema', 'status', ...fields, 'receiptDigest'], label)
  assert.equal(value.schema, schema, `${label} schema drifted`)
  assert.equal(value.status, status, `${label} status drifted`)
  requireDigest(value.receiptDigest, `${label}.receiptDigest`)
  const { receiptDigest, ...body } = value
  assert.equal(digestValue(body), receiptDigest, `${label} receipt digest drifted`)
  return value
}
const normalizeForwardHealCollaboration = (value, label) => {
  requireExactFields(value, COLLABORATION_FIELDS, label)
  for (const field of COLLABORATION_FIELDS.filter(field => field !== 'leaseEpoch')) {
    requireText(value[field], `${label}.${field}`)
  }
  assert.ok(Number.isSafeInteger(value.leaseEpoch) && value.leaseEpoch > 0, `${label}.leaseEpoch must be positive`)
  requireSha(value.fenceRevision, `${label}.fenceRevision`)
  return { ...value }
}
const forwardHealCollaborationKey = value => COLLABORATION_FIELDS.map(field => String(value[field])).join('\u0000')
const normalizeForwardHealPreservationEntries = entries => {
  assert.ok(Array.isArray(entries), 'overlap preservation entries must be an array')
  const normalized = entries.map((entry, index) => {
    const label = `overlap preservation entry ${index}`
    requireExactFields(entry, [
      'collaboration', 'writeSetDigest', 'stateDigest', 'recoveryHandle', 'preservationMode', 'overlapClass',
    ], label)
    const collaboration = normalizeForwardHealCollaboration(entry.collaboration, `${label}.collaboration`)
    requireDigest(entry.writeSetDigest, `${label}.writeSetDigest`)
    requireDigest(entry.stateDigest, `${label}.stateDigest`)
    requireText(entry.recoveryHandle, `${label}.recoveryHandle`)
    assert.ok(['active-lane', 'immutable-recovery-object'].includes(entry.preservationMode),
      `${label}.preservationMode drifted`)
    assert.ok(['disjoint', 'overlapping'].includes(entry.overlapClass), `${label}.overlapClass drifted`)
    return { ...entry, collaboration }
  })
  const keys = normalized.map(entry => forwardHealCollaborationKey(entry.collaboration))
  assert.equal(new Set(keys).size, keys.length, 'overlap preservation entries contain duplicate collaboration identities')
  assert.deepEqual(keys, [...keys].sort(), 'overlap preservation entries are not canonically ordered')
  return normalized
}
const normalizeForwardHealDispositionObservations = observations => {
  assert.ok(Array.isArray(observations), 'overlap disposition observations must be an array')
  const normalized = observations.map((observation, index) => {
    const label = `overlap disposition observation ${index}`
    requireExactFields(observation, ['collaboration', 'stateDigest', 'recoveryHandle', 'disposition'], label)
    const collaboration = normalizeForwardHealCollaboration(observation.collaboration, `${label}.collaboration`)
    requireDigest(observation.stateDigest, `${label}.stateDigest`)
    requireText(observation.recoveryHandle, `${label}.recoveryHandle`)
    assert.ok(['retained', 'restored'].includes(observation.disposition), `${label}.disposition drifted`)
    return { ...observation, collaboration }
  })
  const keys = normalized.map(observation => forwardHealCollaborationKey(observation.collaboration))
  assert.equal(new Set(keys).size, keys.length, 'overlap disposition observations contain duplicate collaboration identities')
  assert.deepEqual(keys, [...keys].sort(), 'overlap disposition observations are not canonically ordered')
  return normalized
}

const normalizeForwardHealPages = value => {
  requireExactFields(value, [
    'deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision', 'deployedAt',
  ], 'forward-heal Pages observation')
  requireText(value.deploymentId, 'forward-heal Pages deploymentId')
  const deploymentOrigin = normalizeOrigin(value.deploymentOrigin)
  requireSha(value.deploymentCommitRevision, 'forward-heal Pages deploymentCommitRevision')
  requireSha(value.sourceRevision, 'forward-heal Pages sourceRevision')
  requireCanonicalInstant(value.deployedAt, 'forward-heal Pages deployedAt')
  return { ...value, deploymentOrigin }
}
const normalizeForwardHealState = value => {
  requireExactFields(value, [
    'schema', 'workspaceId', 'readbackAdapterId', 'readbackKind', 'stateContractDigest',
    'readbackDigest', 'observedCounts', 'capturedAt',
  ], 'forward-heal D1 observation')
  assert.equal(value.schema, D1_STATE_SNAPSHOT_SCHEMA, 'forward-heal D1 observation schema drifted')
  requireText(value.workspaceId, 'forward-heal D1 workspaceId')
  assert.equal(value.readbackAdapterId, 'cloudflare-wrangler-d1-direct-readback/v1')
  assert.equal(value.readbackKind, 'direct-authoritative')
  requireDigest(value.stateContractDigest, 'forward-heal D1 stateContractDigest')
  requireDigest(value.readbackDigest, 'forward-heal D1 readbackDigest')
  const observedCounts = normalizeCounts(value.observedCounts, 'forward-heal D1 observedCounts')
  requireCanonicalInstant(value.capturedAt, 'forward-heal D1 capturedAt')
  return { ...value, observedCounts }
}
const normalizeForwardHealMirror = value => {
  requireExactFields(value, [
    'schema', 'repository', 'revision', 'sourceRevision', 'observedAt',
  ], 'forward-heal mirror observation')
  assert.equal(value.schema, OBSERVED_MIRROR_SCHEMA, 'forward-heal mirror observation schema drifted')
  requireText(value.repository, 'forward-heal mirror repository')
  requireSha(value.revision, 'forward-heal mirror revision')
  requireSha(value.sourceRevision, 'forward-heal mirror sourceRevision')
  requireCanonicalInstant(value.observedAt, 'forward-heal mirror observedAt')
  return { ...value }
}
const normalizeForwardHealRollbackIdentity = value => {
  requireExactFields(value, ['schema', 'pages', 'mirror', 'd1'], 'forward-heal rollback identity')
  assert.equal(value.schema, ROLLBACK_IDENTITY_SCHEMA)
  requireExactFields(value.pages, [
    'deploymentId', 'deploymentOrigin', 'deploymentCommitRevision', 'sourceRevision',
  ], 'forward-heal rollback Pages identity')
  requireText(value.pages.deploymentId, 'forward-heal rollback Pages deploymentId')
  const deploymentOrigin = normalizeOrigin(value.pages.deploymentOrigin)
  requireSha(value.pages.deploymentCommitRevision, 'forward-heal rollback Pages deploymentCommitRevision')
  requireSha(value.pages.sourceRevision, 'forward-heal rollback Pages sourceRevision')
  requireExactFields(value.mirror, ['repository', 'revision'], 'forward-heal rollback mirror identity')
  requireText(value.mirror.repository, 'forward-heal rollback mirror repository')
  requireSha(value.mirror.revision, 'forward-heal rollback mirror revision')
  requireExactFields(value.d1, ['stateContractDigest', 'readbackDigest', 'counts'], 'forward-heal rollback D1 identity')
  requireDigest(value.d1.stateContractDigest, 'forward-heal rollback D1 stateContractDigest')
  requireDigest(value.d1.readbackDigest, 'forward-heal rollback D1 readbackDigest')
  const counts = normalizeCounts(value.d1.counts, 'forward-heal rollback D1 counts')
  return {
    schema: value.schema,
    pages: { ...value.pages, deploymentOrigin },
    mirror: { ...value.mirror },
    d1: { ...value.d1, counts },
  }
}
const substantiveForwardHealObservation = ({ pages, state, mirror }) => {
  const { capturedAt: _stateCapturedAt, ...stateIdentity } = state
  const { observedAt: _mirrorObservedAt, ...mirrorIdentity } = mirror
  return { pages, state: stateIdentity, mirror: mirrorIdentity }
}
const validateForwardHealFailure = ({ failureObservation, failureDetail, failureDetailBytes }) => {
  requireExactFields(failureObservation, [
    'schema', 'failedStage', 'messageDigest', 'observedAt',
  ], 'failed release observation')
  assert.equal(failureObservation.schema, FAILURE_OBSERVATION_SCHEMA)
  assert.equal(failureObservation.failedStage, 'live-verification')
  requireDigest(failureObservation.messageDigest, 'failed release messageDigest')
  requireCanonicalInstant(failureObservation.observedAt, 'failed release observedAt')
  const detailBytes = Buffer.from(failureDetailBytes)
  assert.deepEqual(JSON.parse(detailBytes.toString('utf8')), failureDetail, 'failed release detail bytes drifted')
  assert.equal(digestBytes(detailBytes), failureObservation.messageDigest, 'failed release detail digest drifted')
  requireExactFields(failureDetail, ['failedStage', 'outcomes'], 'failed release detail')
  assert.equal(failureDetail.failedStage, failureObservation.failedStage)
  requireRecord(failureDetail.outcomes, 'failed release step outcomes')
  for (const [step, outcome] of Object.entries({
    deployment_gate: 'success',
    deploy_pages: 'success',
    deployment_authority: 'success',
    deployment_receipt: 'success',
    reconcile_state: 'success',
    state_receipt: 'success',
    fidelity: 'failure',
    publish_mirror: 'skipped',
    publication_receipt: 'skipped',
  })) assert.equal(failureDetail.outcomes[step], outcome, `failed release ${step} outcome drifted`)
}
const validateForwardHealLifecycle = lifecycle => {
  const preservation = normalizeSealedReceipt(lifecycle.preservation, {
    schema: 'agentic-overlap-preservation-receipt/v1', status: 'preserved', fields: RECEIPT_FIELDS.preservation,
    label: 'overlap preservation receipt',
  })
  const disposition = normalizeSealedReceipt(lifecycle.disposition, {
    schema: 'agentic-overlap-disposition-receipt/v1', status: 'accounted', fields: RECEIPT_FIELDS.disposition,
    label: 'overlap disposition receipt',
  })
  const integration = normalizeSealedReceipt(lifecycle.integration, {
    schema: 'agentic-integration-receipt/v2', status: 'integrated', fields: RECEIPT_FIELDS.integration,
    label: 'integration receipt',
  })
  const review = normalizeSealedReceipt(lifecycle.review, {
    schema: 'agentic-runtime-review-receipt/v1', status: 'reviewed', fields: RECEIPT_FIELDS.review,
    label: 'runtime review receipt',
  })
  const candidate = normalizeSealedReceipt(lifecycle.candidate, {
    schema: 'agentic-candidate-manifest/v1', status: 'awaiting-human-authorization', fields: RECEIPT_FIELDS.candidate,
    label: 'candidate manifest',
  })
  const authorizationInteraction = normalizeSealedReceipt(lifecycle.authorizationInteraction, {
    schema: 'agentic-authorization-interaction-receipt/v1', status: 'observed',
    fields: RECEIPT_FIELDS.authorizationInteraction, label: 'authorization interaction receipt',
  })
  const authorizedHuman = normalizeSealedReceipt(lifecycle.authorizedHuman, {
    schema: 'agentic-human-authorization-receipt/v2', status: 'authorized',
    fields: RECEIPT_FIELDS.authorizedHuman, label: 'authorized human receipt',
  })
  const authorization = normalizeSealedReceipt(lifecycle.authorization, {
    schema: 'agentic-human-authorization-receipt/v2', status: 'consumed', fields: RECEIPT_FIELDS.authorization,
    label: 'consumed authorization receipt',
  })
  const deployment = normalizeSealedReceipt(lifecycle.deployment, {
    schema: 'agentic-deployment-receipt/v1', status: 'deployed', fields: RECEIPT_FIELDS.deployment,
    label: 'deployment receipt',
  })
  const state = normalizeSealedReceipt(lifecycle.state, {
    schema: 'agentic-state-reconciliation-receipt/v1', status: 'reconciled', fields: RECEIPT_FIELDS.state,
    label: 'state receipt',
  })
  const releaseEvidence = requireRecord(lifecycle.releaseEvidence, 'failed release evidence')
  assert.equal(releaseEvidence.schema, RELEASE_EVIDENCE_SCHEMA)
  requireText(releaseEvidence.repository, 'failed release evidence repository')
  requireSha(releaseEvidence.sourceRevision, 'failed release evidence sourceRevision')
  requireDigest(releaseEvidence.rollbackTargetDigest, 'failed release evidence rollbackTargetDigest')
  requireCanonicalInstant(releaseEvidence.rollbackCapturedAt, 'failed release evidence rollbackCapturedAt')
  const predecessorRollbackIdentity = normalizeForwardHealRollbackIdentity(releaseEvidence.rollbackIdentity)
  assert.equal(digestValue(predecessorRollbackIdentity), releaseEvidence.rollbackTargetDigest,
    'failed release evidence rollback identity digest drifted')
  for (const field of ['convergenceBaseDigest', 'protectedTipDigest']) {
    requireDigest(preservation[field], `overlap preservation ${field}`)
  }
  requireText(preservation.captureAdapterId, 'overlap preservation captureAdapterId')
  requireCanonicalInstant(preservation.capturedAt, 'overlap preservation capturedAt')
  const preservationEntries = normalizeForwardHealPreservationEntries(preservation.entries)
  for (const field of ['preservationReceiptDigest', 'convergenceBaseDigest', 'protectedTipDigest']) {
    requireDigest(disposition[field], `overlap disposition ${field}`)
  }
  requireCanonicalInstant(disposition.observedAt, 'overlap disposition observedAt')
  const dispositionObservations = normalizeForwardHealDispositionObservations(disposition.observations)
  assert.equal(disposition.preservationReceiptDigest, preservation.receiptDigest,
    'overlap disposition is unjoined from preservation')
  assert.equal(disposition.convergenceBaseDigest, preservation.convergenceBaseDigest,
    'overlap disposition convergence base drifted from preservation')
  assert.equal(disposition.protectedTipDigest, preservation.protectedTipDigest,
    'overlap disposition protected tip drifted from preservation')
  assert.equal(dispositionObservations.length, preservationEntries.length,
    'overlap disposition does not account for every preservation entry')
  for (let index = 0; index < preservationEntries.length; index += 1) {
    const entry = preservationEntries[index]
    const observation = dispositionObservations[index]
    assert.equal(forwardHealCollaborationKey(observation.collaboration), forwardHealCollaborationKey(entry.collaboration),
      'overlap disposition collaboration identity drifted from preservation')
    assert.equal(observation.stateDigest, entry.stateDigest,
      'overlap disposition state digest drifted from preservation')
    assert.equal(observation.recoveryHandle, entry.recoveryHandle,
      'overlap disposition recovery handle drifted from preservation')
    if (entry.overlapClass === 'overlapping') {
      assert.equal(observation.disposition, 'retained', 'overlapping work was not retained')
    }
  }
  requireChronology(preservation.capturedAt, disposition.observedAt,
    'overlap disposition predates preservation')
  requireSha(integration.sourceRevision, 'integration sourceRevision')
  for (const field of [
    'preservationReceiptDigest', 'overlapDispositionReceiptDigest', 'sourceDigest',
    'dependencyClosureDigest', 'checksDigest', 'integrationTargetDigest',
  ]) requireDigest(integration[field], `integration ${field}`)
  requireText(integration.evaluatorId, 'integration evaluatorId')
  requireExactFields(integration.collaboration, [
    'actorId', 'deviceId', 'sessionId', 'worktreeId', 'branchId', 'scopeId', 'leaseEpoch', 'fenceRevision',
  ], 'integration collaboration')
  for (const field of ['actorId', 'deviceId', 'sessionId', 'worktreeId', 'branchId', 'scopeId']) {
    requireText(integration.collaboration[field], `integration collaboration ${field}`)
  }
  assert.ok(Number.isSafeInteger(integration.collaboration.leaseEpoch) && integration.collaboration.leaseEpoch > 0)
  requireSha(integration.collaboration.fenceRevision, 'integration collaboration fenceRevision')
  requireCanonicalInstant(integration.integratedAt, 'integration integratedAt')
  assert.equal(integration.preservationReceiptDigest, preservation.receiptDigest,
    'integration is unjoined from overlap preservation')
  assert.equal(integration.overlapDispositionReceiptDigest, disposition.receiptDigest,
    'integration is unjoined from overlap disposition')
  requireChronology(disposition.observedAt, integration.integratedAt,
    'integration predates overlap disposition')
  assert.equal(releaseEvidence.sourceRevision, integration.sourceRevision, 'release evidence source revision drifted')
  assert.equal(review.integrationReceiptDigest, integration.receiptDigest, 'runtime review is unjoined from integration')
  assert.equal(review.sourceDigest, integration.sourceDigest, 'runtime review source digest drifted')
  assert.equal(review.dependencyClosureDigest, integration.dependencyClosureDigest, 'runtime review dependency closure drifted')
  for (const field of ['reviewSurfaceDigest', 'policyDigest', 'probesDigest']) {
    requireDigest(review[field], `runtime review ${field}`)
  }
  requireText(review.reviewerId, 'runtime review reviewerId')
  requireCanonicalInstant(review.issuedAt, 'runtime review issuedAt')
  requireCanonicalInstant(review.expiresAt, 'runtime review expiresAt')
  requireChronology(integration.integratedAt, review.issuedAt, 'runtime review predates integration')
  requireChronology(review.issuedAt, review.expiresAt, 'runtime review expiry predates issue')
  assert.equal(candidate.runtimeReviewReceiptDigest, review.receiptDigest, 'candidate is unjoined from runtime review')
  assert.equal(candidate.sourceDigest, review.sourceDigest, 'candidate source digest drifted')
  assert.equal(candidate.dependencyClosureDigest, review.dependencyClosureDigest, 'candidate dependency closure drifted')
  assert.equal(candidate.policyDigest, review.policyDigest, 'candidate policy digest drifted')
  for (const field of ['targetDigest', 'artifactDigest', 'manifestDigest', 'rollbackTargetDigest']) {
    requireDigest(candidate[field], `candidate ${field}`)
  }
  requireCanonicalInstant(candidate.builtAt, 'candidate builtAt')
  requireChronology(review.issuedAt, candidate.builtAt, 'candidate predates runtime review')
  requireChronology(candidate.builtAt, review.expiresAt, 'candidate follows runtime review expiry')
  assert.equal(candidate.rollbackTargetDigest, releaseEvidence.rollbackTargetDigest,
    'candidate predecessor rollback target drifted')
  assert.equal(authorizationInteraction.candidateDigest, candidate.receiptDigest,
    'authorization interaction is unjoined from candidate')
  assert.equal(authorizationInteraction.targetDigest, candidate.targetDigest,
    'authorization interaction target drifted')
  for (const field of ['humanActorId', 'interactionAdapterId', 'transportClass']) {
    requireText(authorizationInteraction[field], `authorization interaction ${field}`)
  }
  assert.equal(typeof authorizationInteraction.browserRequired, 'boolean',
    'authorization interaction browserRequired must be boolean')
  for (const field of ['challengeDigest', 'responseDigest']) {
    requireDigest(authorizationInteraction[field], `authorization interaction ${field}`)
  }
  requireCanonicalInstant(authorizationInteraction.recordedAt, 'authorization interaction recordedAt')
  requireChronology(candidate.builtAt, authorizationInteraction.recordedAt,
    'authorization interaction predates candidate')
  assert.equal(authorizedHuman.candidateDigest, candidate.receiptDigest,
    'authorized human receipt is unjoined from candidate')
  assert.equal(authorizedHuman.targetDigest, candidate.targetDigest,
    'authorized human receipt target drifted')
  assert.equal(authorizedHuman.decisionKind, 'human', 'authorized human decision kind drifted')
  for (const field of ['humanActorId', 'decisionRef', 'authorityAdapterId']) {
    requireText(authorizedHuman[field], `authorized human ${field}`)
  }
  assert.equal(authorizedHuman.humanActorId, authorizationInteraction.humanActorId,
    'authorized human actor drifted from authorization interaction')
  assert.equal(authorizedHuman.interactionReceiptDigest, authorizationInteraction.receiptDigest,
    'authorized human receipt is unjoined from authorization interaction')
  requireDigest(authorizedHuman.releaseKey, 'authorized human releaseKey')
  assert.equal(authorizedHuman.releaseKey, digestValue({
    targetDigest: candidate.targetDigest, candidateDigest: candidate.receiptDigest,
  }), 'authorized human release key drifted')
  requireCanonicalInstant(authorizedHuman.issuedAt, 'authorized human issuedAt')
  requireCanonicalInstant(authorizedHuman.expiresAt, 'authorized human expiresAt')
  assert.equal(authorizedHuman.consumedAt, null, 'authorized human receipt was already consumed')
  requireChronology(authorizationInteraction.recordedAt, authorizedHuman.issuedAt,
    'authorized human receipt predates authorization interaction')
  requireChronology(authorizedHuman.issuedAt, authorizedHuman.expiresAt,
    'authorized human expiry predates issue')
  assert.equal(authorization.candidateDigest, candidate.receiptDigest, 'authorization is unjoined from candidate')
  assert.equal(authorization.targetDigest, candidate.targetDigest, 'authorization target drifted')
  assert.equal(authorization.decisionKind, 'human', 'authorization decision kind drifted')
  for (const field of ['humanActorId', 'decisionRef', 'authorityAdapterId', 'controllerId']) {
    requireText(authorization[field], `authorization ${field}`)
  }
  for (const field of ['interactionReceiptDigest', 'authorizationReceiptDigest']) {
    requireDigest(authorization[field], `authorization ${field}`)
  }
  requireDigest(authorization.releaseKey, 'authorization releaseKey')
  assert.equal(authorization.releaseKey, digestValue({
    targetDigest: candidate.targetDigest, candidateDigest: candidate.receiptDigest,
  }), 'authorization release key drifted')
  requireCanonicalInstant(authorization.issuedAt, 'authorization issuedAt')
  requireCanonicalInstant(authorization.consumedAt, 'authorization consumedAt')
  requireCanonicalInstant(authorization.expiresAt, 'authorization expiresAt')
  assert.equal(authorization.authorizationReceiptDigest, authorizedHuman.receiptDigest,
    'consumed authorization is unjoined from authorized human receipt')
  for (const field of [
    'candidateDigest', 'targetDigest', 'releaseKey', 'decisionKind', 'humanActorId', 'decisionRef',
    'authorityAdapterId', 'interactionReceiptDigest', 'issuedAt', 'expiresAt',
  ]) assert.equal(authorization[field], authorizedHuman[field],
    `consumed authorization ${field} drifted from authorized human receipt`)
  requireChronology(candidate.builtAt, authorization.issuedAt, 'authorization predates candidate')
  requireChronology(authorization.issuedAt, authorization.consumedAt, 'authorization consumption predates issue')
  requireChronology(authorization.consumedAt, authorization.expiresAt, 'authorization was consumed after expiry')
  assert.equal(deployment.consumedAuthorizationReceiptDigest, authorization.receiptDigest,
    'deployment is unjoined from consumed authorization')
  assert.equal(deployment.candidateDigest, candidate.receiptDigest, 'deployment candidate digest drifted')
  assert.equal(deployment.targetDigest, candidate.targetDigest, 'deployment target digest drifted')
  assert.equal(deployment.releaseKey, authorization.releaseKey, 'deployment release key drifted')
  assert.equal(deployment.controllerId, authorization.controllerId, 'deployment controller drifted')
  assert.equal(deployment.deployedArtifactDigest, candidate.artifactDigest, 'deployment artifact digest drifted')
  assert.equal(deployment.rollbackTargetDigest, candidate.rollbackTargetDigest, 'deployment rollback target drifted')
  requireText(deployment.deploymentAdapterId, 'deployment adapterId')
  requireText(deployment.immutableDeploymentId, 'deployment immutableDeploymentId')
  normalizeOrigin(deployment.immutableDeploymentOrigin)
  requireCanonicalInstant(deployment.deployedAt, 'deployment deployedAt')
  requireChronology(authorization.consumedAt, deployment.deployedAt, 'deployment predates authorization consumption')
  assert.equal(state.deploymentReceiptDigest, deployment.receiptDigest, 'state receipt is unjoined from deployment')
  assert.equal(state.candidateDigest, deployment.candidateDigest, 'state candidate digest drifted')
  assert.equal(state.targetDigest, deployment.targetDigest, 'state target digest drifted')
  assert.equal(state.controllerId, deployment.controllerId, 'state controller drifted')
  for (const field of ['stateContractDigest', 'operationsDigest', 'readbackDigest']) requireDigest(state[field], `state ${field}`)
  assert.equal(state.readbackAdapterId, 'cloudflare-wrangler-d1-direct-readback/v1')
  assert.equal(state.readbackKind, 'direct-authoritative')
  const expectedCounts = normalizeCounts(state.expectedCounts, 'state expectedCounts')
  const observedCounts = normalizeCounts(state.observedCounts, 'state observedCounts')
  assert.deepEqual(observedCounts, expectedCounts, 'state direct readback count parity drifted')
  assert.equal(state.pathHashParity, true, 'state path/hash parity drifted')
  assert.equal(state.contentParity, true, 'state content parity drifted')
  assert.ok(Number.isSafeInteger(state.operationCount) && state.operationCount >= 0)
  assert.ok(Number.isSafeInteger(state.operationLimit) && state.operationLimit >= state.operationCount)
  requireCanonicalInstant(state.reconciledAt, 'state reconciledAt')
  requireChronology(deployment.deployedAt, state.reconciledAt, 'state reconciliation predates deployment')
  return {
    preservation, disposition, integration, review, candidate, authorizationInteraction, authorizedHuman,
    authorization, deployment, state, releaseEvidence, predecessorRollbackIdentity,
  }
}
export const createForwardHealBaselineEvidence = ({
  lifecycle,
  failureObservation,
  failureDetail,
  failureDetailBytes,
  firstObservation,
  secondObservation,
}) => {
  const joined = validateForwardHealLifecycle(lifecycle)
  validateForwardHealFailure({ failureObservation, failureDetail, failureDetailBytes })
  requireChronology(joined.state.reconciledAt, failureObservation.observedAt,
    'failed release observation predates state reconciliation')
  const first = {
    pages: normalizeForwardHealPages(firstObservation.pages),
    state: normalizeForwardHealState(firstObservation.state),
    mirror: normalizeForwardHealMirror(firstObservation.mirror),
  }
  const second = {
    pages: normalizeForwardHealPages(secondObservation.pages),
    state: normalizeForwardHealState(secondObservation.state),
    mirror: normalizeForwardHealMirror(secondObservation.mirror),
  }
  const firstIdentity = substantiveForwardHealObservation(first)
  const secondIdentity = substantiveForwardHealObservation(second)
  assert.deepEqual(secondIdentity, firstIdentity, 'forward-heal provider observations changed between reads')
  requireChronology(failureObservation.observedAt, first.state.capturedAt,
    'first forward-heal D1 observation predates the failed release')
  requireChronology(first.state.capturedAt, first.mirror.observedAt,
    'first mirror observation predates its D1 capture')
  requireChronology(first.mirror.observedAt, second.state.capturedAt,
    'second forward-heal observation round overlaps the first')
  requireChronology(second.state.capturedAt, second.mirror.observedAt,
    'second mirror observation predates its D1 capture')
  assert.equal(second.pages.deploymentId, joined.deployment.immutableDeploymentId,
    'observed Pages deployment is not the failed authorized deployment')
  assert.equal(second.pages.deploymentOrigin, normalizeOrigin(joined.deployment.immutableDeploymentOrigin),
    'observed Pages origin drifted from the failed deployment receipt')
  assert.equal(second.pages.deployedAt, joined.deployment.deployedAt,
    'observed Pages deployment completion drifted from the failed deployment receipt')
  assert.equal(second.pages.deploymentCommitRevision, joined.integration.sourceRevision,
    'observed Pages commit drifted from the integrated source')
  assert.equal(second.pages.sourceRevision, joined.integration.sourceRevision,
    'observed Pages runtime drifted from the integrated source')
  assert.equal(second.state.stateContractDigest, joined.state.stateContractDigest,
    'observed D1 state contract drifted from the reconciled state receipt')
  assert.equal(second.state.readbackDigest, joined.state.readbackDigest,
    'observed D1 readback drifted from the reconciled state receipt')
  assert.deepEqual(second.state.observedCounts, joined.state.observedCounts,
    'observed D1 counts drifted from the reconciled state receipt')
  assert.equal(second.mirror.repository, joined.predecessorRollbackIdentity.mirror.repository,
    'observed mirror repository drifted from the predecessor release evidence')
  assert.equal(second.mirror.revision, joined.predecessorRollbackIdentity.mirror.revision,
    'observed mirror revision drifted from the predecessor release evidence')
  assert.notEqual(second.pages.sourceRevision, second.mirror.sourceRevision,
    'forward-heal evidence requires an explicit Pages/mirror source split')
  assert.equal(second.mirror.sourceRevision, joined.predecessorRollbackIdentity.pages.sourceRevision,
    'observed mirror sourceRevision drifted from the predecessor rollback Pages sourceRevision')
  const rollbackIdentity = normalizeForwardHealRollbackIdentity({
    schema: ROLLBACK_IDENTITY_SCHEMA,
    pages: {
      deploymentId: second.pages.deploymentId,
      deploymentOrigin: second.pages.deploymentOrigin,
      deploymentCommitRevision: second.pages.deploymentCommitRevision,
      sourceRevision: second.pages.sourceRevision,
    },
    mirror: { repository: second.mirror.repository, revision: second.mirror.revision },
    d1: {
      stateContractDigest: second.state.stateContractDigest,
      readbackDigest: second.state.readbackDigest,
      counts: second.state.observedCounts,
    },
  })
  const rollbackRecapture = {
    schema: ROLLBACK_RECAPTURE_SCHEMA,
    rollbackIdentity,
    capturedAt: second.mirror.observedAt,
  }
  const observationRounds = [first, second].map(round => {
    const identity = substantiveForwardHealObservation(round)
    return {
      pagesIdentityDigest: digestValue(identity.pages),
      stateIdentityDigest: digestValue(identity.state),
      mirrorIdentityDigest: digestValue(identity.mirror),
      stateCapturedAt: round.state.capturedAt,
      mirrorObservedAt: round.mirror.observedAt,
    }
  })
  const attestationBody = {
    schema: FORWARD_HEAL_ATTESTATION_SCHEMA,
    status: 'forward-heal-required',
    effect: 'evidence-only',
    rollbackDisposition: 'preserve-current-on-failure',
    observationClock: 'd1-capture-and-mirror-observation/v1',
    failedRelease: {
      sourceRevision: joined.integration.sourceRevision,
      integrationReceiptDigest: joined.integration.receiptDigest,
      runtimeReviewReceiptDigest: joined.review.receiptDigest,
      candidateManifestDigest: joined.candidate.receiptDigest,
      consumedAuthorizationReceiptDigest: joined.authorization.receiptDigest,
      deploymentReceiptDigest: joined.deployment.receiptDigest,
      stateReconciliationReceiptDigest: joined.state.receiptDigest,
      failureObservationDigest: digestValue(failureObservation),
      failureDetailDigest: failureObservation.messageDigest,
      predecessorRollbackTargetDigest: joined.releaseEvidence.rollbackTargetDigest,
    },
    baseline: secondIdentity,
    observationRounds,
    rollbackRecapture,
    rollbackTargetDigest: digestValue(rollbackIdentity),
    capturedAt: first.state.capturedAt,
    observedAt: second.mirror.observedAt,
  }
  return {
    attestation: { ...attestationBody, attestationDigest: digestValue(attestationBody) },
    rollbackRecapture,
  }
}
