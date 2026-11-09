import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'

import {
  buildTerminalAuthorizationEvidence, formatTerminalAuthorizationComment,
  parseTerminalAuthorizationComment, readCanonicalReleaseOwnerState, responseFor,
  selectPendingProductionDeployment, validateCanonicalReleaseOwnerState, validateReleaseRun,
} from './production-terminal-authorization.mjs'
import { digest, readJson, requireText } from './miaoxyz-production-release-core.mjs'
import { collectVersions, validateMiaoxyzCandidate } from './miaoxyz-production-release-candidate.mjs'

export const challengeForMiaoxyz = ({ repository, runId, candidate }) => digest({
  schema: 'agentic-miaoxyz-production-terminal-challenge/v1',
  repository,
  runId: String(runId),
  environment: 'production',
  sourceRevision: candidate.source.revision,
  candidateDigest: candidate.candidateDigest,
  lifecycleCandidateDigest: candidate.lifecycleCandidateDigest,
  targetDigest: candidate.targetDigest,
})

export const validateMiaoxyzAuthorization = ({ approvals, repository, runId, candidate }) => {
  if (!Array.isArray(approvals)) throw new Error('Production approval history must be an array')
  const matches = approvals.filter(approval => (
    approval?.state === 'approved' &&
    approval?.user?.type === 'User' &&
    Number.isSafeInteger(approval.user.id) &&
    typeof approval.user.login === 'string' &&
    approval.environments?.some(environment => environment?.name === 'production')
  ))
  if (matches.length !== 1) throw new Error(`MiaoXYZ release needs exactly one authenticated Production approval; found ${matches.length}`)
  const approval = matches[0]
  const evidence = parseTerminalAuthorizationComment(approval.comment)
  const humanActorId = `github-user:${approval.user.id}:${approval.user.login}`
  const challengeDigest = challengeForMiaoxyz({ repository, runId, candidate })
  if (evidence.repository !== repository || evidence.runId !== String(runId) ||
      evidence.sourceRevision !== candidate.source.revision ||
      evidence.candidateDigest !== candidate.candidateDigest ||
      evidence.lifecycleCandidateDigest !== candidate.lifecycleCandidateDigest ||
      evidence.targetDigest !== candidate.targetDigest || evidence.humanActorId !== humanActorId ||
      evidence.challengeDigest !== challengeDigest ||
      evidence.responseDigest !== responseFor({ challengeDigest, candidateDigest: candidate.candidateDigest })) {
    throw new Error('Production approval is not bound to this exact MiaoXYZ source, artifact, route, and baseline')
  }
  return evidence
}

export const assertProtectedDeployRuntime = ({ repository, runId, candidate }) => {
  const expectedWorkflowRef = `${repository}/.github/workflows/release.yml@refs/heads/main`
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_REPOSITORY !== repository ||
      process.env.GITHUB_RUN_ID !== String(runId) ||
      process.env.GITHUB_JOB !== 'miaoxyz_deploy' ||
      process.env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
      process.env.GITHUB_SHA !== candidate.source.revision ||
      process.env.GITHUB_WORKFLOW_SHA !== candidate.source.revision) {
    throw new Error('MiaoXYZ Production mutation is restricted to the exact protected release workflow job')
  }
}

export const parseVersionList = value => {
  const output = typeof value === 'string' ? JSON.parse(value) : value
  const versions = collectVersions(output)
  return versions
}

export const runGhText = (args, input) => execFileSync('gh', args, {
  encoding: 'utf8',
  input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  stdio: ['pipe', 'pipe', 'pipe'],
}).trim()
export const runGhJson = args => JSON.parse(runGhText(args))

export const listRunArtifacts = (repository, runId) => runGhJson([
  'api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
])?.artifacts ?? []

export const selectMiaoxyzArtifact = (artifacts, run) => {
  const exactName = `miaoxyz-production-candidate-${run.head_sha}-${run.id}`
  const matches = artifacts.filter(artifact => artifact?.expired === false && artifact?.name === exactName)
  if (matches.length !== 1) throw new Error(`Production Release needs one exact MiaoXYZ candidate artifact; found ${matches.length}`)
  return matches[0]
}

export const authorize = async ({ repository, runId, repoRoot }) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('MiaoXYZ Production authorization requires an interactive terminal')
  const run = validateReleaseRun(runGhJson(['api', `repos/${repository}/actions/runs/${runId}`]), repository, runId)
  const artifact = selectMiaoxyzArtifact(listRunArtifacts(repository, runId), run)
  const pending = selectPendingProductionDeployment(runGhJson([
    'api', `repos/${repository}/actions/runs/${runId}/pending_deployments`,
  ]))
  const actor = runGhJson(['api', 'user'])
  if (actor?.type !== 'User' || !Number.isSafeInteger(actor.id) || !String(actor.login || '').trim()) {
    throw new Error('MiaoXYZ authorization requires an authenticated human GitHub user')
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'miaoxyz-production-authorization-'))
  try {
    runGhText(['run', 'download', String(run.id), '--repo', repository, '--name', artifact.name, '--dir', scratch])
    const candidate = readJson(path.join(scratch, 'miaoxyz-production-candidate.json'))
    validateMiaoxyzCandidate(candidate, repoRoot)
    if (candidate.source.revision !== run.head_sha) throw new Error('MiaoXYZ candidate source differs from the protected release run')
    const before = readCanonicalReleaseOwnerState({ repositoryRoot: repoRoot })
    validateCanonicalReleaseOwnerState({ state: before, expectedRevision: run.head_sha, label: 'agentic-graph' })
    const challengeDigest = challengeForMiaoxyz({ repository, runId, candidate })
    const responseDigest = responseFor({ challengeDigest, candidateDigest: candidate.candidateDigest })
    process.stderr.write([
      'MiaoXYZ Production candidate review',
      `Source: ${candidate.source.revision}`,
      `Target: https://${candidate.target.routes[0]} and descendants`,
      `Worker artifact: ${candidate.worker.artifactDigest}`,
      `D1: ${candidate.database.id} (${candidate.database.name})`,
      `Cloudflare account: ${candidate.baseline.accountId}`,
      `Cloudflare zone: ${candidate.baseline.zoneId}`,
      `Rollback baseline: ${digest(candidate.baseline)}`,
      `airvio.co route inventory: ${candidate.baseline.routes.length} entries (${digest(candidate.baseline.routes)})`,
      `Existing MiaoXYZ route owners: ${candidate.baseline.routes.filter(route => route.pattern.includes('/MiaoXYZ')).map(route => `${route.pattern} -> ${route.script || '(none)'}`).join('; ') || '(none)'}`,
      `Local review: ${candidate.localReviewCandidateDigest}`,
      `Release evidence: ${candidate.releaseEvidenceDigest}`,
      `Privacy evidence: ${candidate.governance.privacyBaselineDigest}`,
      `Data region evidence: ${candidate.governance.dataRegionDigest}`,
      `Backup/restore evidence: ${candidate.governance.backupRestoreDigest}`,
      `Rate-limit evidence: ${candidate.governance.rateLimitReviewDigest}`,
      `Candidate: ${candidate.candidateDigest}`,
      `Reply exactly: authorize ${responseDigest}`,
    ].join('\n') + '\n')
    const terminal = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = (await terminal.question('> ')).trim()
    terminal.close()
    if (answer !== `authorize ${responseDigest}`) throw new Error('MiaoXYZ authorization response did not match this exact candidate')
    const after = readCanonicalReleaseOwnerState({ repositoryRoot: repoRoot })
    validateCanonicalReleaseOwnerState({ state: after, expectedRevision: run.head_sha, label: 'agentic-graph' })
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('canonical main changed during MiaoXYZ authorization')
    const humanActorId = `github-user:${actor.id}:${actor.login}`
    const evidence = buildTerminalAuthorizationEvidence({
      repository,
      runId: String(runId),
      sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest,
      lifecycleCandidateDigest: candidate.lifecycleCandidateDigest,
      targetDigest: candidate.targetDigest,
      humanActorId,
      challengeDigest,
      responseDigest,
      recordedAt: new Date().toISOString(),
    })
    const comment = formatTerminalAuthorizationComment(evidence)
    runGhText(['api', '--method', 'POST', `repos/${repository}/actions/runs/${runId}/pending_deployments`, '--input', '-'], {
      environment_ids: [pending.environment.id],
      state: 'approved',
      comment,
    })
    const approvals = runGhJson(['api', `repos/${repository}/actions/runs/${runId}/approvals`])
    validateMiaoxyzAuthorization({ approvals, repository, runId, candidate })
    process.stdout.write(`${JSON.stringify({
      schema: 'agentic-miaoxyz-production-authorization-result/v1',
      status: 'authorized',
      repository,
      runId: String(runId),
      sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest,
      targetDigest: candidate.targetDigest,
      humanActorId,
      authorizationEvidenceDigest: evidence.evidenceDigest,
    }, null, 2)}\n`)
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
}
