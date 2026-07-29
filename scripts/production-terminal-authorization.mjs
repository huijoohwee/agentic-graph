import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export const TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA = 'knowgrph-production-terminal-authorization/v2'
export const TERMINAL_AUTHORIZATION_RESULT_SCHEMA = 'knowgrph-production-terminal-authorization-result/v1'
export const INTERACTION_ADAPTER_ID = 'knowgrph-gh-cli-terminal/v1'
export const INTERACTION_TRANSPORT_CLASS = 'interactive-terminal'
export const GITHUB_APPROVAL_COMMENT_MAX_BYTES = 1024

const digestPattern = /^[0-9a-f]{64}$/
const shaPattern = /^[0-9a-f]{40}$/
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const compressedEvidencePrefix = 'z.'
const maximumDecodedEvidenceBytes = 16 * 1024
const evidenceFields = [
  'schema',
  'status',
  'repository',
  'runId',
  'environment',
  'sourceRevision',
  'candidateDigest',
  'lifecycleCandidateDigest',
  'targetDigest',
  'humanActorId',
  'interactionAdapterId',
  'transportClass',
  'browserRequired',
  'challengeDigest',
  'responseDigest',
  'recordedAt',
  'evidenceDigest',
]

export const buildTerminalAuthorizationEvidence = ({
  repository,
  runId,
  sourceRevision,
  candidateDigest,
  lifecycleCandidateDigest,
  targetDigest,
  humanActorId,
  challengeDigest,
  responseDigest,
  recordedAt,
}) => {
  requireRepository(repository)
  requireRunId(runId)
  if (!shaPattern.test(String(sourceRevision || ''))) throw new Error('source revision must be an exact commit SHA')
  for (const [value, label] of [
    [candidateDigest, 'candidate digest'],
    [lifecycleCandidateDigest, 'lifecycle candidate digest'],
    [targetDigest, 'target digest'],
    [challengeDigest, 'challenge digest'],
    [responseDigest, 'response digest'],
  ]) requireDigest(value, label)
  requireText(humanActorId, 'human actor')
  requireInstant(recordedAt, 'interaction time')
  const evidence = {
    schema: TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA,
    status: 'observed',
    repository,
    runId: String(runId),
    environment: 'production',
    sourceRevision,
    candidateDigest,
    lifecycleCandidateDigest,
    targetDigest,
    humanActorId,
    interactionAdapterId: INTERACTION_ADAPTER_ID,
    transportClass: INTERACTION_TRANSPORT_CLASS,
    browserRequired: false,
    challengeDigest,
    responseDigest,
    recordedAt,
  }
  return Object.freeze({ ...evidence, evidenceDigest: digest(evidence) })
}

export const validateTerminalAuthorizationEvidence = value => {
  assertExactObject(value, evidenceFields, 'terminal authorization evidence')
  if (value.schema !== TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA ||
      value.status !== 'observed' ||
      value.environment !== 'production' ||
      value.interactionAdapterId !== INTERACTION_ADAPTER_ID ||
      value.transportClass !== INTERACTION_TRANSPORT_CLASS ||
      value.browserRequired !== false) {
    throw new Error('terminal authorization evidence has an invalid profile')
  }
  requireRepository(value.repository)
  requireRunId(value.runId)
  if (!shaPattern.test(String(value.sourceRevision || ''))) throw new Error('source revision must be an exact commit SHA')
  requireText(value.humanActorId, 'human actor')
  requireInstant(value.recordedAt, 'interaction time')
  for (const [entry, label] of [
    [value.candidateDigest, 'candidate digest'],
    [value.lifecycleCandidateDigest, 'lifecycle candidate digest'],
    [value.targetDigest, 'target digest'],
    [value.challengeDigest, 'challenge digest'],
    [value.responseDigest, 'response digest'],
    [value.evidenceDigest, 'evidence digest'],
  ]) requireDigest(entry, label)
  const { evidenceDigest, ...evidence } = value
  if (evidenceDigest !== digest(evidence)) throw new Error('terminal authorization evidence digest drifted')
  if (value.responseDigest !== responseFor({
    challengeDigest: value.challengeDigest,
    candidateDigest: value.candidateDigest,
  })) throw new Error('terminal authorization response is not bound to its challenge and candidate')
  return value
}

export const formatTerminalAuthorizationComment = evidence => {
  validateTerminalAuthorizationEvidence(evidence)
  const encoded = deflateRawSync(Buffer.from(JSON.stringify(evidence), 'utf8'), {
    level: 9,
  }).toString('base64url')
  const comment = `${TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA} ${compressedEvidencePrefix}${encoded}`
  if (Buffer.byteLength(comment, 'utf8') > GITHUB_APPROVAL_COMMENT_MAX_BYTES) {
    throw new Error('terminal authorization evidence exceeds the GitHub approval comment limit')
  }
  return comment
}

export const parseTerminalAuthorizationComment = comment => {
  const [schema, encoded, ...extra] = String(comment || '').trim().split(/\s+/)
  if (schema !== TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA || !encoded || extra.length) {
    throw new Error('production approval lacks exact terminal authorization evidence')
  }
  let value
  try {
    const evidenceBytes = encoded.startsWith(compressedEvidencePrefix)
      ? inflateRawSync(Buffer.from(encoded.slice(compressedEvidencePrefix.length), 'base64url'), {
          maxOutputLength: maximumDecodedEvidenceBytes,
        })
      : Buffer.from(encoded, 'base64url')
    value = JSON.parse(evidenceBytes.toString('utf8'))
  } catch {
    throw new Error('production approval terminal authorization evidence is malformed')
  }
  return validateTerminalAuthorizationEvidence(value)
}

export const validateReleaseRun = (run, repository, runId) => {
  requireRepository(repository)
  requireRunId(runId)
  if (String(run?.id) !== String(runId) ||
      run?.event !== 'workflow_dispatch' ||
      run?.path !== '.github/workflows/release.yml' ||
      run?.head_branch !== 'main' ||
      !shaPattern.test(String(run?.head_sha || '')) ||
      !['queued', 'in_progress', 'waiting'].includes(run?.status) ||
      run?.conclusion !== null) {
    throw new Error('run is not an active protected-main Production Release candidate')
  }
  return run
}

export const selectLifecycleCandidateArtifact = (artifacts, run) => {
  if (!Array.isArray(artifacts)) throw new Error('workflow artifacts must be an array')
  const suffix = `-${String(run.id)}`
  const matches = artifacts.filter(artifact => (
    artifact?.expired === false &&
    typeof artifact.name === 'string' &&
    artifact.name.startsWith('production-lifecycle-') &&
    !artifact.name.startsWith('production-lifecycle-complete-') &&
    artifact.name.endsWith(suffix)
  ))
  if (matches.length !== 1 ||
      matches[0].name !== `production-lifecycle-${run.head_sha}-${run.id}`) {
    throw new Error(`Production Release requires one exact lifecycle candidate artifact; found ${matches.length}`)
  }
  return matches[0]
}

export const selectProductionAuthorizationArtifact = (artifacts, run) => {
  if (!Array.isArray(artifacts)) throw new Error('workflow artifacts must be an array')
  const expectedName = `production-authorization-${run.head_sha}`
  const matches = artifacts.filter(artifact => (
    artifact?.expired === false && artifact?.name === expectedName
  ))
  if (matches.length !== 1) {
    throw new Error(`Production Release requires one exact authorization candidate artifact; found ${matches.length}`)
  }
  return matches[0]
}

export const selectPendingProductionDeployment = pending => {
  if (!Array.isArray(pending)) throw new Error('pending deployments must be an array')
  const matches = pending.filter(entry => (
    entry?.environment?.name === 'production' &&
    Number.isSafeInteger(entry.environment.id) &&
    entry.current_user_can_approve === true
  ))
  if (matches.length !== 1 || pending.length !== 1) {
    throw new Error(`Production Release requires one approvable production deployment; found ${matches.length}`)
  }
  return matches[0]
}

export const validateCandidateManifest = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      value.schema !== 'agentic-candidate-manifest/v1' ||
      value.status !== 'awaiting-human-authorization') {
    throw new Error('lifecycle candidate manifest is malformed')
  }
  requireDigest(value.targetDigest, 'candidate target digest')
  requireDigest(value.receiptDigest, 'candidate receipt digest')
  const { receiptDigest, ...evidence } = value
  if (receiptDigest !== digest(evidence)) throw new Error('lifecycle candidate receipt digest drifted')
  return value
}

export const validateProductionCandidateLink = ({
  sourceRevision,
  localReview,
  releaseCandidate,
  lifecycleCandidate,
}) => {
  validateCandidateManifest(lifecycleCandidate)
  if (!releaseCandidate || !isExactObject(releaseCandidate, [
    'schema',
    'status',
    'source',
    'agenticCanvasOs',
    'catalogRevision',
    'artifact',
    'immutableManifest',
    'localReviewCandidateDigest',
    'candidateDigest',
  ]) ||
      releaseCandidate.schema !== 'agentic-production-release-candidate/v1' ||
      releaseCandidate.status !== 'awaiting-human-authorization') {
    throw new Error('production release candidate is malformed')
  }
  if (!localReview || !isExactObject(localReview, [
    'schema',
    'status',
    'source',
    'agenticCanvasOs',
    'catalogRevision',
    'runtimeEvidenceDigest',
    'candidateDigest',
  ])) {
    throw new Error('local review candidate is malformed')
  }
  requireDigest(releaseCandidate.candidateDigest, 'production release candidate digest')
  requireDigest(releaseCandidate.localReviewCandidateDigest, 'local review candidate digest')
  const { candidateDigest: releaseDigest, ...releaseEvidence } = releaseCandidate
  const { candidateDigest: reviewDigest, ...reviewEvidence } = localReview
  if (releaseDigest !== digest(releaseEvidence) ||
      reviewDigest !== digest(reviewEvidence) ||
      releaseCandidate.source?.revision !== sourceRevision ||
      localReview?.candidateDigest !== releaseCandidate.localReviewCandidateDigest ||
      localReview?.source?.revision !== sourceRevision ||
      localReview?.agenticCanvasOs?.revision !== releaseCandidate.agenticCanvasOs?.revision ||
      releaseCandidate.catalogRevision !== releaseCandidate.agenticCanvasOs?.revision ||
      lifecycleCandidate.sourceDigest !== digest(releaseCandidate.source) ||
      lifecycleCandidate.artifactDigest !== releaseCandidate.artifact?.digest ||
      lifecycleCandidate.manifestDigest !== releaseCandidate.immutableManifest?.digest) {
    throw new Error('production and lifecycle candidates are not an exact joined release')
  }
  return true
}

export const challengeFor = ({ repository, run, releaseCandidate, lifecycleCandidate }) => digest({
  schema: 'knowgrph-production-terminal-challenge/v1',
  repository,
  runId: String(run.id),
  environment: 'production',
  sourceRevision: run.head_sha,
  candidateDigest: releaseCandidate.candidateDigest,
  lifecycleCandidateDigest: lifecycleCandidate.receiptDigest,
  targetDigest: lifecycleCandidate.targetDigest,
})

export const responseFor = ({ challengeDigest, candidateDigest }) => digest({
  schema: 'knowgrph-production-terminal-response/v1',
  challengeDigest,
  candidateDigest,
})

const main = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Production authorization requires an interactive terminal; non-interactive confirmation is forbidden')
  }
  const { values } = parseArgs({
    options: {
      repository: { type: 'string' },
      'run-id': { type: 'string' },
    },
    strict: true,
  })
  const repository = values.repository || runGhText(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const runId = required(values['run-id'], '--run-id')
  const run = validateReleaseRun(runGhJson(['api', `repos/${repository}/actions/runs/${runId}`]), repository, runId)
  const artifactPayload = runGhJson(['api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`])
  const lifecycleArtifact = selectLifecycleCandidateArtifact(artifactPayload?.artifacts, run)
  const authorizationArtifact = selectProductionAuthorizationArtifact(artifactPayload?.artifacts, run)
  const pending = selectPendingProductionDeployment(
    runGhJson(['api', `repos/${repository}/actions/runs/${runId}/pending_deployments`]),
  )
  const actor = runGhJson(['api', 'user'])
  if (actor?.type !== 'User' || !Number.isSafeInteger(actor.id) || !String(actor.login || '').trim()) {
    throw new Error('Production authorization requires an authenticated human GitHub user')
  }
  const humanActorId = `github-user:${actor.id}:${actor.login}`
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'knowgrph-production-authorization-'))
  try {
    const lifecycleRoot = path.join(temporaryRoot, 'lifecycle')
    const authorizationRoot = path.join(temporaryRoot, 'authorization')
    runGhText(['run', 'download', String(run.id), '--repo', repository, '--name', lifecycleArtifact.name, '--dir', lifecycleRoot])
    runGhText(['run', 'download', String(run.id), '--repo', repository, '--name', authorizationArtifact.name, '--dir', authorizationRoot])
    const lifecycleCandidate = validateCandidateManifest(readJson(path.join(lifecycleRoot, 'candidate-manifest.json')))
    const localReview = readJson(path.join(authorizationRoot, 'local-review-candidate.json'))
    const releaseCandidate = readJson(path.join(authorizationRoot, 'production-release-candidate.json'))
    validateProductionCandidateLink({
      sourceRevision: run.head_sha,
      localReview,
      releaseCandidate,
      lifecycleCandidate,
    })
    const repositoryRoot = path.resolve(import.meta.dirname, '..')
    const agenticCanvasOsRoot = path.resolve(repositoryRoot, '..', 'agentic-canvas-os')
    requireCanonicalRevision(repositoryRoot, run.head_sha, 'Knowgrph')
    requireCanonicalRevision(
      agenticCanvasOsRoot,
      releaseCandidate.agenticCanvasOs.revision,
      'Agentic Canvas OS',
    )
    const runtime = runCommandJson('npm', [
      '--prefix',
      agenticCanvasOsRoot,
      'run',
      '--silent',
      'runtime:local:status',
      '--',
      `--repository=${repositoryRoot}`,
      '--json',
    ])
    const promptContract = await import(pathToFileURL(path.join(
      agenticCanvasOsRoot,
      'scripts',
      'production-release-authorization-contract.mjs',
    )).href)
    promptContract.validateProductionReleaseCandidate(releaseCandidate)
    const prompt = promptContract.createProductionAuthorizationPrompt(
      runtime,
      localReview,
      releaseCandidate,
      { runRef: `run:${run.id}` },
    )
    process.stderr.write(`${promptContract.formatProductionAuthorizationPrompt(prompt)}\n`)
    const challengeDigest = challengeFor({ repository, run, releaseCandidate, lifecycleCandidate })
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await terminal.question('> ')).trim()
    terminal.close()
    if (answer !== prompt.authorizationReply) {
      throw new Error('Production authorization challenge response did not match')
    }
    const evidence = buildTerminalAuthorizationEvidence({
      repository,
      runId: String(run.id),
      sourceRevision: run.head_sha,
      candidateDigest: releaseCandidate.candidateDigest,
      lifecycleCandidateDigest: lifecycleCandidate.receiptDigest,
      targetDigest: lifecycleCandidate.targetDigest,
      humanActorId,
      challengeDigest,
      responseDigest: responseFor({
        challengeDigest,
        candidateDigest: releaseCandidate.candidateDigest,
      }),
      recordedAt: new Date().toISOString(),
    })
    const comment = formatTerminalAuthorizationComment(evidence)
    runGhText(
      ['api', '--method', 'POST', `repos/${repository}/actions/runs/${run.id}/pending_deployments`, '--input', '-'],
      {
        environment_ids: [pending.environment.id],
        state: 'approved',
        comment,
      },
    )
    const approvals = runGhJson(['api', `repos/${repository}/actions/runs/${run.id}/approvals`])
    const matches = approvals.filter(approval => (
      approval?.state === 'approved' &&
      approval?.user?.type === 'User' &&
      approval.user.id === actor.id &&
      approval.user.login === actor.login &&
      approval.environments?.some(environment => environment?.name === 'production') &&
      approval.comment === comment
    ))
    if (matches.length !== 1) throw new Error('protected environment did not record the exact terminal authorization')
    process.stdout.write(`${JSON.stringify({
      schema: TERMINAL_AUTHORIZATION_RESULT_SCHEMA,
      status: 'authorized',
      repository,
      runId: String(run.id),
      sourceRevision: run.head_sha,
      candidateDigest: releaseCandidate.candidateDigest,
      lifecycleCandidateDigest: lifecycleCandidate.receiptDigest,
      targetDigest: lifecycleCandidate.targetDigest,
      humanActorId,
      interactionEvidenceDigest: evidence.evidenceDigest,
      decisionRef: `${run.html_url}#environment-production`,
      authorizedAt: evidence.recordedAt,
    }, null, 2)}\n`)
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

const runGhText = (argumentsList, input) => execFileSync('gh', argumentsList, {
  encoding: 'utf8',
  input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  stdio: ['pipe', 'pipe', 'pipe'],
}).trim()

const runGhJson = argumentsList => JSON.parse(runGhText(argumentsList))
const runCommandJson = (command, argumentsList) => JSON.parse(execFileSync(command, argumentsList, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim())
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'))

const requireCanonicalRevision = (repositoryRoot, expectedRevision, label) => {
  const git = argumentsList => execFileSync('git', argumentsList, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (git(['branch', '--show-current']) !== 'main' ||
      git(['rev-parse', 'HEAD']) !== expectedRevision ||
      git(['rev-parse', 'origin/main']) !== expectedRevision ||
      git(['status', '--porcelain'])) {
    throw new Error(`${label} canonical main drifted from the authorized release input`)
  }
}

const required = (value, label) => {
  if (!String(value || '').trim()) throw new Error(`${label} is required`)
  return String(value).trim()
}

const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be non-empty`)
}

const requireDigest = (value, label) => {
  if (!digestPattern.test(String(value || ''))) throw new Error(`${label} must be an exact SHA-256 digest`)
}

const requireInstant = (value, label) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`)
}

const requireRepository = value => {
  if (!repositoryPattern.test(String(value || ''))) throw new Error('repository must be owner/name')
}

const requireRunId = value => {
  if (!/^[1-9][0-9]*$/.test(String(value || ''))) throw new Error('run ID must be a positive integer')
}

const assertExactObject = (value, keys, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error(`${label} contains missing or unknown fields`)
  }
}

const isExactObject = (value, keys) => (
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
)

const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main()
