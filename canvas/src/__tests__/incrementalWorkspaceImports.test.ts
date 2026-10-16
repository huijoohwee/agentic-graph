import test from 'node:test'
import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import { importWorkspaceLocalFiles, importWorkspaceLocalFolder } from '@/features/markdown-workspace/workspaceImport/localImport'
import { importWorkspaceUrl } from '@/features/markdown-workspace/workspaceImport/urlImport'
import { importContentDigest, loadWorkspaceSourceIndex, setWorkspaceEntrySource } from '@/features/workspace-fs/sourceIndex'
import { runWorkspaceWebsiteImport } from '@/features/markdown-workspace/useWorkspaceFileActions/websiteImportAction'
import { refreshIndexedSource } from '@/features/markdown-workspace/workspaceImport/refreshIndexedSource'
import { clearPendingLocalImport, hydrateWorkspaceFileFromPendingLocalImport } from '@/features/markdown-workspace/workspaceImport/pendingLocalImport'
import { findSavedUrlImport, recordUrlImport } from '@/features/markdown-workspace/workspaceImport/incrementalImport'

function selectedFile(name: string, text: string, relative?: string): globalThis.File {
  const file = new File([text], name, { type: 'text/markdown', lastModified: 1 })
  if (relative) Object.defineProperty(file, 'webkitRelativePath', { value: relative })
  return file as unknown as globalThis.File
}
function countedFs() {
  const fs = createMemoryWorkspaceFs(); let writes = 0
  return { fs: { ...fs,
    createFile: async (args: Parameters<typeof fs.createFile>[0]) => { if (args.name !== '_import-index.md') writes++; return fs.createFile(args) },
    writeFileText: async (...args: Parameters<typeof fs.writeFileText>) => { if (!args[0].endsWith('/_import-index.md')) writes++; return fs.writeFileText(...args) },
  }, writes: () => writes }
}

test('files reuse input bytes, update same-size changed content in place and preserve local edits', async () => {
  const { fs, writes } = countedFs()
  const run = (text: string) => importWorkspaceLocalFiles({ fs, files: [selectedFile('incremental-file.md', text)] })
  const first = await run('first'); assert.equal(first.failed.length, 0)
  const count = writes(), path = first.createdPaths[0]
  const repeated = await run('first'); assert.equal(repeated.failed.length, 0); assert.deepEqual(repeated.createdPaths, [path]); assert.equal(writes(), count)
  const changed = await run('other'); assert.equal(changed.failed.length, 0); assert.deepEqual(changed.createdPaths, [path]); assert.equal(await fs.readFileText(path), 'other')
  await fs.writeFileText(path, 'my notes')
  const conflict = await run('third'); assert.equal(conflict.failed.length, 1); assert.equal(await fs.readFileText(path), 'my notes')
  assert.equal(loadWorkspaceSourceIndex()[path].importState?.identity, `local:${path}`)
})

test('folders retain paths, reuse unchanged files, and change only the changed member', async () => {
  const { fs, writes } = countedFs()
  const run = (text: string) => importWorkspaceLocalFolder({ fs, files: [selectedFile('a.ts', text, 'incremental-folder/a.ts'), selectedFile('b.ts', 'stable', 'incremental-folder/nested/b.ts')] })
  const first = await run('alpha'); assert.deepEqual(first.failed, [])
  const count = writes(); const repeated = await run('alpha'); assert.deepEqual(repeated.failed, []); assert.equal(writes(), count)
  const changed = await run('bravo'); assert.deepEqual(changed.failed, []); assert.equal(writes(), count + 1)
  assert.deepEqual(changed.createdPaths, first.createdPaths)
  assert.equal(await fs.readFileText('/incremental-folder/a.ts'), 'bravo')
  assert.equal((await fs.listEntries()).filter(entry => entry.kind === 'file' && entry.path.startsWith('/incremental-folder/') && entry.name !== '_import-index.md').length, 2)
})

test('saved URL and selected website pages are reused without fetch, conversion or new files', async () => {
  const { fs, writes } = countedFs(), url = 'https://example.invalid/reference/entry'
  await fs.createFolder({ parentPath: '/', name: 'websites' })
  const path = await fs.createFile({ parentPath: '/websites', name: 'saved.md', text: `---\nkgWebpageUrl: "${url}"\n---\nSaved article` })
  const before = writes()
  const result = await importWorkspaceUrl({ fs, urlRaw: url, fetchUrlContent: async () => { throw new Error('must not fetch') } })
  assert.deepEqual(result.createdPaths, [path]); assert.equal(writes(), before)
  await fs.createFolder({ parentPath: '/websites', name: 'example.invalid' })
  await fs.createFolder({ parentPath: '/websites/example.invalid', name: 'reference' })
  const canonicalPath = await fs.createFile({ parentPath: '/websites/example.invalid/reference', name: 'entry.md', text: `---\nkgWebpageUrl: "${url}"\n---\nCurrent saved article` })
  const withCanonical = writes()
  const preferred = await importWorkspaceUrl({ fs, urlRaw: url, fetchUrlContent: async () => { throw new Error('must not fetch') } })
  assert.deepEqual(preferred.createdPaths, [canonicalPath]); assert.equal(writes(), withCanonical)
  assert.ok(await fs.readFileText(path), 'historical copy stays intact')
  const crawl = await runWorkspaceWebsiteImport({ url, opts: { selectedUrls: [url] }, getFs: async () => fs, importJobRef: { current: 1 }, jobId: 1, status: { setStatusProgress() {} } })
  assert.deepEqual(crawl.createdPaths, [canonicalPath]); assert.equal(crawl.websiteImportManifest, undefined, 'reuse must not invent a crawl receipt')
  assert.equal(writes(), withCanonical)
})

test('deferred folders reconnect selected files, retain hydrated receipts and restore missing output', async () => {
  const { fs, writes } = countedFs()
  const run = () => importWorkspaceLocalFolder({ fs, files: [selectedFile('note.md', 'Saved note', 'deferred-folder/note.md')] })
  const first = await run(), path = first.createdPaths[0]
  assert.deepEqual(first.failed, [])
  clearPendingLocalImport(path)
  assert.deepEqual((await run()).createdPaths, [path])
  assert.equal((await hydrateWorkspaceFileFromPendingLocalImport({ fs, path }))?.text, 'Saved note')
  const count = writes()
  assert.deepEqual((await run()).failed, []); assert.equal(writes(), count)
  await fs.deleteEntry(path)
  assert.deepEqual((await run()).createdPaths, [path])
  assert.equal((await hydrateWorkspaceFileFromPendingLocalImport({ fs, path }))?.text, 'Saved note')
})

test('saved URL acceptance skips an earlier candidate without deleting it or changing generic reuse', async () => {
  const { fs, writes } = countedFs(), url = 'https://example.invalid/accepted-source'
  const earlier = await fs.createFile({ parentPath: '/', name: 'a-saved.md', text: 'Retained earlier source' })
  const later = await fs.createFile({ parentPath: '/', name: 'z-saved.md', text: 'Accepted later source' })
  await recordUrlImport(fs, earlier, url); await recordUrlImport(fs, later, url)
  const before = writes()
  const selected = await findSavedUrlImport(fs, url, async saved => saved.path === later)
  assert.equal(selected?.path, later)
  assert.equal((await findSavedUrlImport(fs, url))?.path, earlier)
  assert.equal(await fs.readFileText(earlier), 'Retained earlier source'); assert.equal(writes(), before)
  const decoyUrl = 'https://example.invalid/body-marker'
  const decoy = await fs.createFile({ parentPath: '/', name: 'body-marker.md',
    text: `---\nkgWebpageUrl: "${decoyUrl}"\n---\nkgVideoAgentImport: true\n${'漢'.repeat(180_000)}` })
  const beforeDecoy = writes()
  const generic = await importWorkspaceUrl({ fs, urlRaw: decoyUrl, fetchUrlContent: async () => { throw new Error('generic source must not fetch') } })
  assert.deepEqual(generic.createdPaths, [decoy]); assert.equal(writes(), beforeDecoy)
})

test('source refresh sends validators, skips writes on unchanged data and preserves racing edits', async () => {
  const { fs, writes } = countedFs(), url = 'https://example.invalid/refresh', path = '/incremental-refresh.md'
  const original = `---\nkgWebpageUrl: "${url}"\n---\nSaved content\n`
  await fs.createFile({ parentPath: '/', name: path.slice(1), text: original })
  const digest = await importContentDigest('upstream')
  setWorkspaceEntrySource(path, { kind: 'url', url, importState: { identity: `url:${url}`, inputDigest: digest, outputDigest: await importContentDigest(original), checkedAt: 1, status: 'imported', etag: '"one"' } })
  const oldFetch = globalThis.fetch, before = writes()
  try {
    globalThis.fetch = (async (_url, options) => {
      assert.equal(JSON.parse(String(options?.body)).options.etag, '"one"')
      return new Response(JSON.stringify({ ok: true, unchanged: true, digest, etag: '"one"', checkedAt: Date.now() }))
    }) as typeof fetch
    assert.equal((await refreshIndexedSource(fs, path, url, { mirrorToHost: false })).unchanged, true); assert.equal(writes(), before)
    globalThis.fetch = (async () => { await fs.writeFileText(path, 'racing edit'); return new Response(JSON.stringify({ ok: true, unchanged: false, digest, text: 'new text', contentType: 'text/plain', checkedAt: Date.now() })) }) as typeof fetch
    await assert.rejects(refreshIndexedSource(fs, path, url, { mirrorToHost: false }), /changed while/)
    assert.equal(await fs.readFileText(path), 'racing edit')
  } finally { globalThis.fetch = oldFetch }
})

test('changed deferred bytes replace the input receipt even when the placeholder stays identical', async () => {
  const { fs } = countedFs(), path = '/pending-change/note.md'
  const run = (text: string) => importWorkspaceLocalFolder({ fs, files: [selectedFile('note.md', text, 'pending-change/note.md')] })
  await run('first'); await run('other')
  assert.equal((await hydrateWorkspaceFileFromPendingLocalImport({ fs, path }))?.text, 'other')
  assert.deepEqual((await run('first')).failed, [])
  assert.equal((await hydrateWorkspaceFileFromPendingLocalImport({ fs, path }))?.text, 'first')
  assert.equal(await fs.readFileText(path), 'first')
})
