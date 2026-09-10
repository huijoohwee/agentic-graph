import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  D1_MIGRATION, HASH_PINNED_FORWARD_DATA_CONVERGENCE_MIGRATIONS, digest, repoRoot, requireText,
} from './travel-mesh-release-plan.mjs'

const directory = path.resolve(repoRoot, D1_MIGRATION.directory)
const names = () => fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()
const args = (config, ...command) => ['--no-install', 'wrangler', 'd1', ...command, '--config', config]

// Retain original migration filenames as the provider's immutable ledger keys.
// A core release stages only its storage dependencies; optional product schema
// changes remain pending for the profile that actually deploys those products.
export const selectedMigrationSources = profile => {
  const selected = profile.migrations ?? names()
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
    || selected.some(name => !names().includes(name))) throw new Error('runtime migration selection is invalid')
  return [...selected].sort().map(name => ({ name, source: fs.readFileSync(path.join(directory, name), 'utf8') }))
}

export const migrationCompatibilityFailures = (files, profile) => files.flatMap(({ name, source }) => {
  if (HASH_PINNED_FORWARD_DATA_CONVERGENCE_MIGRATIONS[name] === digest(source)
    || profile.forwardMigrationDigests?.[name] === digest(source)) return []
  const sql = source.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  return /(?:^|;)\s*(?:DROP\s|TRUNCATE\s|DELETE\s|UPDATE\s|ALTER\s+TABLE\s+\S+\s+RENAME\s)/im.test(sql)
    ? [`pending D1 migration is not forward-compatible with Worker rollback: ${name}`] : []
})

const withConfig = async (configuration, profile, callback) => {
  const files = selectedMigrationSources(profile)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-graph-release-migrations-'))
  try {
    const migrations = path.join(root, 'migrations')
    fs.mkdirSync(migrations)
    for (const { name, source } of files) fs.writeFileSync(path.join(migrations, name), source, { flag: 'wx', mode: 0o600 })
    const storage = profile.plan.find(unit => unit.id === 'storage')
    const [name, id] = storage.storageVariables ?? ['TRAVEL_STORAGE_D1_DATABASE_NAME', 'TRAVEL_STORAGE_D1_DATABASE_ID']
    const config = path.join(root, 'wrangler.json')
    fs.writeFileSync(config, JSON.stringify({ d1_databases: [{ binding: D1_MIGRATION.database,
      database_name: requireText(configuration.variables[name], 'migration database name'),
      database_id: requireText(configuration.variables[id], 'migration database ID'), migrations_dir: migrations }] }),
    { flag: 'wx', mode: 0o600 })
    return await callback(config, files)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

const appliedMigrations = async (run, runJson, config) => {
  let value
  try {
    value = await runJson(run, args(config, 'execute', D1_MIGRATION.database, '--remote',
      '--command', 'SELECT name FROM d1_migrations ORDER BY name', '--json'), 'D1 migration inventory')
  } catch (error) {
    if (/no such table:\s*d1_migrations/i.test(error.message)) return new Set()
    throw error
  }
  const groups = Array.isArray(value) ? value : [value]
  if (!groups.length || groups.some(group => !Array.isArray(group?.results))) throw new Error('D1 migration inventory is malformed')
  const rows = groups.flatMap(group => group.results)
  if (rows.some(row => typeof row?.name !== 'string' || !row.name.trim())
    || new Set(rows.map(row => row.name)).size !== rows.length) throw new Error('D1 migration inventory is malformed')
  return new Set(rows.map(row => row.name))
}

const inspect = async (run, runJson, config, files, profile) => {
  const applied = await appliedMigrations(run, runJson, config)
  const pending = files.filter(file => !applied.has(file.name))
  const failures = migrationCompatibilityFailures(pending, profile)
  if (failures.length) throw new Error(failures.join('\n'))
  return { selected: files.map(({ name, source }) => ({ name, sourceDigest: digest(source) })),
    appliedBefore: [...applied].sort(), pending: pending.map(file => file.name),
    deferred: names().filter(name => !files.some(file => file.name === name) && !applied.has(name)) }
}

// Read-only provider observation. Call before Pages deployment, and again before
// Worker upload; the apply boundary separately rechecks the exact same inventory.
export const inspectMigrations = ({ run, runJson, configuration, profile }) => withConfig(configuration, profile,
  (config, files) => inspect(run, runJson, config, files, profile))

export const applyMigrations = ({ run, runJson, configuration, profile, expected }) => withConfig(configuration, profile,
  async (config, files) => {
    let appliedBefore = new Set(), pending = [], bookmark = null, applyAttempted = false
    try {
      const current = await inspect(run, runJson, config, files, profile)
      appliedBefore = new Set(current.appliedBefore)
      pending = current.pending
      if (digest(current) !== digest(expected)) throw new Error('D1 migration inventory changed after preflight')
      if (!pending.length) return { ...current, applied: false, bookmark: null, disposition: 'unchanged' }
      const info = await runJson(run, args(config, 'time-travel', 'info', D1_MIGRATION.database, '--json'), 'D1 time-travel bookmark')
      bookmark = requireText(info?.bookmark ?? info?.result?.bookmark, 'D1 time-travel bookmark')
      applyAttempted = true
      await run(args(config, 'migrations', 'apply', D1_MIGRATION.database, '--remote'))
      const after = await appliedMigrations(run, runJson, config)
      for (const name of pending) if (!after.has(name)) throw new Error(`D1 migration did not converge: ${name}`)
      if ([...appliedBefore].some(name => !after.has(name))
        || [...after].some(name => !appliedBefore.has(name) && !pending.includes(name))) throw new Error('D1 migration inventory changed unexpectedly during apply')
      return { ...current, applied: true, bookmark, disposition: 'retained-forward-compatible-on-worker-rollback' }
    } catch (error) {
      let observedAfter = null, observationError = null
      if (applyAttempted) {
        try { observedAfter = await appliedMigrations(run, runJson, config) }
        catch (failure) { observationError = failure.message.slice(0, 500) }
      }
      const actuallyApplied = observedAfter ? pending.filter(name => !appliedBefore.has(name) && observedAfter.has(name)) : []
      error.migrationReceipt = { pending, applied: actuallyApplied.length > 0, actuallyApplied,
        appliedBefore: [...appliedBefore].sort(), bookmark, applyAttempted, observationError,
        disposition: applyAttempted ? 'preserve-required-partial-migration-possible' : 'not-mutated' }
      error.migrationMutationPossible = applyAttempted
      throw error
    }
  })
