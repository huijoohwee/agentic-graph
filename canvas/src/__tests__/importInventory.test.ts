import test from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { IMPORT_INDEX_MAX_BYTES, importInventoryPath, readImportInventory, renderImportInventory } from '@/features/workspace-fs/importInventory'
import { persistImportInventory, readWebsiteInventory } from '@/features/workspace-fs/importInventoryPersistence'
import { importWorkspaceLocalFiles, importWorkspaceLocalFolder } from '@/features/markdown-workspace/workspaceImport/localImport'
import type { WorkspaceFs } from '@/features/workspace-fs/types'

const source = 'https://catalog.example.invalid/reference'
const indexPath = importInventoryPath(source)
async function document(fs: WorkspaceFs, name: string, text: string) {
  return fs.createFile({ parentPath: '/', name, text })
}
const file = (name: string, text: string, relative?: string) => {
  const value = new File([text], name, { type: 'text/plain' })
  if (relative) Object.defineProperty(value, 'webkitRelativePath', { value: relative })
  return value as unknown as globalThis.File
}

test('one host index consolidates page links and saved content with all prior discoveries, without fetching', async () => {
  const fs = createMemoryWorkspaceFs(), previousFetch = globalThis.fetch
  globalThis.fetch = (async () => { throw new Error('Inventory must not fetch') }) as typeof fetch
  try {
    const body = `---\nkgWebpageUrl: "${source}"\n---\n# Collection\n[Next](${source}/next)\n[Download](/__website_import/artifact?importId=sample)\nOriginal page notes`
    const path = await document(fs, 'collection.md', body)
    await persistImportInventory(fs, [{ source: `${source}/later#section`, status: 'not imported' }])
    const rows = readImportInventory((await fs.readFileText(indexPath))!)
    assert.equal(rows.length, 3)
    assert.equal(rows.find(row => row.source === source)?.status, 'imported')
    assert.deepEqual(rows.find(row => row.source === source)?.outputs, [{ path }])
    assert.equal(rows.find(row => row.source.endsWith('/next'))?.status, 'not imported')
    assert.equal(await fs.readFileText(path), body, 'captured page content is not replaced by its catalog')
    const restarted = createMemoryWorkspaceFs({ initialEntries: await fs.listEntries() })
    assert.equal((await readWebsiteInventory(restarted, source)).length, 3)
    assert.equal(await persistImportInventory(restarted), false)
    await persistImportInventory(restarted, [{ source: `${source}/new`, status: 'not imported' }])
    assert.equal((await readWebsiteInventory(restarted, source)).length, 4, 'new discovery does not erase earlier sessions')
    await restarted.deleteEntry(path)
    await persistImportInventory(restarted)
    assert.equal(readImportInventory((await restarted.readFileText(indexPath))!).find(row => row.source === source)?.status, 'missing')
    assert.equal(await restarted.readFileText(path), null, 'missing content is never reinstated by inventory reads')
  } finally { globalThis.fetch = previousFetch }
})

test('files and folders index imported, unsupported and failed inputs together, with stable paths', async () => {
  const fs = createMemoryWorkspaceFs()
  await importWorkspaceLocalFiles({ fs, files: [file('inventory-valid.txt', 'content'), file('inventory-unsupported.exe', 'opaque')] })
  let rows = readImportInventory((await fs.readFileText('/_import-index.md'))!)
  assert.equal(rows.find(row => row.source === 'local:/inventory-valid.txt')?.status, 'imported')
  assert.equal(rows.find(row => row.source === 'local:/inventory-unsupported.exe')?.detail, 'Unsupported format')
  await fs.writeFileText('/inventory-valid.txt', 'personal notes')
  const failed = await importWorkspaceLocalFiles({ fs, files: [file('inventory-valid.txt', 'new source')] })
  assert.equal(failed.failed.length, 1)
  rows = readImportInventory((await fs.readFileText('/_import-index.md'))!)
  assert.match(rows.find(row => row.source === 'local:/inventory-valid.txt')!.detail!, /edited locally/)
  assert.equal(await fs.readFileText('/inventory-valid.txt'), 'personal notes')
  await importWorkspaceLocalFolder({ fs, files: [file('a.ts', 'export {}', 'inventory-folder/deep/a.ts'), file('b.exe', 'opaque', 'inventory-folder/b.exe')] })
  rows = readImportInventory((await fs.readFileText('/inventory-folder/_import-index.md'))!)
  assert.equal(rows.length, 2)
  assert.equal(rows.find(row => row.source.endsWith('a.ts'))?.status, 'imported')
  assert.equal(rows.find(row => row.source.endsWith('b.exe'))?.status, 'not imported')
})

test('durable receipts restore import identity after browser metadata loss; unchanged imports perform no writes', async () => {
  const memory = createMemoryWorkspaceFs(); let writes = 0
  const fs = { ...memory, createFile: async (args: Parameters<WorkspaceFs['createFile']>[0]) => { writes++; return memory.createFile(args) },
    writeFileText: async (...args: Parameters<WorkspaceFs['writeFileText']>) => { writes++; return memory.writeFileText(...args) } }
  const selected = file('inventory-restart.txt', 'saved')
  await importWorkspaceLocalFiles({ fs, files: [selected] })
  const path = '/inventory-restart.txt', before = writes, receipt = loadWorkspaceSourceIndex()[path].importState
  setWorkspaceEntrySource(path, null)
  await persistImportInventory(fs)
  assert.deepEqual(loadWorkspaceSourceIndex()[path].importState, receipt)
  await importWorkspaceLocalFiles({ fs, files: [selected] })
  assert.equal(writes, before)
  assert.equal(receipt?.outputDigest, await importContentDigest('saved'))
})

test('captured URL aliases and local input receipts keep their distinct identities', async () => {
  const fs = createMemoryWorkspaceFs(), body = `---\nkgWebpageUrl: "${source}/redirected"\n---\nCaptured page`
  await importWorkspaceLocalFiles({ fs, files: [file('inventory-capture.md', body)] })
  const local = readImportInventory((await fs.readFileText('/_import-index.md'))!).find(row => row.source === 'local:/inventory-capture.md')!
  assert.equal(local.outputs?.[0].receipt?.identity, local.source)
  const remote = readImportInventory((await fs.readFileText(indexPath))!).find(row => row.source === `${source}/redirected`)!
  assert.equal(remote.status, 'imported'); assert.equal(remote.outputs?.[0].receipt, undefined)
  assert.equal(await persistImportInventory(fs), false)
})

test('index collisions, edits, and concurrent changes fail without destroying content; outside notes survive', async () => {
  const fs = createMemoryWorkspaceFs(), row = { source: 'local:/note.txt', status: 'not imported' as const }
  await document(fs, '_import-index.md', 'Authored content')
  await assert.rejects(persistImportInventory(fs, [row]), /preserved/)
  assert.equal(await fs.readFileText('/_import-index.md'), 'Authored content')
  await fs.writeFileText('/_import-index.md', `My notes\n${renderImportInventory([row])}\nKeep this footer`)
  await persistImportInventory(fs, [{ source: 'local:/second.txt', status: 'not imported' }])
  const current = (await fs.readFileText('/_import-index.md'))!
  assert.ok(current.startsWith('My notes\n')); assert.ok(current.endsWith('Keep this footer'))
  const racing: WorkspaceFs = { ...fs, writeFileText: async (path, text, options) => {
    await fs.writeFileText(path, current + '\nRacing notes'); return fs.writeFileText(path, text, options)
  } }
  await assert.rejects(persistImportInventory(racing, [{ source: 'local:/third.txt', status: 'not imported' }]), /changed in another tab/)
  assert.ok((await fs.readFileText('/_import-index.md'))!.endsWith('Racing notes'))
  assert.throws(() => readImportInventory(current.replace('| not imported |', '| imported |')), /edited/)
})

test('concurrent discovery sessions merge, encoded links stay valid, and size exhaustion preserves the last index', async () => {
  const fs = createMemoryWorkspaceFs()
  await Promise.all([persistImportInventory(fs, [{ source: `${source}/one`, status: 'not imported' }]), persistImportInventory(fs, [{ source: `${source}/two`, status: 'not imported' }])])
  assert.equal((await readWebsiteInventory(fs, source)).length, 2)
  const many = Array.from({ length: 627 }, (_, i) => ({ source: `${source}/item-${i}?label=a%20b`, status: 'not imported' as const }))
  await persistImportInventory(fs, many)
  const text = (await fs.readFileText(indexPath))!
  assert.ok(new TextEncoder().encode(text).byteLength < IMPORT_INDEX_MAX_BYTES)
  assert.ok(text.includes('label=a%20b>)'))
  assert.equal(readImportInventory(text).length, 629)
  await assert.rejects(persistImportInventory(fs, Array.from({ length: 2000 }, (_, i) => ({ source: `${source}/${'long-path-'.repeat(40)}${i}`, status: 'not imported' }))), /480 KiB/)
  assert.equal(await fs.readFileText(indexPath), text)
})

test('local host copies use the existing writer once per change and retry a failed copy without rewriting workspace content', async () => {
  const fs = createMemoryWorkspaceFs(), originalFetch = globalThis.fetch, originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const requests: Array<{ url: string; body: Record<string, unknown> }> = []
  let fail = true
  const fetcher = (async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    return new Response(JSON.stringify(fail ? { ok: false, error: 'Host unavailable' } : { ok: true }), { status: fail ? 503 : 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'localhost' }, fetch: fetcher } })
  globalThis.fetch = fetcher
  try {
    await assert.rejects(persistImportInventory(fs, [{ source, status: 'not imported' }]), /Host unavailable/)
    const saved = await fs.readFileText(indexPath)
    fail = false
    assert.equal(await persistImportInventory(fs), false)
    assert.equal(await fs.readFileText(indexPath), saved)
    assert.equal(await persistImportInventory(fs), false)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].url, '/__agentic_os_fs_reveal')
    assert.equal(requests[0].body.saveOnly, true)
    assert.deepEqual(requests[1].body.snapshot, { workspacePath: indexPath, text: saved })
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('grouped local media inputs retain links to their final saved sequence in file and folder imports', async () => {
  for (const mode of ['file', 'folder'] as const) {
    const fs = createMemoryWorkspaceFs()
    const inputs = ['first.mp4', 'second.mp4'].map(name => {
      const value = new File(['media'], name, { type: 'video/mp4' })
      if (mode === 'folder') Object.defineProperty(value, 'webkitRelativePath', { value: `media-set/${name}` })
      return value as unknown as globalThis.File
    })
    const result = mode === 'file' ? await importWorkspaceLocalFiles({ fs, files: inputs }) : await importWorkspaceLocalFolder({ fs, files: inputs })
    assert.equal(result.failed.length, 0)
    const rows = readImportInventory((await fs.readFileText(mode === 'file' ? '/_import-index.md' : '/media-set/_import-index.md'))!)
    assert.equal(rows.length, 2)
    for (const row of rows) {
      assert.equal(row.status, 'imported')
      assert.ok(row.outputs?.length)
      for (const output of row.outputs!) assert.ok(await fs.readFileText(output.path), 'index links to saved aggregate, never a pruned intermediate')
    }
    assert.equal(await persistImportInventory(fs), false)
  }
})
