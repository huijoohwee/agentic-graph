#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DIGEST, PROTECTED_SECRET_NAMES, PROTECTED_VARIABLE_NAMES, SHA, TRAVEL_MARKETPLACE, TRAVEL_MESH_BOOTSTRAP_UNITS, TRAVEL_MESH_PLAN, assertAdditiveBootstrapMigrations, bootstrapMigrationSpec, bootstrapResourceSpecFor,
  bootstrapRuntimeConfiguration, bootstrapUnitSpecFor, canonical, digest, materializeRouteFreeBootstrapConfig, removeEphemeralFile, requireText, routeSpecFor, validateBootstrapProtectedConfiguration } from './travel-mesh-release-plan.mjs'
import { assertBootstrapTargetsUnexposed, bindingEvidence, cloudflareApiAllPages, cloudflareApiEnvelope, createBootstrapInventoryReader, requireStableCompleteInventory, validateRouteInventory } from './travel-mesh-release-inventory.mjs'
import { activeDeployment, probeMesh, uploadArguments } from './travel-mesh-release.mjs'; import { appendBootstrapJournal, buildBootstrapPlan, consumeBootstrapAuthorization, createBootstrapJournal, exactResponseLossDisposition, normalizeBootstrapCompletion, normalizeBootstrapJournal, normalizeBootstrapJournalCarrier, normalizeBootstrapPacket, normalizeBootstrapPlan, normalizeBootstrapReceipt, sealBootstrapCompletion, selectBootstrapJournalCarrier } from './travel-mesh-bootstrap-authorization.mjs'
export const BOOTSTRAP_RECEIPT_SCHEMA = 'agenticgraph-travel-mesh-bootstrap-receipt/v3'
export const ACTUAL_STORAGE_D1_ID = '633355bf-1a52-4085-bd3c-eba4220ff152'
export const BOOTSTRAP_DEPLOY_ORDER = Object.freeze(['marketplace', 'mcp-shell', 'settlement-executor', 'net-settlement', 'flight-discovery', 'experience-discovery', 'overflow', 'travel-commerce', 'mcp', 'operator-gateway', 'storage'])
export const BOOTSTRAP_EFFECT_ORDER = Object.freeze(['resources', 'storage-migrations', ...BOOTSTRAP_DEPLOY_ORDER.map(id => `deploy:${id}`), 'disable-public-subdomains', 'routes-and-custom-domain', 'live-probes', 'project-environment-packet', 'persist-receipt', 'enable-release'])
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const wranglerConfigurationDigest = () => {
  const workersRoot = path.resolve(repoRoot, 'cloudflare/workers')
  const entries = fs.readdirSync(workersRoot, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .flatMap(entry => fs.readdirSync(path.join(workersRoot, entry.name), { withFileTypes: true }).filter(file => file.isFile() && /^wrangler(?:\.[^.]+)*\.(?:json|jsonc|toml)$/.test(file.name))
      .map(file => {
        const relativePath = path.posix.join('cloudflare/workers', entry.name, file.name)
        return { path: relativePath, contentDigest: digest(fs.readFileSync(path.resolve(repoRoot, relativePath), 'utf8')) }
      }))
    .sort((left, right) => left.path.localeCompare(right.path))
  if (entries.length === 0) throw new Error('Wrangler configuration inventory is empty')
  return digest(entries)
}
const requiredEnvironment = environment => {
  const targetNames = [...new Set([...PROTECTED_VARIABLE_NAMES.filter(name => !['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(name)), ...PROTECTED_SECRET_NAMES])]
  const missing = targetNames.filter(name => !String(environment[name] ?? '').trim())
  if (missing.length) throw new Error(`bootstrap environment is missing: ${missing.join(', ')}`)
  validateBootstrapProtectedConfiguration(environment)
  return environment
}
export const createBootstrapDesiredState = (environment, beforeInventory = null) => {
  requiredEnvironment(environment)
  const routes = routeSpecFor(environment), runtime = bootstrapRuntimeConfiguration(environment)
  return Object.freeze({
    accountId: environment.CLOUDFLARE_ACCOUNT_ID, zoneId: environment.TRAVEL_PUBLIC_ZONE_ID,
    resources: bootstrapResourceSpecFor(environment), migrations: bootstrapMigrationSpec(),
    units: Object.freeze(TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => bootstrapUnitSpecFor(entry, environment, beforeInventory?.units?.find(unit => unit.id === entry.id)))),
    deploymentOrder: BOOTSTRAP_DEPLOY_ORDER,
    mcpTransition: Object.freeze(['private-unrouted-secret-free-503-shell', 'travel-commerce', 'exact-mcp']),
    routes, exposure: Object.freeze(TRAVEL_MESH_BOOTSTRAP_UNITS.map(entry => Object.freeze({ worker: entry.worker, enabled: false, previewsEnabled: false }))),
    environment: Object.freeze({
      variables: Object.freeze(Object.entries(runtime.variables).map(([name, value]) => ({ name, valueDigest: digest(String(value)) })).sort((left, right) => left.name.localeCompare(right.name))),
      secretNames: Object.freeze([...PROTECTED_SECRET_NAMES].sort()), receiptVariable: 'TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON',
      enableVariable: 'TRAVEL_MESH_RELEASE_ENABLED' }),
    configurationDigest: digest({ runtime: Object.fromEntries(Object.entries(runtime).map(([name, value]) => [name, name === 'secrets' ? Object.fromEntries(Object.entries(value).map(([id, entries]) => [id, Object.keys(entries).sort()])) : value])),
    }) })
}
export const bootstrapEffectGraph = desired => Object.freeze(BOOTSTRAP_EFFECT_ORDER.map((id, index) => Object.freeze({
  index, id, policy: id === 'routes-and-custom-domain' ? 'route-last'
    : id === 'enable-release' ? 'environment-last' : id === 'deploy:mcp' ? 'replace-shell' : 'create-or-adopt',
  expectedDigest: digest(id === 'resources' ? desired.resources : id === 'routes-and-custom-domain' ? desired.routes
    : id === 'disable-public-subdomains' ? desired.exposure : { id, desiredDigest: digest(desired) }),
})))
const packetMatchesRuntime = (packet, environment) => {
  const normalized = normalizeBootstrapPacket(packet)
  for (const { name, valueDigest } of [...normalized.variables, ...normalized.secrets]) {
    if (!(name in environment) || digest(String(environment[name])) !== valueDigest) throw new Error(`provider packet digest does not match protected runtime value ${name}`)
  }
  const requiredVariables = PROTECTED_VARIABLE_NAMES.filter(name => !['TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', 'TRAVEL_MESH_RELEASE_ENABLED'].includes(name)).sort()
  if (normalized.variables.map(entry => entry.name).sort().join('\0') !== requiredVariables.join('\0')
    || normalized.secrets.map(entry => entry.name).sort().join('\0') !== [...PROTECTED_SECRET_NAMES].sort().join('\0')) {
    throw new Error('provider packet does not contain the exact protected variable and secret name inventory')
  }
  return normalized
}
export const planBootstrap = async ({ adapter, environment, packet, sourceSha, sourceTree, controllerDigest, workflowDigest, wranglerDigest, issuedAt, expiresAt }) => {
  if (![sourceSha, sourceTree].every(value => SHA.test(value)) || ![controllerDigest, workflowDigest, wranglerDigest].every(value => DIGEST.test(value))) {
    throw new Error('bootstrap protected source evidence is invalid')
  }
  packetMatchesRuntime(packet, environment)
  const { inventory: beforeInventory } = await requireStableCompleteInventory(() => adapter.readCompleteInventory())
  if (!Array.isArray(beforeInventory.appliedMigrations)) throw new Error('complete provider inventory omitted D1 migration state')
  assertAdditiveBootstrapMigrations(new Set(beforeInventory.appliedMigrations))
  const desired = createBootstrapDesiredState(environment, beforeInventory)
  assertBootstrapTargetsUnexposed(beforeInventory, desired)
  return buildBootstrapPlan({ sourceSha, sourceTree, controllerDigest, workflowDigest, wranglerDigest, packet,
    beforeInventory, desired, effectGraph: bootstrapEffectGraph(desired), issuedAt, expiresAt })
}
const effectExpectation = (id, desired, receipt = null, plan = null) => {
  if (id === 'resources') return desired.resources
  if (id === 'storage-migrations') return desired.migrations
  if (id === 'routes-and-custom-domain') return desired.routes
  if (id === 'disable-public-subdomains') return desired.exposure
  if (id === 'live-probes') return { status: 'ready', services: ['agenticgraph-mcp', 'agenticgraph-storage', 'agenticgraph-travel-operator-gateway'] }
  if (id === 'persist-receipt') return receipt
  if (id === 'project-environment-packet') return { packetDigest: plan?.packetDigest ?? null,
    variables: desired.environment.variables, secretNames: desired.environment.secretNames }
  if (id === 'enable-release') return { name: 'TRAVEL_MESH_RELEASE_ENABLED', value: 'true' }
  const unitId = id.replace(/^deploy:/, '')
  if (unitId === 'mcp-shell') return { worker: 'agenticgraph-mcp', private: true, routeFree: true,
    secretNames: [], status: 503, sourceSha: plan?.sourceSha ?? null, planDigest: plan?.planDigest ?? null,
    active: true, percentage: 100 }
  const unit = desired.units.find(entry => entry.id === unitId)
  return { id: unit.id, worker: unit.worker, routeFree: true, secretNames: unit.secretNames,
    bindingSpecDigest: unit.bindingSpecDigest, configDigest: unit.configDigest, planDigestBound: true,
    sourceSha: plan?.sourceSha ?? null, planDigest: plan?.planDigest ?? null, active: true, percentage: 100 }
}
const journalEffect = ({ id, expected, observed, disposition, at }) => {
  const body = { effectId: id, expectedDigest: digest(expected), observedDigest: digest(observed), disposition, attemptedAt: at }
  return Object.freeze({ ...body, effectDigest: digest(body) })
}
const projectOne = async ({ adapter, plan, journal, id, expected, at, pending = null }) => {
  const expectedDigest = digest(expected)
  if (pending && (pending.effectId !== id || pending.expectedDigest !== expectedDigest)) throw new Error('durable pending bootstrap effect drifted')
  await adapter.persistJournal(journal, { effectId: id, expectedDigest })
  let disposition = 'projected'
  try {
    await adapter.project(id, expected, plan)
  } catch (error) {
    if (adapter.responseLossAdoptable?.(id) !== true) throw error
    let observedAfterLoss
    try { observedAfterLoss = await adapter.observe(id, plan) }
    catch (observeError) { throw new Error(`${id} response-loss reconciliation failed: ${observeError.message}`, { cause: error }) }
    disposition = exactResponseLossDisposition({ expected, observed: observedAfterLoss, error })
  }
  const observed = await adapter.observe(id, plan)
  if (canonical(observed) !== canonical(expected)) throw new Error(`bootstrap effect ${id} did not converge exactly`)
  const next = appendBootstrapJournal(journal, journalEffect({ id, expected, observed, disposition, at }))
  await adapter.persistJournal(next)
  return next
}
const buildReceipt = ({ plan, authorization, journal, finalEvidence, provisionedAt }) => {
  const effectJournalDigest = digest({ planDigest: plan.planDigest,
    authorizationReceiptDigest: authorization.receiptDigest,
    effects: journal.effects.filter(effect => !['persist-receipt', 'enable-release'].includes(effect.effectId)) })
  const body = {
    schema: BOOTSTRAP_RECEIPT_SCHEMA, status: 'provisioned', accountId: plan.accountId, zoneId: plan.zoneId,
    sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, planDigest: plan.planDigest, packetDigest: plan.packetDigest,
    authorizedBy: authorization.actor, authorizationReceiptDigest: authorization.receiptDigest,
    workers: plan.desired.units.map(entry => entry.worker), resources: plan.desired.resources,
    versions: finalEvidence.versions, bindings: finalEvidence.bindings, secretNames: finalEvidence.secretNames,
    routes: finalEvidence.routes, domains: finalEvidence.domains, migrations: finalEvidence.migrations,
    exposure: finalEvidence.exposure, probes: finalEvidence.probes, finalEvidenceDigest: digest(finalEvidence),
    effectJournalDigest,
    environmentProjection: { receiptPersisted: true, releaseEnabled: true }, releaseEnabled: true, provisionedAt,
  }
  return normalizeBootstrapReceipt(Object.freeze({ ...body, receiptDigest: digest(body) }), plan)
}
export const applyBootstrap = async ({ adapter, environment, packet, plan, authorization: authorizationText,
  actor, consumedAt, now = Date.now }) => {
  const normalized = normalizeBootstrapPlan(plan)
  const currentPacket = packetMatchesRuntime(packet, environment)
  if (digest(currentPacket) !== normalized.packetDigest
    || canonical(createBootstrapDesiredState(environment, normalized.beforeInventory)) !== canonical(normalized.desired)) {
    throw new Error('sealed bootstrap packet or desired graph drifted before apply')
  }
  if (authorizationText !== normalized.exactAuthorization) throw new Error('exact bootstrap authorization is required')
  await adapter.verifyPlanAuthority?.(normalized)
  const sealedCompletion = await adapter.loadCompletion?.(normalized.planDigest)
  if (sealedCompletion) {
    const completion = normalizeBootstrapCompletion(sealedCompletion, normalized.planDigest)
    await adapter.verifyTerminalOwnedState?.(normalized, completion.receipt)
    return completion
  }
  const persisted = await adapter.loadJournal?.(normalized.planDigest)
  let journal, authorization, pending = null
  if (persisted) {
    journal = normalizeBootstrapJournal(persisted.journal)
    pending = persisted.pending ?? null
    if (pending && (Object.keys(pending).sort().join(',') !== 'effectId,expectedDigest'
      || pending.effectId !== BOOTSTRAP_EFFECT_ORDER[journal.effects.length] || !DIGEST.test(pending.expectedDigest))) {
      throw new Error('durable pending bootstrap envelope is invalid')
    }
    authorization = journal.authorization
    if (journal.planDigest !== normalized.planDigest || authorization.actor !== actor) {
      throw new Error('durable bootstrap journal belongs to a different plan or actor')
    }
  } else {
    if (now() >= Date.parse(currentPacket.expiresAt)) throw new Error('sealed provider packet is expired')
    authorization = consumeBootstrapAuthorization({ plan: normalized, authorization: authorizationText,
      actor, consumedAt, now: now() })
    const stable = await requireStableCompleteInventory(() => adapter.readCompleteInventory())
    if (stable.inventoryDigest !== normalized.beforeInventoryDigest) throw new Error('provider inventory changed after bootstrap planning')
    journal = createBootstrapJournal({ plan: normalized, authorization })
    await adapter.persistJournal(journal)
  }
  const attemptedAt = authorization.consumedAt
  for (const id of BOOTSTRAP_EFFECT_ORDER.slice(0, -2)) {
    const expected = effectExpectation(id, normalized.desired, null, normalized)
    const completed = journal.effects.find(effect => effect.effectId === id)
    if (completed) {
      const superseded = id === 'deploy:mcp-shell' && journal.effects.some(effect => effect.effectId === 'deploy:mcp')
      if (completed.expectedDigest !== digest(expected) || (!superseded
        && canonical(await adapter.observe(id, normalized)) !== canonical(expected))) {
        throw new Error(`completed bootstrap effect ${id} drifted during replay`)
      }
      continue
    }
    journal = await projectOne({ adapter, plan: normalized, journal, id, expected, at: attemptedAt, pending })
    pending = null
  }
  const finalEvidence = await adapter.readCompletionEvidence(normalized)
  const receipt = buildReceipt({ plan: normalized, authorization, journal, finalEvidence,
    provisionedAt: authorization.consumedAt })
  for (const [id, expected] of [
    ['persist-receipt', receipt],
    ['enable-release', effectExpectation('enable-release', normalized.desired, null, normalized)],
  ]) {
    const completed = journal.effects.find(effect => effect.effectId === id)
    if (completed) {
      if (completed.expectedDigest !== digest(expected)
        || canonical(await adapter.observe(id, normalized)) !== canonical(expected)) {
        throw new Error(`completed bootstrap effect ${id} drifted during replay`)
      }
    } else journal = await projectOne({ adapter, plan: normalized, journal, id, expected, at: attemptedAt })
  }
  await requireStableCompleteInventory(() => adapter.readCompleteInventory())
  const completion = sealBootstrapCompletion({ planDigest: normalized.planDigest, receipt, journalDigest: journal.journalDigest })
  await adapter.persistCompletion?.(completion)
  return completion
}
const parseArgs = argv => {
  const [command, ...rest] = argv, values = {}
  for (const part of rest) {
    const match = part.match(/^--([^=]+)=(.*)$/s)
    if (!match || match[1] in values) throw new Error(`invalid or duplicate bootstrap argument: ${part}`)
    values[match[1]] = match[2]
  }
  if (!['plan', 'apply', 'verify'].includes(command)) throw new Error('usage: travel-mesh-bootstrap.mjs <plan|apply|verify> --key=value')
  return { command, values }
}
const command = (program, args, options = {}) => {
  const result = spawnSync(program, args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    timeout: 120_000, killSignal: 'SIGKILL', ...options })
  if (result.status !== 0) throw new Error(`${program} command failed (${result.signal ?? result.status}): ${String(result.stderr || result.stdout).slice(0, 500)}`)
  return result.stdout
}
const safeRepository = value => {
  const repository = requireText(value, 'GITHUB_REPOSITORY')
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY is malformed')
  return repository
}
const parseJsonResult = (result, label) => {
  try { return JSON.parse(result.stdout) } catch { throw new Error(`${label} did not return JSON`) }
}
const secretFile = (entry, configuration, environment) => {
  const values = configuration.secrets[entry.id] ?? {}
  if (!Object.keys(values).length) return null
  const file = path.join(path.resolve(environment.RUNNER_TEMP), `bootstrap-${entry.id}-${crypto.randomUUID()}.json`)
  fs.writeFileSync(file, JSON.stringify(values), { flag: 'wx', mode: 0o600 }); return file
}
const materializeMcpShell = environment => {
  const root = fs.mkdtempSync(path.join(path.resolve(environment.RUNNER_TEMP), 'agenticgraph-mcp-shell-'))
  fs.writeFileSync(path.join(root, 'shell.mjs'), 'export default { fetch() { return new Response("bootstrap dependency shell", { status: 503 }) } }\n', { mode: 0o600 })
  const file = path.join(root, 'wrangler.json')
  fs.writeFileSync(file, `${JSON.stringify({ name: 'agenticgraph-mcp', main: './shell.mjs',
    compatibility_date: '2026-07-13', workers_dev: false, preview_urls: false, routes: [] }, null, 2)}\n`, { mode: 0o600 })
  return { file, root }
}
export const createProductionBootstrapAdapter = ({ environment, journalPath, run = null, apiFetch = fetch,
  runCommand = command, probeFetch = fetch }) => {
  const account = environment.CLOUDFLARE_ACCOUNT_ID, zone = environment.TRAVEL_PUBLIC_ZONE_ID
  const runnerRoot = path.resolve(requireText(environment.RUNNER_TEMP, 'RUNNER_TEMP')), journalFile = path.resolve(journalPath)
  if (path.relative(runnerRoot, journalFile).startsWith('..') || path.relative(runnerRoot, journalFile) === '') {
    throw new Error('bootstrap journal must be an external RUNNER_TEMP child')
  }
  const completionFile = `${journalFile}.completion.json`
  run ??= async args => {
    const result = spawnSync('npx', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
      timeout: 180_000, killSignal: 'SIGKILL', env: process.env })
    if (result.status !== 0) throw new Error(`Wrangler command failed (${result.signal ?? result.status}): ${String(result.stderr || result.stdout).slice(0, 500)}`)
    return { stdout: result.stdout, stderr: result.stderr }
  }
  const repository = safeRepository(environment.GITHUB_REPOSITORY ?? process.env.GITHUB_REPOSITORY)
  const runtime = bootstrapRuntimeConfiguration(environment)
  const gh = (args, options = {}) => runCommand('gh', args, { encoding: 'utf8', env: { ...process.env,
    GH_TOKEN: requireText(environment.GH_TOKEN ?? process.env.GH_TOKEN, 'GH_TOKEN') }, ...options })
  const ghJson = (args, label) => parseJsonResult({ stdout: gh(args) }, label)
  const wranglerJson = async args => parseJsonResult(await run(args), `Wrangler ${args.slice(2, 5).join(' ')}`)
  const api = (pathname, options = {}) => cloudflareApiEnvelope(apiFetch,
    `https://api.cloudflare.com/client/v4${pathname}`, environment, `Cloudflare ${options.method ?? 'GET'} ${pathname}`, options)
  const variableInventory = () => ghJson(['variable', 'list', '--env', 'production', '--repo', repository,
    '--json', 'name,value,updatedAt'], 'production variable inventory')
  const readEnvironment = async () => {
    const variables = variableInventory().map(item => ({
      name: requireText(item.name, 'production variable name'), valueDigest: digest(String(item.value)), updatedAt: item.updatedAt ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name))
    const secrets = ghJson(['secret', 'list', '--env', 'production', '--repo', repository,
      '--json', 'name,updatedAt'], 'production secret inventory').map(item => ({
      name: requireText(item.name, 'production secret name'), updatedAt: item.updatedAt ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name))
    return { variables, secrets }
  }
  const inventoryReader = createBootstrapInventoryReader({ environment, apiFetch, wranglerJson, readEnvironment })
  const readCompleteInventory = async () => ({ ...(await inventoryReader()), appliedMigrations: [...(await appliedMigrations())].sort() })
  const entryFor = id => id === 'marketplace' ? TRAVEL_MARKETPLACE
    : TRAVEL_MESH_PLAN.find(entry => entry.id === (id === 'mcp-shell' ? 'mcp' : id))
  const flags = (entry, config = entry.config) => ['--config', config,
    ...(entry.environment ? ['--env', entry.environment] : []), '--name', entry.worker]
  const absentWorker = error => /(?:\bcode\D*10007\b|\b10007\b)/i.test(String(error?.message ?? error))
  const versionView = (entry, id) => wranglerJson(['--no-install', 'wrangler', 'versions', 'view', id, ...flags(entry), '--json'])
  const versions = async entry => {
    try { return await cloudflareApiAllPages(apiFetch, `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${encodeURIComponent(entry.worker)}/versions`, environment, `${entry.id} version inventory`) }
    catch (error) { if (absentWorker(error)) return []; throw error }
  }
  const expectedVersion = (entry, plan, variant = entry.id) => variant === 'mcp-shell'
    ? { tag: `agenticgraph-${plan.sourceSha}-mcp-shell`, message: `agenticgraph bootstrap mcp-shell ${plan.sourceSha} ${plan.planDigest}` }
    : { tag: `agenticgraph-${plan.sourceSha}`, message: `agenticgraph candidate ${plan.sourceSha} ${plan.planDigest}` }
  const verifyBindings = (entry, version, plan) => {
    const unit = plan.desired.units.find(item => item.id === entry.id), evidence = bindingEvidence(version, `${entry.id} active version`)
    if (!unit || digest(evidence) !== unit.bindingSpecDigest || canonical(evidence) !== canonical(unit.bindings)) {
      throw new Error(`${entry.id} active binding inventory drifted from the complete sealed plan`)
    }
    const annotation = expectedVersion(entry, plan)
    if (version.annotations?.['workers/tag'] !== annotation.tag || version.annotations?.['workers/message'] !== annotation.message) {
      throw new Error(`${entry.id} active version is not bound to the bootstrap plan`)
    }
    return new Map((version.resources?.bindings ?? []).map(binding => [binding.name, binding]))
  }
  const observeDeployment = async (id, plan) => {
    const entry = entryFor(id), status = activeDeployment(await wranglerJson(['--no-install', 'wrangler',
      'deployments', 'status', ...flags(entry), '--json']), entry.worker)
    const version = await versionView(entry, status.versionId)
    if (id === 'mcp-shell') {
      const annotation = expectedVersion(entry, plan, 'mcp-shell'), bindings = version.resources?.bindings ?? []
      if (version.annotations?.['workers/tag'] !== annotation.tag || version.annotations?.['workers/message'] !== annotation.message
        || bindings.some(binding => binding.type === 'secret_text')) throw new Error('private MCP dependency shell drifted')
      return effectExpectation('deploy:mcp-shell', plan.desired, null, plan)
    }
    const bindings = verifyBindings(entry, version, plan)
    const unit = plan.desired.units.find(item => item.id === id)
    for (const name of unit.secretNames) if (bindings.get(name)?.type !== 'secret_text') throw new Error(`${id} secret ${name} is absent`)
    return effectExpectation(`deploy:${id}`, plan.desired, null, plan)
  }
  let exposurePreflightComplete = false
  const deploy = async (id, plan) => {
    if (!exposurePreflightComplete) { assertBootstrapTargetsUnexposed(await readCompleteInventory(), plan.desired); exposurePreflightComplete = true }
    const entry = entryFor(id), annotation = expectedVersion(entry, plan, id)
    const matches = (await versions(entry)).filter(item => item.annotations?.['workers/tag'] === annotation.tag
      && item.annotations?.['workers/message'] === annotation.message)
    if (matches.length > 1) throw new Error(`${id} has multiple plan-bound versions`)
    let versionId = matches[0]?.id, responseLoss = null, config = null, secrets = null, shell = null
    try {
      if (!versionId) {
        shell = id === 'mcp-shell' ? materializeMcpShell(environment) : null
        config = shell ? { file: shell.file } : materializeRouteFreeBootstrapConfig(entry, environment)
        if (!shell && config.contentDigest !== plan.desired.units.find(unit => unit.id === id)?.configDigest) {
          throw new Error(`${id} effective route-free configuration drifted from the sealed plan`)
        }
        secrets = ['marketplace', 'mcp-shell'].includes(id) ? null : secretFile(entry, runtime, environment)
        const args = ['marketplace', 'mcp-shell'].includes(id)
          ? ['--no-install', 'wrangler', 'versions', 'upload', ...flags(entry, config.file), '--strict', '--keep-vars',
            '--tag', annotation.tag, '--message', annotation.message]
          : uploadArguments(entry, plan.sourceSha, plan.planDigest, runtime, config.file, secrets)
        try { await run(args) } catch (error) { responseLoss = error }
        const discovered = (await versions(entry)).filter(item => item.annotations?.['workers/tag'] === annotation.tag
          && item.annotations?.['workers/message'] === annotation.message)
        if (discovered.length !== 1) throw responseLoss ?? new Error(`${id} did not create exactly one plan-bound version`)
        versionId = discovered[0].id
      }
      if (id === 'mcp-shell') await versionView(entry, versionId).then(version => {
        const bindings = version.resources?.bindings ?? []
        if (bindings.some(binding => binding.type === 'secret_text')) throw new Error('private MCP dependency shell inherited secrets')
      })
      else await versionView(entry, versionId).then(version => verifyBindings(entry, version, plan))
      let status = null
      try { status = activeDeployment(await wranglerJson(['--no-install', 'wrangler', 'deployments', 'status', ...flags(entry), '--json']), entry.worker) }
      catch (error) { if (!absentWorker(error)) throw error }
      if (status?.versionId !== versionId) try {
        await run(['--no-install', 'wrangler', 'versions', 'deploy', `${versionId}@100`, ...flags(entry),
          '--message', `bootstrap ${plan.planDigest}`, '--yes'])
      } catch (error) { responseLoss ??= error }
      await observeDeployment(id, plan)
      if (responseLoss) throw responseLoss
    } finally {
      if (secrets) fs.rmSync(secrets, { force: true })
      if (shell) fs.rmSync(shell.root, { recursive: true, force: true }); else if (config) fs.rmSync(config.file, { force: true })
    }
  }
  const observeResources = async plan => {
    const inventory = await readCompleteInventory(), resources = plan.desired.resources
    for (const id of [resources.balanceCacheKvNamespaceId, resources.mcpDefinitionKvNamespaceId]) {
      if (!inventory.kv.some(item => item.id === id)) throw new Error(`required KV namespace ${id} is absent`)
    }
    for (const name of [resources.mcpMediaR2Bucket, resources.provenanceArchiveR2Bucket, resources.storageR2Bucket]) {
      if (!inventory.r2.some(item => (item.name ?? item.bucket_name) === name)) throw new Error(`required R2 bucket ${name} is absent`)
    }
    if (!inventory.d1.some(item => (item.uuid ?? item.id) === ACTUAL_STORAGE_D1_ID
      && item.name === resources.storageD1DatabaseName)) throw new Error('required shared D1 database is absent')
    return resources
  }
  const appliedMigrations = async () => {
    const config = materializeRouteFreeBootstrapConfig(TRAVEL_MESH_PLAN.find(entry => entry.id === 'storage'), environment)
    try {
      const value = await wranglerJson(['--no-install', 'wrangler', 'd1', 'execute', 'DB', '--remote', '--command',
        'SELECT name FROM d1_migrations ORDER BY name', '--json', '--config', config.file])
      return new Set((Array.isArray(value) ? value : [value]).flatMap(item => item.results ?? []).map(item => item.name))
    } catch (error) { if (/no such table:\s*d1_migrations/i.test(error.message)) return new Set(); throw error }
    finally { fs.rmSync(config.file, { force: true }) }
  }
  const observeMigrations = async plan => {
    const applied = await appliedMigrations()
    for (const name of plan.desired.migrations.names) if (!applied.has(name)) throw new Error(`D1 migration ${name} is absent`)
    return plan.desired.migrations
  }
  const observeEnvironment = async plan => {
    const current = await readEnvironment(), expected = effectExpectation('project-environment-packet', plan.desired, null, plan)
    for (const item of expected.variables) if (!current.variables.some(value => value.name === item.name
      && value.valueDigest === item.valueDigest)) throw new Error(`production variable ${item.name} drifted`)
    for (const name of expected.secretNames) if (!current.secrets.some(value => value.name === name)) throw new Error(`production secret ${name} is absent`)
    return expected
  }
  const observeRoutes = async plan => {
    const inventory = await readCompleteInventory()
    validateRouteInventory(inventory.routes, inventory.domains, environment)
    return plan.desired.routes
  }
  const observeExposure = async plan => {
    const inventory = await readCompleteInventory()
    for (const expected of plan.desired.exposure) if (!inventory.exposure.some(item => item.worker === expected.worker
      && item.enabled === false && item.previewsEnabled === false)) throw new Error(`${expected.worker} public subdomain is not disabled`)
    return plan.desired.exposure
  }
  const observeProbes = async plan => {
    const probes = await probeMesh(environment.TRAVEL_MESH_PROBE_SPEC_JSON, { environment, fetchFn: probeFetch })
    const services = probes.map(item => item.service).sort(), expected = effectExpectation('live-probes', plan.desired)
    if (services.join('\0') !== [...expected.services].sort().join('\0')) throw new Error('live probe service inventory drifted')
    return expected
  }
  const setEnvironmentValue = (kind, name, value) => gh([kind, 'set', name, '--env', 'production', '--repo', repository], { input: value })
  const project = async (id, expected, plan) => {
    if (id === 'resources') {
      const { inventory } = await requireStableCompleteInventory(readCompleteInventory), resources = plan.desired.resources
      for (const target of [resources.balanceCacheKvNamespaceId, resources.mcpDefinitionKvNamespaceId]) {
        if (!inventory.kv.some(item => item.id === target)) throw new Error(`bootstrap cannot synthesize sealed KV identity ${target}`)
      }
      if (!inventory.d1.some(item => (item.uuid ?? item.id) === ACTUAL_STORAGE_D1_ID
        && item.name === resources.storageD1DatabaseName)) throw new Error('bootstrap cannot synthesize the sealed D1 identity')
      for (const name of [resources.mcpMediaR2Bucket, resources.provenanceArchiveR2Bucket, resources.storageR2Bucket]) {
        if (!inventory.r2.some(item => (item.name ?? item.bucket_name) === name)) {
          await run(['--no-install', 'wrangler', 'r2', 'bucket', 'create', name])
        }
      }
      return
    }
    if (id === 'storage-migrations') {
      const applied = await appliedMigrations(), spec = assertAdditiveBootstrapMigrations(applied)
      if (spec.names.some(name => !applied.has(name))) {
        const config = materializeRouteFreeBootstrapConfig(TRAVEL_MESH_PLAN.find(entry => entry.id === 'storage'), environment)
        try { await run(['--no-install', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', config.file]) }
        finally { fs.rmSync(config.file, { force: true }) }
      }
      return
    }
    if (id.startsWith('deploy:')) return deploy(id.slice('deploy:'.length), plan)
    if (id === 'routes-and-custom-domain') {
      const { inventory } = await requireStableCompleteInventory(readCompleteInventory)
      for (const route of plan.desired.routes.routes) {
        const matching = inventory.routes.filter(item => item.pattern === route.pattern)
        if (matching.length > 1 || (matching[0] && matching[0].script !== route.script)) throw new Error(`route ${route.pattern} conflicts with preserved provider state`)
        if (!matching.length) await api(`/zones/${zone}/workers/routes`, { method: 'POST', body: route })
      }
      for (const domain of plan.desired.routes.domains) {
        const matching = inventory.domains.filter(item => item.hostname === domain.hostname)
        if (matching.length > 1 || (matching[0] && (matching[0].service !== domain.service
          || matching[0].zone_id !== domain.zoneId))) throw new Error(`domain ${domain.hostname} conflicts with preserved provider state`)
        if (!matching.length) await api(`/accounts/${account}/workers/domains`, { method: 'PUT', body: {
          hostname: domain.hostname, service: domain.service, zone_id: domain.zoneId, zone_name: domain.zoneName,
        } })
      }
      return
    }
    if (id === 'disable-public-subdomains') {
      for (const item of plan.desired.exposure) await api(`/accounts/${account}/workers/scripts/${encodeURIComponent(item.worker)}/subdomain`,
        { method: 'POST', body: { enabled: false, previews_enabled: false } })
      return
    }
    if (id === 'live-probes') { await observeProbes(plan); return }
    if (id === 'project-environment-packet') {
      for (const { name } of expected.variables) setEnvironmentValue('variable', name, String(environment[name]))
      for (const name of expected.secretNames) setEnvironmentValue('secret', name, String(environment[name]))
      return
    }
    if (id === 'persist-receipt') { setEnvironmentValue('variable', 'TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON', JSON.stringify(expected)); return }
    if (id === 'enable-release') { setEnvironmentValue('variable', 'TRAVEL_MESH_RELEASE_ENABLED', 'true'); return }
    throw new Error(`unknown bootstrap effect ${id}`)
  }
  const observe = async (id, plan) => {
    if (id === 'resources') return observeResources(plan)
    if (id === 'storage-migrations') return observeMigrations(plan)
    if (id.startsWith('deploy:')) return observeDeployment(id.slice('deploy:'.length), plan)
    if (id === 'routes-and-custom-domain') return observeRoutes(plan)
    if (id === 'disable-public-subdomains') return observeExposure(plan)
    if (id === 'live-probes') return observeProbes(plan)
    if (id === 'project-environment-packet') return observeEnvironment(plan)
    const name = id === 'persist-receipt' ? 'TRAVEL_MESH_BOOTSTRAP_RECEIPT_JSON' : 'TRAVEL_MESH_RELEASE_ENABLED'
    const value = ghJson(['variable', 'get', name, '--env', 'production', '--repo', repository, '--json', 'name,value'], `${name} readback`).value
    if (id === 'persist-receipt') {
      let receipt
      try { receipt = JSON.parse(value) } catch { throw new Error('persisted bootstrap receipt is not JSON') }
      return receipt
    }
    if (id === 'enable-release' && value === 'true') return { name, value }
    throw new Error(`bootstrap environment readback ${name} drifted`)
  }
  const atomicWrite = (file, value) => {
    const directory = path.dirname(file), temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    const descriptor = fs.openSync(temporary, 'r'); fs.fsyncSync(descriptor); fs.closeSync(descriptor)
    fs.renameSync(temporary, file); const directoryDescriptor = fs.openSync(directory, 'r')
    fs.fsyncSync(directoryDescriptor); fs.closeSync(directoryDescriptor)
  }
  const journalVariable = 'TRAVEL_MESH_BOOTSTRAP_JOURNAL_JSON'
  const localCarrier = () => fs.existsSync(journalFile) ? normalizeBootstrapJournalCarrier({ ...readJson(journalFile),
    completion: fs.existsSync(completionFile) ? readJson(completionFile) : null }) : null
  const remoteCarrier = () => {
    const matches = variableInventory().filter(item => item.name === journalVariable)
    if (matches.length > 1) throw new Error('durable bootstrap journal variable is duplicated')
    if (!matches.length) return null
    let value
    try { value = JSON.parse(String(matches[0].value)) } catch { throw new Error('durable bootstrap journal variable is not JSON') }
    return normalizeBootstrapJournalCarrier(value)
  }
  const durableCarrier = planDigest => selectBootstrapJournalCarrier({ local: localCarrier(), remote: remoteCarrier(), planDigest })
  const writeCarrier = carrier => {
    const normalized = normalizeBootstrapJournalCarrier(carrier), serialized = JSON.stringify(normalized)
    if (PROTECTED_SECRET_NAMES.filter(name => name !== 'CLOUDFLARE_ACCOUNT_ID').some(name => serialized.includes(String(environment[name])))) throw new Error('durable bootstrap journal must not contain protected secret bytes')
    setEnvironmentValue('variable', journalVariable, serialized)
    const readback = ghJson(['variable', 'get', journalVariable, '--env', 'production', '--repo', repository,
      '--json', 'name,value'], 'durable bootstrap journal readback')
    if (readback.name !== journalVariable || readback.value !== serialized) throw new Error('durable bootstrap journal readback drifted')
    atomicWrite(journalFile, { journal: normalized.journal, pending: normalized.pending })
    if (normalized.completion) atomicWrite(completionFile, normalized.completion); else fs.rmSync(completionFile, { force: true })
  }
  const readCompletionEvidence = async plan => {
    const stable = await requireStableCompleteInventory(readCompleteInventory), versions = {}, bindings = {}, secretNames = {}
    for (const unit of plan.desired.units) {
      await observeDeployment(unit.id, plan)
      const evidence = stable.inventory.units.find(item => item.id === unit.id)
      versions[unit.id] = { worker: unit.worker, deploymentId: evidence.deployment.deploymentId,
        versionId: evidence.versionId, percentage: 100 }
      bindings[unit.id] = { digest: digest(evidence.bindings), entries: evidence.bindings }
      secretNames[unit.id] = evidence.secretNames
    }
    const routeEvidence = validateRouteInventory(stable.inventory.routes, stable.inventory.domains, environment)
    return { versions, bindings, secretNames, routes: routeEvidence.routes, domains: routeEvidence.domains,
      migrations: await observeMigrations(plan), exposure: await observeExposure(plan), probes: await observeProbes(plan) }
  }
  return {
    readCompleteInventory,
    verifyPlanAuthority: async plan => {
      const head = runCommand('git', ['rev-parse', 'HEAD']).trim(), tree = runCommand('git', ['rev-parse', 'HEAD^{tree}']).trim()
      const remote = runCommand('git', ['ls-remote', 'origin', 'refs/heads/main']).trim().split(/\s/)[0]
      const status = runCommand('git', ['status', '--porcelain=v1', '--untracked-files=all'])
      if (status !== '' || head !== plan.sourceSha || remote !== plan.sourceSha || tree !== plan.sourceTree
        || digest(fs.readFileSync(path.resolve(repoRoot, 'scripts/travel-mesh-bootstrap.mjs'), 'utf8')) !== plan.controllerDigest
        || digest(fs.readFileSync(path.resolve(repoRoot, '.github/workflows/travel-mesh-bootstrap.yml'), 'utf8')) !== plan.workflowDigest
        || wranglerConfigurationDigest() !== plan.wranglerDigest
        || plan.desired.configurationDigest !== createBootstrapDesiredState(environment, plan.beforeInventory).configurationDigest) {
        throw new Error('protected source/controller/workflow/configuration drifted from the sealed bootstrap plan')
      }
    },
    loadJournal: async planDigest => { const carrier = durableCarrier(planDigest); return carrier ? { journal: carrier.journal, pending: carrier.pending } : null },
    persistJournal: async (journal, pending = null) => writeCarrier({ journal, pending, completion: null }),
    loadCompletion: async planDigest => durableCarrier(planDigest)?.completion ?? null,
    persistCompletion: async completion => {
      const carrier = durableCarrier(completion.planDigest)
      if (!carrier || carrier.journal.journalDigest !== completion.journalDigest) throw new Error('terminal completion lost its durable journal')
      writeCarrier({ journal: carrier.journal, pending: carrier.pending, completion })
    }, project, observe,
    responseLossAdoptable: id => !['project-environment-packet', 'live-probes'].includes(id),
    readCompletionEvidence,
    verifyTerminalOwnedState: async (plan, receipt) => {
      if (canonical(await observe('persist-receipt', plan)) !== canonical(receipt)
        || canonical(await observe('enable-release', plan)) !== canonical(effectExpectation('enable-release', plan.desired))) {
        throw new Error('terminal bootstrap environment projection drifted')
      }
      const evidence = await readCompletionEvidence(plan); await observeResources(plan)
      if (digest(evidence) !== receipt.finalEvidenceDigest) throw new Error('terminal bootstrap provider evidence drifted from its sealed receipt')
    },
  }
}
const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const writeJson = (file, value) => fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
export const main = async argv => {
  const { command: action, values } = parseArgs(argv)
  if (action === 'verify') return normalizeBootstrapReceipt(readJson(requireText(values.receipt, '--receipt')))
  const environment = requiredEnvironment(process.env), packet = readJson(requireText(values.packet, '--packet')),
    journalPath = path.resolve(requireText(values.journal, '--journal')), adapter = createProductionBootstrapAdapter({ environment, journalPath })
  if (action === 'plan') {
    const plan = await planBootstrap({ adapter, environment, packet,
      sourceSha: requireText(values['source-sha'], '--source-sha'), sourceTree: requireText(values['source-tree'], '--source-tree'),
      controllerDigest: requireText(values['controller-digest'], '--controller-digest'), workflowDigest: requireText(values['workflow-digest'], '--workflow-digest'),
      wranglerDigest: requireText(values['wrangler-digest'], '--wrangler-digest'), issuedAt: requireText(values['issued-at'], '--issued-at'), expiresAt: requireText(values['expires-at'], '--expires-at') })
    writeJson(requireText(values.output, '--output'), plan); return plan
  }
  const result = await applyBootstrap({ adapter, environment, packet, plan: readJson(requireText(values.plan, '--plan')),
    authorization: requireText(values.authorization, '--authorization'), actor: requireText(values.actor, '--actor'),
    consumedAt: requireText(values['consumed-at'], '--consumed-at') })
  writeJson(requireText(values.output, '--output'), result); return result
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1 }) }
