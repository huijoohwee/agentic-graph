import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

import { validateLocalReviewCandidate } from './production-release-authorization.mjs'
import {
  parseTerminalAuthorizationComment,
  validateProductionCandidateLink,
} from './production-terminal-authorization.mjs'

const CONTRACT_MODULE = 'scripts/collaborative-release-lifecycle-contract.mjs'
const HUMAN_AUTHORIZATION_TTL_MS = 30 * 60 * 1000
const RUNTIME_REVIEW_TTL_MS = 24 * 60 * 60 * 1000

export const digest = value => createHash('sha256').update(
  typeof value === 'string' ? value : canonicalJson(value),
).digest('hex')

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
  if (readiness?.source?.revision !== sourceRevision ||
      readiness?.source?.tree !== sourceTree ||
      readiness?.agenticCanvasOs?.revision !== agenticCanvasOsRevision ||
      readiness?.artifact?.algorithm !== 'sha256' ||
      readiness?.immutableManifest?.algorithm !== 'sha256') {
    throw new Error('production readiness drifted from the reviewed candidate')
  }

  const convergenceBaseDigest = digest({
    sourceRevision,
    sourceTree,
    integrationTarget: 'refs/heads/main',
  })
  const protectedTipDigest = digest({
    sourceRevision,
    sourceTree,
  })
  const preservation = contract.createOverlapPreservationReceipt({
    convergenceBaseDigest,
    protectedTipDigest,
    captureAdapterId: 'github-actions-clean-workspace/v1',
    entries: [],
    capturedAt: integratedAt,
  })
  const disposition = contract.createOverlapDispositionReceipt(preservation, {
    preservationReceiptDigest: preservation.receiptDigest,
    convergenceBaseDigest,
    protectedTipDigest,
    observations: [],
    observedAt: integratedAt,
  })
  const integration = contract.createIntegrationReceipt(preservation, disposition, {
    sourceRevision,
    sourceDigest: digest(localReview.source),
    dependencyClosureDigest: digest({
      agenticCanvasOs: localReview.agenticCanvasOs,
      catalogRevision: localReview.catalogRevision,
      guideline: {
        repository: 'huijoohwee/huijoohwee.github.io',
        revision: guidelineRevision,
      },
    }),
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
    rollbackTargetDigest: digest({
      repository: readiness.mirror?.repository,
      revision: mirrorRevision,
    }),
    builtAt: issuedAt,
  })
  return { preservation, disposition, integration, review, candidate }
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
  if (terminalEvidence.repository !== repository ||
      terminalEvidence.runId !== String(runId) ||
      terminalEvidence.sourceRevision !== integration.sourceRevision ||
      terminalEvidence.candidateDigest !== releaseCandidate.candidateDigest ||
      terminalEvidence.lifecycleCandidateDigest !== candidate.receiptDigest ||
      terminalEvidence.targetDigest !== candidate.targetDigest ||
      terminalEvidence.humanActorId !== humanActorId) {
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

const main = async () => {
  const [command, ...argumentsList] = process.argv.slice(2)
  const { values } = parseArgs({
    args: argumentsList,
    options: {
      'docs-root': { type: 'string' },
      'docs-sha': { type: 'string' },
      'local-review': { type: 'string' },
      readiness: { type: 'string' },
      'source-sha': { type: 'string' },
      'source-tree': { type: 'string' },
      'docs-tree': { type: 'string' },
      'guideline-sha': { type: 'string' },
      'mirror-revision': { type: 'string' },
      'actor-id': { type: 'string' },
      'device-id': { type: 'string' },
      'session-id': { type: 'string' },
      'worktree-id': { type: 'string' },
      'branch-id': { type: 'string' },
      'scope-id': { type: 'string' },
      'lease-epoch': { type: 'string' },
      'fence-revision': { type: 'string' },
      'integrated-at': { type: 'string' },
      'issued-at': { type: 'string' },
      'target-id': { type: 'string' },
      approvals: { type: 'string' },
      repository: { type: 'string' },
      'run-id': { type: 'string' },
      'server-url': { type: 'string' },
      'controller-id': { type: 'string' },
      'candidate-digest': { type: 'string' },
      'release-candidate': { type: 'string' },
      'receipt-dir': { type: 'string' },
      'output-dir': { type: 'string' },
      'probe-evidence': { type: 'string' },
      'deployment-url': { type: 'string' },
      'publication-revision': { type: 'string' },
      'publication-target': { type: 'string' },
      'github-output': { type: 'boolean' },
    },
    strict: true,
  })
  const contract = await loadContract(values['docs-root'], values['docs-sha'])
  const outputDir = path.resolve(required(values['output-dir'], '--output-dir'))
  fs.mkdirSync(outputDir, { recursive: true })

  if (command === 'create') {
    const localReview = readJson(required(values['local-review'], '--local-review'))
    const readiness = readJson(required(values.readiness, '--readiness'))
    const result = createLifecycleCandidate({
      contract,
      localReview,
      readiness,
      sourceRevision: required(values['source-sha'], '--source-sha'),
      sourceTree: required(values['source-tree'], '--source-tree'),
      agenticCanvasOsRevision: required(values['docs-sha'], '--docs-sha'),
      agenticCanvasOsTree: required(values['docs-tree'], '--docs-tree'),
      guidelineRevision: required(values['guideline-sha'], '--guideline-sha'),
      mirrorRevision: required(values['mirror-revision'], '--mirror-revision'),
      collaboration: {
        actorId: required(values['actor-id'], '--actor-id'),
        deviceId: required(values['device-id'], '--device-id'),
        sessionId: required(values['session-id'], '--session-id'),
        worktreeId: required(values['worktree-id'], '--worktree-id'),
        branchId: required(values['branch-id'], '--branch-id'),
        scopeId: required(values['scope-id'], '--scope-id'),
        leaseEpoch: positiveInteger(values['lease-epoch'], '--lease-epoch'),
        fenceRevision: required(values['fence-revision'], '--fence-revision'),
      },
      integratedAt: required(values['integrated-at'], '--integrated-at'),
      issuedAt: required(values['issued-at'], '--issued-at'),
      targetId: required(values['target-id'], '--target-id'),
    })
    writeJson(path.join(outputDir, 'overlap-preservation-receipt.json'), result.preservation)
    writeJson(path.join(outputDir, 'overlap-disposition-receipt.json'), result.disposition)
    writeJson(path.join(outputDir, 'integration-receipt.json'), result.integration)
    writeJson(path.join(outputDir, 'runtime-review-receipt.json'), result.review)
    writeJson(path.join(outputDir, 'candidate-manifest.json'), result.candidate)
    writeGitHubOutput(values['github-output'], 'candidate_digest', result.candidate.receiptDigest)
    return
  }

  const receiptDir = path.resolve(required(values['receipt-dir'], '--receipt-dir'))
  if (command === 'authorize') {
    const integration = readJson(path.join(receiptDir, 'integration-receipt.json'))
    const review = readJson(path.join(receiptDir, 'runtime-review-receipt.json'))
    const candidate = readJson(path.join(receiptDir, 'candidate-manifest.json'))
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

  if (command === 'live') {
    const candidate = readJson(path.join(receiptDir, 'candidate-manifest.json'))
    const consumed = readJson(path.join(receiptDir, 'consumed-human-authorization-receipt.json'))
    const probeEvidence = fs.readFileSync(path.resolve(required(values['probe-evidence'], '--probe-evidence')))
    const deployedArtifactDigest = candidate.artifactDigest
    const live = contract.createLiveVerificationReceipt(consumed, {
      deployedArtifactDigest,
      observedRuntimeDigest: digest({
        sourceRevision: required(values['source-sha'], '--source-sha'),
        deploymentUrl: required(values['deployment-url'], '--deployment-url'),
        probeEvidenceDigest: digest(probeEvidence),
      }),
      probesDigest: digest(probeEvidence),
      rollbackTargetDigest: candidate.rollbackTargetDigest,
      verifiedAt: required(values['issued-at'], '--issued-at'),
    })
    if (live.deployedArtifactDigest !== candidate.artifactDigest) {
      throw new Error('live deployment artifact drifted from the authorized candidate')
    }
    writeJson(path.join(outputDir, 'live-verification-receipt.json'), live)
    return
  }

  if (command === 'publish') {
    const live = readJson(path.join(receiptDir, 'live-verification-receipt.json'))
    const publicationRevision = required(values['publication-revision'], '--publication-revision')
    requireSha(publicationRevision, 'publication revision')
    const publicationTarget = required(values['publication-target'], '--publication-target')
    const publication = contract.createPublicationReceipt(live, {
      publicationIdentitiesDigest: digest({
        repository: publicationTarget,
        revision: publicationRevision,
      }),
      publishedAt: required(values['issued-at'], '--issued-at'),
    })
    writeJson(path.join(outputDir, 'publication-receipt.json'), publication)
    return
  }

  throw new Error('command must be create, authorize, live, or publish')
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

const readJson = filePath => JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
const writeGitHubOutput = (enabled, name, value) => {
  if (!enabled) return
  const outputPath = required(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT')
  fs.appendFileSync(outputPath, `${name}=${value}\n`, 'utf8')
}
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
const requireSha = (value, label) => {
  if (!/^[0-9a-f]{40}$/.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`)
}
const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`)
}
const requireInstant = (value, label) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`)
}
const requireIdentity = (identity, revision, tree, label) => {
  if (identity?.revision !== revision || identity?.tree !== tree) {
    throw new Error(`${label} identity drifted from localhost review`)
  }
}
const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

if (path.resolve(process.argv[1] || '') === path.resolve(import.meta.filename)) {
  await main()
}
