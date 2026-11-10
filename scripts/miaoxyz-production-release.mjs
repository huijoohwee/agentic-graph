import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'

import { validateLocalReviewCandidate } from './production-release-authorization.mjs'
import { normalizeReleaseEvidence } from './lib/production-release-lifecycle-evidence.mjs'
import {
  MIAOXYZ_GOVERNANCE_SCHEMA, gitText, readCommittedWorkerFiles, readJson, readWorkerConfig, repoRootFrom, requireText,
  validateProductionConfig, writeJson,
} from './miaoxyz-production-release-core.mjs'
import {
  captureProductionBaseline, createMiaoxyzCandidate, migrationsDigest, validateMiaoxyzCandidate,
} from './miaoxyz-production-release-candidate.mjs'
import { authorize, validateMiaoxyzAuthorization } from './miaoxyz-production-release-authorization.mjs'
import { deploy } from './miaoxyz-production-release-deploy.mjs'
import { runWrangler } from './miaoxyz-production-release-candidate.mjs'

export const main = async () => {
  const [command, ...args] = process.argv.slice(2)
  const { values } = parseArgs({
    args,
    options: {
      'repo-root': { type: 'string' },
      'source-sha': { type: 'string' },
      'local-review': { type: 'string' },
      'release-evidence': { type: 'string' },
      'governance-evidence': { type: 'string' },
      candidate: { type: 'string' },
      output: { type: 'string' },
      approvals: { type: 'string' },
      repository: { type: 'string' },
      'run-id': { type: 'string' },
      'expected-candidate-digest': { type: 'string' },
      receipt: { type: 'string' },
    },
    strict: true,
  })
  const repoRoot = repoRootFrom(values['repo-root'])
  if (command === 'prepare') {
    const sourceRevision = values['source-sha'] || gitText(repoRoot, ['rev-parse', 'HEAD'])
    const sourceTree = gitText(repoRoot, ['rev-parse', 'HEAD^{tree}'])
    const localReview = readJson(requireText(values['local-review'], '--local-review'))
    const releaseEvidence = readJson(requireText(values['release-evidence'], '--release-evidence'))
    const governanceEvidence = readJson(requireText(values['governance-evidence'], '--governance-evidence'))
    validateProductionConfig(readWorkerConfig(repoRoot), governanceEvidence)
    validateLocalReviewCandidate(localReview)
    normalizeReleaseEvidence(releaseEvidence, {
      repository: 'huijoohwee/agentic-graph',
      sourceRevision,
    })
    readCommittedWorkerFiles(repoRoot)
    migrationsDigest(repoRoot)
    const baseline = await captureProductionBaseline(repoRoot)
    const candidate = createMiaoxyzCandidate({
      repoRoot, sourceRevision, sourceTree, localReview, releaseEvidence, governanceEvidence, baseline,
    })
    writeJson(requireText(values.output, '--output'), candidate, 0o644)
    process.stdout.write(`candidate_digest=${candidate.candidateDigest}\n`)
    return
  }
  if (command === 'verify') {
    const candidate = readJson(requireText(values.candidate, '--candidate'))
    validateMiaoxyzCandidate(candidate, repoRoot)
    return
  }
  if (command === 'dry-run') {
    const secretPath = path.join(os.tmpdir(), `miaoxyz-dry-run-secrets-${randomUUID()}.json`)
    writeJson(secretPath, {
      OPERATOR_ACCESS_TOKEN: 'dry-run-operator-token-not-for-deployment',
      RATE_LIMIT_HMAC_SECRET: 'dry-run-rate-limit-secret-not-for-deployment',
    }, 0o600)
    try {
      runWrangler(repoRoot, ['deploy', '--env', 'production', '--dry-run', '--secrets-file', secretPath])
    } finally {
      try { fs.unlinkSync(secretPath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    }
    return
  }
  if (command === 'authorize') {
    await authorize({
      repository: requireText(values.repository, '--repository'),
      runId: requireText(values['run-id'], '--run-id'),
      repoRoot,
    })
    return
  }
  if (command === 'verify-authorization') {
    const candidate = readJson(requireText(values.candidate, '--candidate'))
    validateMiaoxyzCandidate(candidate, repoRoot)
    const approvals = readJson(requireText(values.approvals, '--approvals'))
    validateMiaoxyzAuthorization({
      approvals,
      repository: requireText(values.repository, '--repository'),
      runId: requireText(values['run-id'], '--run-id'),
      candidate,
    })
    return
  }
  if (command === 'deploy') {
    await deploy({
      repoRoot,
      candidatePath: requireText(values.candidate, '--candidate'),
      approvalsPath: requireText(values.approvals, '--approvals'),
      repository: requireText(values.repository, '--repository'),
      runId: requireText(values['run-id'], '--run-id'),
      expectedCandidateDigest: requireText(values['expected-candidate-digest'], '--expected-candidate-digest'),
      receiptPath: requireText(values.receipt, '--receipt'),
    })
    return
  }
  throw new Error('Use prepare, verify, dry-run, authorize, verify-authorization, or deploy')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(error => {
    process.stderr.write(`${error?.message || 'MiaoXYZ production release failed'}\n`)
    process.exitCode = 1
  })
}
