import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness, settleDiscovery } from '@/tests/lib/importInventoryHarness'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { MarkdownWorkspaceSourceFilesList } from '@/features/markdown-workspace/MarkdownWorkspaceSourceFilesList'
import { SourceFileWebsiteActions } from '@/features/source-files/SourceFileWebsiteActions'
import { websiteFolderSources, projectWebsiteImportTree } from '@/features/source-files/websiteImportTreeProjection'
import { finishWebsiteImportSelection, importSelectedWebsiteFolderPages, useWebsiteImportSelectionSession } from '@/features/source-files/websiteImportSelectionSession'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'

const url = 'https://example.test/library/'
const folder: WorkspaceEntry = { kind: 'folder', name: 'websites', path: '/websites', parentPath: '/', updatedAtMs: 0 }
const source = (path: string, target = url): WorkspaceEntry => ({ kind: 'file', name: path.split('/').pop()!, path,
  parentPath: path.slice(0, path.lastIndexOf('/')), updatedAtMs: 0, text: `---\nkgWebpageUrl: "${target}"\n---\n# Saved source` })

function Harness({ entries }: { entries: WorkspaceEntry[] }) {
  return <MarkdownWorkspaceSourceFilesList entries={entries} loading={false} loadError="" textSizeClass="text-xs" activePath={null}
    sourcesByPath={null} expandedPaths={new Set(['/websites'])} toggleExpanded={() => {}} onSelectFile={() => {}}
    onSelectFolder={() => {}} onCreateNewFile={() => {}} onRevealInFinder={() => {}} onClearFile={() => {}}
    onRenameEntry={() => {}} onDeleteEntry={() => {}} />
}
const button = (label: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
async function openFolderActions(host: HTMLElement) {
  const row = host.querySelector('section[aria-label="Folder websites"]')!
  const name = (row.querySelector<HTMLButtonElement>('button[aria-label="Folder websites"]') ?? row.querySelector<HTMLButtonElement>('button[aria-label="Collapse folder websites"]'))!
  await act(async () => name.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })))
}

test('folder sources use descendant metadata, deduplicate URLs and reject sibling-prefix and unsafe targets', () => {
  assert.deepEqual(websiteFolderSources([folder, source('/websites/a.md'), source('/websites/copy.md'),
    source('/websites-other/b.md', 'https://other.test/'), source('/websites/bad.md', 'javascript:alert(1)')], null, '/websites'),
  [{ url, path: '/websites/a.md' }])
})

test('folder import covers selected inventory beyond pagination and filtering without exposing sibling URLs', () => {
  const pages = Array.from({ length: 120 }, (_, index) => ({ url: `${url}${index}`, path: `/library/${index}` }))
  const sibling = source('/elsewhere/other.md', url + 'other')
  const projection = projectWebsiteImportTree([folder, source('/websites/library.md'), sibling], null,
    { id: 1, url, sourcePath: '/websites/library.md', pages: [...pages, { url: url + 'other', path: '/library/other' }],
      selected: new Set(pages.map(page => page.url)), visited: new Set(), busy: false, error: '', limited: false, query: '119', visibleCount: 1 })
  assert.equal(projection.selectionUrls.get('/websites')?.length, 1)
  assert.deepEqual(projection.folderImportUrls.get('/websites'), pages.map(page => page.url))
  assert.deepEqual(projection.folderImportUrls.get('/elsewhere'), [url + 'other'])
  const duplicate = projectWebsiteImportTree([source('/websites/a.md'), source('/saved/a.md')], null,
    { id: 2, url, pages: [{ url, path: '/library/' }], selected: new Set([url]), visited: new Set(), busy: false, error: '', limited: false, query: '' })
  assert.deepEqual(duplicate.folderImportUrls.get('/websites'), [url])
  assert.deepEqual(duplicate.folderImportUrls.get('/saved'), [url], 'every saved copy belongs to its actual containing folder')
})

test('idle folder Import starts discovery and confirms actual selected descendant pages', async () => {
  const { restore } = await initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), requests: unknown[] = [], imported: unknown[] = []
  let importedResolve!: () => void
  const importedReady = new Promise<void>(resolve => { importedResolve = resolve })
  globalThis.fetch = (async (target, options) => {
    requests.push({ target, body: JSON.parse(String(options?.body)) })
    return new Response(JSON.stringify({ ok: true, pages: [{ url, path: '/library/' }, { url: url + 'one', path: '/library/one' }], limited: false }))
  }) as typeof fetch
  const unregister = registerMarkdownWorkspaceActionBridge('folder-import-test', { importWebsite: async (root, options) => {
    imported.push({ root, selectedUrls: options?.selectedUrls }); importedResolve(); return { handled: true }
  } })
  try {
    await act(async () => root.render(<Harness entries={[folder, source('/websites/library.md')]} />))
    await openFolderActions(host)
    assert.equal(button('Choose pages to import in websites').disabled, false)
    await act(async () => button('Choose pages to import in websites').click())
    await settleDiscovery()
    assert.equal(requests.length, 1)
    assert.deepEqual(imported, [], 'discovery alone does not write pages')
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 2)
    await openFolderActions(host)
    assert.equal(button('Import selected (2) in websites').disabled, false)
    await act(async () => { button('Import selected (2) in websites').click(); await importedReady })
    assert.deepEqual(imported, [{ root: url, selectedUrls: [url, url + 'one'] }])
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 0)
    assert.equal(button('Select pages to import in websites').disabled, false, 'folder can resume after completion')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); unregister(); globalThis.fetch = previousFetch; restore() }
})

test('multiple saved sources require choosing a URL before discovery', async () => {
  const { restore } = await initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), requests: Array<{ rootUrl: string; url: string }> = []
  globalThis.fetch = (async (_target, options) => {
    requests.push(JSON.parse(String(options?.body)))
    return new Response(JSON.stringify({ ok: true, pages: [], limited: false }))
  }) as typeof fetch
  try {
    await act(async () => root.render(<Harness entries={[folder, source('/websites/a.md'), source('/websites/b.md', 'https://second.test/')]} />))
    await openFolderActions(host)
    await act(async () => button('Choose pages to import in websites').click())
    assert.equal(requests.length, 0, 'no first-source guess')
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Website source in websites"]')!
    assert.equal(select.options.length, 2)
    await act(async () => { select.value = '/websites/b.md'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
    await act(async () => Array.from(document.querySelectorAll('button')).find(item => item.textContent === 'Find pages to import')!.click())
    await settleDiscovery()
    assert.equal(requests[0].rootUrl, 'https://second.test/')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); globalThis.fetch = previousFetch; restore() }
})

test('folder confirmation preserves outside selections, retries failure, and rejects stale or concurrent calls', async () => {
  const { restore } = await initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), urls = [url + 'inside', url + 'outside'], calls: string[][] = []
  let fail = true, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const unregister = registerMarkdownWorkspaceActionBridge('folder-partial-test', { importWebsite: async (_root, options) => {
    calls.push(options?.selectedUrls || []); if (fail) throw new Error('Capture failed'); await gate; return { handled: true }
  } })
  try {
    useWebsiteImportSelectionSession.setState({ session: { id: 701, url, pages: urls.map(url => ({ url, path: new URL(url).pathname })),
      selected: new Set(urls), visited: new Set(), busy: false, error: '', limited: false, query: '' } })
    await act(async () => root.render(<SourceFileWebsiteActions entry={folder} discoveryContext folderPageUrls={[urls[0]]} />))
    assert.equal(button('Import selected (1) in websites').disabled, false)
    await act(async () => { await assert.rejects(importSelectedWebsiteFolderPages(701, [urls[0]]), /Capture failed/) })
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], urls)
    fail = false
    await act(async () => {
      const pending = importSelectedWebsiteFolderPages(701, [urls[0]])
      await importSelectedWebsiteFolderPages(701, [urls[0]])
      await importSelectedWebsiteFolderPages(700, [urls[0]])
      release(); await pending
    })
    assert.equal(calls.length, 2)
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], [urls[1]])
    await importSelectedWebsiteFolderPages(701, [urls[0]])
    assert.equal(calls.length, 2, 'unselected pages cannot be reimported by stale folder actions')
  } finally { release(); await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); unregister(); restore() }
})
