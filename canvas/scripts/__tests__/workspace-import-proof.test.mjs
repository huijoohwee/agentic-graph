import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { importWorkspaceFile } from '../lib/workspace-import-proof.mjs'

const native = 'markdown-workspace-status', fallback = 'launch:import:localFiles'
const path = '/notes/flight.md', source = '# Flight\nα\n'
function fixture({ records = [{ key: `entries\u0000${path}`, collection: 'entries', id: path, value: { path, text: source } }], initial = [], databases, readError } = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' })
  const { window } = dom, counters = { observers: 0, disconnected: 0, handles: 0, disposed: 0, closed: 0, lookups: [], scans: 0 }
  const Observer = window.MutationObserver
  window.MutationObserver = class extends Observer {
    constructor(callback) { super(callback); counters.observers++ }
    disconnect() { counters.disconnected++; super.disconnect() }
  }
  const request = result => {
    const value = { result }; queueMicrotask(() => value.onsuccess?.()); return value
  }
  window.indexedDB = {
    databases: async () => databases || [{ name: 'workspace-fs:indexeddb:test' }],
    open: name => request({ objectStoreNames: { contains: () => true },
      transaction: () => ({ objectStore: () => ({
        get: key => {
          counters.lookups.push(key)
          const entries = databases?.find(db => db.name === name)?.records || records
          if (!readError) return request(entries.find(entry => entry.key === key))
          const pending = { error: Error('IndexedDB read failed') }; queueMicrotask(() => pending.onerror?.()); return pending
        },
        getAll: () => {
          counters.scans++
          if (!readError) return request(databases?.find(db => db.name === name)?.records || records)
          const pending = { error: Error('IndexedDB read failed') }; queueMicrotask(() => pending.onerror?.()); return pending
        },
      }) }), close: () => { counters.closed++ } }),
  }
  const execute = (fn, ...args) => window.eval(`(${fn.toString()})`)(...args)
  const page = {
    evaluate: async (fn, arg) => execute(fn, arg),
    evaluateHandle: async fn => {
      const value = execute(fn); counters.handles++
      return { evaluate: async fn => execute(fn, value), dispose: async () => { counters.disposed++ } }
    },
  }
  const toast = (channel, message, role = 'status', replace = false) => {
    let card = window.document.querySelector(`[data-kg-toast-id="${channel}"]`)
    if (replace && card) { card.remove(); card = null }
    if (!card) { card = window.document.createElement('article'); card.dataset.kgToastId = channel; card.innerHTML = '<p data-kg-toast-message></p>'; window.document.body.append(card) }
    card.setAttribute('role', role); card.querySelector('p').textContent = message
  }
  for (const row of initial) toast(...row)
  const tick = () => new Promise(resolve => setImmediate(resolve))
  const run = (action, options = {}) => importWorkspaceFile({ page, fileChooser: { setFiles: action }, file: { name: 'flight.md', buffer: Buffer.from(source) }, path, source, timeoutMs: 200, ...options })
  const clean = () => { assert.equal(counters.disconnected, counters.observers); assert.equal(counters.disposed, counters.handles); dom.window.close() }
  return { page, toast, tick, run, counters, clean, window }
}

test('fresh native import proves exact persisted UTF-8 bytes by primary key and cleans up', async () => {
  const f = fixture({ records: [{ key: `entries\u0000${path}`, collection: 'entries', id: path, value: { path, text: source } }] })
  const result = await f.run(async () => { assert.equal(f.counters.observers, 1); f.toast(native, 'Importing'); await f.tick(); f.toast(native, 'Imported 1; corpus ready') })
  assert.equal(result.channel, native); assert.equal(result.bytes, Buffer.byteLength(source)); assert.equal(result.path, path)
  assert.deepEqual(f.counters.lookups, [`entries\u0000${path}`]); assert.equal(f.counters.scans, 0)
  assert.equal(f.counters.closed, 1); f.clean()
})

test('fresh fallback completion and replaced terminal nodes are supported', async () => {
  const f = fixture({ records: [{ key: `entries\u0000${path}`, collection: 'entries', id: path, value: { path, text: source } }], initial: [[fallback, 'Imported 1 file(s)']] })
  const result = await f.run(async () => f.toast(fallback, 'Imported 1 file(s)', 'status', true))
  assert.equal(result.channel, fallback); f.clean()
})

test('stale successes on either channel cannot complete a new import', async () => {
  const f = fixture({ initial: [[native, 'Imported 1'], [fallback, 'Imported 1 file(s)']] })
  await assert.rejects(f.run(async () => { f.toast(native, 'Preparing workspace before import'); await f.tick() }, { timeoutMs: 25 }), /timed out/)
  f.clean()
})

test('same channel progress permits an otherwise identical new terminal', async () => {
  const f = fixture({ initial: [[native, 'Imported 1']] })
  const result = await f.run(async () => { f.toast(native, 'Importing'); await f.tick(); f.toast(native, 'Imported 1') })
  assert.equal(result.message, 'Imported 1'); f.clean()
})

for (const [message, role] of [['Import failed: disk full', 'status'], ['Import cancelled', 'status'], ['Import replaced by a newer request', 'status'], ['Storage unavailable', 'alert'], ['Imported 1; 1 failed', 'status'], ['Imported 1; 1 skipped', 'status'], ['Imported 0', 'status']]) {
  test(`rejects fresh terminal ${message}`, async () => {
    const f = fixture(); await assert.rejects(f.run(async () => f.toast(native, message, role)), /failed|Unexpected/); f.clean()
  })
}

for (const [name, records] of [
  ['missing', []],
  ['wrong path', [{ key: 'entries\u0000/elsewhere.md', collection: 'entries', id: '/elsewhere.md', value: { path: '/elsewhere.md', text: source } }]],
  ['wrong bytes', [{ key: `entries\u0000${path}`, collection: 'entries', id: path, value: { path, text: source.trim() } }]],
  ['wrong id', [{ key: `entries\u0000${path}`, collection: 'entries', id: '/elsewhere.md', value: { path, text: source } }]],
]) {
  test(`rejects ${name} persisted source and closes database`, async () => {
    const f = fixture({ records }); await assert.rejects(f.run(async () => f.toast(native, 'Imported 1')), /exactly one record with exact bytes/)
    assert.equal(f.counters.closed, 1); f.clean()
  })
}

test('the Node deadline covers a hung chooser despite a success toast', async () => {
  const f = fixture(), started = performance.now()
  await assert.rejects(f.run(async () => { f.toast(native, 'Imported 1'); await new Promise(() => {}) }, { timeoutMs: 25 }), /timed out/)
  assert.ok(performance.now() - started < 150); f.clean()
})

test('chooser failure disconnects an unsettled observer and disposes its handle', async () => {
  const f = fixture(); await assert.rejects(f.run(async () => { throw Error('Chooser failed') }), /Chooser failed/); f.clean()
})

test('the same deadline includes a blocked IndexedDB read', async () => {
  const f = fixture(); f.window.indexedDB.databases = () => new Promise(() => {})
  await assert.rejects(f.run(async () => f.toast(native, 'Imported 1'), { timeoutMs: 25 }), /timed out/); f.clean()
})

test('late handle acquisition is cleaned without selecting files after expiry', async () => {
  const f = fixture(), acquire = f.page.evaluateHandle
  let release, selected = false
  f.page.evaluateHandle = async fn => { await new Promise(resolve => { release = resolve }); return acquire(fn) }
  await assert.rejects(f.run(async () => { selected = true }, { timeoutMs: 25 }), /timed out/)
  release(); await f.tick(); assert.equal(selected, false); f.clean()
})

test('deadline validation prevents action and observer allocation', async () => {
  const f = fixture()
  await assert.rejects(f.run(async () => assert.fail('must not select'), { timeoutMs: 60001 }), /Invalid/)
  assert.equal(f.counters.observers, 0); f.clean()
})


test('duplicate exact paths across workspace databases fail and all databases close', async () => {
  const entry = { key: `entries\u0000${path}`, collection: 'entries', id: path, value: { path, text: source } }
  const f = fixture({ databases: [{ name: 'workspace-fs:indexeddb:a', records: [entry] }, { name: 'workspace-fs:indexeddb:b', records: [entry] }] })
  await assert.rejects(f.run(async () => f.toast(native, 'Imported 1')), /found 2/)
  assert.equal(f.counters.closed, 2); f.clean()
})

test('IndexedDB read errors close the database and remove observer and handle', async () => {
  const f = fixture({ readError: true })
  await assert.rejects(f.run(async () => f.toast(native, 'Imported 1')), /IndexedDB read failed/)
  assert.equal(f.counters.closed, 1); f.clean()
})

test('a new import cannot reuse an unchanged terminal in its own channel', async () => {
  const f = fixture({ initial: [[native, 'Imported 1']] })
  await assert.rejects(f.run(async () => { f.window.document.body.append(f.window.document.createElement('div')) }, { timeoutMs: 25 }), /timed out/)
  f.clean()
})
test('browser import proof and receipt consumers have no undefined identifiers', async () => {
  const [{ ESLint }, { default: globals }, { fileURLToPath }] = await Promise.all([
    import('eslint'), import('globals'), import('node:url'),
  ])
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [{ files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error' } }] })
  const paths = ['../lib/workspace-import-proof.mjs', '../lib/aviation-evidence-offline-proof.mjs', '../run_spatial_workspace_full_app_smoke.mjs']
    .map(path => fileURLToPath(new URL(path, import.meta.url)))
  const results = await eslint.lintFiles(paths)
  assert.deepEqual(results.flatMap(result => result.messages.map(message => ({ file: result.filePath, ...message }))), [])
})
