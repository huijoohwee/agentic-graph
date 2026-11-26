import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  appRootFrom, digest, digestBytes, readJson, readWorkerConfig, requireText,
  writeAtomicJson, writeJson,
} from './miaoxyz-production-release-core.mjs'
import {
  collectVersions, wranglerPath, validateMiaoxyzCandidate,
} from './miaoxyz-production-release-candidate.mjs'

export const DEV_WORKER_NAME = 'agentic-miaoxyz-dev'
export const DEV_DATABASE_NAME = 'agentic-miaoxyz-dev'
export const DEV_DATABASE_ID = 'df2511e9-f7b1-4110-8421-b84038371263'
const VERSION_ID = /^[0-9a-f-]{36}$/iu
const SUBDOMAIN = /^[a-z0-9-]+$/u

export const createDevConfig = sourceConfig => {
  const dev = structuredClone(sourceConfig)
  delete dev.env
  dev.name = DEV_WORKER_NAME
  dev.workers_dev = true
  dev.preview_urls = false
  dev.routes = []
  dev.d1_databases = [{
    binding: 'DB', database_name: DEV_DATABASE_NAME, database_id: DEV_DATABASE_ID,
    migrations_dir: 'migrations',
  }]
  dev.secrets = { required: ['OPERATOR_ACCESS_TOKEN', 'RATE_LIMIT_HMAC_SECRET'] }
  dev.vars = {
    ...dev.vars,
    APP_BASE_PATH: '',
    DEPLOYMENT_ENV: 'dev',
    RELEASE_SOURCE_REVISION: 'unreleased',
    RELEASE_CANDIDATE_DIGEST: 'unreleased',
    PRIVACY_BASELINE_APPROVED: 'false',
    DATA_REGION_APPROVED: 'false',
    BACKUP_RESTORE_APPROVED: 'false',
    RATE_LIMIT_REVIEW_APPROVED: 'false',
  }
  dev.triggers = { crons: [] }
  dev.observability = {
    enabled: true,
    logs: { enabled: true, invocation_logs: true },
    traces: { enabled: false, head_sampling_rate: 0 },
  }
  return dev
}

export const validateDevConfig = (dev, productionId) => {
  const issues = []
  if (dev?.name !== DEV_WORKER_NAME) issues.push(`Dev Worker name must be ${DEV_WORKER_NAME}`)
  if (dev?.workers_dev !== true || dev?.preview_urls !== false) issues.push('Dev must use workers.dev with preview URLs disabled')
  if (!Array.isArray(dev?.routes) || dev.routes.length !== 0) issues.push('Dev must not bind custom-domain routes')
  if (dev?.vars?.APP_BASE_PATH !== '' || dev?.vars?.DEPLOYMENT_ENV !== 'dev') issues.push('Dev must serve at its workers.dev root with DEPLOYMENT_ENV=dev')
  if (dev?.vars?.RELEASE_SOURCE_REVISION !== 'unreleased' || dev?.vars?.RELEASE_CANDIDATE_DIGEST !== 'unreleased') {
    issues.push('Dev release identity vars must remain placeholders in source configuration')
  }
  for (const name of ['PRIVACY_BASELINE_APPROVED', 'DATA_REGION_APPROVED', 'BACKUP_RESTORE_APPROVED', 'RATE_LIMIT_REVIEW_APPROVED']) {
    if (dev?.vars?.[name] !== 'false') issues.push(`${name} must remain false in Dev`)
  }
  if (dev?.version_metadata?.binding !== 'CF_VERSION_METADATA') issues.push('Dev must bind Worker version metadata')
  if (dev?.assets?.directory !== './public' || dev?.assets?.binding !== 'ASSETS') issues.push('Dev must bind the tracked MiaoXYZ static assets')
  if (dev?.triggers?.crons?.length) issues.push('Dev cron triggers must be disabled')
  const databases = dev?.d1_databases
  const database = Array.isArray(databases) ? databases.find(binding => binding.binding === 'DB') : null
  if (databases?.length !== 1 || database?.database_name !== DEV_DATABASE_NAME || database?.database_id !== DEV_DATABASE_ID || database?.migrations_dir !== 'migrations') {
    issues.push('Dev must use only its provisioned, tracked-migrations D1 database')
  }
  if (!DEV_DATABASE_ID || DEV_DATABASE_ID === productionId) issues.push('Dev and Production must use distinct D1 databases')
  const secrets = [...(dev?.secrets?.required ?? [])].sort()
  if (JSON.stringify(secrets) !== JSON.stringify(['OPERATOR_ACCESS_TOKEN', 'RATE_LIMIT_HMAC_SECRET'])) {
    issues.push('Dev must require distinct operator and rate-limit secrets')
  }
  if (issues.length) throw new Error(`MiaoXYZ Dev preflight is blocked:\n- ${issues.join('\n- ')}`)
  return { dev, database }
}

export const validateDevDatabaseInfo = (info, database) => {
  const row = info?.result && typeof info.result === 'object' ? info.result : info
  if (row?.uuid !== database.database_id || row?.name !== database.database_name) {
    throw new Error('MiaoXYZ Dev D1 info does not match the reviewed database identity')
  }
  const location = {
    runningInRegion: row.running_in_region,
    jurisdiction: row.jurisdiction,
    readReplicationMode: row.read_replication?.mode,
  }
  if (location.runningInRegion !== 'APAC' || location.jurisdiction !== null || location.readReplicationMode !== 'disabled') {
    throw new Error('MiaoXYZ Dev D1 must remain APAC best-effort, without jurisdiction or read replication')
  }
  return location
}

export const workersDevOrigin = async ({ accountId, token, workerName = DEV_WORKER_NAME }) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`MiaoXYZ Dev workers.dev subdomain read failed with HTTP ${response.status}`)
  }
  const payload = await response.json()
  const subdomain = payload?.success === true && payload.errors?.length === 0 ? payload.result?.subdomain : null
  if (!SUBDOMAIN.test(String(subdomain || ''))) throw new Error('MiaoXYZ Dev workers.dev subdomain response is invalid')
  return `https://${workerName}.${subdomain}.workers.dev`
}

export const probeDev = async ({ origin, sourceRevision, candidateDigest, expectedVersionId }) => {
  const probes = [
    { url: `${origin}/`, expected: response => response.ok },
    { url: `${origin}/api/health`, expected: async response => {
      if (!response.ok) return false
      const body = await response.json()
      return body?.service === 'miaoxyz' && body?.environment === 'dev' &&
        body?.sourceRevision === sourceRevision && body?.candidateDigest === candidateDigest &&
        body?.versionId === expectedVersionId
    } },
  ]
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const results = []
      for (const probe of probes) {
        const response = await fetch(probe.url, { redirect: 'follow', signal: AbortSignal.timeout(5000) })
        const host = new URL(response.url || probe.url).hostname
        results.push(host.endsWith('.workers.dev') && await probe.expected(response))
        try { await response.body?.cancel() } catch {}
      }
      if (results.every(Boolean)) return true
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
  return false
}

export const validateDevPromotionReceipt = ({ receipt, candidate, config = null }) => {
  if (!receipt || receipt.schema !== 'agentic-miaoxyz-dev-deployment-receipt/v1' || receipt.status !== 'deployed') {
    throw new Error('MiaoXYZ Dev deployment receipt is missing or unsuccessful')
  }
  const { receiptDigest, ...body } = receipt
  if (receiptDigest !== digest(body)) throw new Error('MiaoXYZ Dev deployment receipt digest is invalid')
  const sourceConfig = readWorkerConfig(process.cwd())
  const devConfig = config ?? createDevConfig(sourceConfig)
  const configured = validateDevConfig(devConfig, sourceConfig.env?.production?.d1_databases?.[0]?.database_id)
  if (receipt.sourceRevision !== candidate.source.revision || receipt.candidateDigest !== candidate.candidateDigest ||
      receipt.workerArtifactDigest !== candidate.worker.artifactDigest ||
      receipt.wranglerConfigDigest !== candidate.worker.wranglerConfigDigest ||
      receipt.devConfigDigest !== digest(devConfig) ||
      receipt.workerName !== configured.dev.name || receipt.databaseId !== configured.database.database_id ||
      receipt.deployedVersionId === '' || !VERSION_ID.test(receipt.deployedVersionId) ||
      receipt.probePassed !== true || receipt.workersDevOrigin !== `https://${receipt.workerName}.${receipt.workersDevSubdomain}.workers.dev` ||
      !SUBDOMAIN.test(String(receipt.workersDevSubdomain || ''))) {
    throw new Error('MiaoXYZ Dev receipt does not bind the exact candidate, Worker, D1, version, and workers.dev readback')
  }
  return receipt
}

export const assertProtectedDevRuntime = ({ repository, runId, candidate }) => {
  const expectedWorkflowRef = `${repository}/.github/workflows/release.yml@refs/heads/main`
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.GITHUB_REF !== 'refs/heads/main' ||
      process.env.GITHUB_REPOSITORY !== repository ||
      process.env.GITHUB_RUN_ID !== String(runId) ||
      process.env.GITHUB_JOB !== 'miaoxyz_dev_deploy' ||
      process.env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
      process.env.GITHUB_SHA !== candidate.source.revision ||
      process.env.GITHUB_WORKFLOW_SHA !== candidate.source.revision) {
    throw new Error('MiaoXYZ Dev mutation is restricted to the exact protected release workflow job')
  }
}

const parseJsonOutput = (value, label) => {
  try { return JSON.parse(value) } catch { throw new Error(`${label} did not return JSON`) }
}
const runDevWrangler = (repoRoot, configPath, args, { allowMissingScript = false } = {}) => {
  try {
    return execFileSync(wranglerPath(repoRoot), [...args, '--config', configPath], {
      cwd: appRootFrom(repoRoot), encoding: 'utf8', env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = `${error?.stderr || ''}\n${error?.stdout || ''}`
    if (allowMissingScript && /(?:10007|script (?:does not exist|not found)|worker script.*not found)/iu.test(detail)) return ''
    throw new Error(`MiaoXYZ isolated Dev command failed: wrangler ${args[0]} ${args[1] || ''}`)
  }
}
const activeDevVersions = (repoRoot, configPath, allowMissingScript = false) => {
  const value = runDevWrangler(repoRoot, configPath, ['deployments', 'status', '--name', DEV_WORKER_NAME, '--json'], { allowMissingScript })
  return value.trim() ? collectVersions(parseJsonOutput(value, 'MiaoXYZ Dev Worker deployment status')) : []
}
const captureDevDatabase = (repoRoot, configPath, database) => {
  const info = parseJsonOutput(runDevWrangler(repoRoot, configPath, ['d1', 'info', database.database_name, '--json']), 'MiaoXYZ Dev D1 info')
  const location = validateDevDatabaseInfo(info, database)
  const migrations = runDevWrangler(repoRoot, configPath, ['d1', 'migrations', 'list', database.database_name, '--remote'])
  return { location, migrationStateDigest: digestBytes(migrations.replace(/\r\n/gu, '\n').trim()) }
}
const writeDevSecrets = output => {
  const operatorToken = requireText(process.env.MIAOXYZ_DEV_OPERATOR_ACCESS_TOKEN, 'MiaoXYZ Dev operator secret')
  const hmacSecret = requireText(process.env.MIAOXYZ_DEV_RATE_LIMIT_HMAC_SECRET, 'MiaoXYZ Dev rate-limit secret')
  if (operatorToken.length < 32 || hmacSecret.length < 32 || operatorToken === hmacSecret ||
      operatorToken === process.env.MIAOXYZ_OPERATOR_ACCESS_TOKEN || hmacSecret === process.env.MIAOXYZ_RATE_LIMIT_HMAC_SECRET) {
    throw new Error('MiaoXYZ Dev secrets must be distinct random values of at least 32 characters and separate from Production')
  }
  writeJson(output, { OPERATOR_ACCESS_TOKEN: operatorToken, RATE_LIMIT_HMAC_SECRET: hmacSecret }, 0o600)
}

export const deployDev = async ({ repoRoot, candidatePath, expectedCandidateDigest, receiptPath }) => {
  const candidate = readJson(candidatePath)
  validateMiaoxyzCandidate(candidate, repoRoot)
  assertProtectedDevRuntime({ repository: 'huijoohwee/agentic-graph', runId: process.env.GITHUB_RUN_ID, candidate })
  if (candidate.candidateDigest !== expectedCandidateDigest) throw new Error('Downloaded MiaoXYZ candidate differs from the verified job output')
  if (process.env.CLOUDFLARE_ACCOUNT_ID !== candidate.baseline.accountId) throw new Error('MiaoXYZ Dev Cloudflare account differs from the candidate account')
  const sourceConfig = readWorkerConfig(repoRoot)
  const devConfig = createDevConfig(sourceConfig)
  const { dev, database } = validateDevConfig(devConfig, sourceConfig.env?.production?.d1_databases?.[0]?.database_id)
  const configPath = path.join(appRootFrom(repoRoot), `.wrangler-dev-release-${randomUUID()}.jsonc`)
  writeJson(configPath, devConfig, 0o600)
  let before
  let priorVersions
  try {
    before = captureDevDatabase(repoRoot, configPath, database)
    priorVersions = activeDevVersions(repoRoot, configPath, true)
  } catch (error) {
    try { fs.unlinkSync(configPath) } catch (cleanupError) { if (cleanupError?.code !== 'ENOENT') throw cleanupError }
    throw error
  }
  const secretPath = path.join(os.tmpdir(), `miaoxyz-dev-secrets-${randomUUID()}.json`)
  let migrationAttempted = false
  let migrationsApplied = false
  let deploymentAttempted = false
  let status = 'failed-before-mutation'
  let probePassed = false
  let deployedVersionId = ''
  let origin = ''
  let failureCode = ''
  const sealReceipt = async () => {
    const receipt = {
      schema: 'agentic-miaoxyz-dev-deployment-receipt/v1',
      status,
      sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest,
      workerArtifactDigest: candidate.worker.artifactDigest,
      wranglerConfigDigest: candidate.worker.wranglerConfigDigest,
      devConfigDigest: digest(devConfig),
      workerName: dev.name,
      databaseName: database.database_name,
      databaseId: database.database_id,
      d1Location: before.location,
      migrationBaselineDigest: before.migrationStateDigest,
      migrationAttempted,
      migrationsApplied,
      deploymentAttempted,
      previousVersions: priorVersions,
      deployedVersionId,
      workersDevOrigin: origin,
      workersDevSubdomain: origin ? new URL(origin).hostname.slice(`${dev.name}.`.length, -'.workers.dev'.length) : '',
      probePassed,
      failureCode,
      recordedAt: new Date().toISOString(),
    }
    receipt.receiptDigest = digest(receipt)
    writeAtomicJson(receiptPath, receipt, 0o644)
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
    return receipt
  }
  try {
    writeDevSecrets(secretPath)
    migrationAttempted = true
    status = 'preserve-required'
    failureCode = 'migration-outcome-unknown'
    await sealReceipt()
    runDevWrangler(repoRoot, configPath, ['d1', 'migrations', 'apply', database.database_name, '--remote'])
    migrationsApplied = true
    failureCode = 'worker-deployment-outcome-unknown'
    await sealReceipt()
    deploymentAttempted = true
    await sealReceipt()
    runDevWrangler(repoRoot, configPath, [
      'deploy', '--var', `RELEASE_SOURCE_REVISION:${candidate.source.revision}`,
      '--var', `RELEASE_CANDIDATE_DIGEST:${candidate.candidateDigest}`, '--secrets-file', secretPath,
    ])
    const activeVersions = activeDevVersions(repoRoot, configPath)
    const previousIds = new Set(priorVersions.map(version => version.versionId))
    const newlyActive = activeVersions.filter(version => !previousIds.has(version.versionId))
    if (newlyActive.length !== 1 || newlyActive[0].percentage !== 100) {
      throw new Error('MiaoXYZ Dev deployment did not resolve to exactly one new 100% Worker version')
    }
    deployedVersionId = newlyActive[0].versionId
    const token = requireText(process.env.CLOUDFLARE_API_TOKEN, 'Cloudflare API token')
    origin = await workersDevOrigin({ accountId: candidate.baseline.accountId, token, workerName: dev.name })
    probePassed = await probeDev({ origin, sourceRevision: candidate.source.revision,
      candidateDigest: candidate.candidateDigest, expectedVersionId: deployedVersionId })
    if (!probePassed) throw new Error('MiaoXYZ Dev workers.dev health readback failed')
    status = 'deployed'
    failureCode = ''
  } catch (error) {
    failureCode = error?.message === 'MiaoXYZ Dev workers.dev health readback failed' ? 'dev-health-probe-failed' : 'release-step-failed'
    if (deploymentAttempted && priorVersions.length) {
      try {
        const specs = priorVersions.map(version => `${version.versionId}@${version.percentage}%`)
        runDevWrangler(repoRoot, configPath, ['versions', 'deploy', ...specs, '--name', dev.name, '--yes'])
        status = 'rolled-back'
      } catch { status = 'preserve-required' }
    } else if (deploymentAttempted || migrationAttempted) status = 'preserve-required'
  } finally {
    try { fs.unlinkSync(secretPath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
    try { fs.unlinkSync(configPath) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
  const receipt = await sealReceipt()
  if (status !== 'deployed') process.exitCode = 1
  return receipt
}

export const verifyPromotion = ({ repoRoot, candidatePath, devReceiptPath, expectedCandidateDigest }) => {
  const candidate = readJson(candidatePath)
  validateMiaoxyzCandidate(candidate, repoRoot)
  if (candidate.candidateDigest !== expectedCandidateDigest) throw new Error('Production candidate differs from the verified candidate digest')
  const receipt = readJson(devReceiptPath)
  return validateDevPromotionReceipt({ receipt, candidate, config: createDevConfig(readWorkerConfig(repoRoot)) })
}

const args = new Map(process.argv.slice(3).filter(value => value.startsWith('--')).map(value => {
  const index = value.indexOf('=')
  return index < 0 ? [value.slice(2), ''] : [value.slice(2, index), value.slice(index + 1)]
}))
const requiredArg = name => requireText(args.get(name), `--${name}`)
const root = path.resolve(args.get('repo-root') || path.join(import.meta.dirname, '..'))

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'deploy') {
    await deployDev({ repoRoot: root, candidatePath: requiredArg('candidate'),
      expectedCandidateDigest: requiredArg('expected-candidate-digest'), receiptPath: requiredArg('receipt') })
  } else if (process.argv[2] === 'verify') {
    verifyPromotion({ repoRoot: root, candidatePath: requiredArg('candidate'),
      devReceiptPath: requiredArg('dev-receipt'), expectedCandidateDigest: requiredArg('expected-candidate-digest') })
    process.stdout.write('MiaoXYZ Dev promotion receipt matches the exact Production candidate.\n')
  } else {
    throw new Error('usage: miaoxyz-hosted-dev-release.mjs <deploy|verify> --repo-root=<path> --candidate=<path> --expected-candidate-digest=<sha256> [--receipt=<path>|--dev-receipt=<path>]')
  }
}
