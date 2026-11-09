import fs from 'node:fs'
import path from 'node:path'

const API_ROOT = 'https://api.cloudflare.com/client/v4'
const DATABASE_PREFIX = 'miaoxyz-rehearsal-'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const SHA = /^[0-9a-f]{40}$/u

const required = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

const apiRequest = async ({ token, accountId, databaseId, method, endpoint, body, stage }) => {
  const response = await fetch(`${API_ROOT}/accounts/${accountId}/d1/database${endpoint(databaseId)}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  })
  let payload
  try { payload = await response.json() } catch { throw new Error(`${stage} returned non-JSON HTTP ${response.status}`) }
  if (!response.ok || payload?.success !== true || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
    throw new Error(`${stage} failed with Cloudflare HTTP ${response.status}`)
  }
  return payload.result
}

const query = async (context, sql, params = []) => {
  const result = await apiRequest({
    ...context,
    method: 'POST',
    endpoint: id => `/${id}/query`,
    body: { sql, params },
    stage: 'Synthetic D1 query',
  })
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true) {
    throw new Error('Synthetic D1 query did not return one successful result')
  }
  return result[0]
}

const readProbe = async context => {
  const result = await query(context,
    'SELECT record_id, payload FROM miaoxyz_restore_probe ORDER BY record_id')
  return (result.results ?? []).map(row => ({ recordId: row.record_id, payload: row.payload }))
}

const writeReceipt = (file, receipt) => {
  if (!file) return
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  fs.writeFileSync(path.resolve(file), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
}

const run = async () => {
  const receiptPath = process.env.MIAOXYZ_REHEARSAL_RECEIPT
  const receipt = {
    schema: 'agentic-miaoxyz-d1-restore-rehearsal/v1',
    status: 'started',
    repository: process.env.GITHUB_REPOSITORY ?? null,
    sourceRevision: process.env.GITHUB_SHA ?? null,
    workflowRunId: process.env.GITHUB_RUN_ID ?? null,
    workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    locationHintRequested: 'apac',
    workerRoutesTouched: false,
    productionDatabaseTouched: false,
    temporaryDatabaseCreated: false,
    bookmarkCaptured: false,
    mutationObserved: false,
    restoreVerified: false,
    temporaryDatabaseDeleted: false,
    startedAt: new Date().toISOString(),
  }
  let failure = null
  let temporary = null
  let token = null
  let accountId = null
  let expectedName = null
  let productionDatabaseId = null

  try {
    if (process.env.GITHUB_ACTIONS !== 'true'
      || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
      || process.env.GITHUB_REF !== 'refs/heads/main'
      || process.env.GITHUB_REPOSITORY !== 'huijoohwee/agentic-graph'
      || process.env.MIAOXYZ_REHEARSAL_ENVIRONMENT !== 'production') {
      throw new Error('Rehearsal is restricted to the manual protected main workflow')
    }
    const sourceRevision = required(process.env.GITHUB_SHA, 'GitHub source revision')
    const runId = required(process.env.GITHUB_RUN_ID, 'GitHub workflow run ID')
    const attempt = required(process.env.GITHUB_RUN_ATTEMPT, 'GitHub workflow run attempt')
    if (!SHA.test(sourceRevision) || !/^\d+$/u.test(runId) || !/^\d+$/u.test(attempt)) {
      throw new Error('GitHub workflow identity is malformed')
    }
    token = required(process.env.CLOUDFLARE_API_TOKEN, 'Cloudflare API token')
    accountId = required(process.env.CLOUDFLARE_ACCOUNT_ID, 'Cloudflare account ID').toLowerCase()
    if (!/^[0-9a-f]{32}$/u.test(accountId)) throw new Error('Cloudflare account ID is malformed')

    const configPath = path.join(process.cwd(), 'cloudflare/workers/miaoxyz/wrangler.jsonc')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    const productionBinding = config?.env?.production?.d1_databases?.find(item => item.binding === 'DB')
    if (productionBinding?.database_name !== 'agentic-miaoxyz-production'
      || !UUID.test(String(productionBinding?.database_id ?? ''))) {
      throw new Error('The reviewed production D1 identity is invalid')
    }
    productionDatabaseId = productionBinding.database_id.toLowerCase()
    expectedName = `${DATABASE_PREFIX}${runId}-${attempt}`
    receipt.temporaryDatabaseName = expectedName
    receipt.accountId = accountId

    const created = await apiRequest({
      token,
      accountId,
      method: 'POST',
      endpoint: () => '',
      body: { name: expectedName, primary_location_hint: 'apac', read_replication: { mode: 'disabled' } },
      stage: 'Temporary D1 creation',
    })
    const id = String(created?.uuid ?? '').toLowerCase()
    const name = String(created?.name ?? '')
    receipt.temporaryDatabaseId = id || null
    receipt.observedDatabaseVersion = created?.version ?? null
    receipt.observedRegion = created?.running_in_region ?? created?.primary_location_hint ?? null
    if (!UUID.test(id) || id === productionDatabaseId || name !== expectedName) {
      throw new Error('Cloudflare did not return the exact isolated temporary D1 identity')
    }
    temporary = { id, name }
    receipt.temporaryDatabaseCreated = true

    const context = { token, accountId, databaseId: id }
    await query(context,
      'CREATE TABLE miaoxyz_restore_probe (record_id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
    await query(context,
      'INSERT INTO miaoxyz_restore_probe (record_id, payload) VALUES (?, ?), (?, ?)',
      ['event-a', '{"requestId":"synthetic-request-a","action":"status-changed"}',
        'request-a', '{"status":"submitted","containsContactDetails":false}'])
    receipt.seededRowCount = (await readProbe(context)).length
    if (receipt.seededRowCount !== 2) throw new Error('Synthetic seed rows did not persist')

    const bookmarkResult = await apiRequest({
      token,
      accountId,
      databaseId: id,
      method: 'GET',
      endpoint: value => `/${value}/time_travel/bookmark`,
      stage: 'D1 Time Travel bookmark capture',
    })
    const bookmark = String(bookmarkResult?.bookmark ?? '')
    if (!bookmark) throw new Error('Cloudflare did not return a pre-mutation bookmark')
    receipt.bookmarkCaptured = true
    receipt.bookmarkDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bookmark))
      .then(buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join(''))
    receipt.bookmarkCapturedAt = new Date().toISOString()

    await query(context, "UPDATE miaoxyz_restore_probe SET payload = 'mutated-after-bookmark'")
    const mutatedRows = await readProbe(context)
    receipt.mutationObserved = mutatedRows.length === 2
      && mutatedRows.every(row => row.payload === 'mutated-after-bookmark')
    if (!receipt.mutationObserved) throw new Error('Synthetic post-bookmark mutation was not observed')

    const restored = await apiRequest({
      token,
      accountId,
      databaseId: id,
      method: 'POST',
      endpoint: value => `/${value}/time_travel/restore?bookmark=${encodeURIComponent(bookmark)}`,
      stage: 'Temporary D1 Time Travel restore',
    })
    receipt.restoreBookmark = restored?.bookmark ?? null
    const restoredRows = await readProbe(context)
    receipt.restoredRowCount = restoredRows.length
    receipt.restoreVerified = restoredRows.length === 2
      && restoredRows[0]?.recordId === 'event-a'
      && restoredRows[0]?.payload === '{"requestId":"synthetic-request-a","action":"status-changed"}'
      && restoredRows[1]?.recordId === 'request-a'
      && restoredRows[1]?.payload === '{"status":"submitted","containsContactDetails":false}'
    if (!receipt.restoreVerified) throw new Error('Restored synthetic schema or rows did not match the captured state')
    receipt.status = 'passed'
  } catch (error) {
    failure = error instanceof Error ? error.message : 'Unknown rehearsal failure'
  } finally {
    if (temporary && expectedName === temporary.name && temporary.id !== productionDatabaseId) {
      try {
        await apiRequest({
          token,
          accountId,
          databaseId: temporary.id,
          method: 'DELETE',
          endpoint: id => `/${id}`,
          stage: 'Temporary D1 deletion',
        })
        receipt.temporaryDatabaseDeleted = true
        receipt.deletedAt = new Date().toISOString()
      } catch (error) {
        failure = [failure, error instanceof Error ? error.message : 'Temporary D1 deletion failed']
          .filter(Boolean).join('; ')
      }
    }
    receipt.finishedAt = new Date().toISOString()
    if (failure) {
      receipt.status = 'failed'
      receipt.failure = failure
    }
    writeReceipt(receiptPath, receipt)
  }
  if (failure) throw new Error(failure)
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    temporaryDatabaseName: receipt.temporaryDatabaseName,
    temporaryDatabaseId: receipt.temporaryDatabaseId,
    restoreVerified: receipt.restoreVerified,
    temporaryDatabaseDeleted: receipt.temporaryDatabaseDeleted,
    receiptPath,
  })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  if (process.argv[2] !== 'run') {
    process.stderr.write('Use run in the protected MiaoXYZ D1 rehearsal workflow.\n')
    process.exitCode = 2
  } else {
    run().catch(error => {
      process.stderr.write(`${error instanceof Error ? error.message : 'MiaoXYZ D1 restore rehearsal failed'}\n`)
      process.exitCode = 1
    })
  }
}
