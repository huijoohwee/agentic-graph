import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { digest, readJson, requireText, writeAtomicJson, writeJson } from './miaoxyz-production-release-core.mjs'
import {
  captureProductionBaseline, collectVersions, runWrangler, validateBaseline, validateMiaoxyzCandidate,
} from './miaoxyz-production-release-candidate.mjs'
import { assertProtectedDeployRuntime, validateMiaoxyzAuthorization } from './miaoxyz-production-release-authorization.mjs'

export const writeSecrets = output => {
  const operatorToken = requireText(process.env.MIAOXYZ_OPERATOR_ACCESS_TOKEN, 'MiaoXYZ operator secret')
  const hmacSecret = requireText(process.env.MIAOXYZ_RATE_LIMIT_HMAC_SECRET, 'MiaoXYZ rate-limit secret')
  if (operatorToken.length < 32 || hmacSecret.length < 32 || operatorToken === hmacSecret) {
    throw new Error('MiaoXYZ Production secrets must be distinct random values of at least 32 characters')
  }
  writeJson(output, {
    OPERATOR_ACCESS_TOKEN: operatorToken,
    RATE_LIMIT_HMAC_SECRET: hmacSecret,
  }, 0o600)
}

export const compareBaseline = (expected, actual) => {
  validateBaseline(expected)
  validateBaseline(actual)
  const changedFields = []
  if (JSON.stringify(expected.activeVersions) !== JSON.stringify(actual.activeVersions)) changedFields.push('activeVersions')
  if (expected.migrationStateDigest !== actual.migrationStateDigest) changedFields.push('migrationStateDigest')
  if (expected.d1DatabaseId !== actual.d1DatabaseId) changedFields.push('d1DatabaseId')
  if (digest(expected.d1Location) !== digest(actual.d1Location)) changedFields.push('d1Location')
  if (expected.accountId !== actual.accountId) changedFields.push('accountId')
  if (expected.zoneId !== actual.zoneId) changedFields.push('zoneId')
  if (digest(expected.routes) !== digest(actual.routes)) changedFields.push('routes')
  if (changedFields.length) {
    throw new Error(`MiaoXYZ Production state drifted after candidate authorization in ${changedFields.join(', ')}; no migration or deployment was started`)
  }
}

export const probeProduction = async ({ sourceRevision, candidateDigest, expectedVersionIds } = {}) => {
  const probes = [
    { url: 'https://airvio.co/MiaoXYZ/', expected: response => response.ok &&
      response.url === 'https://airvio.co/MiaoXYZ/' &&
      response.headers.get('content-type')?.includes('text/html') },
    { url: 'https://airvio.co/MiaoXYZ/api/health', expected: async response => {
      if (!response.ok) return false
      const body = await response.json()
      return body?.service === 'miaoxyz' &&
        body?.environment === 'production' &&
        (sourceRevision === undefined || body?.sourceRevision === sourceRevision) &&
        (candidateDigest === undefined || body?.candidateDigest === candidateDigest) &&
        (expectedVersionIds === undefined || expectedVersionIds.includes(body?.versionId))
    } },
  ]
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const results = []
      for (const probe of probes) {
        const response = await fetch(probe.url, { redirect: 'follow', signal: AbortSignal.timeout(5000) })
        results.push(await probe.expected(response))
        try { await response.body?.cancel() } catch {}
      }
      if (results.every(Boolean)) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  return false
}

export const readActiveVersions = (repoRoot, workerName) => {
  const statusText = runWrangler(repoRoot, [
    'deployments', 'status', '--name', workerName, '--json', '--env', 'production',
  ], { allowMissingScript: true })
  if (!statusText.trim()) return []
  try { return collectVersions(JSON.parse(statusText)) } catch (error) {
    if (error?.message?.includes('percentages must total 100')) throw error
    throw new Error('MiaoXYZ active Worker version status did not return valid JSON')
  }
}

export const deploy = async ({ repoRoot, candidatePath, approvalsPath, repository, runId, expectedCandidateDigest, receiptPath }) => {
  const candidate = readJson(candidatePath)
  validateMiaoxyzCandidate(candidate, repoRoot)
  assertProtectedDeployRuntime({ repository, runId, candidate })
  if (candidate.candidateDigest !== expectedCandidateDigest) {
    throw new Error('Downloaded MiaoXYZ candidate differs from the verified job output')
  }
  const approvals = readJson(approvalsPath)
  validateMiaoxyzAuthorization({ approvals, repository, runId, candidate })
  const before = await captureProductionBaseline(repoRoot)
  compareBaseline(candidate.baseline, before)
  const secretPath = path.join(os.tmpdir(), `miaoxyz-secrets-${randomUUID()}.json`)
  let migrationAttempted = false
  let migrationsApplied = false
  let deploymentAttempted = false
  let status = 'failed-before-mutation'
  let probePassed = false
  let rollbackPassed = false
  let deployedVersionId = ''
  let failureCode = ''
  const sealReceipt = () => {
    const receipt = {
      schema: 'agentic-miaoxyz-production-deployment-receipt/v1',
      status,
      preserveRequired: status === 'preserve-required',
      sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest,
      targetDigest: candidate.targetDigest,
      baselineDigest: digest(candidate.baseline),
      migrationAttempted,
      migrationsApplied,
      deploymentAttempted,
      deployedVersionId,
      probePassed,
      rollbackPassed,
      failureCode,
      recordedAt: new Date().toISOString(),
    }
    receipt.receiptDigest = digest(receipt)
    writeAtomicJson(receiptPath, receipt, 0o644)
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
  }
  try {
    writeSecrets(secretPath)
    migrationAttempted = true
    status = 'preserve-required'
    failureCode = 'migration-outcome-unknown'
    sealReceipt()
    runWrangler(repoRoot, [
      'd1', 'migrations', 'apply', candidate.database.name, '--remote', '--env', 'production',
    ])
    migrationsApplied = true
    failureCode = 'worker-deployment-outcome-unknown'
    sealReceipt()
    deploymentAttempted = true
    try {
      sealReceipt()
    } catch (error) {
      deploymentAttempted = false
      throw error
    }
    runWrangler(repoRoot, [
      'deploy', '--env', 'production', '--var', `RELEASE_SOURCE_REVISION:${candidate.source.revision}`,
      '--var', `RELEASE_CANDIDATE_DIGEST:${candidate.candidateDigest}`, '--secrets-file', secretPath,
    ])
    const activeVersions = readActiveVersions(repoRoot, candidate.target.workerName)
    const previousVersionIds = new Set(candidate.baseline.activeVersions.map(version => version.versionId))
    const newlyActiveVersions = activeVersions.filter(version => !previousVersionIds.has(version.versionId))
    if (newlyActiveVersions.length !== 1 || newlyActiveVersions[0].percentage !== 100) {
      throw new Error('MiaoXYZ active deployment did not resolve to exactly one new 100% Worker version')
    }
    deployedVersionId = newlyActiveVersions[0].versionId
    probePassed = await probeProduction({
      sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest,
      expectedVersionIds: [deployedVersionId],
    })
    if (!probePassed) throw new Error('MiaoXYZ public route probes failed')
    status = 'deployed'
    failureCode = ''
  } catch (error) {
    failureCode = error?.message === 'MiaoXYZ public route probes failed' ? 'public-probe-failed' : 'release-step-failed'
    if (deploymentAttempted && candidate.baseline.activeVersions.length) {
      try {
        const specs = candidate.baseline.activeVersions.map(version => `${version.versionId}@${version.percentage}%`)
        runWrangler(repoRoot, [
          'versions', 'deploy', ...specs, '--name', candidate.target.workerName,
          '--env', 'production', '--yes',
        ])
        rollbackPassed = await probeProduction({
          expectedVersionIds: candidate.baseline.activeVersions.map(version => version.versionId),
        })
        status = rollbackPassed && !migrationsApplied ? 'rolled-back' : 'preserve-required'
      } catch {
        status = 'preserve-required'
      }
    } else if (deploymentAttempted) {
      status = 'preserve-required'
    } else if (migrationAttempted) {
      status = 'preserve-required'
    }
  } finally {
    try { fs.unlinkSync(secretPath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
  sealReceipt()
  if (status !== 'deployed') process.exitCode = 1
}
