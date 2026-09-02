import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import YAML from 'yaml'
import { COMMERCE_PROVIDER_STORAGE_REVISIONS, PROTECTED_SECRET_NAMES, PROTECTED_VARIABLE_NAMES, TRAVEL_MARKETPLACE, TRAVEL_MESH_BOOTSTRAP_UNITS, TRAVEL_MESH_PLAN, assertAdditiveBootstrapMigrations, bootstrapMcpTransitionFor, bootstrapProviderBindingsFor, bootstrapResourceSpecFor, bootstrapUnitSpecFor, digest, parseProbeSpec, releaseConfigFile, removeEphemeralFile, routeSpecFor, validateProtectedConfiguration } from '../travel-mesh-release-plan.mjs'
import { cloudflareApiAllPages, cloudflareWorkerVersionDetails, requireStableCompleteInventory } from '../travel-mesh-release-inventory.mjs'
import { BOOTSTRAP_EFFECT_ORDER, BOOTSTRAP_RECEIPT_SCHEMA, applyBootstrap, bootstrapEffectGraph, createBootstrapDesiredState, createProductionBootstrapAdapter, planBootstrap, wranglerConfigurationDigest } from '../travel-mesh-bootstrap.mjs'
import { BOOTSTRAP_PACKET_SCHEMA, bootstrapReceiptCarrier, preflightBootstrapTerminalCarriers } from '../travel-mesh-bootstrap-authorization.mjs'
import { activeDeployment, assertReleaseAuthority, commerceProviderRuntimeProofFor, deployMesh, preflightMesh, restoreMesh, meshOutcomeOutputs, parseR2BucketNames, probeMesh, uploadArguments, validateRouteInventory, verifyCandidateVersion } from '../travel-mesh-release.mjs'
const sourceSha = 'a'.repeat(40), candidateDigest = 'b'.repeat(64), uuid = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
const repositoryMigrations = fs.readdirSync(new URL('../../cloudflare/d1/migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort(), releaseWorkflow = YAML.parse(fs.readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8'))
const protectedEnvironment = () => {
  const environment = Object.fromEntries(PROTECTED_SECRET_NAMES.map((name, index) => [name, `secret-${index}-${'x'.repeat(40)}`]))
  Object.assign(environment, {
    CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32), CLOUDFLARE_API_TOKEN: `token-${'c'.repeat(40)}`, TRAVEL_ISSUANCE_SERVICE_BASE_URL: 'https://issuance.example.com', TRAVEL_EXPERIENCE_PROVIDER_ID: 'experience-live', TRAVEL_EXPERIENCE_PROVIDER_BASE_URL: 'https://experience.example.com', TRAVEL_EXPERIENCE_PROVIDER_SEARCH_PATH: '/v1/search', TRAVEL_EXPERIENCE_PROVIDER_VERIFY_PATH: '/v1/verify', TRAVEL_EXPERIENCE_ROUTE_CATALOGUE_JSON: '{"experience-leg":{"route":"live"}}',
    TRAVEL_ATLAS_API_BASE_URL: 'https://atlas.example.com', TRAVEL_ATLAS_SEARCH_PATH: '/v2/search', TRAVEL_ATLAS_VERIFY_PATH: '/v2/verify', TRAVEL_ATLAS_ROUTE_CATALOGUE_JSON: '{"flight-leg":{"route":"live"}}', TRAVEL_ATLAS_CLIENT_ID: `atlas-${'i'.repeat(32)}`, TRAVEL_ATLAS_CLIENT_SECRET: `atlas-${'s'.repeat(32)}`, TRAVEL_ISSUANCE_SERVICE_AUTH_TOKEN: `issuance-${'1'.repeat(32)}`, TRAVEL_EXPERIENCE_PROVIDER_API_TOKEN: `experience-${'2'.repeat(32)}`,
    AGENTICGRAPH_AGENT_RUNTIME_BEARER_TOKEN: `mcp-${'3'.repeat(32)}`, TRAVEL_INFERENCE_OVERFLOW_TOKEN: `overflow-${'4'.repeat(32)}`, TRAVEL_COMMERCE_API_TOKEN: `commerce-${'5'.repeat(32)}`, TRAVEL_RECONCILIATION_OPERATOR_TOKEN: `operator-${'6'.repeat(32)}`, SHARED_NODE_TRAVEL_BUNDLE_MAP_JSON: '{"schema":"map/v1","entries":[{"bundle":"live"}]}', TRAVEL_ACCESS_ISSUER: 'https://team.cloudflareaccess.com', TRAVEL_ACCESS_AUDIENCE: 'audience_1234567890', TRAVEL_ACCESS_CLIENT_ID: `access-${'7'.repeat(32)}`, TRAVEL_ACCESS_CLIENT_SECRET: `access-${'8'.repeat(32)}`,
    TRAVEL_PUBLIC_ZONE_NAME: 'airvio.co', TRAVEL_PUBLIC_BASE_URL: 'https://airvio.co', TRAVEL_PUBLIC_ZONE_ID: '9'.repeat(32), TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID: '2'.repeat(32), TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID: '3'.repeat(32), TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET: 'agenticgraph-travel-provenance-archive', TRAVEL_STORAGE_D1_DATABASE_ID: '633355bf-1a52-4085-bd3c-eba4220ff152', TRAVEL_STORAGE_D1_DATABASE_NAME: 'airvio', TRAVEL_STORAGE_R2_BUCKET: 'agenticgraph-storage-blobs',
    AGENTICGRAPH_MCP_TOOL_LIST_NAME: 'agenticgraph-production-tools', AGENTICGRAPH_MEDIA_BUCKET: 'agenticgraph-media', AGENTICGRAPH_MEDIA_R2_BUCKET: 'agenticgraph-media', TRAVEL_MESH_PROBE_SPEC_JSON: JSON.stringify([{ id: 'mcp', service: 'agenticgraph-mcp', url: 'https://airvio.co/agenticgraph/control-plane/mcp/readyz' }, { id: 'operator-gateway', service: 'agenticgraph-travel-operator-gateway', url: 'https://airvio.co/agenticgraph/control-plane/travel/reconciliation/readyz' }, { id: 'storage', service: 'agenticgraph-storage', url: 'https://storage.airvio.co/readyz' }]),
    MARKETPLACE_SERVICE: TRAVEL_MARKETPLACE.worker, TRAVEL_MESH_RELEASE_ENABLED: 'true', RUNNER_TEMP: os.tmpdir(), GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sourceSha, GITHUB_WORKFLOW: 'Production Release', GITHUB_WORKFLOW_REF: 'owner/repo/.github/workflows/release.yml@refs/heads/main',
  })
  for (const entry of TRAVEL_MESH_PLAN) environment[entry.workerEnv] = entry.worker
  const resources = bootstrapResourceSpecFor(environment)
  const body = { schema: BOOTSTRAP_RECEIPT_SCHEMA, status: 'provisioned', accountId: environment.CLOUDFLARE_ACCOUNT_ID,
    authorizedBy: 'operator:bootstrap', provisionedAt: '2026-08-20T00:00:00.000Z', workers: TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => entry.worker), resources, planDigest: '7'.repeat(64), packetDigest: '8'.repeat(64), releaseEnabled: true, environmentProjection: { receiptPersisted: true, releaseEnabled: true } }
  environment.TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON = JSON.stringify({ ...body, receiptDigest: digest(body) })
  return environment
}
const authorization = Object.freeze({ schema: 'agentic-human-authorization-receipt/v2', status: 'consumed', candidateDigest, controllerId: 'github-actions:release' })
const candidateVersion = (entry, id, configuration, annotations = {}) => ({ id, annotations, metadata: { created_on: '2026-08-20T00:00:00Z' }, resources: { bindings: entry.id === 'marketplace'
  ? [...entry.secrets.map(([name]) => ({ name, type: 'secret_text' })),
    { name: 'MARKETPLACE_DB', type: 'd1', id: configuration.variables.TRAVEL_STORAGE_D1_DATABASE_ID }] : [
  ...entry.secrets.map(([name]) => ({ name, type: 'secret_text' })), ...Object.entries(configuration.overrides[entry.id]).map(([name, text]) => ({ name, type: 'plain_text', text })),
  ...Object.entries(configuration.serviceTargets[entry.id]).map(([name, service]) => ({ name, type: 'service', service, ...(entry.serviceTargets.find(([binding]) => binding === name)?.[3] ? { entrypoint: entry.serviceTargets.find(([binding]) => binding === name)[3] } : {}) })),
  ...entry.bindingProofs.map(([name, type, envName, field]) => ({ name, type, [field]: configuration.variables[envName] })),
  ...(['mcp', 'overflow'].includes(entry.id) ? [{ name: 'AI', type: 'ai' }] : []),
] } })
const fakeCloudflare = (environment, { extraBaselineSecrets = {}, empty = false, exactBootstrapBindings = false,
  privateMcpBaseline = false } = {}) => {
  const configuration = validateProtectedConfiguration(environment)
  const states = new Map(TRAVEL_MESH_PLAN.map((entry, index) => {
    const versionId = uuid(index + 1), version = candidateVersion(entry, versionId, configuration, { 'workers/tag': 'baseline', 'workers/message': 'baseline' })
    for (const name of extraBaselineSecrets[entry.id] ?? []) version.resources.bindings.push({ name, type: 'secret_text' })
    return [entry.worker, { entry, active: versionId, deployment: uuid(index + 101), subdomain: { enabled: false, previews_enabled: false }, providerSecrets: version.resources.bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort(), versions: [version] }]
  }))
  const mcpBaseline = structuredClone(states.get('agenticgraph-mcp'))
  if (empty) for (const state of states.values()) { state.active = null; state.versions = []; state.providerSecrets = [] }
  if (privateMcpBaseline) states.set('agenticgraph-mcp', mcpBaseline)
  const calls = [], allMigrations = repositoryMigrations; let appliedMigrationNames = [...allMigrations]
  let failActivationWorker = null, activationFailureUsed = false, failBeforeActivationWorker = null, beforeActivationFailureUsed = false, failUploadWorker = null, exposeOnUploadWorker = null, competeBeforeActivationWorker = null, competitionUsed = false, failMigration = false
  const stateForArgs = args => states.get(args[args.indexOf('--name') + 1])
  const json = value => ({ stdout: JSON.stringify(value), stderr: '' })
  const run = async args => {
    calls.push([...args])
    if (args.includes('deployments') && args.includes('status')) { const state = stateForArgs(args)
      if (state?.entry.worker === competeBeforeActivationWorker && !competitionUsed && state.versions.some(version => version.annotations?.['workers/tag'] === `agenticgraph-${sourceSha}`)) { const id = uuid(8000 + state.versions.length); state.versions.push({ id, annotations: { 'workers/tag': 'competing', 'workers/message': 'competing' }, resources: { bindings: [] } }); state.active = id; competitionUsed = true }
      if (!state?.active) throw new Error('API error code 10007 Worker does not exist'); return json({ id: state.deployment, created_on: '2026-08-20T00:00:00Z', versions: [{ version_id: state.active, percentage: 100 }] }) }
    if (args.includes('versions') && args.includes('list')) return json(stateForArgs(args).versions)
    if (args.includes('versions') && args.includes('view')) { const state = stateForArgs(args), id = args[args.indexOf('view') + 1]; return json(state.versions.find(version => version.id === id)) }
    if (args.includes('secret') && args.includes('list')) return json(stateForArgs(args).providerSecrets.map(name => ({ name })))
    if (args.includes('kv') && args.includes('namespace')) return json([{ id: environment.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID, title: 'mcp' }, { id: environment.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID, title: 'balance' }])
    if (args.includes('r2') && args.includes('bucket') && args.includes('list')) return { stdout: `name: ${environment.AGENTICGRAPH_MEDIA_R2_BUCKET}\nname: ${environment.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET}\nname: ${environment.TRAVEL_STORAGE_R2_BUCKET}\n`, stderr: '' }
    if (args.includes('d1') && args.includes('list')) return json([{ uuid: environment.TRAVEL_STORAGE_D1_DATABASE_ID, name: environment.TRAVEL_STORAGE_D1_DATABASE_NAME }])
    if (args[2] === 'deploy' || (args.includes('versions') && args.includes('upload'))) {
      if (args.includes('--dry-run')) return { stdout: 'dry run', stderr: '' }
      if (stateForArgs(args).entry.worker === failUploadWorker) throw new Error('simulated upload response loss without candidate proof')
      const state = stateForArgs(args), id = uuid(1000 + states.size + state.versions.length)
      const tag = args[args.indexOf('--tag') + 1], message = args[args.indexOf('--message') + 1]
      const candidate = tag.endsWith('-mcp-shell')
        ? { id, annotations: { 'workers/tag': tag, 'workers/message': message, 'workers/triggered_by': 'wrangler' }, resources: { bindings: [] } }
        : exactBootstrapBindings ? { id, annotations: { 'workers/tag': tag, 'workers/message': message }, resources: {
          bindings: bootstrapProviderBindingsFor(state.entry, args[args.indexOf('--config') + 1]).map(binding => ({ ...binding })),
        } } : candidateVersion(state.entry, id, configuration, { 'workers/tag': tag, 'workers/message': message })
      for (let index = 0; index < args.length; index += 1) if (args[index] === '--var') { const [name, ...parts] = args[++index].split(':'), text = parts.join(':')
        candidate.resources.bindings = candidate.resources.bindings.filter(binding => binding.name !== name); candidate.resources.bindings.push({ name, type: 'plain_text', text }) }
      for (const binding of args.includes('--keep-vars') ? state.versions[0]?.resources.bindings ?? [] : []) if (['secret_text', 'plain_text'].includes(binding.type) && !candidate.resources.bindings.some(item => item.name === binding.name)) candidate.resources.bindings.push({ ...binding })
      state.versions.push(candidate)
      state.providerSecrets = candidate.resources.bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name).sort()
      if (state.entry.worker === exposeOnUploadWorker) state.subdomain = { enabled: true, previews_enabled: true }
      if (args[2] === 'deploy') { state.active = id; state.deployment = uuid(Number(state.deployment.slice(-12)) + 1000) }
      return { stdout: `Worker Version ID: ${id}`, stderr: '' }
    }
    if (args.includes('versions') && args.includes('deploy')) {
      const state = stateForArgs(args), spec = args[args.indexOf('deploy') + 1], id = spec.split('@')[0]
      if (state.entry.worker === failBeforeActivationWorker && !beforeActivationFailureUsed && state.versions.at(-1).id === id) { beforeActivationFailureUsed = true; throw new Error('simulated failure before activation') }
      state.active = id
      state.deployment = uuid(Number(state.deployment.slice(-12)) + 1000)
      if (state.entry.worker === failActivationWorker && !activationFailureUsed && state.versions.at(-1).id === id) { activationFailureUsed = true; throw new Error('simulated activation response loss') }
      return { stdout: 'deployed', stderr: '' }
    }
    if (args.includes('d1') && args.includes('time-travel')) return json({ bookmark: 'bookmark-before-travel-release' })
    if (args.includes('d1') && args.includes('migrations') && args.includes('apply')) {
      if (failMigration) { appliedMigrationNames = [...allMigrations]; throw new Error('simulated partial D1 migration failure') }
      appliedMigrationNames = [...allMigrations]
      return { stdout: 'migrated', stderr: '' }
    }
    if (args.includes('d1') && args.includes('execute')) return json([{ results: appliedMigrationNames.map(name => ({ name })) }])
    throw new Error(`unexpected fake command: ${args.join(' ')}`)
  }
  const spec = routeSpecFor(environment), routeRecords = empty ? [] : spec.routes.map((route, index) => ({ id: `route-${index}`, ...route }))
  const domainRecords = empty ? [] : spec.domains.map((domain, index) => ({ id: `domain-${index}`, hostname: domain.hostname,
    service: domain.service, zone_id: domain.zoneId, zone_name: domain.zoneName }))
  const envelope = (result, info = { total_pages: 1 }) => new Response(JSON.stringify({ success: true, result,
    ...(info ? { result_info: info } : {}) }), { status: 200 })
  const apiFetch = async (url, options = {}) => {
    const parsed = new URL(url), pathname = parsed.pathname, body = options.body ? JSON.parse(options.body) : null
    if (pathname.endsWith('/zones')) return envelope([{ id: environment.TRAVEL_PUBLIC_ZONE_ID, name: environment.TRAVEL_PUBLIC_ZONE_NAME }])
    if (pathname.endsWith('/workers/scripts')) return envelope([...states.values()].filter(state => state.active).map(state => ({ id: state.entry.worker })))
    const detail = pathname.match(/\/workers\/scripts\/([^/]+)\/versions\/([^/]+)$/)
    if (detail) return envelope(states.get(decodeURIComponent(detail[1])).versions.find(version => version.id === decodeURIComponent(detail[2])), null)
    if (pathname.endsWith('/versions')) { const versions = states.get(decodeURIComponent(pathname.split('/').at(-2))).versions
      const page = Number(parsed.searchParams.get('page') ?? 1), start = (page - 1) * 100
      return envelope({ items: versions.slice(start, start + 100).map(({ id }) => ({ id })) }, null) }
    if (pathname.endsWith('/storage/kv/namespaces')) return envelope([
      { id: environment.TRAVEL_AGENT_DEFINITION_CACHE_KV_NAMESPACE_ID, title: 'mcp' },
      { id: environment.TRAVEL_BALANCE_CACHE_KV_NAMESPACE_ID, title: 'balance' }])
    if (pathname.endsWith('/r2/buckets')) return envelope({ buckets: [environment.AGENTICGRAPH_MEDIA_R2_BUCKET,
      environment.TRAVEL_PROVENANCE_ARCHIVE_R2_BUCKET, environment.TRAVEL_STORAGE_R2_BUCKET].map(name => ({ name })) }, { cursor: null })
    if (pathname.endsWith('/d1/database')) return envelope([{ uuid: environment.TRAVEL_STORAGE_D1_DATABASE_ID,
      name: environment.TRAVEL_STORAGE_D1_DATABASE_NAME }])
    if (pathname.endsWith('/workers/routes')) {
      if (options.method === 'POST') { routeRecords.push({ id: `route-${routeRecords.length}`, ...body }); return envelope(routeRecords.at(-1), null) }
      return envelope(routeRecords)
    }
    if (pathname.endsWith('/workers/domains')) {
      if (options.method === 'PUT') { domainRecords.push({ id: `domain-${domainRecords.length}`, ...body }); return envelope(domainRecords.at(-1), null) }
      return envelope(domainRecords)
    }
    if (pathname.endsWith('/subdomain')) {
      const worker = decodeURIComponent(pathname.split('/').at(-2)), state = states.get(worker)
      if (options.method === 'POST') state.subdomain = { enabled: body.enabled, previews_enabled: body.previews_enabled }
      return envelope(state.subdomain, null)
    }
    throw new Error(`unexpected fake API URL: ${url}`)
  }
  return { apiFetch, calls, configuration, run, states,
    setFailActivation: worker => { failActivationWorker = worker }, setFailBeforeActivation: worker => { failBeforeActivationWorker = worker },
    setFailUpload: worker => { failUploadWorker = worker },
    setExposeOnUpload: worker => { exposeOnUploadWorker = worker },
    setCompeteBeforeActivation: worker => { competeBeforeActivationWorker = worker },
    setFailMigration: () => { failMigration = true; appliedMigrationNames = allMigrations.slice(0, -1) },
    setProviderSecrets: (worker, names) => { states.get(worker).providerSecrets = [...names].sort() },
    baseline: new Map([...states].map(([worker, state]) => [worker, state.active])) }
}
const readinessService = url => {
  const pathname = new URL(url).pathname
  return pathname.includes('/travel/reconciliation/') ? 'agenticgraph-travel-operator-gateway'
    : new URL(url).hostname.startsWith('storage.') ? 'agenticgraph-storage' : 'agenticgraph-mcp'
}
const fetchReadiness = async url => new Response(JSON.stringify({ ok: true, service: readinessService(url), ...(new URL(url).pathname.includes('/travel/reconciliation/') ? { providerRuntime: commerceProviderRuntimeProofFor(sourceSha, candidateDigest) } : {}) }), { status: 200 })
const bootstrapPacket = environment => ({
  schema: BOOTSTRAP_PACKET_SCHEMA, accountId: environment.CLOUDFLARE_ACCOUNT_ID, zoneId: environment.TRAVEL_PUBLIC_ZONE_ID,
  issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T01:00:00.000Z',
  variables: PROTECTED_VARIABLE_NAMES.filter(name => !['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(name))
    .map(name => ({ name, valueDigest: digest(String(environment[name])) })),
  secrets: PROTECTED_SECRET_NAMES.map(name => ({ name, valueDigest: digest(String(environment[name])) })),
})
const bootstrapAdapter = ({ inventory = { marker: 'stable-before', routes: [], domains: [],
  units: [{ id: 'mcp', worker: 'agenticgraph-mcp', absent: true, exposure: { worker: 'agenticgraph-mcp', absent: true } }],
  appliedMigrations: [...repositoryMigrations, 'provider-baseline.sql'].sort() }, loseResponseAt = null } = {}) => {
  const observed = new Map(), calls = [], journals = [], terminalVerifications = []; let responseLost = false, completion = null
  const completionEvidence = async plan => ({
    versions: Object.fromEntries(plan.desired.units.map(unit => [unit.id, `${unit.id}-version`])),
    bindings: { marketplaceD1: environmentFixture.TRAVEL_STORAGE_D1_DATABASE_ID, storageD1: environmentFixture.TRAVEL_STORAGE_D1_DATABASE_ID },
    secretNames: {}, routes: plan.desired.routes.routes, domains: plan.desired.routes.domains, migrations: plan.desired.migrations, exposure: plan.desired.exposure,
    probes: { status: 'ready', services: ['agenticgraph-mcp', 'agenticgraph-storage', 'agenticgraph-travel-operator-gateway'] },
  })
  return {
    calls, journals, terminalVerifications, readCompleteInventory: async () => inventory,
    persistJournal: async (journal, pending = null) => { journals.push({ journal, pending }) }, loadJournal: async () => journals.at(-1) ?? null,
    loadCompletion: async () => completion, persistCompletion: async value => { completion = structuredClone(value) }, dropCompletion: () => { completion = null }, responseLossAdoptable: () => true,
    project: async (id, expected) => {
      calls.push(id); observed.set(id, structuredClone(expected))
      if (id === loseResponseAt && !responseLost) { responseLost = true; throw new Error('mutated then connection reset') }
    },
    observe: async id => structuredClone(observed.get(id)), readCompletionEvidence: completionEvidence,
    verifyTerminalOwnedState: async (plan, receipt) => { terminalVerifications.push(receipt.receiptDigest); assert.deepEqual(observed.get('persist-receipt'), receipt)
      assert.deepEqual(observed.get('enable-release'), { name: 'TRAVEL_MESH_RELEASE_ENABLED', value: 'true' })
      assert.equal(digest(await completionEvidence(plan)), receipt.finalEvidenceDigest) } }
}
const environmentFixture = protectedEnvironment()
const productionBootstrapFixture = ({ privateMcpBaseline = false } = {}) => {
  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment,
    { empty: true, exactBootstrapBindings: true, privateMcpBaseline })
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-production-adapter-')), variables = new Map(), secrets = new Set(PROTECTED_SECRET_NAMES)
  environment.RUNNER_TEMP = root; environment.GITHUB_REPOSITORY = 'owner/repo'; environment.GH_TOKEN = 'gh-token'
  for (const name of PROTECTED_VARIABLE_NAMES.filter(name => !['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(name))) variables.set(name, String(environment[name]))
  const commandCalls = [], runCommand = (program, args, options = {}) => {
    commandCalls.push({ program, args: [...args], hasInput: Object.hasOwn(options, 'input') })
    if (program === 'git') return args[0] === 'status' ? '' : args[0] === 'ls-remote' ? `${sourceSha}\trefs/heads/main\n`
      : args.at(-1) === 'HEAD^{tree}' ? `${'c'.repeat(40)}\n` : `${sourceSha}\n`
    const kind = args[0], action = args[1], name = args[2]
    if (action === 'list') return JSON.stringify(kind === 'variable' ? [...variables].map(([key, value]) => ({ name: key, value, updatedAt: null }))
      : [...secrets].map(key => ({ name: key, updatedAt: null })))
    if (action === 'set') { assert(!args.includes(String(options.input))); (kind === 'variable' ? variables.set(name, String(options.input)) : secrets.add(name)); return '' }
    if (kind === 'variable' && action === 'get') return JSON.stringify({ name, value: variables.get(name) })
    throw new Error(`unexpected fixture command ${program} ${args.join(' ')}`)
  }
  const adapter = createProductionBootstrapAdapter({ environment, journalPath: path.join(root, 'journal.json'), run: cloudflare.run,
    apiFetch: cloudflare.apiFetch, runCommand, probeFetch: fetchReadiness })
  return { adapter, cloudflare, commandCalls, environment, root, runCommand, variables }
}
test('bootstrap plan seals complete stable inventory, packet digests, ten units, and exact authorization', async () => {
  const environment = protectedEnvironment(), adapter = bootstrapAdapter()
  const plan = await planBootstrap({ adapter, environment, packet: bootstrapPacket(environment), sourceSha, sourceTree: 'c'.repeat(40), controllerDigest: 'd'.repeat(64), workflowDigest: 'e'.repeat(64), wranglerDigest: 'f'.repeat(64), issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T00:30:00.000Z' })
  assert.equal(plan.desired.units.length, 10); assert.equal(plan.desired.units[0].worker, 'agenticgraph-marketplace-production')
  assert.equal(plan.desired.units[0].d1DatabaseId, environment.TRAVEL_STORAGE_D1_DATABASE_ID); assert.equal(plan.desired.units.at(-1).d1DatabaseId, environment.TRAVEL_STORAGE_D1_DATABASE_ID)
  assert.deepEqual(plan.effectGraph, bootstrapEffectGraph(plan.desired))
  assert.equal(plan.exactAuthorization, `authorize travel-mesh-provider-bootstrap ${plan.planDigest}`)
  assert(!JSON.stringify(plan).includes(environment.TRAVEL_COMMERCE_API_TOKEN))
  assert(plan.desired.migrations.names.includes('provider-baseline.sql')); assert(!plan.desired.migrations.repository.names.includes('provider-baseline.sql'))
  assert.equal(plan.desired.units.find(unit => unit.id === 'experience-discovery').bindings.find(binding => binding.name === 'EXPERIENCE_PROVIDER_ID').valueDigest, digest(environment.TRAVEL_EXPERIENCE_PROVIDER_ID))
  assert.throws(() => bootstrapMcpTransitionFor({ units: [{ id: 'mcp', worker: 'agenticgraph-mcp', versionId: 'v1', deployment: { versionId: 'v1', percentage: 100 }, bindings: [{ name: 'TOKEN', type: 'secret_text' }], secretNames: [], exposure: { enabled: false, previewsEnabled: false } }], routes: [], domains: [] }), /secret-inventory coherent/)
  assert.throws(() => bootstrapUnitSpecFor(TRAVEL_MESH_PLAN.find(unit => unit.id === 'mcp'), environment, { bindings: [{ name: 'UNMANAGED', type: 'service', service: 'competing-worker' }] }), /unmanaged structural baseline binding/); assert.throws(() => bootstrapUnitSpecFor(TRAVEL_MESH_PLAN.find(unit => unit.id === 'mcp'), environment, { bindings: [{ name: 'AGENTICGRAPH_MCP_PUBLIC_BASE_URL', type: 'secret_text' }] }), /baseline secret/)
  assert.throws(() => assertAdditiveBootstrapMigrations(new Set(plan.beforeInventory.appliedMigrations.filter(name => name !== '0006_stripe_webhook_processing_state.sql'))), /not additive/)
  await assert.rejects(() => requireStableCompleteInventory((() => { let read = 0; return async () => ({ read: read++ }) })()), /drifted across the required double-read/)
})
test('bootstrap apply journals exact order, adopts only exact response loss, and enables release last', async () => {
  const environment = protectedEnvironment(), adapter = bootstrapAdapter({ loseResponseAt: 'deploy:mcp' })
  const plan = await planBootstrap({ adapter, environment, packet: bootstrapPacket(environment), sourceSha, sourceTree: 'c'.repeat(40), controllerDigest: 'd'.repeat(64), workflowDigest: 'e'.repeat(64),
    wranglerDigest: 'f'.repeat(64), issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T00:30:00.000Z' })
  const input = { adapter, environment, packet: bootstrapPacket(environment), plan, authorization: plan.exactAuthorization, actor: 'github:8945812', consumedAt: '2026-08-30T00:01:00.000Z', now: () => Date.parse('2026-08-30T00:01:00.000Z') }, result = await applyBootstrap(input)
  assert.equal(result.status, 'complete'); assert.deepEqual(adapter.calls, BOOTSTRAP_EFFECT_ORDER)
  assert.equal(adapter.calls.at(-2), 'persist-receipt'); assert.equal(adapter.calls.at(-1), 'enable-release')
  const effects = adapter.journals.filter(entry => !entry.pending).flatMap(entry => entry.journal.effects).filter((entry, index, all) => all.findIndex(item => item.effectId === entry.effectId) === index)
  const beforeMcp = adapter.journals.findLast(entry => !entry.pending && entry.journal.effects.length === BOOTSTRAP_EFFECT_ORDER.indexOf('deploy:mcp')).journal, mcpExpectedDigest = effects.find(effect => effect.effectId === 'deploy:mcp').expectedDigest
  assert.equal(effects.find(effect => effect.effectId === 'deploy:mcp').disposition, 'adopted-response-loss')
  assert.equal(result.receipt.schema, BOOTSTRAP_RECEIPT_SCHEMA); assert.equal(result.receipt.releaseEnabled, true)
  const prefix = adapter.journals.findLast(entry => !entry.pending && entry.journal.effects.length === BOOTSTRAP_EFFECT_ORDER.length - 2).journal
  const terminalProbe = preflightBootstrapTerminalCarriers({ journal: prefix, receipt: result.receipt }); assert.equal(terminalProbe.combinations.length, 4); assert.equal(adapter.terminalVerifications.length, 1)
  const receiptBody = Object.fromEntries(Object.entries(result.receipt).filter(([name]) => name !== 'receiptDigest')), carrierBase = { ...receiptBody, authorizedBy: '' }, carrierBaseSize = Buffer.byteLength(JSON.stringify({ ...carrierBase, receiptDigest: digest(carrierBase) }))
  const utf8Padding = bytes => `${'é'.repeat(Math.floor(bytes / 2))}${bytes % 2 ? 'x' : ''}`, exactBody = { ...carrierBase, authorizedBy: utf8Padding(48 * 1024 - carrierBaseSize) }, exactReceipt = { ...exactBody, receiptDigest: digest(exactBody) }
  assert.equal(Buffer.byteLength(bootstrapReceiptCarrier(exactReceipt)), 48 * 1024); const oversizedBody = { ...exactBody, authorizedBy: `${exactBody.authorizedBy}x` }; assert.throws(() => bootstrapReceiptCarrier({ ...oversizedBody, receiptDigest: digest(oversizedBody) }), /48 KiB/)
  const carrierBytes = Math.max(...terminalProbe.combinations.map(item => Buffer.byteLength(JSON.stringify(item.carrier)))), terminalBody = { ...receiptBody, authorizedBy: `${receiptBody.authorizedBy}${utf8Padding(48 * 1024 - carrierBytes)}` }, terminalReceipt = { ...terminalBody, receiptDigest: digest(terminalBody) }
  assert.equal(Math.max(...preflightBootstrapTerminalCarriers({ journal: prefix, receipt: terminalReceipt }).combinations.map(item => Buffer.byteLength(JSON.stringify(item.carrier)))), 48 * 1024); const terminalOverflow = { ...terminalBody, authorizedBy: `${terminalBody.authorizedBy}x` }; assert.throws(() => preflightBootstrapTerminalCarriers({ journal: prefix, receipt: { ...terminalOverflow, receiptDigest: digest(terminalOverflow) } }), /48 KiB/)
  const projectionCount = adapter.calls.length; adapter.dropCompletion(); const recovered = await applyBootstrap(input); assert.equal(recovered.resultDigest, result.resultDigest); assert.equal(adapter.calls.length, projectionCount); adapter.dropCompletion()
  adapter.journals.splice(0, adapter.journals.length, { journal: prefix, pending: { effectId: 'persist-receipt', expectedDigest: '0'.repeat(64) } })
  await assert.rejects(() => applyBootstrap(input), /durable pending bootstrap effect drifted/); adapter.journals.splice(0, adapter.journals.length, { journal: prefix, pending: { effectId: 'persist-receipt', expectedDigest: digest(result.receipt) } })
  assert.equal((await applyBootstrap(input)).status, 'complete')
  const mcpCallCount = adapter.calls.filter(id => id === 'deploy:mcp').length; adapter.dropCompletion(); adapter.journals.splice(0, adapter.journals.length, { journal: beforeMcp, pending: { effectId: 'deploy:mcp', expectedDigest: mcpExpectedDigest } }); const replayObserve = adapter.observe; adapter.observe = async (id, ...args) => id === 'deploy:mcp-shell' ? { drifted: true } : replayObserve(id, ...args); assert.equal((await applyBootstrap(input)).status, 'complete'); adapter.observe = replayObserve
  const replayMcp = adapter.journals.at(-1).journal.effects.find(effect => effect.effectId === 'deploy:mcp'); assert.equal(adapter.calls.filter(id => id === 'deploy:mcp').length, mcpCallCount); assert.equal(replayMcp.disposition, 'adopted-response-loss'); assert.equal(replayMcp.expectedDigest, replayMcp.observedDigest)
})
test('bootstrap rejects inexact response-loss readback and complete inventory pagination drift', async () => {
  const environment = protectedEnvironment(), adapter = bootstrapAdapter()
  const plan = await planBootstrap({ adapter, environment, packet: bootstrapPacket(environment), sourceSha, sourceTree: 'c'.repeat(40), controllerDigest: 'd'.repeat(64), workflowDigest: 'e'.repeat(64), wranglerDigest: 'f'.repeat(64), issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T00:30:00.000Z' })
  const originalProject = adapter.project, originalObserve = adapter.observe
  adapter.project = async (id, expected) => id === 'deploy:marketplace'
    ? (adapter.calls.push(id), Promise.reject(new Error('unknown response'))) : originalProject(id, expected)
  adapter.observe = async id => id === 'deploy:marketplace' ? { worker: 'competing-target' } : originalObserve(id)
  await assert.rejects(() => applyBootstrap({ adapter, environment, packet: bootstrapPacket(environment), plan, authorization: plan.exactAuthorization, actor: 'github:8945812', consumedAt: '2026-08-30T00:01:00.000Z', now: () => Date.parse('2026-08-30T00:01:00.000Z') }), /not exactly adopted/)
  const pages = []
  const records = await cloudflareApiAllPages(async url => { const page = Number(new URL(url).searchParams.get('page')); pages.push(page); return new Response(JSON.stringify({ success: true, result: [{ page }], result_info: { total_pages: 2 } })) }, 'https://api.cloudflare.test/items', environment, 'fixture inventory')
  assert.deepEqual(pages, [1, 2]); assert.deepEqual(records, [{ page: 1 }, { page: 2 }])
  const versionPages = [], details = await cloudflareWorkerVersionDetails(async url => { const parsed = new URL(url)
    if (parsed.pathname.endsWith('/versions')) { const page = Number(parsed.searchParams.get('page')); versionPages.push(page); return new Response(JSON.stringify({ success: true, result: { items: page === 1 ? [{ id: 'v1' }, { id: 'v2' }] : [] } })) }
    const id = decodeURIComponent(parsed.pathname.split('/').at(-1)); return new Response(JSON.stringify({ success: true, result: { id, annotations: { 'workers/tag': `tag-${id}` }, resources: { bindings: [] } } })) },
  'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'version fixture')
  assert.deepEqual(versionPages, [1, 2]); assert.deepEqual(details.map(item => item.annotations['workers/tag']), ['tag-v1', 'tag-v2'])
  await assert.rejects(() => cloudflareWorkerVersionDetails(async url => { const page = Number(new URL(url).searchParams.get('page')); return new Response(JSON.stringify({ success: true, result: { items: page === 1 ? [{ id: 'duplicate' }, { id: 'a' }] : page === 2 ? [{ id: 'duplicate' }, { id: 'b' }] : [] } })) },
  'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'duplicate fixture'), /duplicate version identity/)
  await assert.rejects(() => cloudflareWorkerVersionDetails(async () => new Response(JSON.stringify({ success: true, result: { items: [] }, result_info: { page: 1, count: 0, total_pages: 2 } })), 'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'truncated fixture'), /ended before its declared final page/)
  await assert.rejects(() => cloudflareWorkerVersionDetails(async url => { const page = Number(new URL(url).searchParams.get('page')); return new Response(JSON.stringify({ success: true, result: { items: page === 1 ? [{ id: 'v1' }] : [] }, ...(page === 1 ? { result_info: { total_pages: 2 } } : {}) })) }, 'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'empty final fixture'), /ended before its declared final page/)
  await assert.rejects(() => cloudflareWorkerVersionDetails(async url => { const page = Number(new URL(url).searchParams.get('page')); return new Response(JSON.stringify({ success: true, result: { items: [{ id: `v${page}` }] }, ...(page === 1 ? { result_info: { total_pages: 1 } } : {}) })) }, 'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'omitted metadata fixture'), /exceeded its declared final page/)
  assert.deepEqual(await cloudflareWorkerVersionDetails(async () => new Response(JSON.stringify({ success: true, result: { items: [] }, result_info: { page: 1, count: 0, total_count: 0, total_pages: 1 } })), 'https://api.cloudflare.test/workers/scripts/mcp/versions', environment, 'empty fixture'), [])
})
test('bootstrap uses a bounded artifact carrier and rejects oversized evidence before provider mutation', async () => {
  const environment = protectedEnvironment(), oversizedAdapter = bootstrapAdapter({ inventory: { records: ['x'.repeat(4 * 1024 * 1024)], routes: [], domains: [], units: [{ id: 'mcp', worker: 'agenticgraph-mcp', absent: true, exposure: { worker: 'agenticgraph-mcp', absent: true } }], appliedMigrations: repositoryMigrations } })
  await assert.rejects(() => planBootstrap({ adapter: oversizedAdapter, environment,
    packet: bootstrapPacket(environment), sourceSha, sourceTree: 'c'.repeat(40),
    controllerDigest: 'd'.repeat(64), workflowDigest: 'e'.repeat(64), wranglerDigest: 'f'.repeat(64),
    issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T00:30:00.000Z' }),
  /exceeds the 4 MiB protected artifact carrier/)
})
test('production bootstrap adapter performs exact replay-safe provider projection with no secret argv', async () => {
  const fixture = productionBootstrapFixture(), { adapter, environment } = fixture
  const planFor = item => planBootstrap({ adapter: item.adapter, environment: item.environment, packet: bootstrapPacket(item.environment), sourceSha, sourceTree: 'c'.repeat(40), controllerDigest: digest(fs.readFileSync(new URL('../travel-mesh-bootstrap.mjs', import.meta.url), 'utf8')), workflowDigest: digest(fs.readFileSync(new URL('../../.github/workflows/travel-mesh-bootstrap.yml', import.meta.url), 'utf8')), wranglerDigest: wranglerConfigurationDigest(), issuedAt: '2026-08-30T00:00:00.000Z', expiresAt: '2026-08-30T00:30:00.000Z' })
  const inputFor = (item, sealed) => ({ adapter: item.adapter, environment: item.environment, packet: bootstrapPacket(item.environment), plan: sealed, authorization: sealed.exactAuthorization, actor: 'github:8945812', consumedAt: '2026-08-30T00:01:00.000Z', now: () => Date.parse('2026-08-30T00:01:00.000Z') })
  const effects = [], originalProject = adapter.project; adapter.project = async (id, ...args) => { effects.push(id); return originalProject(id, ...args) }
  const plan = await planFor(fixture), input = inputFor(fixture, plan)
  await assert.rejects(() => applyBootstrap({ ...input, environment: { ...environment, TRAVEL_COMMERCE_API_TOKEN: 'drift' } }), /packet digest/); await assert.rejects(() => applyBootstrap({ ...input, now: () => Date.parse('2026-08-30T01:00:00.000Z') }), /expired/)
  const first = await applyBootstrap(input)
  const finalEvidence = await adapter.readCompletionEvidence(plan), enabled = fixture.variables.get('TRAVEL_MESH_RELEASE_ENABLED'), runCommand = fixture.runCommand; let terminalReads = 0
  const driftAdapter = createProductionBootstrapAdapter({ environment, journalPath: path.join(fixture.root, 'drift.json'), run: fixture.cloudflare.run, apiFetch: fixture.cloudflare.apiFetch, runCommand: (program, args, options) => { if (program === 'gh' && args[0] === 'variable' && args[1] === 'get' && ['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(args[2]) && ++terminalReads === 3) fixture.variables.set('TRAVEL_MESH_RELEASE_ENABLED', 'false'); return runCommand(program, args, options) }, probeFetch: fetchReadiness })
  await assert.rejects(() => driftAdapter.verifyTerminalOwnedState(plan, first.receipt, finalEvidence), /TRAVEL_MESH_RELEASE_ENABLED drifted/); fixture.variables.set('TRAVEL_MESH_RELEASE_ENABLED', enabled)
  fs.rmSync(fixture.root, { recursive: true, force: true })
  const resumedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-production-restart-'))
  environment.RUNNER_TEMP = resumedRoot
  const resumedAdapter = createProductionBootstrapAdapter({ environment, journalPath: path.join(resumedRoot, 'journal.json'), run: fixture.cloudflare.run, apiFetch: fixture.cloudflare.apiFetch, runCommand: fixture.runCommand, probeFetch: fetchReadiness })
  const replay = await applyBootstrap({ ...input, adapter: resumedAdapter })
  assert.equal(first.resultDigest, replay.resultDigest); assert.deepEqual(effects, BOOTSTRAP_EFFECT_ORDER)
  assert.equal(first.receipt.workers.length, 10); assert.equal(first.receipt.resources.storageD1DatabaseId, environment.TRAVEL_STORAGE_D1_DATABASE_ID)
  assert(fixture.commandCalls.filter(call => call.program === 'gh' && call.args[1] === 'set').every(call => call.hasInput))
  assert(!JSON.stringify(fixture.commandCalls).includes(environment.TRAVEL_COMMERCE_API_TOKEN)); for (const args of fixture.cloudflare.calls.filter(call => call.includes('versions') && call.includes('upload') && !call[call.indexOf('--tag') + 1].endsWith('-mcp-shell'))) { const entry = TRAVEL_MESH_BOOTSTRAP_UNITS.find(item => item.worker === args[args.indexOf('--name') + 1]); assert.equal(path.dirname(path.resolve(args[args.indexOf('--config') + 1])), path.dirname(path.resolve(entry.config))) }
  const shellDeploy = fixture.cloudflare.calls.find(call => call[call.indexOf('--tag') + 1]?.endsWith('-mcp-shell'))
  assert(shellDeploy?.[2] === 'deploy' && !shellDeploy.includes('versions') && !shellDeploy.includes('--keep-vars') && !shellDeploy.includes('--secrets-file'))
  assert.throws(() => createProductionBootstrapAdapter({ environment: { ...environment, GITHUB_REPOSITORY: 'owner/repo;touch /tmp/pwned' }, journalPath: path.join(resumedRoot, 'other.json') }), /malformed/)
  fs.rmSync(resumedRoot, { recursive: true, force: true })
  const adopted = productionBootstrapFixture({ privateMcpBaseline: true }), adoptedPlan = await planFor(adopted)
  assert.equal(adoptedPlan.desired.mcpTransition.mode, 'adopt-existing-private'); await applyBootstrap(inputFor(adopted, adoptedPlan))
  assert.equal(adopted.cloudflare.calls.filter(call => call[call.indexOf('--tag') + 1]?.endsWith('-mcp-shell')).length, 0); fs.rmSync(adopted.root, { recursive: true, force: true })
  for (const privateMcpBaseline of [false, true]) { const competing = productionBootstrapFixture({ privateMcpBaseline }), competingPlan = await planFor(competing); competing.cloudflare.setCompeteBeforeActivation('agenticgraph-mcp'); await assert.rejects(() => applyBootstrap(inputFor(competing, competingPlan)), /active binding inventory drifted|active MCP predecessor/); assert.equal(competing.cloudflare.calls.filter(call => call.includes('versions') && call.includes('deploy') && call[call.indexOf('--name') + 1] === 'agenticgraph-mcp').length, 0); assert.equal(competing.cloudflare.states.get('agenticgraph-mcp').versions.find(version => version.id === competing.cloudflare.states.get('agenticgraph-mcp').active).annotations['workers/tag'], 'competing'); assert(!competing.variables.has('TRAVEL_MESH_RELEASE_ENABLED')); fs.rmSync(competing.root, { recursive: true, force: true }) }
  for (const privateMcpBaseline of [false, true]) { const interrupted = productionBootstrapFixture({ privateMcpBaseline }), interruptedPlan = await planFor(interrupted), interruptedInput = inputFor(interrupted, interruptedPlan); interrupted.cloudflare.setFailBeforeActivation('agenticgraph-mcp'); await assert.rejects(() => applyBootstrap(interruptedInput), /response-loss reconciliation failed/); const carrier = JSON.parse(interrupted.variables.get('TRAVEL_MESH_BOOTSTRAP_JOURNAL_JSON')), uploads = interrupted.cloudflare.calls.filter(call => call.includes('versions') && call.includes('upload') && call[call.indexOf('--name') + 1] === 'agenticgraph-mcp').length; assert.equal(carrier.pending.effectId, 'deploy:mcp'); assert(!carrier.journal.effects.some(effect => effect.effectId === 'deploy:mcp')); assert(!interrupted.variables.has('TRAVEL_MESH_RELEASE_ENABLED')); assert.equal((await applyBootstrap(interruptedInput)).status, 'complete'); assert.equal(interrupted.cloudflare.calls.filter(call => call.includes('versions') && call.includes('upload') && call[call.indexOf('--name') + 1] === 'agenticgraph-mcp').length, uploads); assert.equal(interrupted.variables.get('TRAVEL_MESH_RELEASE_ENABLED'), 'true'); fs.rmSync(interrupted.root, { recursive: true, force: true }) }
})
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
  assert.equal(validateProtectedConfiguration(protectedEnvironment()).overrides.mcp.AGENTICGRAPH_MCP_PUBLIC_BASE_URL, 'https://airvio.co')
  const wrongProbe = JSON.parse(protectedEnvironment().TRAVEL_MESH_PROBE_SPEC_JSON)
  wrongProbe[0].url = 'https://airvio.co/agenticgraph/control-plane/mcp/livez'
  assert.throws(() => parseProbeSpec(wrongProbe, { publicHost: 'airvio.co' }), /exact protected production host and readiness path/)
  const environment = protectedEnvironment(), encoder = new TextEncoder()
  const chunked = await probeMesh(environment.TRAVEL_MESH_PROBE_SPEC_JSON, { environment, fetchFn: async url => {
    const bytes = encoder.encode(JSON.stringify({ ok: true, service: readinessService(url), ...(new URL(url).pathname.includes('/travel/reconciliation/') ? { providerRuntime: commerceProviderRuntimeProofFor(sourceSha, candidateDigest) } : {}) })), midpoint = Math.ceil(bytes.length / 2)
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
  const bootstrapGate = 'Require completed travel mesh bootstrap before Pages'
  const cloudflareSteps = new Set([...travelSteps, 'Capture current production rollback target', 'Enforce sole deployment ownership',
    'Deploy verified artifact', 'Capture authoritative candidate deployment', 'Reconcile canonical docs into D1',
    'Capture successful release rollback target',
    'Roll back Pages to exact last-known-good deployment', 'Restore and reconcile last-known-good D1 state',
    'Capture authoritative restored Pages deployment'])
  const cloudflareNames = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
  const travelOnlyNames = [...PROTECTED_VARIABLE_NAMES, ...PROTECTED_SECRET_NAMES.filter(name => !cloudflareNames.includes(name))]
  for (const name of [...travelOnlyNames, ...cloudflareNames]) assert.equal(Object.hasOwn(deploy.env, name), false)
  for (const step of steps) {
    const scoped = step.env ?? {}
    if (travelSteps.has(step.name)) for (const name of [...travelOnlyNames, ...cloudflareNames]) assert.equal(Object.hasOwn(scoped, name), true)
    else if (step.name === bootstrapGate) {
      assert.deepEqual(Object.keys(scoped).sort(), ['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'])
    }
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
    'workers/tag': `agenticgraph-${sourceSha}`, 'workers/message': `agenticgraph candidate ${sourceSha} ${candidateDigest}`,
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
  assert.throws(() => meshOutcomeOutputs({}), /invalid agenticgraph-travel-mesh-failure-receipt/)
  assert.equal(parseR2BucketNames('name: exact-bucket-longer\n').has('exact-bucket'), false)
  const routeEnvironment = protectedEnvironment(), routeSpec = routeSpecFor(routeEnvironment)
  const domains = routeSpec.domains.map(domain => ({ hostname: domain.hostname, service: domain.service,
    zone_id: domain.zoneId, zone_name: domain.zoneName }))
  assert.doesNotThrow(() => validateRouteInventory(routeSpec.routes, domains, routeEnvironment))
  assert.throws(() => validateRouteInventory([...routeSpec.routes, {
    pattern: 'airvio.co/agenticgraph/control-plane/mcp/readyz', script: 'unrelated-worker',
  }], domains, routeEnvironment), /unexpected overlapping Worker route/)
})
test('preflight is read-only, inventories every baseline, and deploy/restore preserve dependency order', async () => {
  const environment = protectedEnvironment(), cloudflare = fakeCloudflare(environment, { extraBaselineSecrets: {
    mcp: ['EXA_API_KEY'], storage: ['GITHUB_TOKEN'],
  } })
  const now = () => new Date('2026-08-20T00:10:00.000Z')
  const preflight = await preflightMesh({ sourceSha, candidateDigest, authorization, environment, run: cloudflare.run, apiFetch: cloudflare.apiFetch, now })
  assert.equal(preflight.units.length, TRAVEL_MESH_PLAN.length)
  assert.notEqual(preflight.configurationDigest, cloudflare.configuration.configurationDigest)
  assert(preflight.units.every(unit => /^[0-9a-f]{64}$/.test(unit.preservedSecretNameDigest)))
  assert(preflight.units.every(unit => /^[0-9a-f]{64}$/.test(unit.baselineBindingInventory.digest)))
  assert.equal(cloudflare.calls.filter(args => args.includes('upload') && !args.includes('--dry-run')).length, 0)
  const receipt = await deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
    run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn: fetchReadiness, now })
  assert.equal(receipt.status, 'deployed')
  assert.equal(receipt.configurationDigest, preflight.configurationDigest)
  assert.equal(meshOutcomeOutputs(receipt).receipt_sealed, true)
  assert.deepEqual(receipt.units.map(unit => unit.id), TRAVEL_MESH_PLAN.map(entry => entry.id))
  const activations = cloudflare.calls.filter(args => args.includes('versions') && args.includes('deploy') && String(args[args.indexOf('deploy') + 1]).includes('@100')).slice(0, TRAVEL_MESH_PLAN.length)
  assert.deepEqual(activations.map(args => cloudflare.states.get(args[args.indexOf('--name') + 1]).entry.id), TRAVEL_MESH_PLAN.map(entry => entry.id))
  assert(TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'marketplace') < TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'travel-commerce') && TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'travel-commerce') < TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'mcp'))
  for (const [id, storageRevision] of Object.entries(COMMERCE_PROVIDER_STORAGE_REVISIONS)) { const entry = TRAVEL_MESH_PLAN.find(item => item.id === id), unit = receipt.units.find(item => item.id === id), version = cloudflare.states.get(entry.worker).versions.find(item => item.id === unit.candidate.versionId), bindings = new Map(version.resources.bindings.map(binding => [binding.name, binding]))
    for (const [name, value] of [['COMMERCE_PROVIDER_SOURCE_REVISION', sourceSha], ['COMMERCE_PROVIDER_STORAGE_REVISION', storageRevision], ['COMMERCE_PROVIDER_VERSION_ID', candidateDigest]]) assert.equal(bindings.get(name).text, value)
  }
  const commerceActivationIndex = cloudflare.calls.findIndex(args => args.includes('versions') && args.includes('deploy')
    && args[args.indexOf('--name') + 1] === 'agenticgraph-travel-commerce-production')
  const mcpUploadIndex = cloudflare.calls.findIndex(args => args.includes('versions') && args.includes('upload')
    && !args.includes('--dry-run') && args[args.indexOf('--name') + 1] === 'agenticgraph-mcp')
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
  drifted.setProviderSecrets('agenticgraph-mcp', [])
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
  /marketplace: Authentication error \[code: 10000\]/)
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
    if (drift === 'secrets') cloudflare.setProviderSecrets(TRAVEL_MESH_PLAN.find(entry => entry.secrets.length > 0).worker, [])
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
    cloudflare.setFailActivation('agenticgraph-mcp')
    await assert.rejects(() => deployMesh({ sourceSha, candidateDigest, authorization, preflight, environment,
      run: cloudflare.run, apiFetch: cloudflare.apiFetch, fetchFn, now }), error => {
      assert.equal(error.receipt.status, expectedStatus); assert.equal(error.receipt.restorationProof.status, expectedStatus === 'rolled-back' ? 'proved' : 'failed')
      if (expectedStatus === 'rolled-back') {
        assert.equal(error.receipt.restorationProof.probes.length, 3)
        assert.deepEqual(error.receipt.restorationProof.serving.map(unit => unit.versionId),
          TRAVEL_MESH_PLAN.map(entry => cloudflare.baseline.get(entry.worker)))
      }
      return true
    })
    for (const [worker, baseline] of cloudflare.baseline) assert.equal(cloudflare.states.get(worker).active, baseline)
  }; await exercise(async () => new Response('{"ok":false}', { status: 503 }), 'preserve-required'); await exercise(fetchReadiness, 'rolled-back')
})
