import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { validateLocalReviewCandidate } from './production-release-authorization.mjs'
import {
  canonicalJson,
  createLiveEvidenceInput,
  createProductionCompleteCarrier,
  createRollbackEvidenceInput,
  createRolledBackCarrier,
  digest,
  materializeReleaseEvidence,
  normalizeD1ReconciliationEvidence,
  normalizeReleaseEvidence,
  normalizeRollbackRecapture,
  parseWranglerPagesDeployment,
  readEvidenceBytes,
  readProductionCompleteReceipts,
  readRolledBackReceipts,
  validateTerminalCarrier,
} from './lib/production-release-lifecycle-evidence.mjs'
import {
  parseTerminalAuthorizationComment,
  validateProductionCandidateLink,
} from './production-terminal-authorization.mjs'
const CONTRACT_MODULE = 'scripts/collaborative-release-lifecycle-contract.mjs', [V1_SCHEMA, V2_SCHEMA] = ['docs/schemas/collaborative-release-lifecycle.v1.schema.json', 'docs/schemas/collaborative-release-lifecycle.v2.schema.json'], [HUMAN_AUTHORIZATION_TTL_MS, RUNTIME_REVIEW_TTL_MS] = [30 * 60 * 1000, 24 * 60 * 60 * 1000]
const stringOptions = names => Object.fromEntries(names.map(name => [name, { type: 'string' }]))
export { digest }
export const selectProductionApproval = approvals => {
  if (!Array.isArray(approvals)) throw new Error('workflow approval history must be an array')
  const matches = approvals.filter(approval => (
    approval?.state === 'approved'
      && approval?.user?.type === 'User'
      && typeof approval.user.login === 'string'
      && approval.user.login.trim()
      && Number.isSafeInteger(approval.user.id)
      && approval.environments?.some(environment => environment?.name === 'production')
  ))
  if (matches.length !== 1) {
    throw new Error(`production release requires exactly one authenticated human approval; found ${matches.length}`)
  }
  return matches[0]
}
export const createLifecycleCandidate = ({
  contract,
  localReview,
  readiness,
  releaseEvidence,
  sourceRevision,
  sourceTree,
  agenticCanvasOsRevision,
  agenticCanvasOsTree,
  guidelineRevision,
  mirrorRevision,
  collaboration,
  integratedAt,
  issuedAt,
  targetId,
}) => {
  validateLocalReviewCandidate(localReview)
  requireSha(sourceRevision, 'source revision')
  requireSha(sourceTree, 'source tree')
  requireSha(agenticCanvasOsRevision, 'Agentic Canvas OS revision')
  requireSha(agenticCanvasOsTree, 'Agentic Canvas OS tree')
  requireSha(guidelineRevision, 'guideline revision')
  requireSha(mirrorRevision, 'production mirror revision')
  requireInstant(integratedAt, 'integration time')
  requireInstant(issuedAt, 'runtime review issue time')
  requireText(targetId, 'target identity')
  requireIdentity(localReview.source, sourceRevision, sourceTree, 'source')
  requireIdentity(
    localReview.agenticCanvasOs,
    agenticCanvasOsRevision,
    agenticCanvasOsTree,
    'Agentic Canvas OS',
  )
  if (readiness?.source?.revision !== sourceRevision
      || readiness?.source?.tree !== sourceTree
      || readiness?.agenticCanvasOs?.revision !== agenticCanvasOsRevision
      || readiness?.artifact?.algorithm !== 'sha256'
      || readiness?.immutableManifest?.algorithm !== 'sha256') {
    throw new Error('production readiness drifted from the reviewed candidate')
  }
  const frontier = normalizeReleaseEvidence(releaseEvidence, {
    repository: localReview.source.repository,
    sourceRevision,
  })
  if (frontier.rollbackIdentity.mirror.revision !== mirrorRevision) {
    throw new Error('rollback mirror revision drifted from the exact pre-dispatch checkout')
  }
  if (Date.parse(integratedAt) < Date.parse(frontier.observedAt)) {
    throw new Error('integration time cannot predate the authoritative release-frontier observation')
  }
  if (Date.parse(issuedAt) < Date.parse(integratedAt)) {
    throw new Error('runtime review cannot predate release-frontier integration')
  }
  const preservation = contract.createOverlapPreservationReceipt({
    convergenceBaseDigest: frontier.convergenceBaseDigest,
    protectedTipDigest: frontier.protectedTipDigest,
    captureAdapterId: frontier.captureAdapterId,
    entries: frontier.entries,
    capturedAt: frontier.capturedAt,
  })
  const disposition = contract.createOverlapDispositionReceipt(preservation, {
    preservationReceiptDigest: preservation.receiptDigest,
    convergenceBaseDigest: frontier.convergenceBaseDigest,
    protectedTipDigest: frontier.protectedTipDigest,
    observations: frontier.observations,
    observedAt: frontier.observedAt,
  })
  const dependencyClosureDigest = digest({
    agenticCanvasOs: localReview.agenticCanvasOs,
    catalogRevision: localReview.catalogRevision,
    guideline: {
      repository: 'huijoohwee/huijoohwee.github.io',
      revision: guidelineRevision,
    },
    releaseEvidenceDigest: digest(frontier),
    inventoryDigest: frontier.inventoryDigest,
    successorWriteSetDigest: frontier.successorWriteSetDigest,
    sourceEvidenceRefs: frontier.sourceEvidenceRefs,
    rollbackTargetDigest: frontier.rollbackTargetDigest,
    rollbackCapturedAt: frontier.rollbackCapturedAt,
  })
  const integration = contract.createIntegrationReceipt(preservation, disposition, {
    sourceRevision,
    sourceDigest: digest(localReview.source),
    dependencyClosureDigest,
    checksDigest: localReview.runtimeEvidenceDigest,
    evaluatorId: 'github:protected-integration-gate',
    collaboration,
    integrationTargetDigest: digest({
      repository: localReview.source.repository,
      ref: 'refs/heads/main',
    }),
    integratedAt,
  })
  const review = contract.createRuntimeReviewReceipt(integration, {
    reviewSurfaceDigest: localReview.runtimeEvidenceDigest,
    policyDigest: digest({
      guideline: {
        repository: 'huijoohwee/huijoohwee.github.io',
        revision: guidelineRevision,
      },
      runtimeSystem: {
        repository: localReview.agenticCanvasOs.repository,
        revision: agenticCanvasOsRevision,
        tree: agenticCanvasOsTree,
      },
    }),
    probesDigest: localReview.runtimeEvidenceDigest,
    reviewerId: `localhost:turn-end:${localReview.candidateDigest}`,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + RUNTIME_REVIEW_TTL_MS).toISOString(),
  })
  const candidate = contract.createCandidateManifest(review, {
    targetDigest: digest({ adapter: 'cloudflare-pages', targetId }),
    artifactDigest: readiness.artifact.digest,
    manifestDigest: readiness.immutableManifest.digest,
    rollbackTargetDigest: frontier.rollbackTargetDigest,
    builtAt: issuedAt,
  })
  return { preservation, disposition, integration, review, candidate, releaseEvidence: frontier }
}
export const createLifecycleAuthorization = ({
  contract,
  integration,
  review,
  candidate,
  releaseCandidate,
  localReview,
  approvals,
  repository,
  runId,
  serverUrl,
  controllerId,
  issuedAt,
}) => {
  const approval = selectProductionApproval(approvals)
  requireText(repository, 'GitHub repository')
  requireText(runId, 'GitHub run ID')
  requireText(serverUrl, 'GitHub server URL')
  requireText(controllerId, 'release controller ID')
  requireInstant(issuedAt, 'human authorization issue time')
  const humanActorId = `github-user:${approval.user.id}:${approval.user.login}`
  const terminalEvidence = parseTerminalAuthorizationComment(approval.comment)
  validateProductionCandidateLink({
    sourceRevision: integration.sourceRevision,
    localReview,
    releaseCandidate,
    lifecycleCandidate: candidate,
  })
  if (terminalEvidence.repository !== repository
      || terminalEvidence.runId !== String(runId)
      || terminalEvidence.sourceRevision !== integration.sourceRevision
      || terminalEvidence.candidateDigest !== releaseCandidate.candidateDigest
      || terminalEvidence.lifecycleCandidateDigest !== candidate.receiptDigest
      || terminalEvidence.targetDigest !== candidate.targetDigest
      || terminalEvidence.humanActorId !== humanActorId) {
    throw new Error('terminal authorization interaction drifted from the protected release candidate')
  }
  const interaction = contract.createAuthorizationInteractionReceipt(candidate, {
    humanActorId,
    interactionAdapterId: terminalEvidence.interactionAdapterId,
    transportClass: terminalEvidence.transportClass,
    browserRequired: terminalEvidence.browserRequired,
    challengeDigest: terminalEvidence.challengeDigest,
    responseDigest: terminalEvidence.responseDigest,
    recordedAt: terminalEvidence.recordedAt,
  })
  const authorization = contract.createHumanAuthorizationReceipt(candidate, interaction, {
    decisionKind: 'human',
    humanActorId,
    decisionRef: `${serverUrl}/${repository}/actions/runs/${runId}#environment-production`,
    authorityAdapterId: 'github-actions-protected-environment/v1',
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + HUMAN_AUTHORIZATION_TTL_MS).toISOString(),
  })
  contract.validateAuthorizedDeployment({
    integration,
    review,
    candidate,
    authorization,
    current: deploymentIdentity({ integration, review, candidate, authorization }),
    now: issuedAt,
  })
  const dispatch = contract.dispatchReleaseController({}, {
    targetDigest: candidate.targetDigest,
    candidateDigest: candidate.receiptDigest,
    controllerId,
  })
  if (dispatch.status !== 'claimed' || dispatch.ownerControllerId !== controllerId) {
    throw new Error('release controller did not acquire the target fence')
  }
  const consumedAuthorization = contract.consumeHumanAuthorizationReceipt(authorization, {
    consumedAt: issuedAt,
    controllerId,
  })
  return { interaction, authorization, consumedAuthorization, dispatch }
}
export const createLifecycleDeployment = ({
  contract,
  candidate,
  consumedAuthorization,
  releaseEvidence,
  wranglerOutput,
  deploymentCapture,
  rollbackRecapture,
}) => {
  const frontier = normalizeReleaseEvidence(releaseEvidence)
  const recapture = normalizeRollbackRecapture(rollbackRecapture)
  if (digest(recapture.rollbackIdentity) !== frontier.rollbackTargetDigest
      || canonicalJson(recapture.rollbackIdentity) !== canonicalJson(frontier.rollbackIdentity)) {
    throw new Error('pre-dispatch rollback identity drifted before deployment')
  }
  const parsed = parseWranglerPagesDeployment({
    bytes: wranglerOutput,
    deploymentCapture,
    sourceRevision: frontier.sourceRevision,
  })
  if (Date.parse(recapture.capturedAt) < Date.parse(frontier.rollbackCapturedAt)
      || Date.parse(recapture.capturedAt) > Date.parse(parsed.deployedAt)) {
    throw new Error('rollback recapture is outside the pre-deployment evidence window')
  }
  return contract.createDeploymentReceipt(candidate, consumedAuthorization, {
    ...parsed,
    deployedArtifactDigest: candidate.artifactDigest,
    rollbackTargetDigest: frontier.rollbackTargetDigest,
  })
}
export const createLifecycleState = ({ contract, deployment, stateEvidence }) => {
  const evidence = normalizeD1ReconciliationEvidence(stateEvidence)
  const { schema: _schema, workspaceId: _workspaceId, ...receiptInput } = evidence
  return contract.createStateReconciliationReceipt(deployment, receiptInput)
}
export const createLifecycleLive = ({ contract, deployment, state, ...evidence }) => (
  contract.createLiveVerificationReceiptV2(
    deployment,
    state,
    createLiveEvidenceInput({ deployment, state, ...evidence }),
  )
)
export const createLifecyclePublication = ({ contract, live, repository, revision, publishedAt }) => {
  requireText(repository, 'publication repository')
  requireSha(revision, 'publication revision')
  requireInstant(publishedAt, 'publication time')
  return contract.createPublicationReceiptV2(live, {
    publicationIdentitiesDigest: digest({
      repository,
      revision,
      candidateDigest: live.candidateDigest,
      liveVerificationReceiptDigest: live.receiptDigest,
    }),
    publishedAt,
  })
}
export const createLifecycleRollback = ({ contract, deployment, ...evidence }) => (
  contract.createRollbackReceipt(deployment, createRollbackEvidenceInput(evidence))
)
const main = async () => {
  const [command, ...argumentsList] = process.argv.slice(2)
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      ...stringOptions([
        'docs-root', 'controller-root', 'repository-root', 'dormant-admission-journal', 'frontier-inventory',
        'successor-manifest', 'rollback-recapture', 'docs-sha', 'local-review', 'readiness', 'release-evidence',
        'source-sha', 'source-tree', 'docs-tree', 'guideline-sha', 'mirror-revision', 'actor-id', 'device-id',
        'session-id', 'worktree-id', 'branch-id', 'scope-id', 'lease-epoch', 'fence-revision', 'integrated-at',
        'issued-at', 'target-id', 'approvals', 'repository', 'run-id', 'server-url', 'controller-id',
        'candidate-digest', 'release-candidate', 'receipt-dir', 'output-dir', 'wrangler-output',
        'deployment-capture', 'previous-deployment', 'state-evidence', 'immutable-origin-smoke',
        'public-route-probes', 'browser-fidelity', 'client-cache-convergence', 'marker-parity',
        'publication-revision', 'publication-target', 'failure-observation', 'restored-pages', 'restored-state',
        'restored-transports', 'observed-mirror', 'completion', 'carrier', 'output',
      ]),
      'source-evidence-ref': { type: 'string', multiple: true },
      'github-output': { type: 'boolean' },
    },
    strict: true,
  })
  if (command === 'materialize-evidence') {
    const output = path.resolve(required(values.output, '--output'))
    const evidence = await materializeReleaseEvidence({
      repository: required(values['repository-root'], '--repository-root'),
      controllerRoot: required(values['controller-root'], '--controller-root'),
      journalBytes: readEvidenceBytes(required(values['dormant-admission-journal'], '--dormant-admission-journal')),
      inventoryBytes: readEvidenceBytes(required(values['frontier-inventory'], '--frontier-inventory')),
      manifestBytes: readEvidenceBytes(required(values['successor-manifest'], '--successor-manifest')),
      rollbackBytes: readEvidenceBytes(required(values['rollback-recapture'], '--rollback-recapture')),
      sourceRevision: required(values['source-sha'], '--source-sha'),
      sourceTree: required(values['source-tree'], '--source-tree'),
      sourceEvidenceRefs: sourceEvidenceRefsFrom(values['source-evidence-ref']),
    })
    writeJson(output, evidence)
    writeGitHubOutput(values['github-output'], 'release_evidence_digest', digest(evidence))
    return
  }
  const contract = await loadContract(values['docs-root'], values['docs-sha'])
  const outputDir = values['output-dir'] ? path.resolve(values['output-dir']) : null
  if (outputDir) fs.mkdirSync(outputDir, { recursive: true })
  if (command === 'create') {
    requireOutputDir(outputDir)
    const result = createLifecycleCandidate({
      contract,
      localReview: readJson(required(values['local-review'], '--local-review')),
      readiness: readJson(required(values.readiness, '--readiness')),
      releaseEvidence: readJson(required(values['release-evidence'], '--release-evidence')),
      sourceRevision: required(values['source-sha'], '--source-sha'),
      sourceTree: required(values['source-tree'], '--source-tree'),
      agenticCanvasOsRevision: required(values['docs-sha'], '--docs-sha'),
      agenticCanvasOsTree: required(values['docs-tree'], '--docs-tree'),
      guidelineRevision: required(values['guideline-sha'], '--guideline-sha'),
      mirrorRevision: required(values['mirror-revision'], '--mirror-revision'),
      collaboration: collaborationFrom(values),
      integratedAt: required(values['integrated-at'], '--integrated-at'),
      issuedAt: required(values['issued-at'], '--issued-at'),
      targetId: required(values['target-id'], '--target-id'),
    })
    writeJson(path.join(outputDir, 'release-evidence.json'), result.releaseEvidence)
    writeJson(path.join(outputDir, 'overlap-preservation-receipt.json'), result.preservation)
    writeJson(path.join(outputDir, 'overlap-disposition-receipt.json'), result.disposition)
    writeJson(path.join(outputDir, 'integration-receipt.json'), result.integration)
    writeJson(path.join(outputDir, 'runtime-review-receipt.json'), result.review)
    writeJson(path.join(outputDir, 'candidate-manifest.json'), result.candidate)
    writeGitHubOutput(values['github-output'], 'candidate_digest', result.candidate.receiptDigest)
    return
  }
  if (command === 'validate') {
    const carrier = readJson(required(values.carrier, '--carrier'))
    validateTerminalCarrier({
      contract,
      schemas: loadLifecycleSchemas(values['docs-root']),
      Ajv2020: loadAjv2020(),
      carrier,
    })
    return
  }
  const receiptDir = path.resolve(required(values['receipt-dir'], '--receipt-dir'))
  if (command === 'authorize') {
    requireOutputDir(outputDir)
    const integration = readReceipt(receiptDir, 'integration-receipt.json')
    const review = readReceipt(receiptDir, 'runtime-review-receipt.json')
    const candidate = readReceipt(receiptDir, 'candidate-manifest.json')
    if (candidate.receiptDigest !== required(values['candidate-digest'], '--candidate-digest')) {
      throw new Error('protected environment authorization drifted from the prepared candidate digest')
    }
    const result = createLifecycleAuthorization({
      contract,
      integration,
      review,
      candidate,
      releaseCandidate: readJson(required(values['release-candidate'], '--release-candidate')),
      localReview: readJson(required(values['local-review'], '--local-review')),
      approvals: readJson(required(values.approvals, '--approvals')),
      repository: required(values.repository, '--repository'),
      runId: required(values['run-id'], '--run-id'),
      serverUrl: required(values['server-url'], '--server-url'),
      controllerId: required(values['controller-id'], '--controller-id'),
      issuedAt: required(values['issued-at'], '--issued-at'),
    })
    writeJson(path.join(outputDir, 'authorization-interaction-receipt.json'), result.interaction)
    writeJson(path.join(outputDir, 'human-authorization-receipt.json'), result.authorization)
    writeJson(path.join(outputDir, 'consumed-human-authorization-receipt.json'), result.consumedAuthorization)
    writeJson(path.join(outputDir, 'release-controller-claim.json'), result.dispatch)
    return
  }
  if (command === 'deployment' || command === 'deploy') {
    requireOutputDir(outputDir)
    const deployment = createLifecycleDeployment({
      contract,
      candidate: readReceipt(receiptDir, 'candidate-manifest.json'),
      consumedAuthorization: readReceipt(receiptDir, 'consumed-human-authorization-receipt.json'),
      releaseEvidence: readReceipt(receiptDir, 'release-evidence.json'),
      wranglerOutput: readEvidenceBytes(required(values['wrangler-output'], '--wrangler-output')),
      deploymentCapture: readJson(required(values['deployment-capture'], '--deployment-capture')),
      rollbackRecapture: readJson(required(values['previous-deployment'], '--previous-deployment')),
    })
    writeJson(path.join(outputDir, 'deployment-receipt.json'), deployment)
    return
  }
  if (command === 'state') {
    requireOutputDir(outputDir)
    const state = createLifecycleState({
      contract,
      deployment: readReceipt(receiptDir, 'deployment-receipt.json'),
      stateEvidence: readJson(required(values['state-evidence'], '--state-evidence')),
    })
    const issuedAt = required(values['issued-at'], '--issued-at')
    if (state.reconciledAt !== issuedAt) throw new Error('--issued-at must equal D1 evidence reconciledAt')
    writeJson(path.join(outputDir, 'state-reconciliation-receipt.json'), state)
    return
  }
  if (command === 'live') {
    requireOutputDir(outputDir)
    const live = createLifecycleLive({
      contract,
      deployment: readReceipt(receiptDir, 'deployment-receipt.json'),
      state: readReceipt(receiptDir, 'state-reconciliation-receipt.json'),
      sourceRevision: required(values['source-sha'], '--source-sha'),
      immutableOriginSmoke: readEvidenceBytes(required(values['immutable-origin-smoke'], '--immutable-origin-smoke')),
      publicRouteProbes: readEvidenceBytes(required(values['public-route-probes'], '--public-route-probes')),
      browserFidelity: readEvidenceBytes(required(values['browser-fidelity'], '--browser-fidelity')),
      clientCacheConvergence: readEvidenceBytes(required(values['client-cache-convergence'], '--client-cache-convergence')),
      markerParity: readEvidenceBytes(required(values['marker-parity'], '--marker-parity')),
      verifiedAt: required(values['issued-at'], '--issued-at'),
    })
    writeJson(path.join(outputDir, 'live-verification-receipt-v2.json'), live)
    return
  }
  if (command === 'publish') {
    requireOutputDir(outputDir)
    const publication = createLifecyclePublication({
      contract,
      live: readReceipt(receiptDir, 'live-verification-receipt-v2.json'),
      revision: required(values['publication-revision'], '--publication-revision'),
      repository: required(values['publication-target'], '--publication-target'),
      publishedAt: required(values['issued-at'], '--issued-at'),
    })
    writeJson(path.join(outputDir, 'publication-receipt-v2.json'), publication)
    return
  }
  if (command === 'rollback') {
    requireOutputDir(outputDir)
    const rollback = createLifecycleRollback({
      contract,
      deployment: readReceipt(receiptDir, 'deployment-receipt.json'),
      releaseEvidence: readReceipt(receiptDir, 'release-evidence.json'),
      failureObservation: readJson(required(values['failure-observation'], '--failure-observation')),
      restoredPages: readJson(required(values['restored-pages'], '--restored-pages')),
      restoredState: readJson(required(values['restored-state'], '--restored-state')),
      restoredTransports: readJson(required(values['restored-transports'], '--restored-transports')),
      observedMirror: readJson(required(values['observed-mirror'], '--observed-mirror')),
      rolledBackAt: required(values['issued-at'], '--issued-at'),
    })
    writeJson(path.join(outputDir, 'rollback-receipt.json'), rollback)
    return
  }
  if (command === 'carrier') {
    const output = path.resolve(required(values.output, '--output'))
    const completion = values.completion || 'production-complete'
    const carrierFactory = completion === 'rolled-back' ? createRolledBackCarrier : createProductionCompleteCarrier
    const carrier = carrierFactory({
      contract,
      schemas: loadLifecycleSchemas(values['docs-root']),
      Ajv2020: loadAjv2020(),
      receipts: completion === 'rolled-back' ? readRolledBackReceipts(receiptDir) : readProductionCompleteReceipts(receiptDir),
    })
    writeJson(output, carrier)
    writeGitHubOutput(values['github-output'], 'carrier_path', output)
    writeGitHubOutput(values['github-output'], 'publication_receipt_digest', carrier.receipts.at(-1).receiptDigest)
    return
  }
  throw new Error('command must be materialize-evidence, create, authorize, deployment, state, live, publish, rollback, carrier, or validate')
}
const loadContract = async (docsRootValue, expectedRevisionValue) => {
  const docsRoot = path.resolve(required(docsRootValue, '--docs-root'))
  const expectedRevision = required(expectedRevisionValue, '--docs-sha')
  requireSha(expectedRevision, 'Agentic Canvas OS revision')
  const repositoryRoot = path.dirname(docsRoot)
  const actualRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).trim()
  if (actualRevision !== expectedRevision) {
    throw new Error(`Agentic Canvas OS contract drift: expected ${expectedRevision}, received ${actualRevision}`)
  }
  return import(pathToFileURL(path.join(repositoryRoot, CONTRACT_MODULE)).href)
}
const loadLifecycleSchemas = docsRootValue => {
  const repositoryRoot = path.dirname(path.resolve(required(docsRootValue, '--docs-root')))
  return {
    v1: readJson(path.join(repositoryRoot, V1_SCHEMA)),
    v2: readJson(path.join(repositoryRoot, V2_SCHEMA)),
  }
}
const loadAjv2020 = () => {
  const require = createRequire(import.meta.url)
  const module = require('ajv/dist/2020.js')
  return module.default || module
}
const deploymentIdentity = ({ integration, review, candidate, authorization }) => ({
  preservationReceiptDigest: integration.preservationReceiptDigest,
  overlapDispositionReceiptDigest: integration.overlapDispositionReceiptDigest,
  integrationReceiptDigest: integration.receiptDigest,
  runtimeReviewReceiptDigest: review.receiptDigest,
  candidateDigest: candidate.receiptDigest,
  authorizationReceiptDigest: authorization.receiptDigest,
  sourceDigest: candidate.sourceDigest,
  dependencyClosureDigest: candidate.dependencyClosureDigest,
  policyDigest: candidate.policyDigest,
  targetDigest: candidate.targetDigest,
  artifactDigest: candidate.artifactDigest,
  manifestDigest: candidate.manifestDigest,
})
const collaborationFrom = values => ({
  actorId: required(values['actor-id'], '--actor-id'),
  deviceId: required(values['device-id'], '--device-id'),
  sessionId: required(values['session-id'], '--session-id'),
  worktreeId: required(values['worktree-id'], '--worktree-id'),
  branchId: required(values['branch-id'], '--branch-id'),
  scopeId: required(values['scope-id'], '--scope-id'),
  leaseEpoch: positiveInteger(values['lease-epoch'], '--lease-epoch'),
  fenceRevision: required(values['fence-revision'], '--fence-revision'),
})
const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
const readReceipt = (receiptDir, fileName) => readJson(path.join(receiptDir, fileName))
const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
  fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}
const writeGitHubOutput = (enabled, name, value) => {
  if (!enabled) return
  const outputPath = required(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT')
  fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8')
}
const sourceEvidenceRefsFrom = values => (values || []).map(value => {
  const separator = value.indexOf('=')
  if (separator < 1) throw new Error('--source-evidence-ref must be kind=/absolute/path')
  const kind = value.slice(0, separator), filePath = path.resolve(value.slice(separator + 1))
  requireText(kind, 'source evidence kind')
  return { kind, digest: digest(fs.readFileSync(filePath)) }
})
const requireOutputDir = value => { if (!value) throw new Error('--output-dir is required') }
const required = (value, label) => {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}
const positiveInteger = (value, label) => {
  const number = Number(required(value, label))
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${label} must be a positive integer`)
  return number
}
const requireSha = (value, label) => { if (!/^[0-9a-f]{40}$/.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`) }
const requireText = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`) }
const requireInstant = (value, label) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (Number.isNaN(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${label} must be an ISO timestamp`)
}
const requireIdentity = (identity, revision, tree, label) => {
  if (identity?.revision !== revision || identity?.tree !== tree) {
    throw new Error(`${label} identity drifted from localhost review`)
  }
}
if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) await main()
