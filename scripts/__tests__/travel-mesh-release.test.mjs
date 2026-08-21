import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import test from 'node:test'
import YAML from 'yaml'
import {
  PROTECTED_SECRET_NAMES, PROTECTED_VARIABLE_NAMES, TRAVEL_MESH_PLAN, digest,
  parseProbeSpec, releaseConfigFile, removeEphemeralFile, routeSpecFor, validateProtectedConfiguration,
} from '../travel-mesh-release-plan.mjs'
import {
  activeDeployment, assertReleaseAuthority, deployMesh, preflightMesh, restoreMesh,
  meshOutcomeOutputs, parseR2BucketNames, probeMesh, uploadArguments, validateRouteInventory, verifyCandidateVersion,
} from '../travel-mesh-release.mjs'

const sourceSha = 'a'.repeat(40)
const candidateDigest = 'b'.repeat(64)
const uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const releaseWorkflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))

const protectedEnvironment = () => {
  const environment = Object.fromEntries(PROTECTED_SECRET_NAMES.map((name, index) => [name, `secret-${index}-${'x'.repeat(40)}`]))
  Object.assign(environment, {
    CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32), CLOUDFLARE_API_TOKEN: `token-${'c'.repeat(40)}`,
    TRAVEL_ISSUANCE_SERVICE_BASE_URL: 'https://issuance.example.com',
    TRAVEL_EXPERIENCE_PROVIDER_ID: 'experience-live', TRAVEL_EXPERIENCE_PROVIDER_BASE_URL: 'https://experience.example.com',
    TRAVEL_EXPERIENCE_PROVIDER_SEARCH_PATH: '/v1/search', TRAVEL_EXPERIENCE_PROVIDER_VERIFY_PATH: '/v1/verify',
    TRAVEL_EXPERIENCE_ROUTE_CATALOGUE_JSON: '{"experience-leg":{"route":"live"}}',
    TRAVEL_ATLAS_API_BASE_URL: 'https://atlas.example.com', TRAVEL_ATLAS_SEARCH_PATH: '/v2/search',
    TRAVEL_ATLAS_VERIFY_PATH: '/v2/verify', TRAVEL_ATLAS_ROUTE_CATALOGUE_JSON: '{"flight-leg":{"route":"live"}}',
    TRAVEL_ATLAS_CLIENT_ID: `atlas-${'i'.repeat(32)}`, TRAVEL_ATLAS_CLIENT_SECRET: `atlas-${'s'.repeat(32)}`,
    TRAVEL_ISSUANCE_SERVICE_AUTH_TOKEN: `issuance-${'1'.repeat(32)}`,
    TRAVEL_EXPERIENCE_PROVIDER_API_TOKEN: `experience-${'2'.repeat(32)}`,
    KNOWGRPH_AGENT_RUNTIME_BEARER_TOKEN: `mcp-${'3'.repeat(32)}`,
    TRAVEL_INFERENCE_OVERFLOW_TOKEN: `overflow-${'4'.repeat(32)}`,
    TRAVEL_COMMERCE_API_TOKEN: `commerce-${'5'.repeat(32)}`,
    TRAVEL_RECONCILIATION_OPERATOR_TOKEN: `operator-${'6'.repeat(32)}`,
    SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: '{"schema":"map/v1","entries":[{"bundle":"live"}]}',
    TRAVEL_ACCESS_ISSUER: 'https://team.cloudflareaccess.com', TRAVEL_ACCESS_AUDIENCE: 'audience_1234567890',
    TRAVEL_ACCESS_CLIENT_ID: `access-${'7'.repeat(32)}`, TRAVEL_ACCESS_CLIENT_SECRET: `access-${'8'.repeat(32)}`,
    TRAVEL_PUBLIC_ZONE_NAME: 'airvio.co', TRAVEL_PUBLIC_BASE_URL: 'https://airvio.co',
    TRAVEL_PUBLIC_ZONE_ID: '9'.repeat(32),
    TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID: '2'.repeat(32), TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID: '3'.repeat(32),
    TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET: 'knowgrph-travel-provenance-archive',
    TRAVEL_STORAGE_D1_DATABASE_ID: '633355bf-1a52-4085-bd3c-eba4220ff152',
    TRAVEL_STORAGE_D1_DATABASE_NAME: 'knowgrph-storage', TRAVEL_STORAGE_R2_BUCKET: 'knowgrph-storage-blobs',
    KNOWGRPH_MCP_TOOL_LIST_NAME: 'knowgrph-production-tools', KNOWGRPH_MEDIA_BUCKET: 'knowgrph-media',
    KNOWGRPH_MEDIA_R2_BUCKET: 'knowgrph-media',
    TRAVEL_MESH_PROBE_SPEC_JSON: JSON.stringify([
      { id: 'mcp', service: 'knowgrph-mcp', url: 'https://airvio.co/knowgrph/control-plane/mcp/readyz' },
      { id: 'operator-gateway', service: 'knowgrph-travel-operator-gateway', url: 'https://airvio.co/knowgrph/control-plane/travel/reconciliation/readyz' },
      { id: 'storage', service: 'knowgrph-storage', url: 'https://storage.airvio.co/readyz' },
    ]),
    RUNNER_TEMP: os.tmpdir(), GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sourceSha,
    GITHUB_WORKFLOW: 'Production Release', GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/release.yml@refs/heads/main',
  })
  for (const entry of TRAVEL_MESH_PLAN) environment[entry.workerEnv] = entry.worker
  const resources = {
    balanceCacheKvNamespaceId: environment.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID,
    workersAiFree: { models: ['@cf/openai/gpt-oss-20b'], dailyNeuronLimit: 10_000 },
    mcpMediaBucket: environment.KNOWGRPH_MEDIA_BUCKET,
    mcpMediaR2Bucket: environment.KNOWGRPH_MEDIA_R2_BUCKET,
    mcpDefinitionKvNamespaceId: environment.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID,
    probeSpecDigest: digest(JSON.parse(environment.TRAVEL_MESH_PROBE_SPEC_JSON)),
    provenanceArchiveR2Bucket: environment.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET,
    storageD1DatabaseId: environment.TRAVEL_STORAGE_D1_DATABASE_ID,
    storageR2Bucket: environment.TRAVEL_STORAGE_R2_BUCKET,
    publicZoneId: environment.TRAVEL_PUBLIC_ZONE_ID,
    routeSpecDigest: digest(routeSpecFor(environment)),
    workerSubdomainPolicyDigest: digest(TRAVEL_MESH_PLAN.map(entry => ({ worker: entry.worker, enabled: false, previewsEnabled: false }))),
  }
  const body = { schema: 'knowgrph-travel-mesh-bootstrap-receipt/v2', status: 'provisioned',
    accountId: environment.CLOUDFLARE_ACCOUNT_ID, authorizedBy: 'operator:bootstrap',
    provisionedAt: '2026-08-20T00:00:00.000Z', workers: TRAVEL_MESH_PLAN.map(entry => entry.worker), resources }
  environment.TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON = JSON.stringify({ ...body, receiptDigest: digest(body) })
  return environment
}

const authorization = Object.freeze({ schema: 'agentic-human-authorization-receipt/v2', status: 'consumed',
  candidateDigest, controllerId: 'github-actions:release' })

const candidateVersion = (entry, id, configuration, annotations = {}) => ({ id, annotations, metadata: { created_on: '2026-08-20T00:00:00Z' }, resources: { bindings: [
  ...entry.secrets.map(([name]) => ({ name, type: 'secret_text' })),
  ...Object.entries(configuration.overrides[entry.id]).map(([name, text]) => ({ name, type: 'plain_text', text })),
  ...Object.entries(configuration.serviceTargets[entry.id]).map(([name, service]) => ({ name, type: 'service', service,
    ...(entry.serviceTargets.find(([binding]) => binding === name)?.[3]
      ? { entrypoint: entry.serviceTargets.find(([binding]) => binding === name)[3] } : {}) })),
  ...entry.bindingProofs.map(([name, type, envName, field]) => ({ name, type, [field]: configuration.variables[envName] })),
  ...(['mcp', 'overflow'].includes(entry.id) ? [{ name: 'AI', type: 'ai' }] : []),
] } })

const fakeCloudflare = (environment, { extraBaselineSecrets = {} } = {}) => {
  const configuration = validateProtectedConfiguration(environment)
  const states = new Map(TRAVEL_MESH_PLAN.map((entry, index) => {
    const versionId = uuid(index + 1), version = candidateVersion(entry, versionId, configuration,
      { 'workers/tag': 'baseline', 'workers/message': 'baseline' })
    for (const name of extraBaselineSecrets[entry.id] ?? []) version.resources.bindings.push({ name, type: 'secret_text' })
    return [entry.worker, { entry, active: versionId, deployment: uuid(index + 101), subdomain: { enabled: false, previews_enabled: false },
      providerSecrets: version.resources.bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort(), versions: [version] }]
  }))
  const calls = []
  let failActivationWorker = null, activationFailureUsed = false, failUploadWorker = null, exposeOnUploadWorker = null, failMigration = false
  const allMigrations = fs.readdirSync(new URL('../../cloudflare/d1/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()
  let appliedMigrationNames = [...allMigrations]
  const stateForArgs = args => states.get(args[args.indexOf('--name') + 1])
  const json = value => ({ stdout: JSON.stringify(value), stderr: '' })
  const run = async args => {
    calls.push([...args])
    if (args.includes('deployments') && args.includes('status')) {
      const state = stateForArgs(args)
      if (!state) throw new Error('API error 10007 Worker does not exist')
      return json({ id: state.deployment, created_on: '2026-08-20T00:00:00Z', versions: [{ version_id: state.active, percentage: 100 }] })
    }
    if (args.includes('versions') && args.includes('list')) return json(stateForArgs(args).versions)
    if (args.includes('versions') && args.includes('view')) {
      const state = stateForArgs(args), id = args[args.indexOf('view') + 1]
      return json(state.versions.find(version => version.id === id))
    }
    if (args.includes('secret') && args.includes('list')) return json(stateForArgs(args).providerSecrets.map(name => ({ name })))
    if (args.includes('kv') && args.includes('namespace')) return json([
      { id: environment.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID, title: 'mcp' },
      { id: environment.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID, title: 'balance' },
    ])
    if (args.includes('r2') && args.includes('bucket') && args.includes('list')) return { stdout: `name: ${environment.KNOWGRPH_MEDIA_R2_BUCKET}\nname: ${environment.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET}\nname: ${environment.TRAVEL_STORAGE_R2_BUCKET}\n`, stderr: '' }
    if (args.includes('d1') && args.includes('list')) return json([{ uuid: environment.TRAVEL_STORAGE_D1_DATABASE_ID, name: environment.TRAVEL_STORAGE_D1_DATABASE_NAME }])
    if (args.includes('versions') && args.includes('upload')) {
      if (args.includes('--dry-run')) return { stdout: 'dry run', stderr: '' }
      if (stateForArgs(args).entry.worker === failUploadWorker) throw new Error('simulated upload response loss without candidate proof')
      const state = stateForArgs(args), id = uuid(1000 + states.size + state.versions.length)
      const tag = args[args.indexOf('--tag') + 1], message = args[args.indexOf('--message') + 1]
      const candidate = candidateVersion(state.entry, id, configuration, { 'workers/tag': tag, 'workers/message': message })
      for (const binding of state.versions[0].resources.bindings) {
        if (['secret_text', 'plain_text'].includes(binding.type) && !candidate.resources.bindings.some(item => item.name === binding.name)) candidate.resources.bindings.push({ ...binding })
      }
      state.versions.push(candidate)
      if (state.entry.worker === exposeOnUploadWorker) state.subdomain = { enabled: true, previews_enabled: true }
      return { stdout: `Worker Version ID: ${id}`, stderr: '' }
    }
    if (args.includes('versions') && args.includes('deploy')) {
      const state = stateForArgs(args), spec = args[args.indexOf('deploy') + 1], id = spec.split('@')[0]
      state.active = id
      state.deployment = uuid(Number(state.deployment.slice(-12)) + 1000)
      if (state.entry.worker === failActivationWorker && !activationFailureUsed && state.versions.at(-1).id === id) {
        activationFailureUsed = true
        throw new Error('simulated activation response loss')
      }
      return { stdout: 'deployed', stderr: '' }
    }
    if (args.includes('d1') && args.includes('time-travel')) return json({ bookmark: 'bookmark-before-travel-release' })
    if (args.includes('d1') && args.includes('migrations') && args.includes('apply')) {
      if (failMigration) {
        appliedMigrationNames = [...allMigrations]
        throw new Error('simulated partial D1 migration failure')
      }
      appliedMigrationNames = [...allMigrations]
      return { stdout: 'migrated', stderr: '' }
    }
    if (args.includes('d1') && args.includes('execute')) {
      return json([{ results: appliedMigrationNames.map(name => ({ name })) }])
    }
    throw new Error(`unexpected fake command: ${args.join(' ')}`)
  }
  const apiFetch = async url => {
    const spec = routeSpecFor(environment)
    if (String(url).includes('/workers/routes')) {
      return new Response(JSON.stringify({ success: true,
        result: spec.routes.map((route, index) => ({ id: `route-${index}`, ...route })) }), { status: 200 })
    }
    if (String(url).includes('/workers/domains')) {
      return new Response(JSON.stringify({ success: true, result: spec.domains.map((domain, index) => ({
        id: `domain-${index}`, hostname: domain.hostname, service: domain.service, zone_id: domain.zoneId, zone_name: domain.zoneName,
      })), result_info: { total_pages: 1 } }), { status: 200 })
    }
    if (String(url).endsWith('/subdomain')) {
      const worker = decodeURIComponent(new URL(url).pathname.split('/').at(-2))
      return new Response(JSON.stringify({ success: true, result: states.get(worker).subdomain }), { status: 200 })
    }
    throw new Error(`unexpected fake API URL: ${url}`)
  }
  return { apiFetch, calls, configuration, run, states,
    setFailActivation: worker => { failActivationWorker = worker },
    setFailUpload: worker => { failUploadWorker = worker },
    setExposeOnUpload: worker => { exposeOnUploadWorker = worker },
    setFailMigration: () => { failMigration = true; appliedMigrationNames = allMigrations.slice(0, -1) },
    setProviderSecrets: (worker, names) => { states.get(worker).providerSecrets = [...names].sort() },
    baseline: new Map([...states].map(([worker, state]) => [worker, state.active])) }
}

const readinessService = url => {
  const pathname = new URL(url).pathname
  return pathname.includes('/travel/reconciliation/') ? 'knowgrph-travel-operator-gateway'
    : new URL(url).hostname.startsWith('storage.') ? 'knowgrph-storage' : 'knowgrph-mcp'
}
const fetchReadiness = async url => new Response(JSON.stringify({ ok: true, service: readinessService(url) }), { status: 200 })

test('protected configuration aggregates missing fields and rejects sentinels', async () => {
  const missing = protectedEnvironment()
  delete missing.TRAVEL_PUBLIC_BASE_URL
  delete missing.TRAVEL_COMMERCE_API_TOKEN
  assert.throws(() => validateProtectedConfiguration(missing), error => {
    assert.match(error.message, /missing protected variables: TRAVEL_PUBLIC_BASE_URL/)
    assert.match(error.message, /missing protected secrets: TRAVEL_COMMERCE_API_TOKEN/)
    return true
  })
  const sentinel = protectedEnvironment()
  sentinel.TRAVEL_EXPERIENCE_PROVIDER_BASE_URL = 'https://provider.invalid'
  assert.throws(() => validateProtectedConfiguration(sentinel), /production sentinels/)
  assert.equal(validateProtectedConfiguration(protectedEnvironment()).overrides.mcp.KNOWGRPH_MCP_PUBLIC_BASE_URL, 'https://airvio.co')
  const wrongProbe = JSON.parse(protectedEnvironment().TRAVEL_MESH_PROBE_SPEC_JSON)
  wrongProbe[0].url = 'https://airvio.co/knowgrph/control-plane/mcp/livez'
  assert.throws(() => parseProbeSpec(wrongProbe, { publicHost: 'airvio.co' }), /exact protected production host and readiness path/)
  const environment = protectedEnvironment(), encoder = new TextEncoder()
  const chunked = await probeMesh(environment.TRAVEL_MESH_PROBE_SPEC_JSON, { environment, fetchFn: async url => {
    const bytes = encoder.encode(JSON.stringify({ ok: true, service: readinessService(url) })), midpoint = Math.ceil(bytes.length / 2)
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(bytes.slice(0, midpoint)); controller.enqueue(bytes.slice(midpoint)); controller.close()
    } }), { status: 200 })
  } })
  assert.equal(chunked.length, 3)
  let cancelled = 0
  await assert.rejects(() => probeMesh(environment.TRAVEL_MESH_PROBE_SPEC_JSON, { environment, fetchFn: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(40_000)); controller.enqueue(new Uint8Array(40_000)) },
    cancel() { cancelled += 1 },
  }), { status: 200 }) }), /live dependency probe failed/)
  assert.equal(cancelled, 3)
})

test('release configs and upload command use only installed Wrangler upload flags and protected targets', () => {
  const configuration = validateProtectedConfiguration(protectedEnvironment())
  const entry = TRAVEL_MESH_PLAN.find(unit => unit.id === 'travel-commerce')
  const config = releaseConfigFile(entry, configuration)
  try {
    const source = fs.readFileSync(config, 'utf8')
    assert.match(source, new RegExp(configuration.variables.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID))
    assert.match(source, new RegExp(configuration.variables.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET))
    const args = uploadArguments(entry, sourceSha, candidateDigest, configuration, config, '/tmp/secrets.json')
    assert.deepEqual(args.slice(0, 4), ['--no-install', 'wrangler', 'versions', 'upload'])
    assert(args.includes('--strict'))
    assert(args.includes('--keep-vars'))
    assert(!args.some(value => value.startsWith('--experimental-')))
    assert(args.includes('--secrets-file'))
    assert(!args.includes('deploy'))
    assert(!args.includes('secret'))
    assert.deepEqual([...new Set(args.filter(value => value.startsWith('--')))].sort(), [
      '--config', '--env', '--keep-vars', '--message', '--name', '--no-install', '--secrets-file', '--strict', '--tag',
    ])
    const mcp = TRAVEL_MESH_PLAN.find(unit => unit.id === 'mcp')
    assert(uploadArguments(mcp, sourceSha, candidateDigest, configuration, mcp.config, '/tmp/secrets.json').includes('--var'))
  } finally { removeEphemeralFile(config) }
  const storage = TRAVEL_MESH_PLAN.find(unit => unit.id === 'storage'), storageConfig = releaseConfigFile(storage, configuration)
  try {
    const storageSource = fs.readFileSync(storageConfig, 'utf8')
    assert.match(storageSource, /^workers_dev = false$/m)
    assert.match(storageSource, /^preview_urls = false$/m)
    assert.doesNotMatch(storageSource, /^workers_dev = true$/m)
  } finally { removeEphemeralFile(storageConfig) }
  const deploy = releaseWorkflow.jobs.deploy, steps = deploy.steps
  const travelSteps = new Set(['Preflight protected travel mesh without mutation',
    'Upload and activate exact-candidate travel mesh versions', 'Restore exact prior travel mesh versions'])
  const cloudflareSteps = new Set([...travelSteps, 'Capture current production rollback target', 'Enforce sole deployment ownership',
    'Deploy verified artifact', 'Capture authoritative candidate deployment', 'Reconcile canonical docs into D1',
    'Roll back Pages to exact last-known-good deployment', 'Restore and reconcile last-known-good D1 state',
    'Capture authoritative restored Pages deployment'])
  const cloudflareNames = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
  const travelOnlyNames = [...PROTECTED_VARIABLE_NAMES, ...PROTECTED_SECRET_NAMES.filter(name => !cloudflareNames.includes(name))]
  for (const name of [...travelOnlyNames, ...cloudflareNames]) assert.equal(Object.hasOwn(deploy.env, name), false)
  for (const step of steps) {
    const scoped = step.env ?? {}
    if (travelSteps.has(step.name)) for (const name of [...travelOnlyNames, ...cloudflareNames]) assert.equal(Object.hasOwn(scoped, name), true)
    else for (const name of travelOnlyNames) assert.equal(Object.hasOwn(scoped, name), false, `${step.name} received ${name}`)
    if (!cloudflareSteps.has(step.name)) for (const name of cloudflareNames) assert.equal(Object.hasOwn(scoped, name), false, `${step.name} received ${name}`)
  }
  const meshStep = steps.find(step => step.name === 'Upload and activate exact-candidate travel mesh versions')
  assert(meshStep.run.indexOf('preserve_required=true receipt_sealed=false') < meshStep.run.indexOf('travel-mesh-release.mjs deploy'))
  assert.match(steps.find(step => step.name === 'Preserve ambiguous travel mesh state').if,
    /receipt_sealed != 'true'/)
  assert.equal((steps.find(step => step.name === 'Seal and validate rolled-back lifecycle carrier').if
    .match(/receipt_sealed == 'true'/g) ?? []).length, 2)
})

test('candidate proof checks annotations, exact secrets, services, variables, and resources', () => {
  const environment = protectedEnvironment(), configuration = validateProtectedConfiguration(environment)
  const entry = TRAVEL_MESH_PLAN.find(unit => unit.id === 'mcp')
  const value = candidateVersion(entry, uuid(500), configuration, {
    'workers/tag': `knowgrph-${sourceSha}`, 'workers/message': `knowgrph candidate ${sourceSha} ${candidateDigest}`,
  })
  const baseline = candidateVersion(entry, uuid(1), configuration, { 'workers/tag': 'baseline', 'workers/message': 'baseline' })
  baseline.resources.bindings.push({ name: 'EXA_API_KEY', type: 'secret_text' })
  baseline.resources.bindings.push({ name: 'OPERATOR_PROVIDER_REPOSITORY', type: 'plain_text', text: 'owner/private-provider' })
  value.resources.bindings.push({ name: 'EXA_API_KEY', type: 'secret_text' })
  value.resources.bindings.push({ name: 'OPERATOR_PROVIDER_REPOSITORY', type: 'plain_text', text: 'owner/private-provider' })
  const preservedSecretNameDigest = digest([...entry.secrets.map(([name]) => name), 'EXA_API_KEY'].sort())
  assert.match(verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline, preservedSecretNameDigest), /^[0-9a-f]{64}$/)
  value.resources.bindings.splice(value.resources.bindings.findIndex(binding => binding.name === 'EXA_API_KEY'), 1)
  assert.throws(() => verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline,
    preservedSecretNameDigest), /exact baseline-plus-managed allowlist/)
  value.resources.bindings.push({ name: 'EXA_API_KEY', type: 'secret_text' })
  value.resources.bindings.find(binding => binding.name === 'TRAVEL_GUARDRAIL').entrypoint = 'WrongEntrypoint'
  assert.throws(() => verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline,
    preservedSecretNameDigest), /entrypoint did not bind exactly/)
  value.resources.bindings.find(binding => binding.name === 'TRAVEL_GUARDRAIL').entrypoint = 'TravelAgencyGuardrailService'
  value.resources.bindings.find(binding => binding.name === 'AI').type = 'changed-ai'
  assert.throws(() => verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline,
    preservedSecretNameDigest), /unmanaged baseline binding AI changed/)
  value.resources.bindings.find(binding => binding.name === 'AI').type = 'ai'
  value.resources.bindings.find(binding => binding.name === 'OPERATOR_PROVIDER_REPOSITORY').text = 'owner/drifted-provider'
  assert.throws(() => verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline,
    preservedSecretNameDigest), /unmanaged baseline binding OPERATOR_PROVIDER_REPOSITORY changed/)
  value.resources.bindings.find(binding => binding.name === 'OPERATOR_PROVIDER_REPOSITORY').text = 'owner/private-provider'
  value.resources.bindings.find(binding => binding.type === 'service').service = 'unconfigured'
  assert.throws(() => verifyCandidateVersion(value, entry, sourceSha, candidateDigest, configuration, baseline,
    preservedSecretNameDigest), /production sentinel/)
})

test('authority and active deployment are exact and fail closed', () => {
  const environment = protectedEnvironment()
  assert.doesNotThrow(() => assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment }))
  assert.throws(() => assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment: { ...environment, GITHUB_REF: 'refs/heads/dev' } }), /protected/)
  assert.equal(activeDeployment({ id: 'deployment', created_on: 'now', versions: [{ version_id: 'version', percentage: 100 }] }, 'worker').versionId, 'version')
  assert.throws(() => activeDeployment({ id: 'deployment', created_on: 'now', versions: [{ version_id: 'version', percentage: 50 }] }, 'worker'), /exactly one/)
  assert.deepEqual(meshOutcomeOutputs(), { attempted: true, mutation_possible: true, mutation_proven: false,
    restored: false, compensated: false, preserve_required: true, receipt_sealed: false })
  assert.throws(() => meshOutcomeOutputs({}), /invalid knowgrph-travel-mesh-failure-receipt/)
  assert.equal(parseR2BucketNames('name: exact-bucket-longer\n').has('exact-bucket'), false)
  const routeEnvironment = protectedEnvironment(), routeSpec = routeSpecFor(routeEnvironment)
  const domains = routeSpec.domains.map(domain => ({ hostname: domain.hostname, service: domain.service,
    zone_id: domain.zoneId, zone_name: domain.zoneName }))
  assert.doesNotThrow(() => validateRouteInventory(routeSpec.routes, domains, routeEnvironment))
  assert.throws(() => validateRouteInventory([...routeSpec.routes, {
    pattern: 'airvio.co/knowgrph/control-plane/mcp/readyz', script: 'unrelated-worker',
  }], domains, routeEnvironment), /unexpected overlapping Worker route/)
})

test('preflight is read-only, inventories every baseline, and deploy/restore preserve dependency order', async () => {
  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment, { extraBaselineSecrets: {
    mcp: ['EXA_API_KEY'], storage: ['GITHUB_TOKEN'],
  } })
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment, run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
  assert.equal(preflight.units.length, 9)
  assert(preflight.units.every(unit => /^[0-9a-f]{64}$/.test(unit.preservedSecretNameDigest)))
  assert(preflight.units.every(unit => /^[0-9a-f]{64}$/.test(unit.baselineBindingInventory.digest)))
  assert.equal(cloudflare.calls.filter(args => args.includes('upload') && !args.includes('--dry-run')).length, 0)
  const receipt = await deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now })
  assert.equal(receipt.status, 'deployed')
  assert.equal(meshOutcomeOutputs(receipt).receipt_sealed, true)
  assert.deepEqual(receipt.units.map(unit => unit.id), TRAVEL_MESH_PLAN.map(entry => entry.id))
  const activations = cloudflare.calls.filter(args => args.includes('versions') && args.includes('deploy')
    && String(args[args.indexOf('deploy') + 1]).includes('@100')).slice(0, 9)
  assert.deepEqual(activations.map(args => cloudflare.states.get(args[args.indexOf('--name') + 1]).entry.id), TRAVEL_MESH_PLAN.map(entry => entry.id))
  assert(TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'travel-commerce') < TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'mcp'))
  const commerceActivationIndex = cloudflare.calls.findIndex(args => args.includes('versions') && args.includes('deploy')
    && args[args.indexOf('--name') + 1] === 'knowgrph-travel-commerce-production')
  const mcpUploadIndex = cloudflare.calls.findIndex(args => args.includes('versions') && args.includes('upload')
    && !args.includes('--dry-run') && args[args.indexOf('--name') + 1] === 'knowgrph-mcp')
  assert(commerceActivationIndex < mcpUploadIndex)
  await assert.rejects(() => restoreMesh({ sourceSha, candidateDigest, authorization, receipt, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: async () => new Response('{"ok":false}', { status: 503 }), now }), error => {
    assert.equal(error.receipt.status, 'preserve-required')
    assert.match(error.receipt.error, /restored mesh probe failed/)
    return true
  })
  const rollback = await restoreMesh({ sourceSha, candidateDigest, authorization, receipt, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now })
  assert.equal(rollback.status, 'restored')
  assert.equal(rollback.probes.length, 3)
  assert.deepEqual(rollback.serving.map(unit => unit.versionId), TRAVEL_MESH_PLAN.map(entry => cloudflare.baseline.get(entry.worker)))
  for (const [worker, baseline] of cloudflare.baseline) assert.equal(cloudflare.states.get(worker).active, baseline)
  const drifted = fakeCloudflare(environment, { extraBaselineSecrets: { mcp: ['EXA_API_KEY'] } })
  drifted.setProviderSecrets('knowgrph-mcp', [])
  await assert.rejects(() => preflightMesh({ sourceSha, candidateDigest, authorization, environment,
    run: drifted.run, apiFetch: drifted.apiFetch, now }), /provider and active-version secret inventories differ/)
})

test('preflight fails before Cloudflare inventory and serializes a complete inventory', async () => {
  const incomplete = protectedEnvironment()
  delete incomplete.TRAVEL_PUBLIC_BASE_URL
  let rejectedRunCalls = 0, rejectedFetchCalls = 0
  await assert.rejects(() => preflightMesh({ sourceSha, candidateDigest, authorization, environment: incomplete,
    run: async () => { rejectedRunCalls += 1; throw new Error('unexpected remote command') },
    apiFetch: async () => { rejectedFetchCalls += 1; throw new Error('unexpected remote request') } }),
  /missing protected variables: TRAVEL_PUBLIC_BASE_URL/)
  assert.equal(rejectedRunCalls, 0)
  assert.equal(rejectedFetchCalls, 0)

  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment)
  let inFlight = 0, maxInFlight = 0
  const serializeProbe = operation => async (...args) => {
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await new Promise(resolve => setImmediate(resolve))
    try { return await operation(...args) } finally { inFlight -= 1 }
  }
  await preflightMesh({ sourceSha, candidateDigest, authorization, environment,
    run: serializeProbe(cloudflare.run), apiFetch: serializeProbe(cloudflare.apiFetch) })
  assert.equal(maxInFlight, 1)

  let rejectedAccessCalls = 0
  await assert.rejects(() => preflightMesh({ sourceSha, candidateDigest, authorization, environment,
    run: async () => { rejectedAccessCalls += 1; throw new Error('Authentication error [code: 10000]') },
    apiFetch: async () => { rejectedAccessCalls += 1; throw new Error('unexpected request after auth failure') } }),
  /settlement-executor: Authentication error \[code: 10000\]/)
  assert.equal(rejectedAccessCalls, 1)
})

test('an upload response with no exact candidate proof is preserve-required and reports ambiguity', async () => {
  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment)
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment, run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
  cloudflare.setFailUpload(TRAVEL_MESH_PLAN[0].worker)
  await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now }), error => {
    assert.equal(error.receipt.status, 'preserve-required')
    assert.equal(error.receipt.mutationAmbiguous, true)
    assert.deepEqual(meshOutcomeOutputs(error.receipt), {
      attempted: true, mutation_possible: true, mutation_proven: false,
      restored: false, compensated: false, preserve_required: true, receipt_sealed: true,
    })
    return true
  })
  const exposed = fakeCloudflare(environment)
  const exposedPreflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment,
    run: exposed.run, apiFetch: exposed.apiFetch, now })
  exposed.setExposeOnUpload(TRAVEL_MESH_PLAN[0].worker)
  await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight: exposedPreflight, environment,
    run: exposed.run, apiFetch: exposed.apiFetch, fetchFn: fetchReadiness, now }), error => {
    assert.equal(error.receipt.status, 'preserve-required')
    assert.match(error.receipt.restorationProof.error, /workers\.dev and preview URLs must both be disabled/)
    return true
  })
})

test('pre-upload drift seals an exact not-mutated receipt and permits terminal rollback', async () => {
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  for (const drift of ['expired', 'secrets']) {
    const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment)
    const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment,
      run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
    if (drift === 'secrets') cloudflare.setProviderSecrets(TRAVEL_MESH_PLAN[0].worker, [])
    const deployNow = drift === 'expired' ? () => new Date('2026-08-20T00:41:00.000Z') : now
    await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
      run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now: deployNow }), error => {
      assert.equal(error.receipt.status, 'not-mutated')
      assert.equal(error.receipt.mutationAttempted, false)
      assert.equal(error.receipt.restorationProof.status, 'not-required')
      assert.deepEqual(meshOutcomeOutputs(error.receipt), {
        attempted: false, mutation_possible: false, mutation_proven: false,
        restored: false, compensated: false, preserve_required: false, receipt_sealed: true,
      })
      return true
    })
    assert.equal(cloudflare.calls.filter(args => args.includes('upload') && !args.includes('--dry-run')).length, 0)
  }
})

test('a partial D1 migration failure is re-inventoried and never reported as rolled back', async () => {
  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment)
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment, run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
  cloudflare.setFailMigration()
  await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now }), error => {
    assert.equal(error.receipt.status, 'preserve-required')
    assert.equal(error.receipt.migrations.applyAttempted, true)
    assert.equal(error.receipt.migrations.actuallyApplied.length, 1)
    assert.equal(error.receipt.migrations.disposition, 'preserve-required-partial-migration-possible')
    assert.equal(meshOutcomeOutputs(error.receipt).mutation_proven, true)
    return true
  })
})

test('a partial activation response loss is detected and every serving version is restored', async () => {
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  const exercise = async (fetchFn, expectedStatus) => {
    const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment)
    const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment, run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
    cloudflare.setFailActivation('knowgrph-mcp')
    await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
      run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn, now }), error => {
      assert.equal(error.receipt.status, expectedStatus)
      assert.equal(error.receipt.restorationProof.status, expectedStatus === 'rolled-back' ? 'proved' : 'failed')
      if (expectedStatus === 'rolled-back') {
        assert.equal(error.receipt.restorationProof.probes.length, 3)
        assert.deepEqual(error.receipt.restorationProof.serving.map(unit => unit.versionId),
          TRAVEL_MESH_PLAN.map(entry => cloudflare.baseline.get(entry.worker)))
      }
      return true
    })
    for (const [worker, baseline] of cloudflare.baseline) assert.equal(cloudflare.states.get(worker).active, baseline)
  }
  await exercise(async () => new Response('{"ok":false}', { status: 503 }), 'preserve-required')
  await exercise(fetchReadiness, 'rolled-back')
})
