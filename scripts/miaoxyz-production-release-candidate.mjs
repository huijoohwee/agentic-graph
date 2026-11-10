import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { validateLocalReviewCandidate } from './production-release-authorization.mjs'
import { normalizeReleaseEvidence } from './lib/production-release-lifecycle-evidence.mjs'
import {
  MIAOXYZ_BASELINE_SCHEMA, MIAOXYZ_CANDIDATE_SCHEMA, MIAOXYZ_GOVERNANCE_SCHEMA,
  appRootFrom, digest, digestBytes, digestPattern, gitText, readCommittedWorkerFiles,
  readWorkerConfig, requireDigest, requireSha, requireText, routePatterns, validateProductionConfig,
  versionPattern,
} from './miaoxyz-production-release-core.mjs'

export const collectVersions = value => {
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

export const wranglerPath = repoRoot => path.join(appRootFrom(repoRoot), 'node_modules/.bin/wrangler')
export const runWrangler = (repoRoot, args, { allowMissingScript = false } = {}) => {
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

export const cloudflareApiResult = async (url, token) => {
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

export const captureRouteInventory = async () => {
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

export const validateRouteOwnership = (routeInventory, workerName) => {
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
  const database = production.d1_databases?.find(binding => binding.binding === 'DB')
  if (!database?.database_name || !database.database_id) throw new Error('production D1 identity is missing')
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
  const d1InfoText = runWrangler(repoRoot, [
    'd1', 'info', database.database_name, '--json', '--env', 'production',
  ])
  let d1Info
  try { d1Info = JSON.parse(d1InfoText) } catch { throw new Error('Wrangler D1 info did not return JSON') }
  const d1Database = d1Info?.result && typeof d1Info.result === 'object' ? d1Info.result : d1Info
  if (d1Database?.uuid !== database.database_id || d1Database?.name !== database.database_name) {
    throw new Error('MiaoXYZ D1 info does not match the reviewed production database identity')
  }
  const d1Location = {
    runningInRegion: d1Database.running_in_region,
    jurisdiction: d1Database.jurisdiction,
    readReplicationMode: d1Database.read_replication?.mode,
  }
  if (d1Location.runningInRegion !== 'APAC' || d1Location.jurisdiction !== null ||
      d1Location.readReplicationMode !== 'disabled') {
    throw new Error('MiaoXYZ production D1 no longer matches the approved APAC best-effort, no-jurisdiction, replication-disabled decision')
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
    d1Location,
    migrationStateDigest: digestBytes(migrationText.replace(/\r\n/gu, '\n').trim()),
    d1DatabaseId: database.database_id,
  }
}

export const validateBaseline = baseline => {
  if (!baseline || baseline.schema !== MIAOXYZ_BASELINE_SCHEMA || baseline.workerName !== 'agentic-miaoxyz-production') {
    throw new Error('MiaoXYZ baseline state schema or Worker identity is invalid')
  }
  if (baseline.d1Location?.runningInRegion !== 'APAC' || baseline.d1Location?.jurisdiction !== null ||
      baseline.d1Location?.readReplicationMode !== 'disabled') {
    throw new Error('MiaoXYZ baseline must bind the approved APAC best-effort D1 location, no jurisdiction, and disabled read replication')
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

export const artifactDigests = repoRoot => readCommittedWorkerFiles(repoRoot)
export const migrationsDigest = repoRoot => {
  const migrationDirectory = path.join(appRootFrom(repoRoot), 'migrations')
  const files = fs.readdirSync(migrationDirectory).filter(file => file.endsWith('.sql')).sort()
  if (!files.length) throw new Error('MiaoXYZ has no D1 migrations')
  return digest(files.map(file => ({ file, digest: digestBytes(fs.readFileSync(path.join(migrationDirectory, file))) })))
}

export const createCandidateCore = ({ repoRoot, sourceRevision, sourceTree, localReview, releaseEvidence, governanceEvidence, baseline }) => {
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
