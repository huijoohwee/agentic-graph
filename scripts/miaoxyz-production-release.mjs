import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'

import { validateLocalReviewCandidate } from './production-release-authorization.mjs'
import { normalizeReleaseEvidence } from './lib/production-release-lifecycle-evidence.mjs'
import {
  buildTerminalAuthorizationEvidence,
  formatTerminalAuthorizationComment,
  parseTerminalAuthorizationComment,
  readCanonicalReleaseOwnerState,
  responseFor,
  selectPendingProductionDeployment,
  validateCanonicalReleaseOwnerState,
  validateReleaseRun,
} from './production-terminal-authorization.mjs'

export const MIAOXYZ_CANDIDATE_SCHEMA = 'agentic-miaoxyz-production-candidate/v2'
export const MIAOXYZ_GOVERNANCE_SCHEMA = 'agentic-miaoxyz-production-governance-evidence/v1'
export const MIAOXYZ_BASELINE_SCHEMA = 'agentic-miaoxyz-production-baseline/v2'

const routePatterns = ['airvio.co/MiaoXYZ', 'airvio.co/MiaoXYZ/*']
const approvalNames = [
  'PRIVACY_BASELINE_APPROVED',
  'DATA_REGION_APPROVED',
  'BACKUP_RESTORE_APPROVED',
  'RATE_LIMIT_REVIEW_APPROVED',
]
const requiredSecrets = ['OPERATOR_ACCESS_TOKEN', 'RATE_LIMIT_HMAC_SECRET']
const shaPattern = /^[0-9a-f]{40}$/u
const digestPattern = /^[0-9a-f]{64}$/u
const versionPattern = /^[0-9a-f-]{36}$/iu

const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')
const digestBytes = value => createHash('sha256').update(value).digest('hex')
const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const writeJson = (file, value, mode = 0o600) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode })
}
const writeAtomicJson = (file, value, mode = 0o600) => {
  const target = path.resolve(file)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeJson(temporary, value, mode)
    fs.renameSync(temporary, target)
  } finally {
    try { fs.unlinkSync(temporary) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
}
const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}
const requireDigest = (value, label) => {
  if (!digestPattern.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 digest`)
}
const requireSha = (value, label) => {
  if (!shaPattern.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`)
}
const repoRootFrom = value => path.resolve(value || path.join(import.meta.dirname, '..'))
const appRootFrom = repoRoot => path.join(repoRoot, 'cloudflare/workers/miaoxyz')
const gitText = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()

export const readCommittedWorkerFiles = repoRoot => {
  const prefix = 'cloudflare/workers/miaoxyz/'
  const listed = execFileSync('git', ['ls-files', '-z', '--', prefix], { cwd: repoRoot })
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter(file => !file.includes('/node_modules/') && !file.includes('/.wrangler/'))
    .filter(file => !/(?:^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/u.test(file))
    .sort()
  if (!listed.length) throw new Error('MiaoXYZ source must be tracked in the exact reviewed commit')
  return listed.map(relativePath => ({
    relativePath,
    digest: digestBytes(fs.readFileSync(path.join(repoRoot, relativePath))),
  }))
}

const readWorkerConfig = repoRoot => JSON.parse(fs.readFileSync(
  path.join(appRootFrom(repoRoot), 'wrangler.jsonc'),
  'utf8',
))

export const validateProductionConfig = (config, governanceEvidence) => {
  const issues = []
  const production = config?.env?.production
  if (!production || production.name !== 'agentic-miaoxyz-production') issues.push('production Worker name must be agentic-miaoxyz-production')
  const configuredRoutes = Array.isArray(production?.routes)
    ? production.routes.map(route => route.pattern).sort()
    : []
  if (JSON.stringify(configuredRoutes) !== JSON.stringify([...routePatterns].sort())) {
    issues.push('production routes must exactly target airvio.co/MiaoXYZ and airvio.co/MiaoXYZ/*')
  }
  if (production?.routes?.some(route => route.zone_name !== 'airvio.co')) {
    issues.push('both production routes must use the airvio.co zone')
  }
  if (production?.vars?.APP_BASE_PATH !== '/MiaoXYZ') issues.push('production APP_BASE_PATH must be /MiaoXYZ')
  if (production?.vars?.DEPLOYMENT_ENV !== 'production') issues.push('production DEPLOYMENT_ENV must be production')
  if (production?.vars?.RELEASE_SOURCE_REVISION !== 'unreleased' || production?.vars?.RELEASE_CANDIDATE_DIGEST !== 'unreleased') {
    issues.push('production release identity vars must remain unreleased placeholders in source configuration')
  }
  if (production?.version_metadata?.binding !== 'CF_VERSION_METADATA') {
    issues.push('production must bind Cloudflare Worker version metadata as CF_VERSION_METADATA')
  }
  if (production?.workers_dev !== false) issues.push('production workers.dev must be disabled')
  if (production?.preview_urls !== false) issues.push('production preview URLs must be disabled')
  for (const name of approvalNames) {
    if (production?.vars?.[name] !== 'true') issues.push(`${name} must be true after its evidence is approved`)
  }
  const secrets = [...(production?.secrets?.required ?? [])].sort()
  if (JSON.stringify(secrets) !== JSON.stringify([...requiredSecrets].sort())) {
    issues.push('production required secrets must name OPERATOR_ACCESS_TOKEN and RATE_LIMIT_HMAC_SECRET')
  }
  const database = production?.d1_databases?.find(binding => binding.binding === 'DB')
  const databaseId = database?.database_id
  if (production?.d1_databases?.length !== 1 || database?.database_name !== 'agentic-miaoxyz-production' || database?.migrations_dir !== 'migrations') {
    issues.push('production must use only the agentic-miaoxyz-production D1 binding and tracked migrations directory')
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(String(databaseId || '')) || /^0{8}-0{4}-4{4}-8{4}-0{12}$/iu.test(String(databaseId || ''))) {
    issues.push('production D1 database ID must be a provisioned UUID')
  }
  validateGovernanceEvidence(governanceEvidence, issues)
  if (issues.length) throw new Error(`MiaoXYZ Production preflight is blocked:\n- ${issues.join('\n- ')}`)
  return { production, databaseId }
}

export const validateGovernanceEvidence = (value, issues = []) => {
  const names = ['privacyBaselineDigest', 'dataRegionDigest', 'backupRestoreDigest', 'rateLimitReviewDigest']
  if (!value || value.schema !== MIAOXYZ_GOVERNANCE_SCHEMA || value.status !== 'approved') {
    issues.push('governance evidence must use the approved MiaoXYZ evidence schema')
    return issues
  }
  for (const name of names) {
    if (!digestPattern.test(String(value[name] || ''))) issues.push(`${name} must contain a retained evidence digest`)
  }
  if (typeof value.reviewedAt !== 'string' || Number.isNaN(Date.parse(value.reviewedAt)) ||
      new Date(Date.parse(value.reviewedAt)).toISOString() !== value.reviewedAt) {
    issues.push('governance reviewedAt must be an ISO timestamp')
  }
  return issues
}

const collectVersions = value => {
  const found = new Map()
  const visit = node => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    const versionId = node.version_id ?? node.versionId
    const percentage = node.percentage ?? node.traffic_percentage
    if (versionPattern.test(String(versionId || '')) && Number.isFinite(Number(percentage))) {
      found.set(String(versionId), { versionId: String(versionId), percentage: Number(percentage) })
    }
    Object.values(node).forEach(visit)
  }
  visit(value)
  const versions = [...found.values()].sort((left, right) => left.versionId.localeCompare(right.versionId))
  if (versions.length && versions.reduce((sum, entry) => sum + entry.percentage, 0) !== 100) {
    throw new Error('MiaoXYZ baseline active-version percentages must total 100')
  }
  return versions
}

const wranglerPath = repoRoot => path.join(appRootFrom(repoRoot), 'node_modules/.bin/wrangler')
const runWrangler = (repoRoot, args, { allowMissingScript = false } = {}) => {
  const appRoot = appRootFrom(repoRoot)
  try {
    return execFileSync(wranglerPath(repoRoot), [...args, '--config', 'wrangler.jsonc'], {
      cwd: appRoot,
      encoding: 'utf8',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    const detail = `${error?.stderr || ''}\n${error?.stdout || ''}`
    if (allowMissingScript && /(?:10007|script (?:does not exist|not found)|worker script.*not found)/iu.test(detail)) return ''
    throw new Error(`MiaoXYZ protected preflight command failed: wrangler ${args[0]} ${args[1] || ''}`)
  }
}

const cloudflareApiResult = async (url, token) => {
  let response
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new Error('MiaoXYZ read-only Cloudflare inventory request failed')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`MiaoXYZ read-only Cloudflare inventory returned HTTP ${response.status}`)
  }
  let payload
  try { payload = await response.json() } catch { throw new Error('MiaoXYZ Cloudflare inventory response was not JSON') }
  if (payload?.success !== true || !Array.isArray(payload.errors) || payload.errors.length > 0) {
    throw new Error('MiaoXYZ Cloudflare inventory was not complete and successful')
  }
  return payload.result
}

const captureRouteInventory = async () => {
  const token = requireText(process.env.CLOUDFLARE_API_TOKEN, 'read-only Cloudflare API token')
  const accountId = requireText(process.env.CLOUDFLARE_ACCOUNT_ID, 'Cloudflare account ID').toLowerCase()
  if (!/^[0-9a-f]{32}$/u.test(accountId)) throw new Error('Cloudflare account ID must be 32 hexadecimal characters')
  const zoneId = requireText(process.env.CLOUDFLARE_ZONE_ID, 'Cloudflare airvio.co zone ID').toLowerCase()
  if (!/^[0-9a-f]{32}$/u.test(zoneId)) throw new Error('Cloudflare airvio.co zone ID must be 32 hexadecimal characters')
  const zone = await cloudflareApiResult(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, token)
  if (zone?.id !== zoneId || String(zone?.name || '').toLowerCase() !== 'airvio.co' || zone?.account?.id !== accountId) {
    throw new Error('MiaoXYZ route inventory token, account ID, or zone ID does not identify airvio.co')
  }
  const routes = await cloudflareApiResult(`https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`, token)
  if (!Array.isArray(routes)) throw new Error('MiaoXYZ route inventory is incomplete')
  const scopedRoutes = routes
    .filter(route => typeof route?.pattern === 'string')
    .filter(route => {
      const pattern = route.pattern.replace(/^https?:\/\//iu, '')
      const slash = pattern.indexOf('/')
      const hostname = (slash < 0 ? pattern : pattern.slice(0, slash)).toLowerCase()
      return hostname === 'airvio.co' || hostname === '*airvio.co' || hostname === '*' || hostname.endsWith('.airvio.co')
    })
    .map(route => ({ id: String(route.id || ''), pattern: route.pattern, script: route.script ?? null }))
    .sort((left, right) => left.pattern.localeCompare(right.pattern) || left.id.localeCompare(right.id))
  if (scopedRoutes.some(route => !route.id || (route.script !== null && typeof route.script !== 'string'))) {
    throw new Error('MiaoXYZ route inventory contains a malformed route')
  }
  return { accountId, zoneId, routes: scopedRoutes }
}

const validateRouteOwnership = (routeInventory, workerName) => {
  for (const route of routeInventory.routes) {
    const pattern = route.pattern.replace(/^https?:\/\//iu, '')
    const slash = pattern.indexOf('/')
    const hostname = (slash < 0 ? pattern : pattern.slice(0, slash)).toLowerCase()
    if (hostname !== 'airvio.co' && hostname !== '*airvio.co' && hostname !== '*') continue
    const routePath = slash < 0 ? '/' : pattern.slice(slash)
    const literalPathPrefix = routePath.split('*', 1)[0]
    if (routePath !== '/MiaoXYZ' && !routePath.startsWith('/MiaoXYZ/') && literalPathPrefix !== '/MiaoXYZ') continue
    if (route.script !== workerName) {
      throw new Error(`MiaoXYZ route overlap is owned by ${route.script || 'a route without a Worker'}: ${route.pattern}`)
    }
  }
}

export const captureProductionBaseline = async repoRoot => {
  const config = readWorkerConfig(repoRoot)
  const production = config.env?.production
  if (!production) throw new Error('production Wrangler environment is missing')
  requireText(process.env.CLOUDFLARE_API_TOKEN, 'read-only Cloudflare API token')
  requireText(process.env.CLOUDFLARE_ACCOUNT_ID, 'Cloudflare account ID')
  const routeInventory = await captureRouteInventory()
  validateRouteOwnership(routeInventory, production.name)
  const statusText = runWrangler(repoRoot, [
    'deployments', 'status', '--name', production.name, '--json', '--env', 'production',
  ], { allowMissingScript: true })
  let status = null
  if (statusText.trim()) {
    try { status = JSON.parse(statusText) } catch { throw new Error('Wrangler deployment status did not return JSON') }
  }
  const migrationText = runWrangler(repoRoot, [
    'd1', 'migrations', 'list', production.d1_databases?.find(binding => binding.binding === 'DB')?.database_name,
    '--remote', '--env', 'production',
  ])
  return {
    schema: MIAOXYZ_BASELINE_SCHEMA,
    workerName: production.name,
    accountId: routeInventory.accountId,
    zoneId: routeInventory.zoneId,
    routes: routeInventory.routes,
    activeVersions: collectVersions(status),
    migrationStateDigest: digestBytes(migrationText.replace(/\r\n/gu, '\n').trim()),
    d1DatabaseId: production.d1_databases?.find(binding => binding.binding === 'DB')?.database_id,
  }
}

const validateBaseline = baseline => {
  if (!baseline || baseline.schema !== MIAOXYZ_BASELINE_SCHEMA || baseline.workerName !== 'agentic-miaoxyz-production') {
    throw new Error('MiaoXYZ baseline state schema or Worker identity is invalid')
  }
  if (!Array.isArray(baseline.activeVersions)) throw new Error('MiaoXYZ baseline activeVersions must be an array')
  if (!/^[0-9a-f]{32}$/u.test(String(baseline.accountId || '')) ||
      !/^[0-9a-f]{32}$/u.test(String(baseline.zoneId || '')) || !Array.isArray(baseline.routes)) {
    throw new Error('MiaoXYZ baseline account, route zone, and inventory are invalid')
  }
  for (const route of baseline.routes) {
    if (!route || typeof route.id !== 'string' || !route.id || typeof route.pattern !== 'string' ||
        (route.script !== null && typeof route.script !== 'string')) {
      throw new Error('MiaoXYZ baseline contains a malformed route')
    }
  }
  validateRouteOwnership({ routes: baseline.routes }, baseline.workerName)
  for (const version of baseline.activeVersions) {
    if (!versionPattern.test(String(version.versionId || '')) || !Number.isFinite(version.percentage) || version.percentage < 0 || version.percentage > 100) {
      throw new Error('MiaoXYZ baseline contains an invalid active Worker version')
    }
  }
  if (baseline.activeVersions.length && baseline.activeVersions.reduce((sum, version) => sum + version.percentage, 0) !== 100) {
    throw new Error('MiaoXYZ baseline active-version percentages must total 100')
  }
  requireDigest(baseline.migrationStateDigest, 'MiaoXYZ migration baseline digest')
  return baseline
}

const artifactDigests = repoRoot => readCommittedWorkerFiles(repoRoot)
const migrationsDigest = repoRoot => {
  const migrationDirectory = path.join(appRootFrom(repoRoot), 'migrations')
  const files = fs.readdirSync(migrationDirectory).filter(file => file.endsWith('.sql')).sort()
  if (!files.length) throw new Error('MiaoXYZ has no D1 migrations')
  return digest(files.map(file => ({ file, digest: digestBytes(fs.readFileSync(path.join(migrationDirectory, file))) })))
}

const createCandidateCore = ({ repoRoot, sourceRevision, sourceTree, localReview, releaseEvidence, governanceEvidence, baseline }) => {
  requireSha(sourceRevision, 'source revision')
  requireSha(sourceTree, 'source tree')
  validateLocalReviewCandidate(localReview)
  if (localReview.source.revision !== sourceRevision || localReview.source.tree !== sourceTree) {
    throw new Error('local turn:end review does not bind the exact MiaoXYZ source revision and tree')
  }
  const normalizedReleaseEvidence = normalizeReleaseEvidence(releaseEvidence, {
    repository: 'huijoohwee/agentic-graph',
    sourceRevision,
  })
  validateBaseline(baseline)
  if (baseline.d1DatabaseId !== readWorkerConfig(repoRoot).env?.production?.d1_databases?.find(binding => binding.binding === 'DB')?.database_id) {
    throw new Error('MiaoXYZ baseline D1 identity drifted from Wrangler configuration')
  }
  const { production, databaseId } = validateProductionConfig(readWorkerConfig(repoRoot), governanceEvidence)
  const files = artifactDigests(repoRoot)
  const target = {
    workerName: production.name,
    routes: routePatterns,
    basePath: production.vars.APP_BASE_PATH,
  }
  return {
    schema: MIAOXYZ_CANDIDATE_SCHEMA,
    status: 'awaiting-human-authorization',
    source: { repository: 'huijoohwee/agentic-graph', revision: sourceRevision, tree: sourceTree },
    target,
    worker: {
      artifactDigest: digest(files),
      fileCount: files.length,
      wranglerConfigDigest: digest(readWorkerConfig(repoRoot)),
      migrationsDigest: migrationsDigest(repoRoot),
    },
    database: { name: 'agentic-miaoxyz-production', id: databaseId },
    governance: {
      privacyBaselineDigest: governanceEvidence.privacyBaselineDigest,
      dataRegionDigest: governanceEvidence.dataRegionDigest,
      backupRestoreDigest: governanceEvidence.backupRestoreDigest,
      rateLimitReviewDigest: governanceEvidence.rateLimitReviewDigest,
      reviewedAt: governanceEvidence.reviewedAt,
    },
    baseline,
    localReviewCandidateDigest: localReview.candidateDigest,
    releaseEvidenceDigest: digest(normalizedReleaseEvidence),
  }
}

export const createMiaoxyzCandidate = input => {
  const core = createCandidateCore(input)
  const candidateDigest = digest(core)
  const targetDigest = digest(core.target)
  const lifecycleCandidateDigest = digest({
    schema: 'agentic-miaoxyz-lifecycle-candidate/v1',
    sourceRevision: core.source.revision,
    candidateDigest,
    targetDigest,
    artifactDigest: core.worker.artifactDigest,
    rollbackBaselineDigest: digest(core.baseline),
    releaseEvidenceDigest: core.releaseEvidenceDigest,
  })
  return Object.freeze({ ...core, candidateDigest, lifecycleCandidateDigest, targetDigest })
}

export const validateMiaoxyzCandidate = (candidate, repoRoot) => {
  if (!candidate || candidate.schema !== MIAOXYZ_CANDIDATE_SCHEMA || candidate.status !== 'awaiting-human-authorization') {
    throw new Error('MiaoXYZ Production candidate schema or state is invalid')
  }
  for (const field of ['candidateDigest', 'lifecycleCandidateDigest', 'targetDigest']) requireDigest(candidate[field], field)
  const {
    candidateDigest,
    lifecycleCandidateDigest,
    targetDigest,
    ...core
  } = candidate
  if (candidateDigest !== digest(core)) throw new Error('MiaoXYZ candidate digest drifted')
  if (targetDigest !== digest(core.target)) throw new Error('MiaoXYZ target digest drifted')
  const expectedLifecycleDigest = digest({
    schema: 'agentic-miaoxyz-lifecycle-candidate/v1',
    sourceRevision: core.source.revision,
    candidateDigest,
    targetDigest,
    artifactDigest: core.worker.artifactDigest,
    rollbackBaselineDigest: digest(core.baseline),
    releaseEvidenceDigest: core.releaseEvidenceDigest,
  })
  if (lifecycleCandidateDigest !== expectedLifecycleDigest) throw new Error('MiaoXYZ lifecycle candidate digest drifted')
  requireSha(core.source.revision, 'MiaoXYZ source revision')
  requireSha(core.source.tree, 'MiaoXYZ source tree')
  if (core.source.repository !== 'huijoohwee/agentic-graph') throw new Error('MiaoXYZ candidate repository identity is invalid')
  for (const [value, label] of [
    [core.worker?.artifactDigest, 'Worker artifact digest'],
    [core.worker?.wranglerConfigDigest, 'Wrangler config digest'],
    [core.worker?.migrationsDigest, 'D1 migrations digest'],
    [core.localReviewCandidateDigest, 'local review candidate digest'],
    [core.releaseEvidenceDigest, 'release evidence digest'],
    [core.governance?.privacyBaselineDigest, 'privacy evidence digest'],
    [core.governance?.dataRegionDigest, 'data region evidence digest'],
    [core.governance?.backupRestoreDigest, 'backup/restore evidence digest'],
    [core.governance?.rateLimitReviewDigest, 'rate-limit evidence digest'],
  ]) requireDigest(value, label)
  if (!Number.isSafeInteger(core.worker?.fileCount) || core.worker.fileCount < 1) {
    throw new Error('MiaoXYZ candidate Worker file count is invalid')
  }
  const config = readWorkerConfig(repoRoot)
  const { production, databaseId } = validateProductionConfig(config, {
    schema: MIAOXYZ_GOVERNANCE_SCHEMA,
    status: 'approved',
    ...core.governance,
  })
  const files = artifactDigests(repoRoot)
  if (core.target?.workerName !== production.name ||
      JSON.stringify(core.target?.routes) !== JSON.stringify(routePatterns) ||
      core.target?.basePath !== production.vars.APP_BASE_PATH ||
      core.worker.artifactDigest !== digest(files) ||
      core.worker.fileCount !== files.length ||
      core.worker.wranglerConfigDigest !== digest(config) ||
      core.worker.migrationsDigest !== migrationsDigest(repoRoot) ||
      core.database?.name !== 'agentic-miaoxyz-production' ||
      core.database?.id !== databaseId ||
      core.baseline?.d1DatabaseId !== databaseId ||
      core.baseline?.workerName !== production.name) {
    throw new Error('MiaoXYZ candidate does not match the exact tracked Worker bytes, target, D1, or migrations')
  }
  validateBaseline(core.baseline)
  if (typeof core.governance.reviewedAt !== 'string' || Number.isNaN(Date.parse(core.governance.reviewedAt)) ||
      new Date(Date.parse(core.governance.reviewedAt)).toISOString() !== core.governance.reviewedAt) {
    throw new Error('MiaoXYZ candidate governance review timestamp is invalid')
  }
  const currentSha = gitText(repoRoot, ['rev-parse', 'HEAD'])
  const currentTree = gitText(repoRoot, ['rev-parse', 'HEAD^{tree}'])
  if (currentSha !== core.source.revision || currentTree !== core.source.tree) {
    throw new Error('MiaoXYZ source changed after candidate preparation')
  }
  return candidate
}

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

const assertProtectedDeployRuntime = ({ repository, runId, candidate }) => {
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

const parseVersionList = value => {
  const output = typeof value === 'string' ? JSON.parse(value) : value
  const versions = collectVersions(output)
  return versions
}

const runGhText = (args, input) => execFileSync('gh', args, {
  encoding: 'utf8',
  input: input === undefined ? undefined : `${JSON.stringify(input)}\n`,
  stdio: ['pipe', 'pipe', 'pipe'],
}).trim()
const runGhJson = args => JSON.parse(runGhText(args))

const listRunArtifacts = (repository, runId) => runGhJson([
  'api', `repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`,
])?.artifacts ?? []

const selectMiaoxyzArtifact = (artifacts, run) => {
  const exactName = `miaoxyz-production-candidate-${run.head_sha}-${run.id}`
  const matches = artifacts.filter(artifact => artifact?.expired === false && artifact?.name === exactName)
  if (matches.length !== 1) throw new Error(`Production Release needs one exact MiaoXYZ candidate artifact; found ${matches.length}`)
  return matches[0]
}

const authorize = async ({ repository, runId, repoRoot }) => {
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

const writeSecrets = output => {
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

const compareBaseline = (expected, actual) => {
  validateBaseline(expected)
  validateBaseline(actual)
  if (JSON.stringify(expected.activeVersions) !== JSON.stringify(actual.activeVersions) ||
      expected.migrationStateDigest !== actual.migrationStateDigest ||
      expected.d1DatabaseId !== actual.d1DatabaseId ||
      expected.accountId !== actual.accountId ||
      expected.zoneId !== actual.zoneId ||
      digest(expected.routes) !== digest(actual.routes)) {
    throw new Error('MiaoXYZ Production state drifted after candidate authorization; no migration or deployment was started')
  }
}

const probeProduction = async ({ sourceRevision, candidateDigest, expectedVersionIds } = {}) => {
  const probes = [
    { url: 'https://airvio.co/MiaoXYZ/', expected: response => response.ok },
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

const readActiveVersions = (repoRoot, workerName) => {
  const statusText = runWrangler(repoRoot, [
    'deployments', 'status', '--name', workerName, '--json', '--env', 'production',
  ], { allowMissingScript: true })
  if (!statusText.trim()) return []
  try { return collectVersions(JSON.parse(statusText)) } catch (error) {
    if (error?.message?.includes('percentages must total 100')) throw error
    throw new Error('MiaoXYZ active Worker version status did not return valid JSON')
  }
}

const deploy = async ({ repoRoot, candidatePath, approvalsPath, repository, runId, expectedCandidateDigest, receiptPath }) => {
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

const main = async () => {
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
