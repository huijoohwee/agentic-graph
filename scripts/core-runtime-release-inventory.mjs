import { createHash } from 'node:crypto'
import { digest } from './travel-mesh-release-plan.mjs'
import {
  assertWorkerSubdomainDisabled, cloudflareApiAllPages, cloudflareApiEnvelope, parseR2BucketNames,
} from './travel-mesh-release-inventory.mjs'
import { validateCoreConfiguration } from './core-runtime-release-plan.mjs'
import { inspectCoreStorageDomain } from './core-runtime-release-domain.mjs'

export const coreExposure = async (apiFetch, environment) => [
  await assertWorkerSubdomainDisabled(apiFetch, environment, 'agentic-storage'),
]

// Inventory only existing resources. This profile cannot bootstrap Workers,
// subscriptions, queues, AI providers, tunnels, or paid execution services.
export const coreResourceReadiness = async ({ run, runJson, environment, apiFetch = fetch }) => {
  const { variables: v } = validateCoreConfiguration(environment)
  const account = v.CLOUDFLARE_ACCOUNT_ID, zone = v.AGENTIC_OS_PUBLIC_ZONE_ID
  const root = 'https://api.cloudflare.com/client/v4'
  const evidence = {}, failures = []
  const checks = [
    ['database', async () => {
      const databases = await runJson(run, ['--no-install', 'wrangler', 'd1', 'list', '--json'], 'core D1 inventory')
      const matches = databases.filter(db => db.uuid === v.AGENTIC_OS_STORAGE_D1_DATABASE_ID)
      if (matches.length !== 1 || matches[0].name !== v.AGENTIC_OS_STORAGE_D1_DATABASE_NAME) throw new Error('core D1 identity differs')
      return { id: matches[0].uuid, name: matches[0].name }
    }],
    ['blobStorage', async () => {
      const names = parseR2BucketNames((await run(['--no-install', 'wrangler', 'r2', 'bucket', 'list'])).stdout)
      if (!names.has(v.AGENTIC_OS_STORAGE_R2_BUCKET)) throw new Error('core R2 bucket is absent')
      return { name: v.AGENTIC_OS_STORAGE_R2_BUCKET }
    }],
    ['route', async () => {
      const { result } = await cloudflareApiEnvelope(apiFetch, `${root}/zones/${zone}`, environment, 'core zone')
      if (result?.id !== zone || result.name !== v.AGENTIC_OS_PUBLIC_ZONE_NAME || result.account?.id !== account) throw new Error('core zone ownership differs')
      const routes = await cloudflareApiAllPages(apiFetch, `${root}/zones/${zone}/workers/routes`, environment, 'core routes', { singlePage: true })
      const owned = routes.filter(route => route.script === 'agentic-storage')
      if (owned.length !== 1 || owned[0].pattern !== `${v.AGENTIC_OS_PUBLIC_ZONE_NAME}/api/storage/*`) throw new Error('core storage route differs')
      return { zone, pattern: owned[0].pattern, script: owned[0].script }
    }],
    ['storageDomain', async () => inspectCoreStorageDomain({ configuration: { variables: v }, environment, apiFetch })],
    ['browserSessionAuthority', async () => inspectCoreOwner({ configuration: { variables: v }, environment, apiFetch })],
    ['exposure', async () => coreExposure(apiFetch, environment)],
  ]
  for (const [name, check] of checks) {
    try { evidence[name] = digest(await check()) }
    catch (error) { failures.push(`${name}: ${error.message}`) }
  }
  return { evidence, failures }
}

const ownerStateQuery = v => ({
  sql: `SELECT
    (SELECT COUNT(*) FROM workspaces WHERE id = ?) AS workspace_count,
    (SELECT COUNT(*) FROM users) AS user_count,
    (SELECT COUNT(*) FROM auth_sessions) AS session_count,
    (SELECT COUNT(*) FROM workspace_memberships) AS membership_count,
    (SELECT COUNT(*) FROM users u JOIN workspace_memberships m ON m.user_id = u.id
      WHERE u.id = ? AND u.email = ? AND u.status = 'active' AND m.workspace_id = ?
        AND m.status = 'active' AND m.role = 'owner') AS owner_count`,
  params: [v.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID, v.AGENTIC_OS_STORAGE_OWNER_ID,
    v.AGENTIC_OS_STORAGE_OWNER_EMAIL, v.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID],
})
const queryCoreD1 = async (configuration, environment, apiFetch, body) => {
  const v = configuration.variables
  const { result } = await cloudflareApiEnvelope(apiFetch,
    `https://api.cloudflare.com/client/v4/accounts/${v.CLOUDFLARE_ACCOUNT_ID}/d1/database/${v.AGENTIC_OS_STORAGE_D1_DATABASE_ID}/query`,
    environment, 'core identity authority', { method: 'POST', body })
  if (!Array.isArray(result) || result.length < 1 || result.some(row => row.success !== true || !Array.isArray(row.results))) {
    throw new Error('core identity authority response is malformed')
  }
  return result
}
export const inspectCoreOwner = async ({ configuration, environment, apiFetch = fetch }) => {
  const [result] = await queryCoreD1(configuration, environment, apiFetch, ownerStateQuery(configuration.variables))
  const state = result.results[0]
  if (!state || state.workspace_count !== 1 || !['user_count', 'session_count', 'membership_count', 'owner_count']
    .every(key => Number.isSafeInteger(state[key]) && state[key] >= 0)) throw new Error('core workspace or identity inventory is invalid')
  if (state.owner_count !== 1 && !(state.user_count === 0 && state.session_count === 0 && state.membership_count === 0)) {
    throw new Error('core operator lacks an existing owner grant; refusing identity takeover')
  }
  return state
}

// Parameterized additive writes, one provider batch. No existing identity,
// membership, expiry or revocation is overwritten. Concurrent contenders cannot
// create a second initial owner. Parent keys are never returned in receipts.
export const coreOwnerEnrollmentBatch = (configuration, nowIso) => {
  const v = configuration.variables, owner = v.AGENTIC_OS_STORAGE_OWNER_ID
  const workspace = v.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID, email = v.AGENTIC_OS_STORAGE_OWNER_EMAIL
  const sessionHash = createHash('sha256').update(configuration.ownerAccessKey).digest('hex')
  const memberId = `owner:${digest({ owner, workspace }).slice(0, 40)}`
  return [
    { sql: `INSERT INTO users (id, email, display_name, status, created_at, updated_at)
        SELECT ?, ?, ?, 'active', ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)
          AND NOT EXISTS (SELECT 1 FROM auth_sessions) AND NOT EXISTS (SELECT 1 FROM workspace_memberships)`,
      params: [owner, email, owner, nowIso, nowIso] },
    { sql: `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at, updated_at)
        SELECT ?, ?, u.id, 'owner', 'active', ?, ? FROM users u
        WHERE u.id = ? AND u.email = ? AND u.status = 'active'
          AND (SELECT COUNT(*) FROM users) = 1 AND NOT EXISTS (SELECT 1 FROM workspace_memberships)`,
      params: [memberId, workspace, nowIso, nowIso, owner, email] },
    { sql: `INSERT INTO auth_sessions (id, user_id, session_hash, expires_at, created_at, updated_at)
        SELECT ?, u.id, ?, ?, ?, ? FROM users u JOIN workspace_memberships m ON m.user_id = u.id
        WHERE u.id = ? AND u.email = ? AND u.status = 'active' AND m.workspace_id = ?
          AND m.status = 'active' AND m.role = 'owner' AND NOT EXISTS (SELECT 1 FROM auth_sessions WHERE session_hash = ?)`,
      params: [`operator:${sessionHash}`, sessionHash, v.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT,
        nowIso, nowIso, owner, email, workspace, sessionHash] },
    { sql: `SELECT s.id, s.expires_at, s.revoked_at FROM auth_sessions s
        JOIN users u ON u.id = s.user_id JOIN workspace_memberships m ON m.user_id = u.id
        WHERE s.session_hash = ? AND u.id = ? AND u.email = ? AND u.status = 'active'
          AND m.workspace_id = ? AND m.status = 'active' AND m.role = 'owner'`,
      params: [sessionHash, owner, email, workspace] },
  ]
}
export const enrollCoreOwner = async ({ configuration, environment, apiFetch = fetch, now = () => new Date() }) => {
  await inspectCoreOwner({ configuration, environment, apiFetch })
  const result = await queryCoreD1(configuration, environment, apiFetch,
    { batch: coreOwnerEnrollmentBatch(configuration, now().toISOString()) })
  const sessions = result.at(-1).results
  if (result.length !== 4 || sessions.length !== 1 || sessions[0].revoked_at !== null
    || sessions[0].expires_at !== configuration.variables.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT) {
    throw new Error('core operator session enrollment was not proved')
  }
  return { status: 'proved', disposition: 'retained-forward-compatible',
    ownerId: configuration.variables.AGENTIC_OS_STORAGE_OWNER_ID,
    workspaceId: configuration.variables.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID,
    expiresAt: sessions[0].expires_at, sessionIdDigest: digest(sessions[0].id) }
}
