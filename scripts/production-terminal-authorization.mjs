import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export const TERMINAL_AUTHORIZATION_EVIDENCE_SCHEMA = 'knowgrph-production-terminal-authorization/v1'
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

export const challengeFor = ({ repository, run, candidate }) => digest({
  schema: 'knowgrph-production-terminal-challenge/v1',
  repository,
  runId: String(run.id),
  environment: 'production',
  sourceRevision: run.head_sha,
  candidateDigest: candidate.receiptDigest,
  targetDigest: candidate.targetDigest,
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
  const artifact = selectLifecycleCandidateArtifact(artifactPayload?.artifacts, run)
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
    runGhText(['run', 'download', String(run.id), '--repo', repository, '--name', artifact.name, '--dir', temporaryRoot])
    const candidate = validateCandidateManifest(readJson(path.join(temporaryRoot, 'candidate-manifest.json')))
    const challengeDigest = challengeFor({ repository, run, candidate })
    process.stderr.write(
      `Production target: production\nSource revision: ${run.head_sha}\nCandidate digest: ${candidate.receiptDigest}\n` +
      `Challenge digest: ${challengeDigest}\n`,
    )
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await terminal.question('Type the exact candidate digest to authorize Production: ')).trim()
    terminal.close()
    if (answer !== candidate.receiptDigest) throw new Error('Production authorization challenge response did not match')
    const evidence = buildTerminalAuthorizationEvidence({
      repository,
      runId: String(run.id),
      sourceRevision: run.head_sha,
      candidateDigest: candidate.receiptDigest,
      targetDigest: candidate.targetDigest,
      humanActorId,
      challengeDigest,
      responseDigest: responseFor({ challengeDigest, candidateDigest: answer }),
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
      candidateDigest: candidate.receiptDigest,
      targetDigest: candidate.targetDigest,
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
const readJson = filePath => JSON.parse(fs.readFileSync(filePath, 'utf8'))

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

const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) await main()
