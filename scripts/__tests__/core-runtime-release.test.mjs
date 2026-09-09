import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import YAML from 'yaml'
import { DatabaseSync } from 'node:sqlite'
import { CORE_RUNTIME_PROFILE, selectRuntimeProfile } from '../runtime-release-profile.mjs'
import { validateCoreConfiguration, validateCoreOwnerAuthority } from '../core-runtime-release-plan.mjs'
import { coreResourceReadiness, coreOwnerEnrollmentBatch } from '../core-runtime-release-inventory.mjs'
import { probeCoreRuntime } from '../core-runtime-release-probes.mjs'
import { preflightMesh, deployMesh, restoreMesh, meshOutcomeOutputs } from '../travel-mesh-release.mjs'

const sourceSha = 'a'.repeat(40), candidateDigest = 'b'.repeat(64)
const authorization = { schema: 'agentic-human-authorization-receipt/v2', status: 'consumed', candidateDigest, controllerId: 'test-release', humanActorId: 'github-user:1234:operator' }
const environment = () => ({
  CLOUDFLARE_API_TOKEN: 'test-api-token', CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
  AGENTIC_OS_PUBLIC_ZONE_ID: '2'.repeat(32), AGENTIC_OS_PUBLIC_ZONE_NAME: 'airvio.co',
  AGENTIC_OS_STORAGE_D1_DATABASE_NAME: 'airvio', AGENTIC_OS_STORAGE_D1_DATABASE_ID: '633355bf-1a52-4085-bd3c-eba4220ff152',
  AGENTIC_OS_STORAGE_R2_BUCKET: 'agentic-storage-blobs', AGENTIC_OS_STORAGE_SIGNING_SECRET: 's'.repeat(48),
  AGENTIC_OS_STORAGE_OWNER_ID: authorization.humanActorId, AGENTIC_OS_STORAGE_OWNER_EMAIL: 'operator@airvio.co',
  AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID: 'kgws:canonical-docs', AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY: 'a'.repeat(64),
  AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT: new Date(Date.now() + 86400_000).toISOString(),
  GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sourceSha, GITHUB_WORKFLOW: 'Production Release',
  GITHUB_WORKFLOW_REF: 'owner/repository/.github/workflows/release.yml@refs/heads/main',
})
const readyBody = () => ({ ok: true, service: 'agentic-storage', scope: 'core', runtime: 'production', reasons: [],
  dependencies: { d1: 'ready', canvasRoom: 'ready', signingSecret: 'ready', browserSessionAccessConfiguration: 'configured', authSchema: 'ready', blobStorage: 'ready' } })
const provider = (env, { candidateReady = true, zoneAccount = env.CLOUDFLARE_ACCOUNT_ID } = {}) => {
  const config = validateCoreConfiguration(env), calls = [], versions = new Map()
  let active = 'baseline', deployment = 1
  const baseline = { id: active, annotations: { 'workers/tag': 'baseline' }, resources: { bindings: [
    { name: 'DB', type: 'd1', id: env.AGENTIC_OS_STORAGE_D1_DATABASE_ID },
    { name: 'AGENTIC_OS_STORAGE_BLOB_BUCKET', type: 'r2_bucket', bucket_name: env.AGENTIC_OS_STORAGE_R2_BUCKET },
    { name: 'AGENTIC_OS_CANVAS_ROOM', type: 'durable_object_namespace', namespace_id: 'preserved-namespace' },
    { name: 'AGENTIC_OS_STORAGE_LOCAL_RUNTIME', type: 'plain_text', text: 'false' },
  ] } }
  versions.set(active, baseline)
  const json = value => ({ stdout: JSON.stringify(value), stderr: '' })
  const run = async args => {
    calls.push([...args])
    const index = args.indexOf('--name')
    if (index >= 0) assert.equal(args[index + 1], 'agentic-storage', 'core must not act on optional Workers')
    if (args.includes('deployments') && args.includes('status')) return json({ id: String(deployment), created_on: '2026-09-10T00:00:00Z', versions: [{ version_id: active, percentage: 100 }] })
    if (args.includes('versions') && args.includes('list')) return json([...versions.values()])
    if (args.includes('versions') && args.includes('view')) return json(versions.get(args[args.indexOf('view') + 1]))
    if (args.includes('secret') && args.includes('list')) return json([])
    if (args.includes('d1') && args.includes('list')) return json([{ uuid: env.AGENTIC_OS_STORAGE_D1_DATABASE_ID, name: env.AGENTIC_OS_STORAGE_D1_DATABASE_NAME }])
    if (args.includes('r2')) return { stdout: `name: ${env.AGENTIC_OS_STORAGE_R2_BUCKET}\n`, stderr: '' }
    if (args.includes('d1') && args.includes('execute')) return json([{ results: fs.readdirSync(new URL('../../cloudflare/d1/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).map(name => ({ name })) }])
    if (args.includes('upload')) {
      if (args.includes('--dry-run')) return json({})
      const candidate = structuredClone(baseline)
      candidate.id = 'candidate'
      candidate.annotations = { 'workers/tag': args[args.indexOf('--tag') + 1], 'workers/message': args[args.indexOf('--message') + 1] }
      const bindings = new Map(candidate.resources.bindings.map(binding => [binding.name, binding]))
      for (const [name, text] of Object.entries(config.overrides.storage)) bindings.set(name, { name, type: 'plain_text', text })
      for (const name of Object.keys(config.secrets.storage)) bindings.set(name, { name, type: 'secret_text' })
      candidate.resources.bindings = [...bindings.values()]
      versions.set(candidate.id, candidate)
      return json({})
    }
    if (args.includes('versions') && args.includes('deploy')) { active = args[args.indexOf('deploy') + 1].split('@')[0]; deployment++; return json({}) }
    throw new Error(`unexpected command: ${args.join(' ')}`)
  }
  const envelope = (result, paged = false) => Response.json({ success: true, result, ...(paged ? { result_info: { total_pages: 1 } } : {}) })
  const apiFetch = async (rawUrl, options) => {
    const url = new URL(rawUrl)
    if (url.pathname.endsWith('/subdomain')) return envelope({ enabled: false, previews_enabled: false })
    if (url.pathname.endsWith(`/zones/${env.AGENTIC_OS_PUBLIC_ZONE_ID}`)) return envelope({ id: env.AGENTIC_OS_PUBLIC_ZONE_ID, name: 'airvio.co', account: { id: zoneAccount } })
    if (url.pathname.endsWith('/workers/routes')) return envelope([{ pattern: 'airvio.co/api/storage/*', script: 'agentic-storage' }])
    if (url.pathname.endsWith('/query')) {
      const input = JSON.parse(options.body)
      return envelope(input.batch ? input.batch.map((_, i) => ({ success: true, results: i === 3 ? [{ id: 'operator:hashed', expires_at: env.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT, revoked_at: null }] : [] }))
        : [{ success: true, results: [{ workspace_count: 1, user_count: 0, session_count: 0, membership_count: 0, owner_count: 0 }] }])
    }
    throw new Error(`unexpected provider read: ${url}`)
  }
  let loggedOut = false
  const fetchFn = async rawUrl => {
    const url = new URL(rawUrl)
    if (url.pathname.endsWith('/auth/login')) { loggedOut = false; return new Response(null, { status: 303, headers: { location: '/agentic-graph/', 'set-cookie': `__Host-agentic_os_storage_session=${'b'.repeat(64)}; Path=/; Max-Age=900; Secure; HttpOnly; SameSite=Strict` } }) }
    if (url.pathname.endsWith('/auth/logout')) { loggedOut = true; return new Response(null, { status: 204 }) }
    if (url.pathname.endsWith('/auth/session')) return loggedOut ? Response.json({ ok: false }, { status: 401 })
      : Response.json({ ok: true, authenticated: true, workspaceId: env.AGENTIC_OS_STORAGE_OWNER_WORKSPACE_ID, session: { expiresAt: env.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT } })
    if (url.pathname.endsWith('/livez')) return Response.json({ ok: true, service: 'agentic-storage', status: 'live' })
    if (url.pathname.includes('/export/')) return Response.json({ ok: false, code: 'forbidden' }, { status: 401 })
    if (url.pathname.endsWith('/readyz/core')) return Response.json(candidateReady ? readyBody() : { ok: false }, { status: candidateReady ? 200 : 503 })
    throw new Error(`unexpected public probe: ${url}`)
  }
  return { run, apiFetch, fetchFn, calls, versions, active: () => active }
}
const inputs = env => ({ sourceSha, candidateDigest, authorization, environment: env, profile: CORE_RUNTIME_PROFILE })

test('reviewed source selects a closed core or travel profile without an environment escape hatch', () => {
  const value = { schema: 'agentic-graph-production-release-profile/v1', profile: 'core', costPolicy: 'existing-free-resources-only' }
  assert.deepEqual(selectRuntimeProfile(value).plan.map(unit => unit.id), ['storage'])
  assert.equal(selectRuntimeProfile({ ...value, profile: 'travel' }).plan.length, 10)
  for (const invalid of [{ ...value, profile: 'none' }, { ...value, skipChecks: true }, { ...value, costPolicy: 'paid' }]) assert.throws(() => selectRuntimeProfile(invalid))
})
test('core requires a private operator key and binds identity to the protected human authorizer', () => {
  const env = environment()
  assert.doesNotThrow(() => validateCoreConfiguration(env))
  assert.throws(() => validateCoreConfiguration({ ...env, AGENTIC_OS_STORAGE_SIGNING_SECRET: '' }))
  assert.throws(() => validateCoreConfiguration({ ...env, AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY: '' }))
  assert.throws(() => validateCoreOwnerAuthority({ humanActorId: 'different' }, validateCoreConfiguration(env)))
  assert.throws(() => validateCoreOwnerAuthority(authorization, validateCoreConfiguration({ ...env, AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT: '2000-01-01T00:00:00.000Z' })))
  assert.equal(validateCoreConfiguration({ ...env, AGENTIC_OS_STORAGE_LOCAL_RUNTIME: 'true' }).overrides.storage.AGENTIC_OS_STORAGE_LOCAL_RUNTIME, 'false')
})
test('core resource preflight verifies account ownership before any upload', async () => {
  const env = environment(), fixture = provider(env, { zoneAccount: '9'.repeat(32) })
  const result = await coreResourceReadiness({ ...fixture, environment: env, runJson: async (run, args) => JSON.parse((await run(args)).stdout) })
  assert.match(result.failures.join('\n'), /zone ownership/)
  await assert.rejects(preflightMesh({ ...inputs(env), ...fixture }), /zone ownership/)
  assert.equal(fixture.calls.some(args => args.includes('upload')), false)
})
test('core release uses the shared version transaction without attempting the absent MCP seam', async () => {
  const env = environment(), fixture = provider(env), args = { ...inputs(env), ...fixture }
  const preflight = await preflightMesh(args)
  assert.equal(preflight.schema, 'agentic-graph-core-runtime-preflight/v1')
  const receipt = await deployMesh({ ...args, preflight })
  assert.equal(fixture.active(), 'candidate')
  assert.equal(receipt.identityProvisioning.status, 'proved')
  assert.equal(JSON.stringify(receipt).includes(env.AGENTIC_OS_STORAGE_OWNER_ACCESS_KEY), false)
  assert.deepEqual(receipt.units.map(unit => unit.id), ['storage'])
  assert.equal(receipt.schema, 'agentic-graph-core-runtime-release-receipt/v1')
  assert.equal(meshOutcomeOutputs(receipt).mutation_proven, true)
  assert.equal(fixture.calls.filter(args => args.includes('upload') && !args.includes('--dry-run')).length, 1)
  const restored = await restoreMesh({ ...args, receipt, now: () => new Date(Date.parse(env.AGENTIC_OS_STORAGE_OWNER_KEY_EXPIRES_AT) + 3600_000) })
  assert.equal(fixture.active(), 'baseline')
  assert.equal(restored.restorationProof.status, 'proved')
  assert.deepEqual(restored.probes, preflight.baselineProbes)
})
test('failed core readiness restores and proves the old baseline without demanding the new endpoint there', async () => {
  const env = environment(), fixture = provider(env, { candidateReady: false }), args = { ...inputs(env), ...fixture }
  const preflight = await preflightMesh(args)
  await assert.rejects(deployMesh({ ...args, preflight }), error => {
    assert.equal(error.receipt.status, 'rolled-back')
    assert.equal(meshOutcomeOutputs(error.receipt).compensated, true)
    return true
  })
  assert.equal(fixture.active(), 'baseline')
})
test('core deployment rejects a travel receipt before any mutation', async () => {
  const env = environment(), fixture = provider(env), args = { ...inputs(env), ...fixture }
  const preflight = await preflightMesh(args)
  await assert.rejects(deployMesh({ ...args, preflight: { ...preflight, schema: 'agentic-graph-travel-mesh-preflight/v2' } }), /invalid/)
  assert.equal(fixture.calls.some(args => args.includes('upload') && !args.includes('--dry-run')), false)
})
test('production probe rejects local-only readiness and anonymously readable snapshots', async () => {
  const config = validateCoreConfiguration(environment())
  await assert.rejects(probeCoreRuntime(config, { fetchFn: async () => Response.json({ ...readyBody(), runtime: 'local' }) }), /readiness failed/)
  await assert.rejects(probeCoreRuntime(config, { fetchFn: async () => Response.json(readyBody()) }), /not denied/)
})
test('bootstrap selection cannot skip core preflight, version transaction, authorization, or rollback', () => {
  const workflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
  const steps = workflow.jobs.deploy.steps
  assert.equal(workflow.jobs.deploy.environment.name, 'production')
  assert.equal(steps.find(step => step.name === 'Require completed travel mesh bootstrap before Pages').if, "steps.runtime_profile.outputs.requires_travel_bootstrap == 'true'")
  for (const id of ['travel_mesh_preflight', 'deploy_travel_mesh']) assert.equal(steps.find(step => step.id === id).if, undefined)
  assert(steps.findIndex(step => step.id === 'travel_mesh_preflight') < steps.findIndex(step => step.id === 'deploy_pages'))
})


test('core owner enrollment is idempotent and cannot take over a competing or revoked identity', () => {
  const configuration = validateCoreConfiguration(environment())
  const makeDb = () => {
    const db = new DatabaseSync(':memory:')
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES('kgws:canonical-docs');")
    db.exec(fs.readFileSync(new URL('../../cloudflare/d1/migrations/0008_chat_auth_and_audit.sql', import.meta.url), 'utf8'))
    return db
  }
  const enroll = (db, config = configuration) => {
    db.exec('BEGIN')
    try {
      const results = coreOwnerEnrollmentBatch(config, new Date().toISOString()).map(query => db.prepare(query.sql).all(...query.params))
      db.exec('COMMIT')
      return results.at(-1)
    } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const db = makeDb()
  try {
    assert.equal(enroll(db).length, 1)
    assert.equal(enroll(db).length, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 1)
    const rival = { ...configuration, variables: { ...configuration.variables, AGENTIC_OS_STORAGE_OWNER_ID: 'rival', AGENTIC_OS_STORAGE_OWNER_EMAIL: 'rival@airvio.co' } }
    assert.equal(enroll(db, rival).length, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1)
    db.exec("UPDATE auth_sessions SET revoked_at='2026-09-10T00:00:00.000Z'")
    assert.notEqual(enroll(db)[0].revoked_at, null, 'enrollment cannot revive a revoked access key')
    db.exec("UPDATE workspace_memberships SET status='inactive'")
    assert.equal(enroll(db).length, 0)
  } finally { db.close() }
})


test('unknown identity enrollment effects retain preservation even after Worker restoration', async () => {
  const env = environment(), fixture = provider(env)
  const baseFetch = fixture.apiFetch
  fixture.apiFetch = async (url, options) => {
    if (options.body && JSON.parse(options.body).batch) throw new Error('identity response lost')
    return baseFetch(url, options)
  }
  const args = { ...inputs(env), ...fixture }, preflight = await preflightMesh(args)
  await assert.rejects(deployMesh({ ...args, preflight }), error => {
    assert.equal(error.receipt.identityProvisioning.status, 'attempted')
    assert.equal(error.receipt.mutationAmbiguous, true)
    assert.equal(meshOutcomeOutputs(error.receipt).preserve_required, true)
    assert.equal(error.receipt.restorationProof.status, 'proved')
    return true
  })
  assert.equal(fixture.active(), 'baseline')
})

test('a different authorizer cannot initiate operator enrollment or any candidate upload', async () => {
  const env = environment(), fixture = provider(env)
  await assert.rejects(preflightMesh({ ...inputs(env), ...fixture,
    authorization: { ...authorization, humanActorId: 'another-user' } }), /protected human authorizer/)
  assert.equal(fixture.calls.some(args => args.includes('upload')), false)
})
