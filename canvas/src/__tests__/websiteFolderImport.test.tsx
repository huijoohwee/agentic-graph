import { repairCapturedMarkdownTables } from '@/features/markdown-workspace/workspaceImport/repairCapturedMarkdownTables'
import { useWorkspaceMutationActions } from '@/features/markdown-workspace/useWorkspaceFileActions/mutationActions'
import { createMemoryWorkspaceFs } from '@/features/workspace-fs/workspaceFsMemory'
import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness, settleDiscovery, waitForImportCondition } from '@/tests/lib/importInventoryHarness'
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
    const select = document.querySelector<HTMLButtonElement>('button[data-kg-select][aria-label="Website source in websites"]')!
    await act(async () => { select.click(); await new Promise(resolve => setTimeout(resolve, 35)) })
    const menu = document.querySelector('menu[aria-label="Website source in websites"]')!
    const options = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
    assert.equal(options.length, 2)
    await act(async () => options.find(option => option.value === '/websites/b.md')!.click())
    assert.equal(select.getAttribute('data-value'), '/websites/b.md')
    assert.equal(select.getAttribute('aria-expanded'), 'false')
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

const header = '| Field | Unit |', separator = '| --- | --- |'
const rows = ['| Rate | Hz |', '| Duration | s |']
const original = [header, separator, ...rows].join('\n')
const meta = '---\r\ncustom: "authored | metadata"\r\n---\r\n'

test('repair inserts only structure, preserving local rows, metadata, fences, line endings and the final newline choice', () => {
  const saved = '# Measurements\n\n' + original
  const edited = ['# Measurements', '', '~~~', header, ...rows, '~~~', '', 'My notes.', '', header, '| Rate | local \\| unit |', rows[1]].join('\r\n')
  const broken = meta + edited
  const expected = broken.replace('My notes.\r\n\r\n' + header, 'My notes.\r\n\r\n' + header + '\r\n' + separator)
  const result = repairCapturedMarkdownTables(broken, saved)
  assert.deepEqual(result, { text: expected, repaired: 1, unresolved: 0, codeFences: 0 })
  assert.deepEqual(repairCapturedMarkdownTables(expected, saved), { text: expected, repaired: 0, unresolved: 0, codeFences: 0 })
})

test('captured languages repair matching legacy fences without changing authored bytes', () => {
  const source = '# Example\n\n~~~c++\n  int n;\n~~~\n'
  const local = meta + '# Example\r\n\r\nMy note.\r\n\r\nc++\r\n\r\n~~~~\r\n  int n;\r\n~~~~'
  const expected = local.replace('c++\r\n\r\n~~~~', '~~~~c++')
  assert.equal(repairCapturedMarkdownTables(local, source).text, expected)
  assert.equal(repairCapturedMarkdownTables(expected, source).codeFences, 0)
  for (const captured of [source + source, source.replace('  int n;', '  int edited;'), source.replace('~~~c++', 'c++\n\n~~~c++')]) {
    assert.equal(repairCapturedMarkdownTables(local, captured).text, local)
  }
})

test('restores missing column headers, keeps renamed headers and never recreates a deleted or ambiguous table', () => {
  for (const [damaged, expected] of [
    [rows.join('\n'), original], [[separator, ...rows].join('\n'), original],
    [['| Metric | Units |', ...rows].join('\n'), original.replace(header, '| Metric | Units |')],
    [header, header + '\n' + separator],
  ]) assert.equal(repairCapturedMarkdownTables(damaged!, original).text, expected)
  for (const local of ['My replacement', ['```text', header, ...rows, '```'].join('\n'),
    [header, ...rows, '', header, ...rows].join('\n')]) {
    assert.deepEqual(repairCapturedMarkdownTables(local, original), { text: local, repaired: 0, unresolved: 1, codeFences: 0 })
  }
})

test('checked saved pages repair from their own captures, leave other files alone and protect concurrently edited files', async () => {
  const { restore } = await initJsdomHarness()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), previousFetch = globalThis.fetch
  const ids = ['first', 'second', 'unselected', 'race', 'dirty', 'missing']
  const source = (id: string) => new URL(id, document.baseURI).href
  const body = '# Measurements\n\nLocal introduction.\n\n' + [header, rows[0], '| Duration | edited locally |'].join('\n')
  const page = (id: string) => '---\ncustom: "keep exactly"\nkgWebpageUrl: "' + source(id) + '"\nkgWebsiteImportId: "batch"\nkgWebsiteNodeId: "' + id + '"\n---\n\n' + body
  const entries = ids.map(id => ({ path: '/' + id + '.md', name: id + '.md', parentPath: '/', kind: 'file' as const, updatedAtMs: 1, text: page(id) }))
  const fs = createMemoryWorkspaceFs({ initialEntries: entries })
  let dirtyPath: string | null = null
  let actions!: ReturnType<typeof useWorkspaceMutationActions>
  const requests: string[] = [], failures: string[] = [], checked: string[] = []
  const html = '<main><h1>Measurements</h1><table><tr><th>Field</th><th>Unit</th></tr><tr><td>Rate</td><td>Hz</td></tr><tr><td>Duration</td><td>s</td></tr></table></main>'
  globalThis.fetch = async input => {
    const url = new URL(String(input), document.baseURI)
    assert.equal(url.searchParams.get('kind'), 'rawHtml', 'only the saved raw HTML should be read')
    const id = url.searchParams.get('nodeId')!
    requests.push(id)
    if (id === 'race') await fs.writeFileText('/race.md', page('race') + '\nconcurrent edit')
    return id === 'missing' ? new Response('', { status: 404 }) : new Response(html)
  }
  function Harness({ filtered = false } = {}) {
    actions = useWorkspaceMutationActions({ core: { status: { setStatusInfo() {}, setStatusError() {}, setStatusProgress() {},
      setStatusWarning() {}, clearStatus() {}, buildWebpageImportStageLabel: () => '' } },
      ctx: { getFs: async () => fs, refresh: async () => ({ entries, sourcesByPath: {} }), openedPath: null, selectionPath: null,
        selectionEntryKind: null, activeDocumentKey: '', getOpenEditor: () => ({ path: dirtyPath, dirty: !!dirtyPath }),
        setActiveText() {}, setEntries() {}, lastLoadedRef: React.useRef(null), setActiveMarkdownDocument: async () => true,
        setActivePathSafe() {}, setSelectionPathSafe() {} } })
    return <MarkdownWorkspaceSourceFilesList loading={false} loadError="" textSizeClass="" allEntries={entries} entries={filtered ? entries.slice(0, 1) : entries}
      expandedPaths={new Set()} activePath={null} sourcesByPath={{}} toggleExpanded={() => {}} onSelectFile={() => {}}
      onCreateNewFile={() => {}} onSelectFolder={() => {}} onRevealInFinder={() => {}} onClearFile={() => {}} onRenameEntry={() => {}} onDeleteEntry={() => {}}
      onRefreshFileFromSource={async (path, url, options) => {
        const success = await actions.refreshFileFromSource(path, url, options)
        if (success) checked.push(path)
        return success
      }} />
  }
  const click = async (label: string) => {
    const element = [...host.querySelectorAll<HTMLElement>('[aria-label]')].find(el => el.getAttribute('aria-label') === label)
    assert.ok(element, label); await act(async () => element.click())
  }
  const repair = (id: string) => actions.refreshFileFromSource('/' + id + '.md', undefined, {
    repairTablesFromCapture: true, silent: true, onFailure: error => failures.push(error.message),
  })
  try {
    await act(async () => root.render(<Harness />))
    await click('Select saved pages for Markdown repair')
    for (const id of ['first', 'second']) await click('Select saved page /' + id + '.md for Markdown repair')
    await click('Repair Markdown in 2 selected saved pages')
    for (let i = 0; i < 80 && !(await fs.readFileText('/second.md'))?.includes(separator); i++)
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    for (const id of ['first', 'second']) assert.equal(await fs.readFileText('/' + id + '.md'), page(id).replace(header, header + '\n' + separator))
    assert.deepEqual(requests.sort(), ['first', 'second'])
    assert.equal(await fs.readFileText('/unselected.md'), page('unselected'))
    await click('Exit saved page selection')
    // The existing discovery selection can include hidden saved pages and unsaved results.
    const selected = ['first', 'second', 'pending'].map(source)
    await act(async () => {
      useWebsiteImportSelectionSession.setState({ session: { id: 1, url: source('first'), pages: selected.map(url => ({ url, path: new URL(url).pathname })),
        selected: new Set(selected), visited: new Set(), busy: false, error: '', limited: false, query: 'first' } })
      root.render(<Harness filtered />)
    })
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="File first.md"]')!.dispatchEvent(
      new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true })))
    const refreshSelected = document.querySelector<HTMLButtonElement>('button[aria-label="Refresh 2 selected saved pages from saved HTML"]')
    assert.ok(refreshSelected && !refreshSelected.disabled)
    await act(async () => refreshSelected.click())
    await waitForImportCondition(() => checked.length === 4)
    assert.deepEqual(checked.slice(2).sort(), ['/first.md', '/second.md'])
    assert.deepEqual(requests.sort(), ['first', 'second'], 'a second refresh can reuse the saved artifacts')
    assert.equal(await repair('race'), false)
    assert.equal(await fs.readFileText('/race.md'), page('race') + '\nconcurrent edit')
    dirtyPath = '/dirty.md'
    assert.equal(await repair('dirty'), false)
    assert.ok(!requests.includes('dirty'))
    assert.equal(await repair('missing'), false)
    assert.equal(await fs.readFileText('/missing.md'), page('missing'))
    assert.equal(failures.length, 3)
  } finally { await act(async () => root.unmount()); host.remove(); useWebsiteImportSelectionSession.setState({ session: null }); globalThis.fetch = previousFetch; restore() }
})
