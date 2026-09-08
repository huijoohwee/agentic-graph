import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readlinkSync, readSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { findLocalChromiumExecutable } from './lib/local-chromium-executable.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const baseUrl = process.env.AG_STORAGE_RECOVERY_BASE_URL
assert.ok(baseUrl, 'the owned local server runner must supply its URL')
const origin = new URL(baseUrl).origin
const proofUrl = `${origin}/__storage_recovery_browser_proof`
const sha256 = value => createHash('sha256').update(value).digest('hex')
const git = args => execFileSync('git', ['-C', repositoryRoot, ...args], { maxBuffer: 32 * 1024 * 1024 })
const sourceObservation = () => {
  const names = new TextDecoder('utf-8', { fatal: true }).decode(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']))
    .split('\0').filter(Boolean).sort()
  const manifest = createHash('sha256'), buffer = Buffer.allocUnsafe(499_999)
  const sameFile = (a, b) => ['dev', 'ino', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key])
  let bytes = 0, symlinks = 0
  for (const path of names) {
    const absolute = resolve(repositoryRoot, path)
    let before
    try { before = lstatSync(absolute, { bigint: true }) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      manifest.update(`${JSON.stringify([path, 'absent'])}\n`)
      continue
    }
    let kind, hash, size
    if (before.isSymbolicLink()) {
      const target = readlinkSync(absolute, { encoding: 'buffer' })
      kind = 'symlink'; hash = sha256(target); size = target.length; symlinks++
    } else if (before.isFile()) {
      const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
      try {
        const opened = fstatSync(fd, { bigint: true }), content = createHash('sha256')
        if (!sameFile(before, opened) || opened.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Source changed before read: ${path}`)
        size = Number(opened.size)
        for (let offset = 0; offset < size;) {
          const count = readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset)
          if (!count) throw new Error(`Source truncated during read: ${path}`)
          content.update(buffer.subarray(0, count)); offset += count
        }
        if (!sameFile(opened, fstatSync(fd, { bigint: true }))) throw new Error(`Source changed during read: ${path}`)
        kind = 'file'; hash = content.digest('hex')
      } finally { closeSync(fd) }
    } else throw new Error(`Unsupported source inventory entry: ${path}`)
    if (!sameFile(before, lstatSync(absolute, { bigint: true }))) throw new Error(`Source replaced during read: ${path}`)
    manifest.update(`${JSON.stringify([path, kind, before.mode.toString(), size, hash])}\n`)
    bytes += size
  }
  return {
    head: git(['rev-parse', 'HEAD']).toString().trim(), tree: git(['rev-parse', 'HEAD^{tree}']).toString().trim(),
    branch: git(['branch', '--show-current']).toString().trim() || null,
    sourceFilesSha256: manifest.digest('hex'), sourceFileCount: names.length, sourceBytes: bytes, symlinkCount: symlinks,
    observation: 'fresh raw bytes for every tracked and nonignored untracked path; framed path/kind/mode/size/hash; symlink target bytes; explicit missing paths',
    declaredCiCandidate: process.env.AGENTIC_OS_SOURCE_REVISION || null,
  }
}
const output = process.env.AG_STORAGE_RECOVERY_RESULT_PATH
const before = sourceObservation()
const results = []
const executablePath = findLocalChromiumExecutable('', chromium.executablePath())
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const browserVersion = browser.version()
const html = `<!doctype html><html><body><main>Local storage recovery proof</main><script type="module">
import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
</script></body></html>`

async function initialize(page) {
  await page.goto(proofUrl)
  await page.evaluate(async () => {
    const settings = await import('/src/lib/workspace/workspaceStoreSyncSettings.ts')
    if (settings.readWorkspaceSeedSyncEnabledSetting()) throw new Error('Seed sync must be disabled for the isolated local recovery proof')
    const [storage, actions, queue, mapping, contract, store, sync, outbox] = await Promise.all([
      import('/src/lib/storage/agentic-graph-storage-db.ts'),
      import('/src/lib/storage/agentic-graph-storage-conflict-actions.ts'),
      import('/src/lib/storage/agentic-graph-storage-client-push.ts'),
      import('/src/lib/storage/agentic-graph-storage-record-mapping.ts'),
      import('/src/lib/storage/agentic-graph-storage-sync-contract.ts'),
      import('/src/hooks/useGraphStore.ts'),
      import('/src/lib/storage/agentic-graph-storage-client-sync.ts'),
      import('/src/lib/storage/agentic-graph-storage-outbox-record.ts'),
    ])
    const db = await storage.getAgenticGraphStorageDb()
    window.__storageProof = { db, actions, queue, mapping, contract, store, sync, outbox }
    if (!(indexedDB instanceof IDBFactory) || db.persistence.getState().mode !== 'indexeddb'
      || db.persistence.getState().status !== 'active') throw new Error('Real browser IndexedDB must remain active')
    const request = indexedDB.open(storage.AGENTIC_OS_STORAGE_DB_NAME)
    await new Promise((accept, reject) => {
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        if (!(request.result instanceof IDBDatabase)) reject(new Error('Native IDBDatabase required'))
        request.result.close(); accept()
      }
    })
  })
}

async function seed(page, workspaceId) {
  return page.evaluate(async workspaceId => {
    const p = window.__storageProof, hash = p.contract.hashAgenticGraphStorageContent
    const parent = { id: 'sf:recovery-parent', workspaceId, canonicalPath: 'recovery-browser.md', title: null,
      docType: null, lang: null, graphId: null, sourceKind: 'markdown', contentMd: '# Retained parent',
      contentHash: hash('# Retained parent'), parserVersion: 'browser-proof', revision: 7, updatedAtMs: 7, deleted: true }
    const text = '\ufeff# Retained child\n\u0000Exact authored bytes 中文'
    const child = { id: 'browser-child', workspaceId, documentId: parent.id, chunkKey: 'browser-child',
      chunkOrder: 0, heading: null, markdown: text, contentHash: hash(text), tokenEstimate: 1, updatedAtMs: 1 }
    const unrelated = { ...child, id: 'unreviewed-child', chunkKey: 'unreviewed-child', chunkOrder: 8,
      markdown: '# Unreviewed cached bytes', contentHash: hash('# Unreviewed cached bytes') }
    await p.db.collections.documents.incrementalUpsert(p.mapping.toAgenticGraphLocalDocumentRecord(parent))
    await p.db.collections.documentChunks.incrementalUpsert(child)
    await p.db.collections.documentChunks.incrementalUpsert(unrelated)
    const childId = await p.queue.queueAgenticGraphStorageMutation({ dbState: p.db, workspaceId, deviceId: 'browser-tab-a',
      entity: 'documentChunk', op: 'upsert', record: child, baseRevision: null })
    await (await p.db.collections.syncOutbox.findOne(childId).exec()).incrementalPatch({ lastAckStatus: 'conflict' })
    const candidate = { id: childId, mutationId: childId, workspaceId, entity: 'documentChunk', recordId: child.id,
      serverRevision: null, remoteRecord: null, receivedAtMs: 7 }
    await p.db.collections.syncConflicts.incrementalUpsert(candidate)
    p.store.useGraphStore.setState({ sourceFiles: [{ id: 'recovery-parent', name: parent.canonicalPath,
      text, source: { kind: 'local', path: parent.canonicalPath }, status: 'idle' }] })
    return { parent, child, unrelated, childId, candidate }
  }, workspaceId)
}

async function snapshot(page, workspaceId) {
  return page.evaluate(async workspaceId => {
    const p = window.__storageProof
    const rows = async name => (await p.db.collections[name].find({ selector: { workspaceId } }).exec())
      .map(row => row.toJSON()).sort((a, b) => a.id.localeCompare(b.id))
    return { documents: await rows('documents'), children: await rows('documentChunks'), outbox: await rows('syncOutbox'),
      conflicts: await rows('syncConflicts'), history: await p.db.revisionHistory.list(workspaceId, 'sf:recovery-parent'),
      persistence: p.db.persistence.getState(), source: p.store.useGraphStore.getState().sourceFiles,
      log: p.store.useGraphStore.getState().uiLogEntries.map(row => row.message) }
  }, workspaceId)
}

async function choose(page, workspaceId, childId, choice) {
  return page.evaluate(async ({ workspaceId, childId, choice }) => {
    const p = window.__storageProof
    try {
      return await p.actions.runAgenticGraphStorageConflictAction(
        p.actions.buildAgenticGraphStorageConflictFamilyActionId(workspaceId, childId, choice))
    } finally { p.sync.cancelAgenticGraphStorageSync(workspaceId) }
  }, { workspaceId, childId, choice })
}

async function runCase(choice, contended) {
  const started = Date.now(), name = `${choice}:${contended ? 'concurrent-tab' : 'reviewed'}`
  const context = await browser.newContext({ serviceWorkers: 'block' })
  const rejectedRequests = [], pageErrors = []
  let deadline
  try {
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url())
    if (request.url() === proofUrl) return route.fulfill({ contentType: 'text/html', body: html })
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())
      || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__agentic_os_')) {
      rejectedRequests.push({ method: request.method(), origin: url.origin, path: url.pathname })
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
  const first = await context.newPage(), second = await context.newPage()
  for (const page of [first, second]) page.on('pageerror', error => pageErrors.push(error.message))
    await Promise.race([new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error(`${name} exceeded 20 seconds`)), 20_000) }), (async () => {
      await Promise.all([initialize(first), initialize(second)])
      const workspaceId = `browser:recovery:${choice}:${contended}`, fixture = await seed(first, workspaceId)
      assert.deepEqual((await snapshot(second, workspaceId)).children.find(row => row.id === fixture.child.id), fixture.child,
        'the second tab must read the first tab native IndexedDB write')
      let authored = null
      if (contended) {
        await first.exposeFunction('__storageRecoverySecondCommit', async () => {
          authored = await second.evaluate(async ({ workspaceId, fixture }) => {
            const p = window.__storageProof, row = await p.db.collections.syncOutbox.findOne(fixture.childId).exec()
            const previous = row.toJSON(), text = '\ufeff# Concurrent replacement\n\u0000Exact second-tab bytes 中文'
            const replacement = p.outbox.rebuildAgenticGraphStorageOutboxRecordForRetry({ existingRecord: previous,
              mutation: previous.payload, nextBaseRevision: previous.baseRevision, nowMs: Date.now(),
              nextRecord: { ...previous.payload.record, markdown: text, contentHash: p.contract.hashAgenticGraphStorageContent(text) } })
            await row.incrementalPatch({ ...replacement, lastAckStatus: previous.lastAckStatus })
            const added = { ...fixture.child, id: 'inserted-during-review', chunkKey: 'inserted-during-review', chunkOrder: 1,
              markdown: '# New second-tab child', contentHash: p.contract.hashAgenticGraphStorageContent('# New second-tab child') }
            const addedId = await p.queue.queueAgenticGraphStorageMutation({ dbState: p.db, workspaceId, deviceId: 'browser-tab-b',
              entity: 'documentChunk', op: 'upsert', record: added, baseRevision: null })
            return { payload: replacement.payload, added, addedId }
          }, { workspaceId, fixture })
        })
        await first.evaluate(() => {
          const db = window.__storageProof.db, original = db.compareAndWriteWithRevisions.bind(db)
          let commits = 0
          // Explicit fault injection pauses before the real second IndexedDB transaction.
          db.compareAndWriteWithRevisions = async (...args) => {
            if (++commits === 2) await window.__storageRecoverySecondCommit()
            return original(...args)
          }
          window.__storageProof.restoreCommit = () => { db.compareAndWriteWithRevisions = original }
        })
      }
      assert.equal(await choose(first, workspaceId, fixture.childId, choice), true)
      const visible = await snapshot(first, workspaceId)
      const stored = await snapshot(second, workspaceId)
      assert.equal(stored.persistence.mode, 'indexeddb'); assert.equal(stored.persistence.status, 'active')
      assert.deepEqual(stored.children.find(row => row.id === fixture.unrelated.id), fixture.unrelated)
      assert.equal(stored.history.length, 1); assert.equal(stored.history[0].contentMd, fixture.parent.contentMd)
      assert.equal(stored.history[0].documentRevision, choice === 'restore-family' ? 8 : 7)
      if (contended) {
        assert.ok(authored, 'the second tab must edit during the native cleanup boundary')
        assert.deepEqual(stored.outbox.find(row => row.id === fixture.childId)?.payload, authored.payload)
        assert.equal(stored.outbox.find(row => row.id === fixture.childId)?.lastAckStatus, 'conflict')
        assert.deepEqual(stored.outbox.find(row => row.id === authored.addedId)?.payload.record, authored.added)
        assert.deepEqual(stored.conflicts.find(row => row.id === fixture.childId), fixture.candidate)
        assert.ok(visible.log.some(message => message.includes('Concurrent changes were retained')))
        await first.evaluate(() => window.__storageProof.restoreCommit())
      } else if (choice === 'restore-family') {
        assert.equal(stored.documents[0].isDeleted, false)
        assert.equal(stored.outbox.length, 2); assert.ok(stored.outbox.every(row => row.lastAckStatus === ''))
        const parent = stored.outbox.find(row => row.entity === 'document'), child = stored.outbox.find(row => row.entity === 'documentChunk')
        assert.ok(parent.createdAtMs <= child.createdAtMs, 'parent is queued before its retained child')
        assert.equal(child.payload.record.markdown, fixture.child.markdown)
        assert.ok(visible.source.some(row => row.text.includes(fixture.child.markdown)))
      } else {
        assert.equal(stored.documents[0].isDeleted, true)
        assert.equal(stored.outbox.length, 0); assert.equal(stored.conflicts.length, 0)
        assert.equal(stored.children.some(row => row.id === fixture.child.id), false)
        assert.equal(visible.source.some(row => row.id === 'recovery-parent'), false)
      }
      await Promise.all([first.evaluate(() => window.__storageProof.db.db.close()), second.evaluate(() => window.__storageProof.db.db.close())])
      await Promise.all([initialize(first), initialize(second)])
      const reopened = await snapshot(second, workspaceId)
      for (const key of ['documents', 'children', 'outbox', 'conflicts', 'history']) assert.deepEqual(reopened[key], stored[key], `${key} survives closing both tabs' connections and reloading`)
      if (contended) {
        await choose(first, workspaceId, fixture.childId, 'restore-family')
        const retry = await snapshot(second, workspaceId)
        assert.ok(retry.outbox.every(row => row.lastAckStatus === ''), 'fresh explicit recovery must complete')
        assert.equal(retry.outbox.find(row => row.id === fixture.childId)?.payload.record.markdown, authored.payload.record.markdown)
        assert.equal(retry.outbox.find(row => row.id === authored.addedId)?.payload.record.markdown, authored.added.markdown)
      }
      assert.deepEqual(pageErrors, [], 'uncaught browser errors invalidate the proof')
      assert.deepEqual(rejectedRequests, [], 'unexpected network attempts invalidate the isolated local proof')
      results.push({ name, status: 'passed', durationMs: Date.now() - started, realIndexedDb: true, tabs: 2,
        faultInjection: contended ? 'pause-before-native-cleanup-transaction' : null, rejectedRequests })
    })()])
  } finally { clearTimeout(deadline); await context.close() }
}

let failure
try {
  for (const choice of ['restore-family', 'discard-family']) for (const contended of [false, true]) await runCase(choice, contended)
} catch (error) { failure = error; process.exitCode = 1 }
finally {
  await browser.close()
  const after = sourceObservation(), stable = JSON.stringify(before) === JSON.stringify(after)
  const receipt = { schema: 'agentic-graph-storage-parent-child-browser-proof/v1', status: failure || !stable ? 'failed' : 'passed',
    before, after, stable, browserVersion, executablePath, cases: results, error: failure?.stack || null,
    limitations: ['Chromium local IndexedDB only', 'Explicit transaction-pause fault injection in contention cases',
      'Before/after source observations do not establish atomic served-byte coverage or unchanged runtime dependencies',
      'No server acknowledgement, deployed Worker, eviction, other browser or provider evidence'] }
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`) }
  console.log(JSON.stringify(receipt))
  if (!stable) process.exitCode = 1
}
