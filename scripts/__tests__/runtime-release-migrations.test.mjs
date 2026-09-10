import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { CORE_RUNTIME_PROFILE, TRAVEL_RUNTIME_PROFILE } from '../runtime-release-profile.mjs'
import { CORE_RUNTIME_MIGRATIONS } from '../core-runtime-release-plan.mjs'
import { inspectMigrations, applyMigrations, selectedMigrationSources, migrationCompatibilityFailures } from '../runtime-release-migrations.mjs'
import { buildDirectD1DocumentStatements } from '../lib/seed-storage-documents-d1.mjs'

const profile = CORE_RUNTIME_PROFILE
const configuration = { variables: { AGENTIC_OS_STORAGE_D1_DATABASE_NAME: 'test-database',
  AGENTIC_OS_STORAGE_D1_DATABASE_ID: '633355bf-1a52-4085-bd3c-eba4220ff152' } }
const runJson = async (run, args) => JSON.parse((await run(args)).stdout)
const migration = name => fs.readFileSync(new URL(`../../cloudflare/d1/migrations/${name}`, import.meta.url), 'utf8')
const fixture = ({ applied = ['0001_knowgrph_storage.sql', '0008_chat_auth_and_audit.sql'], partialFailure = false } = {}) => {
  let rows = [...applied]
  const calls = [], configurations = [], staged = []
  const run = async args => {
    calls.push(args)
    const configPath = args[args.indexOf('--config') + 1]
    configurations.push(configPath)
    const binding = JSON.parse(fs.readFileSync(configPath, 'utf8')).d1_databases[0]
    assert.equal(binding.database_id, configuration.variables.AGENTIC_OS_STORAGE_D1_DATABASE_ID)
    if (args.includes('execute')) return { stdout: JSON.stringify([{ results: rows.map(name => ({ name })) }]) }
    if (args.includes('info')) return { stdout: JSON.stringify({ bookmark: 'test-bookmark' }) }
    if (args.includes('apply')) {
      const files = fs.readdirSync(binding.migrations_dir).sort()
      for (const name of files) assert.equal(fs.readFileSync(path.join(binding.migrations_dir, name), 'utf8'), migration(name))
      staged.push(files)
      const pending = files.filter(name => !rows.includes(name))
      if (partialFailure) { rows.push(pending[0]); throw new Error('provider interrupted migration apply') }
      rows.push(...pending)
      return { stdout: '' }
    }
    throw new Error('unexpected migration command')
  }
  return { run, runJson, configuration, profile, calls, configurations, staged, replace: names => { rows = names } }
}

test('core selects storage dependencies and retains original provider ledger keys', async () => {
  const f = fixture(), observation = await inspectMigrations(f)
  assert.deepEqual(observation.selected.map(file => file.name), [...CORE_RUNTIME_MIGRATIONS].sort())
  assert(observation.appliedBefore.includes('0001_knowgrph_storage.sql'))
  assert(observation.pending.includes('0001_agentic-graph_storage.sql'))
  assert(observation.deferred.includes('0005_strytree_external_provider_neutralization.sql'))
  assert(observation.deferred.includes('0018_agentic_commerce_paid_resources.sql'))
  assert(f.calls.every(args => args.includes('execute') && args.includes('SELECT name FROM d1_migrations ORDER BY name')))
  assert(f.configurations.every(file => !fs.existsSync(path.dirname(file))))
})

test('apply uses only exact selected SQL and never marks deferred migrations applied', async () => {
  const f = fixture(), expected = await inspectMigrations(f)
  const result = await applyMigrations({ ...f, expected })
  assert.equal(result.applied, true)
  assert.equal(result.bookmark, 'test-bookmark')
  assert.deepEqual(f.staged, [[...CORE_RUNTIME_MIGRATIONS].sort()])
  const after = await inspectMigrations(f)
  assert.deepEqual(after.pending, [])
  assert(after.deferred.includes('0005_strytree_external_provider_neutralization.sql'))
  assert(f.configurations.every(file => !fs.existsSync(path.dirname(file))))
})

test('changed provider inventory stops before bookmark or migration writes', async () => {
  const f = fixture(), expected = await inspectMigrations(f)
  f.replace([...expected.appliedBefore, 'operator-change.sql'])
  await assert.rejects(applyMigrations({ ...f, expected }), error => {
    assert.match(error.message, /changed after preflight/)
    assert.equal(error.migrationReceipt.applyAttempted, false)
    return true
  })
  assert(f.calls.every(args => !args.includes('apply') && !args.includes('time-travel')))
})

test('partial apply retains mutation uncertainty and removes only temporary configurations', async () => {
  const f = fixture({ partialFailure: true }), expected = await inspectMigrations(f)
  await assert.rejects(applyMigrations({ ...f, expected }), error => {
    assert.equal(error.migrationMutationPossible, true)
    assert.equal(error.migrationReceipt.applyAttempted, true)
    assert.equal(error.migrationReceipt.actuallyApplied.length, 1)
    assert.equal(error.migrationReceipt.disposition, 'preserve-required-partial-migration-possible')
    return true
  })
  assert(f.configurations.every(file => !fs.existsSync(path.dirname(file))))
})

test('travel reports every incompatible pending migration while preserving its audited exception', async () => {
  const f = fixture({ applied: [] })
  await assert.rejects(inspectMigrations({ ...f, profile: TRAVEL_RUNTIME_PROFILE,
    configuration: { variables: { TRAVEL_STORAGE_D1_DATABASE_NAME: configuration.variables.AGENTIC_OS_STORAGE_D1_DATABASE_NAME,
      TRAVEL_STORAGE_D1_DATABASE_ID: configuration.variables.AGENTIC_OS_STORAGE_D1_DATABASE_ID } } }), error => {
    for (const name of ['0005_strytree_external_provider_neutralization.sql', '0019_storage_chunk_document_identity.sql', '0020_storage_child_sync_state.sql']) assert(error.message.includes(name))
    assert(!error.message.includes('0017_agentic-graph_vendor_display_names.sql'))
    return true
  })
  assert.equal(f.staged.length, 0)
})

test('forward-compatible exceptions accept exact audited SQL only', () => {
  for (const name of ['0019_storage_chunk_document_identity.sql', '0020_storage_child_sync_state.sql']) {
    assert.deepEqual(migrationCompatibilityFailures([{ name, source: migration(name) }], profile), [])
    assert.equal(migrationCompatibilityFailures([{ name, source: migration(name) + '\nDELETE FROM documents;' }], profile).length, 1)
  }
  const name = '0005_strytree_external_provider_neutralization.sql'
  assert.equal(migrationCompatibilityFailures([{ name, source: migration(name) }], profile).length, 1)
})

test('malformed provider migration observations fail closed', async () => {
  for (const value of [null, {}, [], [{ results: null }], [{ results: [{ name: '' }] }], [{ results: [{ name: 'same' }, { name: 'same' }] }]]) {
    await assert.rejects(inspectMigrations({ configuration, profile, runJson,
      run: async () => ({ stdout: JSON.stringify(value) }) }), /inventory is malformed/)
  }
})

test('selected migrations preserve legacy storage rows and permit legacy schema CRUD with retained triggers', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(migration('0001_agentic-graph_storage.sql'))
    db.exec(migration('0008_chat_auth_and_audit.sql'))
    db.exec(`INSERT INTO workspaces VALUES ('w','test','Test','private','2026-01-01','2026-01-01');
      INSERT INTO documents (id,workspace_id,canonical_path,content_md,content_hash,parser_version,revision,created_at,updated_at)
        VALUES ('d','w','test.md','','hash','parser',1,'2026-01-01','2026-01-01');
      INSERT INTO document_chunks (id,document_id,workspace_id,chunk_key,chunk_order,markdown,token_estimate,content_hash,updated_at)
        VALUES ('c','d','w','0',0,'Before',1,'hash','2026-01-01');
      INSERT INTO graph_snapshots (id,document_id,workspace_id,graph_revision,graph_hash,graph_json,derived_from_document_revision,updated_at)
        VALUES ('g','d','w',1,'hash','{}',1,'2026-01-01');`)
    const tables = ['workspaces', 'documents', 'document_chunks', 'graph_snapshots']
    const before = tables.map(table => db.prepare(`SELECT * FROM ${table}`).all())
    for (const { source } of selectedMigrationSources(profile)) db.exec(source)
    assert.deepEqual(tables.map(table => db.prepare(`SELECT * FROM ${table}`).all()), before)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM storage_child_state').get().n, 2)
    db.exec("UPDATE document_chunks SET markdown='After',content_hash='new',updated_at='2026-02-01' WHERE id='c'")
    assert.equal(db.prepare("SELECT revision FROM documents WHERE id='d'").get().revision, 2)
    db.exec("UPDATE documents SET content_md='Inline',revision=3 WHERE id='d'")
    db.exec("UPDATE document_chunks SET markdown='Inline child' WHERE id='c'")
    assert.equal(db.prepare("SELECT revision FROM documents WHERE id='d'").get().revision, 3)
    db.exec("DELETE FROM document_chunks WHERE id='c'; DELETE FROM graph_snapshots WHERE id='g'")
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM storage_child_state WHERE deleted=1').get().n, 2)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    assert.throws(() => db.exec("UPDATE documents SET content_md='Stale',revision=2 WHERE id='d'"), /document_revision_conflict/)
    const record = { id: 'd', workspaceId: 'w', canonicalPath: 'test.md', sourceKind: 'markdown',
      contentMd: 'Seeded', contentHash: 'seeded-hash', parserVersion: 'parser', revision: 1, deleted: false }
    const statements = buildDirectD1DocumentStatements({ record, chunkMutations: [], authoritativeUpdatedAtMs: 1788998400000 })
    db.exec(statements.join('\n'))
    assert.equal(db.prepare("SELECT content_md FROM documents WHERE id='d'").get().content_md, 'Seeded')
    assert.equal(db.prepare("SELECT revision FROM documents WHERE id='d'").get().revision, 4)
    db.exec(statements.join('\n'))
    assert.equal(db.prepare("SELECT revision FROM documents WHERE id='d'").get().revision, 5)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})
