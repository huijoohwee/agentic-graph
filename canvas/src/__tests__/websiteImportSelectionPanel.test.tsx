import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import WebsiteImportSelectionView from '@/features/source-files/WebsiteImportSelectionView'
import { chooseWebsiteImportPages, finishWebsiteImportSelection, useWebsiteImportSelectionSession } from '@/features/source-files/websiteImportSelectionSession'
import { sourceFileWebsiteUrl, projectWebsiteImportTree } from '@/features/source-files/websiteImportTreeProjection'
import { MarkdownWorkspaceSourceFilesList } from '@/features/markdown-workspace/MarkdownWorkspaceSourceFilesList'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MAIN_PANEL_TABS } from '@/features/panels/mainPanelTabs'

const sourceUrl = 'https://example.test/library/'
const sourceEntry = { path: '/imported.md', parentPath: '/', name: 'imported.md', kind: 'file' as const, updatedAtMs: 0, text: `---\nkgWebpageUrl: "${sourceUrl}"\n---\n# Imported` }
function SourceFilesHarness() {
  return <MarkdownWorkspaceSourceFilesList loading={false} loadError="" textSizeClass="text-xs" entries={[sourceEntry]} expandedPaths={new Set()} activePath={sourceEntry.path}
    toggleExpanded={() => {}} onSelectFile={() => {}} onSelectFolder={() => {}} sourcesByPath={{ [sourceEntry.path]: { kind: 'url', url: sourceUrl } }}
    onCreateNewFile={() => {}} onRevealInFinder={() => {}} onClearFile={() => {}} onRenameEntry={() => {}} onDeleteEntry={() => {}} />
}

test('one Source Files tree supports folder selection, collapse and read-only discovery', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), source = sourceUrl
  const requests: string[] = [], resolutions: Array<string[] | null> = []
  globalThis.fetch = (async url => {
    requests.push(String(url))
    return new Response(JSON.stringify({ ok: true, pages: [source, source + 'a', source + 'b'].map(url => ({ url, path: new URL(url).pathname })), limited: false }))
  }) as typeof fetch
  const checkbox = (label: string) => Array.from(host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')).find(input => input.getAttribute('aria-label') === label)!
  const control = (prefix: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label')?.startsWith(prefix))!
  try {
    await act(async () => { void chooseWebsiteImportPages(source, sourceEntry.path).then(urls => resolutions.push(urls)); root.render(<SourceFilesHarness />) })
    assert.equal(host.querySelector('[aria-label="Website page tree"]'), null, 'no separate discovery tree')
    assert.equal(host.querySelector('dialog'), null)
    assert.equal(control('Import selected').disabled, true)
    assert.equal(host.querySelectorAll('[aria-label="File imported.md"]').length, 2, 'row and button share one existing saved-file name')
    await act(async () => checkbox('Select discovered pages in /library').click())
    assert.equal(control('Import selected').getAttribute('aria-label'), 'Import selected (2) for imported.md')
    assert.equal(checkbox(`Select page ${source}`).checked, false)
    await act(async () => checkbox(`Select page ${source}b`).click())
    assert.equal(checkbox('Select discovered pages in /library').indeterminate, true)
    await act(async () => control('Collapse folder library').click())
    assert.equal(checkbox(`Select page ${source}a`), undefined)
    await act(async () => control('Expand folder library').click())
    assert.equal(checkbox(`Select page ${source}a`).checked, true)
    assert.deepEqual(resolutions, [])
    const session = useWebsiteImportSelectionSession.getState().session!
    const projected = projectWebsiteImportTree([sourceEntry], null, session)
    assert.ok(projected.pendingPaths.size)
    assert.equal(sourceEntry.text.endsWith('# Imported'), true, 'discovery does not rewrite saved files')
    const row = host.querySelector('section[aria-label="File imported.md"]')!
    const actions = Array.from(row.querySelectorAll('button'))
    assert.ok(actions.indexOf(control('Find pages linked from')) < actions.findIndex(button => button.hasAttribute('data-source-file-cloud-status')))
    assert.ok(actions.indexOf(control('Import selected')) < actions.findIndex(button => button.hasAttribute('data-source-file-cloud-status')))
    assert.ok(host.querySelector('button[aria-label="Import a before cloud sync"]')?.hasAttribute('disabled'))
    await act(async () => control('Import selected').click())
    assert.deepEqual(resolutions, [[source + 'a']])
    assert.deepEqual(requests.filter(url => url === '/__website_import/discover'), ['/__website_import/discover'])
    assert.equal(host.querySelector('input[aria-label^="Select page"]'), null, 'transient selection leaves with the session')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); host.remove(); globalThis.fetch = previousFetch; restore() }
})

test('cancel aborts pending discovery and never resolves an import selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  let signal: AbortSignal | undefined, resolution: string[] | null | undefined
  globalThis.fetch = ((_url, init) => { signal = init?.signal as AbortSignal; return new Promise<Response>(() => {}) }) as typeof fetch
  const host = document.createElement('section'), root = createRoot(host)
  try {
    await act(async () => { void chooseWebsiteImportPages('https://example.test/library/').then(urls => { resolution = urls }); root.render(<WebsiteImportSelectionView />) })
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-label') === 'Cancel import selection')!.click())
    assert.equal(resolution, null)
    assert.equal(signal?.aborted, true)
    assert.ok(host.querySelector('input[type=url]'))
    await act(async () => root.unmount())
  } finally { finishWebsiteImportSelection(null); globalThis.fetch = previousFetch; restore() }
})


test('Import URL opens Source Files and retires the MainPanel route', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  assert.equal(MAIN_PANEL_TABS.some(tab => String(tab.key) === 'websiteImport'), false)
  let sourceFilesOpened = 0, mainPanelOpened = 0
  const sourceListener = () => { sourceFilesOpened += 1 }, mainListener = () => { mainPanelOpened += 1 }
  window.addEventListener('kg:markdown-explorer:open-source-files', sourceListener)
  window.addEventListener('kg:mainPanelOpen', mainListener)
  globalThis.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
  const previousView = useGraphStore.getState().workspaceViewMode
  try {
    const old = chooseWebsiteImportPages('https://example.test/first/')
    assert.equal(sourceFilesOpened, 1)
    assert.equal(mainPanelOpened, 0)
    assert.equal(useGraphStore.getState().workspaceViewMode, 'editor')
    const next = chooseWebsiteImportPages('https://example.test/next/')
    assert.equal(await old, null, 'replacement settles the previous pending selection')
    finishWebsiteImportSelection(null)
    assert.equal(await next, null)
  } finally {
    finishWebsiteImportSelection(null); globalThis.fetch = previousFetch
    window.removeEventListener('kg:markdown-explorer:open-source-files', sourceListener)
    window.removeEventListener('kg:mainPanelOpen', mainListener)
    useGraphStore.setState({ workspaceViewMode: previousView }); restore()
  }
})

test('file row imports only its selected pages through the existing workspace bridge', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const url = 'https://example.test/library/', path = '/imported.md'
  const entry = { path, parentPath: '/', name: 'imported.md', kind: 'file' as const, updatedAtMs: 0, text: `---\nkgWebpageUrl: "${url}"\n---\n# Imported` }
  const imported: unknown[] = [], requests: string[] = []
  let importedResolve!: () => void
  const importedReady = new Promise<void>(resolve => { importedResolve = resolve })
  globalThis.fetch = (async target => {
    requests.push(String(target))
    return new Response(JSON.stringify({ ok: true, pages: [{ url: url + 'one', path: '/library/one' }], limited: false }))
  }) as typeof fetch
  const unregister = registerMarkdownWorkspaceActionBridge('test-source-files-import', { importWebsite: async (root, opts) => { imported.push({ root, selectedUrls: opts?.selectedUrls }); importedResolve(); return { handled: true } } })
  const host = document.createElement('section'), root = createRoot(host)
  const control = (prefix: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label')?.startsWith(prefix))!
  try {
    assert.equal(sourceFileWebsiteUrl(entry), url)
    assert.equal(sourceFileWebsiteUrl({ ...entry, text: '---\nkgWebpageUrl: "javascript:alert(1)"\n---' }), null)
    await act(async () => root.render(<SourceFilesHarness />))
    assert.equal(control('Import selected').disabled, true)
    await act(async () => control('Find pages linked from').click())
    assert.deepEqual(imported, [])
    assert.equal(host.querySelectorAll('button[aria-label^="Import selected"]').length, 1, 'the shared tree has only the source-row confirmation')
    await act(async () => (host.querySelector('input[aria-label="Select page https://example.test/library/one"]') as HTMLInputElement).click())
    assert.equal(control('Import selected').disabled, false)
    await act(async () => { control('Import selected').click(); await importedReady })
    assert.deepEqual(imported, [{ root: url, selectedUrls: [url + 'one'] }])
    assert.deepEqual(requests, ['/__website_import/discover'])
    assert.equal(control('Import selected').disabled, true)
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); unregister(); globalThis.fetch = previousFetch; restore() }
})

test('discovery keeps the clicked source when generated siblings share its URL', () => {
  const sibling = { ...sourceEntry, path: '/sitemap.md', name: 'sitemap.md' }
  const session = { id: 1, url: sourceUrl, sourcePath: sourceEntry.path, pages: [{ url: sourceUrl, path: '/library/' }, { url: sourceUrl + 'new', path: '/library/new' }], selected: new Set<string>(), visited: new Set<string>(), busy: false, error: '', limited: false, query: '' }
  const projection = projectWebsiteImportTree([sourceEntry, sibling], null, session)
  assert.equal(projection.ownerPath, sourceEntry.path)
  assert.equal(projection.pageUrls.get(sourceEntry.path), sourceUrl)
  assert.equal(projection.pageUrls.has(sibling.path), false)
  assert.equal(projection.entries.filter(entry => entry.path === sourceEntry.path).length, 1)
  assert.equal(projection.pendingPaths.has(sourceEntry.path), false)
})
