import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const MIAOXYZ_CANDIDATE_SCHEMA = 'agentic-miaoxyz-production-candidate/v2'
export const MIAOXYZ_GOVERNANCE_SCHEMA = 'agentic-miaoxyz-production-governance-evidence/v1'
export const MIAOXYZ_BASELINE_SCHEMA = 'agentic-miaoxyz-production-baseline/v3'

export const routePatterns = ['airvio.co/MiaoXYZ*']
export const approvalNames = [
  'PRIVACY_BASELINE_APPROVED',
  'DATA_REGION_APPROVED',
  'BACKUP_RESTORE_APPROVED',
  'RATE_LIMIT_REVIEW_APPROVED',
]
export const requiredSecrets = ['OPERATOR_ACCESS_TOKEN', 'RATE_LIMIT_HMAC_SECRET']
export const shaPattern = /^[0-9a-f]{40}$/u
export const digestPattern = /^[0-9a-f]{64}$/u
export const versionPattern = /^[0-9a-f-]{36}$/iu

export const canonicalJson = value => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
export const digest = value => createHash('sha256').update(canonicalJson(value)).digest('hex')
export const digestBytes = value => createHash('sha256').update(value).digest('hex')
export const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
export const writeJson = (file, value, mode = 0o600) => {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode })
}
export const writeAtomicJson = (file, value, mode = 0o600) => {
  const target = path.resolve(file)
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeJson(temporary, value, mode)
    fs.renameSync(temporary, target)
  } finally {
    try { fs.unlinkSync(temporary) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }
}
export const requireText = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}
export const requireDigest = (value, label) => {
  if (!digestPattern.test(String(value || ''))) throw new Error(`${label} must be a SHA-256 digest`)
}
export const requireSha = (value, label) => {
  if (!shaPattern.test(String(value || ''))) throw new Error(`${label} must be an exact Git SHA`)
}
export const repoRootFrom = value => path.resolve(value || path.join(import.meta.dirname, '..'))
export const appRootFrom = repoRoot => path.join(repoRoot, 'cloudflare/workers/miaoxyz')
export const gitText = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()

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

export const readWorkerConfig = repoRoot => JSON.parse(fs.readFileSync(
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
    issues.push('production route must exactly target airvio.co/MiaoXYZ* so query-bearing app URLs reach the Worker')
  }
  if (production?.routes?.some(route => route.zone_name !== 'airvio.co')) {
    issues.push('the production route must use the airvio.co zone')
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
