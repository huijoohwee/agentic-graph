import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import {
  DIGEST, D1_MIGRATION, SENTINEL, SHA, TRAVEL_MESH_PLAN, digest,
  bindCommerceProviderReleaseMetadata, releaseConfigFile, removeEphemeralFile, repoRoot, requireText, seal,
  validatePlan, validateProtectedConfiguration,
} from './travel-mesh-release-plan.mjs'
import {
  assertMeshSubdomainsDisabled, assertWorkerSubdomainDisabled, isCloudflareAccessFailure, parseR2BucketNames,
  resourceReadiness, validateRouteInventory,
} from './travel-mesh-release-inventory.mjs'
import {
  assertReleaseConfigPreservesBaseline, bindingInventory, secretBindingNames, verifyCandidateVersion,
} from './travel-mesh-release-bindings.mjs'
import { probeMesh } from './travel-mesh-release-probes.mjs'

export { parseR2BucketNames, validateRouteInventory }
export { verifyCandidateVersion } from './travel-mesh-release-bindings.mjs'
export { commerceProviderRuntimeProofFor, probeMesh, readBoundedProbeBody,
  verifyCommerceProviderRuntimeProof } from './travel-mesh-release-probes.mjs'

const ABSENT_WORKER = /(?:\b10007\b|worker[^\n]*(?:not found|does not exist)|script[^\n]*(?:not found|does not exist))/i
const SHARED_BASELINE_SECRET_WORKERS = new Set(['mcp', 'storage'])
const candidateTag = sourceSha => `agenticgraph-${sourceSha}`
const candidateMessage = (sourceSha, candidateDigest) => `agenticgraph candidate ${sourceSha} ${candidateDigest}`
const configFlags = (entry, config = entry.config) => ['--config', config, '--env', entry.environment ?? '']
const workerCommand = (entry, command, config = entry.config) => [
  '--no-install', 'wrangler', ...command, ...configFlags(entry, config), '--name', entry.worker,
]

export const execute = (args, { cwd = repoRoot, env = process.env } = {}) => new Promise((resolve, reject) => {
  const child = spawn('npx', args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('error', reject)
  child.on('close', code => code === 0 ? resolve({ stdout, stderr })
    : reject(new Error(`Wrangler command failed (${args.slice(1, 4).join(' ')}): ${stderr.trim() || `exit ${code}`}`)))
})

const runJson = async (run, args, label, options) => {
  const result = await run(args, options)
  try { return JSON.parse(result.stdout) } catch { throw new Error(`${label} did not return JSON`) }
}

export const activeDeployment = (value, worker) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.versions)) throw new Error(`${worker} deployment status is malformed`)
  if (value.versions.length !== 1 || value.versions[0]?.percentage !== 100 || typeof value.versions[0]?.version_id !== 'string') {
    throw new Error(`${worker} must have exactly one active version at 100% before release`)
  }
  return Object.freeze({ deploymentId: requireText(value.id, `${worker} deployment id`), versionId: value.versions[0].version_id,
    createdOn: requireText(value.created_on, `${worker} deployment time`) })
}

const statusFor = async (run, entry) => activeDeployment(await runJson(run,
  workerCommand(entry, ['deployments', 'status']).concat('--json'), `${entry.id} deployment status`), entry.worker)
const snapshotFor = async (run, entry) => {
  try { return await statusFor(run, entry) } catch (error) {
    if (ABSENT_WORKER.test(error.message)) return null
    throw error
  }
}
const versionsFor = async (run, entry) => {
  const value = await runJson(run, workerCommand(entry, ['versions', 'list']).concat('--json'), `${entry.id} version list`)
  if (!Array.isArray(value)) throw new Error(`${entry.id} version list is malformed`)
  return value
}
const viewVersion = (run, entry, versionId) => runJson(run,
  workerCommand(entry, ['versions', 'view', versionId]).concat('--json'), `${entry.id} version`)
const listSecrets = async (run, entry) => {
  const value = await runJson(run, workerCommand(entry, ['secret', 'list']).concat('--format', 'json'), `${entry.id} secret list`)
  if (!Array.isArray(value)) throw new Error(`${entry.id} secret list is malformed`)
  return value.map(item => requireText(item?.name, `${entry.id} secret name`)).sort()
}

export const uploadArguments = (entry, sourceSha, candidateDigest, configuration, config, secretsFile) => [
  '--no-install', 'wrangler', 'versions', 'upload', ...configFlags(entry, config), '--name', entry.worker,
  '--strict', '--keep-vars',
  '--tag', candidateTag(sourceSha), '--message', candidateMessage(sourceSha, candidateDigest),
  ...Object.entries(configuration.overrides[entry.id]).flatMap(([name, value]) => ['--var', `${name}:${value}`]),
  ...(secretsFile ? ['--secrets-file', secretsFile] : []),
]
export const activationArguments = (entry, versionId, message) => workerCommand(entry,
  ['versions', 'deploy', `${versionId}@100`]).concat('--message', message, '--yes')

export const assertReleaseAuthority = ({ sourceSha, candidateDigest, authorization, environment = process.env }) => {
  if (!SHA.test(sourceSha) || !DIGEST.test(candidateDigest)) throw new Error('release source or candidate digest is malformed')
  if (environment.GITHUB_ACTIONS !== 'true' || environment.GITHUB_REF !== 'refs/heads/main'
    || environment.GITHUB_SHA !== sourceSha || environment.GITHUB_WORKFLOW !== 'Production Release'
    || !String(environment.GITHUB_WORKFLOW_REF ?? '').includes('/.github/workflows/release.yml@refs/heads/main')) {
    throw new Error('travel mesh mutation is restricted to the protected Production Release workflow on exact main')
  }
  if (authorization?.schema !== 'agentic-human-authorization-receipt/v2' || authorization.status !== 'consumed'
    || authorization.candidateDigest !== candidateDigest || !String(authorization.controllerId ?? '').trim()) {
    throw new Error('travel mesh mutation requires the consumed exact-candidate human authorization receipt')
  }
}

const verifyReceipt = (receipt, schema) => {
  if (receipt?.schema !== schema || !DIGEST.test(receipt.receiptDigest ?? '')) throw new Error(`invalid ${schema} receipt`)
  const { receiptDigest, ...body } = receipt
  if (digest(body) !== receiptDigest) throw new Error(`${schema} receipt digest mismatch`)
  return receipt
}

const secretFile = (entry, secrets, environment) => {
  if (!Object.keys(secrets).length) return null
  const file = path.join(path.resolve(environment.RUNNER_TEMP || os.tmpdir()),
    `agenticgraph-travel-secrets-${entry.id}-${crypto.randomUUID()}.json`)
  fs.writeFileSync(file, JSON.stringify(secrets), { flag: 'wx', mode: 0o600 })
  return file
}
const removeSecretFile = file => { if (file) fs.unlinkSync(file) }

const dryRunUnit = async ({ entry, configuration, environment, run, sourceSha, candidateDigest, baselineVersion }) => {
  const config = releaseConfigFile(entry, configuration)
  const secrets = secretFile(entry, configuration.secrets[entry.id], environment)
  const outdir = path.join(path.resolve(environment.RUNNER_TEMP || os.tmpdir()), `travel-mesh-dry-run-${entry.id}-${crypto.randomUUID()}`)
  try {
    assertReleaseConfigPreservesBaseline(config, baselineVersion, entry, configuration)
    await run(uploadArguments(entry, sourceSha, candidateDigest, configuration, config, secrets).concat('--dry-run', '--outdir', outdir))
  } finally {
    fs.rmSync(outdir, { recursive: true, force: true })
    removeSecretFile(secrets)
    removeEphemeralFile(config)
  }
}

const remoteReadiness = async (run, environment, apiFetch = fetch) => {
  const snapshots = new Map(), failures = [], evidence = {}
  for (const entry of TRAVEL_MESH_PLAN) {
    try {
      const snapshot = await snapshotFor(run, entry)
      if (!snapshot) failures.push(`${entry.id}: Worker ${entry.worker} is absent; separate bootstrap is required`)
      else snapshots.set(entry.id, snapshot)
    } catch (error) {
      failures.push(`${entry.id}: ${error.message}`)
      if (isCloudflareAccessFailure(error)) return { snapshots, evidence, failures }
    }
  }

  const resources = await resourceReadiness({ run, runJson, environment, apiFetch })
  failures.push(...resources.failures)
  Object.assign(evidence, resources.evidence)
  return { snapshots, evidence, failures }
}

export const preflightMesh = async ({ sourceSha, candidateDigest, authorization,
  environment = process.env, run = execute, apiFetch = fetch, now = () => new Date() }) => {
  assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment })
  const configuration = bindCommerceProviderReleaseMetadata(validateProtectedConfiguration(environment), { sourceSha, candidateDigest })
  const remote = await remoteReadiness(run, environment, apiFetch)
  if (remote.failures.length) throw new Error(`protected travel mesh preflight failed\n${remote.failures.join('\n')}`)
  const units = []
  for (const entry of TRAVEL_MESH_PLAN) {
    const previous = remote.snapshots.get(entry.id)
    const versions = await versionsFor(run, entry)
    if (!versions.some(version => version.id === previous.versionId)) throw new Error(`${entry.id} active version is outside the deployable version window`)
    if (versions.some(version => version.annotations?.['workers/tag'] === candidateTag(sourceSha)
      || version.annotations?.['workers/message'] === candidateMessage(sourceSha, candidateDigest))) throw new Error(`${entry.id} already has a version for this exact candidate`)
    const previousVersion = await viewVersion(run, entry, previous.versionId)
    if (SENTINEL.test(JSON.stringify(previousVersion))) throw new Error(`${entry.id} active baseline contains a production sentinel`)
    const existingSecrets = await listSecrets(run, entry), baselineSecrets = secretBindingNames(previousVersion, `${entry.id} baseline`)
    if (JSON.stringify(existingSecrets) !== JSON.stringify(baselineSecrets)) throw new Error(`${entry.id} provider and active-version secret inventories differ`)
    const allowed = new Set(entry.secrets.map(([binding]) => binding)), inherited = baselineSecrets.filter(name => !allowed.has(name))
    if (inherited.length && !SHARED_BASELINE_SECRET_WORKERS.has(entry.id)) throw new Error(`${entry.id} has undeclared inherited secrets: ${inherited.join(', ')}`)
    units.push({ id: entry.id, worker: entry.worker, previous,
      previousVersionDigest: digest(previousVersion), baselineBindingInventory: bindingInventory(previousVersion, `${entry.id} baseline`), existingSecrets,
      preservedSecretNameDigest: digest(baselineSecrets), knownVersionIds: versions.map(version => version.id).sort() })
    await dryRunUnit({ entry, configuration, environment, run, sourceSha, candidateDigest, baselineVersion: previousVersion })
  }
  return seal({ schema: 'agenticgraph-travel-mesh-preflight/v2', status: 'passed', sourceRevision: sourceSha,
    candidateDigest, configurationDigest: configuration.configurationDigest, capturedAt: now().toISOString(),
    resources: remote.evidence, units })
}

const readAppliedMigrations = value => new Set((Array.isArray(value) ? value : [value])
  .flatMap(item => Array.isArray(item?.results) ? item.results : []).map(row => row?.name).filter(name => typeof name === 'string'))
const migrationNames = () => fs.readdirSync(path.resolve(repoRoot, D1_MIGRATION.directory)).filter(name => name.endsWith('.sql')).sort()
const assertAdditiveMigration = name => {
  const source = fs.readFileSync(path.resolve(repoRoot, D1_MIGRATION.directory, name), 'utf8')
    .replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  if (/(?:^|;)\s*(?:DROP\s|TRUNCATE\s|DELETE\s|UPDATE\s|ALTER\s+TABLE\s+\S+\s+RENAME\s)/im.test(source)) {
    throw new Error(`pending D1 migration is not forward-compatible with Worker rollback: ${name}`)
  }
}
const d1Args = (config, ...args) => ['--no-install', 'wrangler', 'd1', ...args, '--config', config]
const appliedMigrations = async (run, config) => {
  try {
    return readAppliedMigrations(await runJson(run, d1Args(config, 'execute', D1_MIGRATION.database, '--remote',
      '--command', 'SELECT name FROM d1_migrations ORDER BY name', '--json'), 'D1 migration inventory'))
  } catch (error) {
    if (/no such table:\s*d1_migrations/i.test(error.message)) return new Set()
    throw error
  }
}
const applyMigrations = async (run, configuration) => {
  const config = releaseConfigFile(TRAVEL_MESH_PLAN.find(unit => unit.id === 'storage'), configuration)
  let appliedBefore = new Set(), pending = [], bookmark = null, applyAttempted = false
  try {
    appliedBefore = await appliedMigrations(run, config)
    pending = migrationNames().filter(name => !appliedBefore.has(name))
    pending.forEach(assertAdditiveMigration)
    if (!pending.length) return { pending, applied: false, bookmark: null, disposition: 'unchanged' }
    const bookmarkResult = await runJson(run, d1Args(config, 'time-travel', 'info', D1_MIGRATION.database, '--json'), 'D1 time-travel bookmark')
    bookmark = requireText(bookmarkResult?.bookmark ?? bookmarkResult?.result?.bookmark, 'D1 time-travel bookmark')
    applyAttempted = true
    await run(d1Args(config, 'migrations', 'apply', D1_MIGRATION.database, '--remote'))
    const after = await appliedMigrations(run, config)
    for (const name of pending) if (!after.has(name)) throw new Error(`D1 migration did not converge: ${name}`)
    return { pending, applied: true, bookmark, disposition: 'retained-forward-compatible-on-worker-rollback' }
  } catch (error) {
    let observedAfter = null, observationError = null
    if (applyAttempted) {
      try { observedAfter = await appliedMigrations(run, config) } catch (inventoryError) { observationError = inventoryError.message.slice(0, 500) }
    }
    const actuallyApplied = observedAfter ? pending.filter(name => !appliedBefore.has(name) && observedAfter.has(name)) : []
    error.migrationReceipt = {
      pending, applied: actuallyApplied.length > 0, actuallyApplied, appliedBefore: [...appliedBefore].sort(), bookmark,
      applyAttempted, observationError,
      disposition: applyAttempted ? 'preserve-required-partial-migration-possible' : 'not-mutated',
    }
    error.migrationMutationPossible = applyAttempted
    throw error
  } finally { removeEphemeralFile(config) }
}

const discoverCandidate = async ({ entry, knownVersionIds, run, sourceSha, candidateDigest, configuration, baselineVersion,
  preservedSecretNameDigest }) => {
  const known = new Set(knownVersionIds)
  const matches = (await versionsFor(run, entry)).filter(version => !known.has(version.id)
    && version.annotations?.['workers/tag'] === candidateTag(sourceSha)
    && version.annotations?.['workers/message'] === candidateMessage(sourceSha, candidateDigest))
  if (matches.length !== 1) throw new Error(`${entry.id} did not produce exactly one new candidate version`)
  return { versionId: matches[0].id, versionDigest: verifyCandidateVersion(await viewVersion(run, entry, matches[0].id),
    entry, sourceSha, candidateDigest, configuration, baselineVersion, preservedSecretNameDigest) }
}

const uploadCandidate = async ({ entry, snapshot, sourceSha, candidateDigest, configuration, environment, run, index, baselineVersion }) => {
  const config = releaseConfigFile(entry, configuration)
  const secrets = secretFile(entry, configuration.secrets[entry.id], environment)
  let commandError = null
  try {
    await run(uploadArguments(entry, sourceSha, candidateDigest, configuration, config, secrets), { env: {
      WRANGLER_OUTPUT_FILE_PATH: path.resolve(environment.RUNNER_TEMP || os.tmpdir(), `wrangler-travel-${index}-${entry.id}.ndjson`),
    } })
  } catch (error) { commandError = error } finally {
    removeSecretFile(secrets)
    removeEphemeralFile(config)
  }
  let candidate = null
  try { candidate = await discoverCandidate({ entry, knownVersionIds: snapshot.knownVersionIds, run, sourceSha, candidateDigest, configuration,
    baselineVersion, preservedSecretNameDigest: snapshot.preservedSecretNameDigest }) } catch (error) {
    if (!commandError) {
      error.uploadAttempted = true
      error.observedCandidate = null
      throw error
    }
  }
  if (commandError) {
    commandError.uploadAttempted = true
    commandError.observedCandidate = candidate
    throw commandError
  }
  return candidate
}

const activateCandidate = async ({ entry, unit, sourceSha, run }) => {
  await run(activationArguments(entry, unit.candidate.versionId, `activate agenticgraph candidate ${sourceSha}`))
  unit.deployed = await statusFor(run, entry)
  if (unit.deployed.versionId !== unit.candidate.versionId) throw new Error(`${entry.id} candidate did not receive 100% traffic`)
  unit.activated = true
}

const compensateUnits = async ({ units, run, sourceSha }) => {
  const restored = [], failures = []
  const rank = new Map(TRAVEL_MESH_PLAN.map((entry, index) => [entry.id, index]))
  for (const unit of [...units].sort((left, right) => rank.get(right.id) - rank.get(left.id))) {
    const entry = TRAVEL_MESH_PLAN.find(candidate => candidate.id === unit.id)
    try {
      if (digest(await viewVersion(run, entry, unit.previous.versionId)) !== unit.previousVersionDigest) {
        throw new Error('captured previous version digest drifted')
      }
      if (digest(await viewVersion(run, entry, unit.candidate.versionId)) !== unit.candidate.versionDigest) {
        throw new Error('captured candidate version digest drifted')
      }
      const current = await statusFor(run, entry)
      if (current.versionId === unit.previous.versionId) {
        restored.push({ id: entry.id, disposition: 'serving-version-unchanged', inactiveCandidateVersionId: unit.candidate.versionId })
        continue
      }
      if (current.versionId !== unit.candidate.versionId) throw new Error('active version drifted; refusing overwrite')
      await run(activationArguments(entry, unit.previous.versionId, `restore pre-candidate version after ${sourceSha}`))
      const after = await statusFor(run, entry)
      if (after.versionId !== unit.previous.versionId) throw new Error('previous version did not restore')
      restored.push({ id: entry.id, disposition: 'version-restored', versionId: after.versionId })
    } catch (error) { failures.push({ id: entry.id, error: error.message.slice(0, 500) }) }
  }
  return { restored, failures }
}

const servingVersions = async ({ units, run, expectedVersionId, boundary }) => {
  const serving = []
  for (const entry of TRAVEL_MESH_PLAN) {
    const unit = units.find(candidate => candidate.id === entry.id), current = await statusFor(run, entry)
    if (!unit || current.versionId !== expectedVersionId(unit)) throw new Error(`${entry.id} serving version drifted ${boundary}`)
    serving.push({ id: entry.id, deploymentId: current.deploymentId, versionId: current.versionId, percentage: 100 })
  }
  return serving
}

const proveRestoredMesh = async ({ units, run, configuration, environment, apiFetch, fetchFn, now, boundary }) => {
  const expectedVersionId = unit => unit.previous.versionId
  const exposureBefore = await assertMeshSubdomainsDisabled(apiFetch, environment)
  const servingBefore = await servingVersions({ units, run, expectedVersionId, boundary: `before ${boundary} live probes` })
  let probes
  try { probes = await probeMesh(configuration.variables.TRAVEL_MESH_PROBE_SPEC_JSON, { environment, fetchFn, now }) }
  catch (error) { throw new Error(`${boundary} mesh probe failed: ${error.message}`) }
  const serving = await servingVersions({ units, run, expectedVersionId, boundary: `after ${boundary} live probes` })
  const exposure = await assertMeshSubdomainsDisabled(apiFetch, environment)
  return { status: 'proved', exposureBefore, servingBefore, probes, serving, exposure }
}

export const deployMesh = async ({ sourceSha, candidateDigest, authorization, preflight,
  environment = process.env, run = execute, apiFetch = fetch, fetchFn = fetch, now = () => new Date() }) => {
  let configuration = null
  const baselineVersions = new Map()
  try {
    assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment })
    verifyReceipt(preflight, 'agenticgraph-travel-mesh-preflight/v2')
    configuration = bindCommerceProviderReleaseMetadata(validateProtectedConfiguration(environment), { sourceSha, candidateDigest })
    const capturedAt = Date.parse(preflight.capturedAt)
    const expectedUnitIds = TRAVEL_MESH_PLAN.map(entry => entry.id)
    if (preflight.sourceRevision !== sourceSha || preflight.candidateDigest !== candidateDigest
      || preflight.configurationDigest !== configuration.configurationDigest
      || preflight.status !== 'passed' || JSON.stringify(preflight.units?.map(unit => unit.id)) !== JSON.stringify(expectedUnitIds)
      || !Number.isFinite(capturedAt) || capturedAt > now().getTime() + 60_000
      || now().getTime() - capturedAt > 30 * 60_000) throw new Error('travel mesh preflight drifted or expired')
    const remote = await remoteReadiness(run, environment, apiFetch)
    if (remote.failures.length || digest(remote.evidence) !== digest(preflight.resources)) {
      throw new Error(`travel mesh resources changed after preflight${remote.failures.length ? `\n${remote.failures.join('\n')}` : ''}`)
    }
    for (const expected of preflight.units) {
      const entry = TRAVEL_MESH_PLAN.find(candidate => candidate.id === expected.id)
      const current = remote.snapshots.get(entry.id)
      if (current.deploymentId !== expected.previous.deploymentId || current.versionId !== expected.previous.versionId) throw new Error(`${entry.id} changed after preflight`)
      const currentVersions = (await versionsFor(run, entry)).map(version => version.id).sort()
      const baselineVersion = await viewVersion(run, entry, current.versionId)
      const currentSecrets = await listSecrets(run, entry)
      if (JSON.stringify(currentVersions) !== JSON.stringify(expected.knownVersionIds)
        || JSON.stringify(currentSecrets) !== JSON.stringify(expected.existingSecrets)
        || digest(currentSecrets) !== expected.preservedSecretNameDigest
        || digest(secretBindingNames(baselineVersion, `${entry.id} baseline`)) !== expected.preservedSecretNameDigest
        || digest(baselineVersion) !== expected.previousVersionDigest
        || digest(bindingInventory(baselineVersion, `${entry.id} baseline`)) !== digest(expected.baselineBindingInventory)) {
        throw new Error(`${entry.id} version or secret state changed after preflight`)
      }
      baselineVersions.set(entry.id, baselineVersion)
    }
  } catch (error) {
    const failure = seal({ schema: 'agenticgraph-travel-mesh-failure-receipt/v2', status: 'not-mutated',
      sourceRevision: sourceSha, candidateDigest, configurationDigest: configuration?.configurationDigest ?? null,
      migrations: { pending: [], applied: false, bookmark: null, disposition: 'not-attempted' }, units: [],
      compensation: { restored: [], failures: [] }, restorationProof: { status: 'not-required', servingBefore: [], probes: [], serving: [] },
      mutationAttempted: false, mutationProven: false, mutationAmbiguous: false,
      failedAt: now().toISOString(), error: String(error?.message ?? error).slice(0, 1_000) })
    const wrapped = new Error(`travel mesh deployment failed (${failure.status}): ${error.message}`)
    wrapped.receipt = failure
    throw wrapped
  }
  const units = []
  let migrations = { pending: [], applied: false, bookmark: null, disposition: 'not-attempted' }
  try {
    const upload = async (entry, index) => {
      const snapshot = preflight.units.find(candidate => candidate.id === entry.id)
      try {
        const candidate = await uploadCandidate({ entry, snapshot, sourceSha, candidateDigest, configuration, environment, run, index,
          baselineVersion: baselineVersions.get(entry.id) })
        units.push({ id: entry.id, worker: entry.worker, previous: snapshot.previous, previousVersionDigest: snapshot.previousVersionDigest,
          candidate, activated: false })
        await assertWorkerSubdomainDisabled(apiFetch, environment, entry.worker)
      } catch (error) {
        if (error.observedCandidate) units.push({ id: entry.id, worker: entry.worker, previous: snapshot.previous, previousVersionDigest: snapshot.previousVersionDigest,
          candidate: error.observedCandidate, activated: false })
        throw error
      }
    }
    const mcpIndex = TRAVEL_MESH_PLAN.findIndex(entry => entry.id === 'mcp')
    for (const [index, entry] of TRAVEL_MESH_PLAN.entries()) if (index !== mcpIndex) await upload(entry, index)
    migrations = await applyMigrations(run, configuration)
    for (const entry of TRAVEL_MESH_PLAN.slice(0, mcpIndex)) {
      await activateCandidate({ entry, unit: units.find(candidate => candidate.id === entry.id), sourceSha, run })
    }
    const mcpEntry = TRAVEL_MESH_PLAN[mcpIndex]
    await upload(mcpEntry, mcpIndex)
    await activateCandidate({ entry: mcpEntry, unit: units.find(candidate => candidate.id === mcpEntry.id), sourceSha, run })
    for (const entry of TRAVEL_MESH_PLAN.slice(mcpIndex + 1)) {
      await activateCandidate({ entry, unit: units.find(candidate => candidate.id === entry.id), sourceSha, run })
    }
    const exposureBefore = await assertMeshSubdomainsDisabled(apiFetch, environment)
    const probes = await probeMesh(configuration.variables.TRAVEL_MESH_PROBE_SPEC_JSON, {
      environment, fetchFn, now, providerMetadata: { sourceRevision: sourceSha, providerVersionId: candidateDigest },
    })
    const receiptUnits = TRAVEL_MESH_PLAN.map(entry => units.find(unit => unit.id === entry.id))
    const serving = await servingVersions({ units: receiptUnits, run,
      expectedVersionId: unit => unit.candidate.versionId, boundary: 'after live probes' })
    const exposure = await assertMeshSubdomainsDisabled(apiFetch, environment)
    return seal({ schema: 'agenticgraph-travel-mesh-release-receipt/v2', status: 'deployed', sourceRevision: sourceSha,
      candidateDigest, configurationDigest: configuration.configurationDigest, migrations, units: receiptUnits,
      exposureBefore, probes, serving, exposure, deployedAt: now().toISOString() })
  } catch (error) {
    if (error.migrationReceipt) migrations = error.migrationReceipt
    const compensation = await compensateUnits({ units, run, sourceSha })
    let restorationProof = { status: 'not-proven', servingBefore: [], probes: [], serving: [], error: 'compensation-incomplete' }
    if (!compensation.failures.length) {
      try { restorationProof = await proveRestoredMesh({ units: preflight.units, run, configuration, environment, apiFetch, fetchFn, now,
        boundary: 'self-compensated' }) }
      catch (proofError) { restorationProof = { ...restorationProof, status: 'failed', error: proofError.message.slice(0, 1_000) } }
    }
    const mutationAmbiguous = (error.uploadAttempted === true && !error.observedCandidate) || error.migrationMutationPossible === true
    const mutationAttempted = error.uploadAttempted === true || units.length > 0 || error.migrationMutationPossible === true
    const mutationProven = units.length > 0 || migrations.applied === true
    const failure = seal({ schema: 'agenticgraph-travel-mesh-failure-receipt/v2',
      status: compensation.failures.length || mutationAmbiguous || restorationProof.status !== 'proved' ? 'preserve-required' : 'rolled-back', sourceRevision: sourceSha,
      candidateDigest, migrations, units: TRAVEL_MESH_PLAN.flatMap(entry => units.filter(unit => unit.id === entry.id)),
      compensation, restorationProof, mutationAttempted, mutationProven, mutationAmbiguous,
      failedAt: now().toISOString(), error: String(error?.message ?? error).slice(0, 1_000) })
    const wrapped = new Error(`travel mesh deployment failed (${failure.status}): ${error.message}`)
    wrapped.receipt = failure
    throw wrapped
  }
}

export const restoreMesh = async ({ sourceSha, candidateDigest, authorization, receipt,
  environment = process.env, run = execute, apiFetch = fetch, fetchFn = fetch, now = () => new Date() }) => {
  assertReleaseAuthority({ sourceSha, candidateDigest, authorization, environment })
  verifyReceipt(receipt, 'agenticgraph-travel-mesh-release-receipt/v2')
  const configuration = bindCommerceProviderReleaseMetadata(validateProtectedConfiguration(environment), { sourceSha, candidateDigest })
  if (receipt.status !== 'deployed' || receipt.sourceRevision !== sourceSha || receipt.candidateDigest !== candidateDigest
    || receipt.configurationDigest !== configuration.configurationDigest
    || JSON.stringify(receipt.units?.map(unit => unit.id)) !== JSON.stringify(TRAVEL_MESH_PLAN.map(entry => entry.id))) throw new Error('travel mesh rollback receipt drifted from the authorized candidate')
  let compensation = { restored: [], failures: [] }
  try {
    compensation = await compensateUnits({ units: receipt.units, run, sourceSha })
    if (compensation.failures.length) throw new Error(`travel mesh rollback requires preservation: ${compensation.failures.map(item => item.id).join(', ')}`)
    const restorationProof = await proveRestoredMesh({ units: receipt.units, run, configuration, environment, apiFetch, fetchFn, now,
      boundary: 'restored' })
    return seal({ schema: 'agenticgraph-travel-mesh-rollback-receipt/v2', status: 'restored', sourceRevision: sourceSha,
      candidateDigest, configurationDigest: configuration.configurationDigest, forwardCompatibleD1Disposition: receipt.migrations.disposition,
      compensation, restorationProof, probes: restorationProof.probes, serving: restorationProof.serving, restoredAt: now().toISOString() })
  } catch (error) {
    const failure = seal({ schema: 'agenticgraph-travel-mesh-rollback-failure-receipt/v2', status: 'preserve-required',
      sourceRevision: sourceSha, candidateDigest, compensation, failedAt: now().toISOString(), error: error.message.slice(0, 1_000) })
    const wrapped = new Error(`travel mesh rollback failed (${failure.status}): ${error.message}`)
    wrapped.receipt = failure
    throw wrapped
  }
}

const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
const writeJson = (file, value) => fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
const output = (values, name, value) => {
  if (values.output) writeJson(values.output, value)
  if (values['github-output']) fs.appendFileSync(requireText(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT'), `${name}=${value.receiptDigest}\n`)
}

const mutationIntentOutputs = Object.freeze({ attempted: true, mutation_possible: true, mutation_proven: false,
  restored: false, compensated: false, preserve_required: true, receipt_sealed: false })

export const meshOutcomeOutputs = receipt => {
  if (receipt == null) return { ...mutationIntentOutputs }
  const release = receipt.schema === 'agenticgraph-travel-mesh-release-receipt/v2'
  const schema = release ? receipt.schema : 'agenticgraph-travel-mesh-failure-receipt/v2'
  verifyReceipt(receipt, schema)
  return { attempted: release ? true : receipt.mutationAttempted === true,
    mutation_possible: release ? true : receipt.mutationAttempted === true,
    mutation_proven: release ? true : receipt.mutationProven === true,
    restored: receipt.status === 'rolled-back', compensated: receipt.status === 'rolled-back',
    preserve_required: receipt.status === 'preserve-required', receipt_sealed: true }
}

const appendOutcome = receipt => {
  const outcome = meshOutcomeOutputs(receipt)
  fs.appendFileSync(requireText(process.env.GITHUB_OUTPUT, 'GITHUB_OUTPUT'),
    `${Object.entries(outcome).map(([name, value]) => `${name}=${value}`).join('\n')}\n`)
}

const main = async () => {
  const [command, ...args] = process.argv.slice(2)
  const { values } = parseArgs({ args, strict: true, options: {
    'source-sha': { type: 'string' }, 'candidate-digest': { type: 'string' }, authorization: { type: 'string' },
    preflight: { type: 'string' }, receipt: { type: 'string' }, 'probe-spec': { type: 'string' }, output: { type: 'string' },
    'github-output': { type: 'boolean' },
  } })
  if (command === 'validate') {
    validatePlan()
    process.stdout.write(`${JSON.stringify({ schema: 'agenticgraph-travel-mesh-plan/v2', status: 'passed',
      bootstrapPolicy: 'separate-authorized-receipt-and-ten-active-baselines-required', units: TRAVEL_MESH_PLAN.map(entry => entry.id) })}\n`)
    return
  }
  if (command === 'probe') {
    const probes = await probeMesh(requireText(values['probe-spec'] ?? process.env.TRAVEL_MESH_PROBE_SPEC_JSON, '--probe-spec'))
    output(values, 'travel_mesh_probe_digest', seal({ schema: 'agenticgraph-travel-mesh-probe-receipt/v1', status: 'passed', probes }))
    return
  }
  const sourceSha = requireText(values['source-sha'], '--source-sha')
  const candidateDigest = requireText(values['candidate-digest'], '--candidate-digest')
  const authorization = readJson(requireText(values.authorization, '--authorization'))
  if (command === 'preflight') {
    output(values, 'travel_mesh_preflight_digest', await preflightMesh({ sourceSha, candidateDigest, authorization }))
    return
  }
  if (command === 'deploy') {
    try {
      const receipt = await deployMesh({ sourceSha, candidateDigest, authorization,
        preflight: readJson(requireText(values.preflight, '--preflight')) })
      output(values, 'travel_mesh_receipt_digest', receipt)
      if (values['github-output']) appendOutcome(receipt)
    } catch (error) {
      if (error.receipt) {
        output(values, 'travel_mesh_failure_digest', error.receipt)
        if (values['github-output']) appendOutcome(error.receipt)
      }
      throw error
    }
    return
  }
  if (command === 'rollback') {
    try {
      output(values, 'travel_mesh_rollback_digest', await restoreMesh({ sourceSha, candidateDigest, authorization,
        receipt: readJson(requireText(values.receipt, '--receipt')) }))
    } catch (error) {
      if (error.receipt) output(values, 'travel_mesh_rollback_failure_digest', error.receipt)
      throw error
    }
    return
  }
  throw new Error('usage: travel-mesh-release.mjs <validate|preflight|deploy|probe|rollback>')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
