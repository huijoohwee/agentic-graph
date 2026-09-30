import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import WebsiteImportSelectionView from '@/features/source-files/WebsiteImportSelectionView'
import { chooseWebsiteImportPages, finishWebsiteImportSelection, useWebsiteImportSelectionSession, visibleWebsiteSelectionPages, showMoreWebsiteSelectionPages, setWebsiteSelectionQuery, toggleWebsiteSelection, importWebsiteFromSourceFiles, confirmRestoredWebsiteSelection } from '@/features/source-files/websiteImportSelectionSession'
import { sourceFileWebsiteUrl, projectWebsiteImportTree } from '@/features/source-files/websiteImportTreeProjection'
import { MarkdownWorkspaceSourceFilesList } from '@/features/markdown-workspace/MarkdownWorkspaceSourceFilesList'
import { ExplorerSearchControl } from '@/features/markdown-workspace/ExplorerSearchControl'
import { registerMarkdownWorkspaceActionBridge } from '@/features/markdown-explorer/workspaceActionBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { MAIN_PANEL_TABS } from '@/features/panels/mainPanelTabs'

const sourceUrl = 'https://example.test/library/'
const sourceEntry = { path: '/imported.md', parentPath: '/', name: 'imported.md', kind: 'file' as const, updatedAtMs: 0, text: `---\nkgWebpageUrl: "${sourceUrl}"\n---\n# Imported` }
function SourceFilesHarness() {
  const [search, setSearch] = React.useState('saved search')
  return <><ExplorerSearchControl search={search} setSearch={setSearch} panelTextClass="text-xs" /><MarkdownWorkspaceSourceFilesList loading={false} loadError="" textSizeClass="text-xs" entries={[sourceEntry]} expandedPaths={new Set()} activePath={sourceEntry.path}
    toggleExpanded={() => {}} onSelectFile={() => {}} onSelectFolder={() => {}} sourcesByPath={{ [sourceEntry.path]: { kind: 'url', url: sourceUrl } }}
    onCreateNewFile={() => {}} onRevealInFinder={() => {}} onClearFile={() => {}} onRenameEntry={() => {}} onDeleteEntry={() => {}} /></>
}

test('idle URL import still has its explicit form', async () => {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section'), root = createRoot(host)
  try {
    await act(async () => root.render(<WebsiteImportSelectionView />))
    assert.ok(host.querySelector('section[aria-label="Import website URL"] input[type=url]'))
  } finally { await act(async () => root.unmount()); restore() }
})

test('idle Source Files checkbox discovers selected website pages before swapping tree icons', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'), root = createRoot(host)
  const requests: string[] = []
  globalThis.fetch = (async target => {
    requests.push(String(target))
    return new Response(JSON.stringify({ ok: true, pages: [{ url: sourceUrl, path: '/library/' }, { url: sourceUrl + 'one', path: '/library/one' }], limited: false }))
  }) as typeof fetch
  try {
    await act(async () => root.render(<SourceFilesHarness />))
    const first = host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')!
    assert.ok(first && !first.disabled, 'selected website file exposes a usable first checkbox while idle')
    assert.ok(host.querySelector('section[aria-label="File imported.md"] button[aria-label="Select file imported.md"]'), 'idle file icon remains until the checkbox is checked')
    await act(async () => first.click())
    assert.deepEqual(requests, ['/__website_import/discover'])
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 2)
    assert.equal(host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')?.checked, true)
    assert.ok(host.querySelector('section[aria-label="File imported.md"] input[type=checkbox]'), 'checking the first box replaces the source file icon')
    assert.equal(host.querySelector<HTMLInputElement>('input[aria-label="Folder .workspace is outside this website import"]')?.disabled, true, 'unrelated local rows cannot join page import')
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')!.click())
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 0)
    assert.ok(host.querySelector('section[aria-label="File imported.md"] button[aria-label="Select file imported.md"]'), 'unchecking restores the file icon')
    assert.ok(host.querySelector('input[aria-label="Select all visible pages"]'), 'the first checkbox remains available for reselection')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); globalThis.fetch = previousFetch; restore() }
})

test('first checkbox retries an empty discovery without losing the selected website source', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'), root = createRoot(host)
  let requests = 0
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, pages: ++requests === 1 ? [] : [{ url: sourceUrl, path: '/library/' }], limited: false }))) as typeof fetch
  try {
    await act(async () => root.render(<SourceFilesHarness />))
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')!.click())
    assert.equal(requests, 1)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 0)
    assert.match(host.textContent || '', /No linked pages were found/)
    assert.equal(host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')?.disabled, false, 'empty discovery remains retryable after restart or failure')
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="Select all visible pages"]')!.click())
    assert.equal(requests, 2)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.has(sourceUrl), true)
    assert.ok(host.querySelector('section[aria-label="File imported.md"] input[type=checkbox]'))
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); globalThis.fetch = previousFetch; restore() }
})

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
    assert.equal(checkbox('Folder .workspace is outside this website import'), undefined)
    assert.equal(checkbox('File agent-mission.inspection.json is outside this website import'), undefined)
    assert.ok(host.querySelector('section[aria-label="File agent-mission.inspection.json"] button[aria-label="Select file agent-mission.inspection.json"]'), 'mission file starts with its normal icon')
    assert.ok(host.querySelector('section[aria-label="File a"] button[aria-label="Select file a"]'), 'discovered page starts with its file icon')
    assert.ok(host.querySelector('section[aria-label="Folder .workspace"] button[aria-label="Collapse folder .workspace"]'), 'mission folder remains independently collapsible')
    await act(async () => checkbox('Select all visible pages').click())
    const chooser = host.querySelector('section[aria-label="Choose folder(s)/page(s) to import"]')!
    assert.equal(chooser.querySelectorAll('input').length, 1, 'active chooser retains only the Select visible checkbox')
    assert.equal(chooser.querySelectorAll('button, h3, p, nav').length, 0, 'legacy chooser controls and explanation are removed')
    assert.equal(chooser.textContent?.trim(), '', 'checkbox accessible name replaces the redundant visible copy')
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 3)
    assert.equal(checkbox('Folder .workspace is outside this website import').disabled, true)
    assert.equal(checkbox('File agent-mission.inspection.json is outside this website import').disabled, true)
    assert.equal(host.querySelector('section[aria-label="File agent-mission.inspection.json"] button[aria-label="Select file agent-mission.inspection.json"]'), null, 'mission file icon swaps to a disabled leading checkbox')
    assert.equal(host.querySelector('section[aria-label="File a"] button[aria-label="Select file a"]'), null, 'selected page icon swaps to a leading checkbox')
    assert.equal(host.querySelector('section[aria-label="Folder .workspace"] svg.lucide-chevron-down'), null, 'mission folder chevron is replaced')
    assert.equal(control('Collapse folder .workspace').getAttribute('aria-expanded'), 'true', 'folder name exposes its expansion state')
    await act(async () => control('Collapse folder .workspace').click())
    assert.equal(checkbox('File agent-mission.inspection.json is outside this website import'), undefined)
    await act(async () => control('Expand folder .workspace').click())
    assert.equal(checkbox('File agent-mission.inspection.json is outside this website import').disabled, true)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 3, 'mission folder expansion does not change page selection')
    await act(async () => checkbox('Select all visible pages').click())
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 0)
    assert.equal(checkbox('Folder .workspace is outside this website import'), undefined, 'clearing selection restores normal folder controls')
    assert.ok(host.querySelector('section[aria-label="File agent-mission.inspection.json"] button[aria-label="Select file agent-mission.inspection.json"]'), 'clearing selection restores the mission file icon')
    await act(async () => checkbox('Select all visible pages').click())
    await act(async () => checkbox('Select discovered pages in /library').click())
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 1, 'folder can deselect its descendants')
    await act(async () => checkbox('Select discovered pages in /library').click())
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 3, 'folder can reselect its descendants')
    await act(async () => checkbox(`Select page ${source}`).click())
    assert.equal(control('Import selected').getAttribute('aria-label'), 'Import selected (2) for imported.md')
    assert.equal(checkbox(`Select page ${source}`).checked, false)
    await act(async () => checkbox(`Select page ${source}b`).click())
    assert.equal(checkbox('Select discovered pages in /library').indeterminate, true)
    const filter = host.querySelector<HTMLInputElement>('input[placeholder="Filter discovered pages"]')!
    assert.ok(filter, 'Explorer search switches to discovery filtering')
    assert.equal(host.querySelectorAll('input[placeholder="Filter discovered pages"]').length, 1)
    assert.equal(host.querySelector('section[aria-label="Choose folder(s)/page(s) to import"] input[type=search]'), null)
    await act(async () => control('Collapse folder library').click())
    assert.equal(checkbox(`Select page ${source}a`), undefined)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 1, 'folder name collapses without changing selection')
    await act(async () => control('Expand folder library').click())
    assert.equal(checkbox(`Select page ${source}a`).checked, true)
    assert.deepEqual(resolutions, [])
    const session = useWebsiteImportSelectionSession.getState().session!
    const projected = projectWebsiteImportTree([sourceEntry], null, session)
    assert.ok(projected.pendingPaths.size)
    assert.equal(sourceEntry.text.endsWith('# Imported'), true, 'discovery does not rewrite saved files')
    const row = host.querySelector('section[aria-label="File imported.md"]')!
    const rowCheckbox = row.querySelector('input[type=checkbox]')!
    const sourceLink = row.querySelector('a[aria-label="Open source URL for imported.md"]')!
    const following = row.ownerDocument.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING
    assert.ok(Boolean(rowCheckbox.compareDocumentPosition(sourceLink) & following), 'selection precedes the source link')
    const folderRow = host.querySelector('section[aria-label="Folder library"]')!
    assert.ok(Boolean(folderRow.querySelector('input[type=checkbox]')!.compareDocumentPosition(folderRow.querySelector('button[aria-label="Collapse folder library"]')!) & following), 'folder checkbox precedes the expandable name')
    assert.equal(folderRow.querySelector('svg.lucide-chevron-down'), null, 'website folder has no duplicate chevron in selection mode')
    assert.equal(folderRow.querySelector('button[aria-label="Collapse folder library"]')?.getAttribute('aria-expanded'), 'true')
    const pendingRow = host.querySelector('section[aria-label="File a"]')!
    const actionGroups = [pendingRow, row].map(item => item.querySelector<HTMLElement>('[data-source-file-actions]')!)
    assert.ok(actionGroups.every(group => group.style.minWidth === actionGroups[0].style.minWidth), 'remaining source actions share one column start')
    const [pendingActions, savedActions] = actionGroups.map(group => Array.from(group.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('a, button')))
    assert.equal(pendingActions.length, 4, 'pending page reserves URL, discovery, import and cloud slots')
    assert.equal(savedActions.length, 4, 'saved file keeps the same four action slots')
    assert.equal(savedActions[0], sourceLink, 'saved file keeps source URL in the first slot')
    assert.match(pendingActions[1].getAttribute('aria-label') || '', /^Find pages linked from /)
    assert.match(savedActions[1].getAttribute('aria-label') || '', /^Find pages linked from /)
    assert.match(pendingActions[2].getAttribute('aria-label') || '', /^Import unavailable for /)
    assert.match(savedActions[2].getAttribute('aria-label') || '', /^Import selected /)
    assert.equal(pendingActions[3].getAttribute('title'), 'Not imported')
    assert.ok(savedActions[3].hasAttribute('data-source-file-cloud-status'))
    assert.equal((pendingActions[0] as HTMLButtonElement).disabled, true, 'pending page has no source-link action')
    assert.equal((pendingActions[2] as HTMLButtonElement).disabled, true, 'non-owner import action is unavailable')
    assert.ok(pendingActions[0].classList.contains('opacity-40'), 'unavailable source link is greyed out')
    assert.ok(pendingActions[2].classList.contains('disabled:opacity-40'), 'unavailable import is greyed out')
    assert.ok([folderRow, pendingRow, row].every(item => item.firstElementChild?.querySelector('input[type=checkbox]')), 'selection occupies the leading icon slot')
    assert.ok([folderRow, pendingRow, row].every(item => !item.querySelector('[data-source-file-actions] input[type=checkbox]')), 'no legacy right-side checkboxes remain')
    assert.equal(folderRow.querySelector('[data-source-file-actions]'), null, 'folder has no empty right action placeholder')
    for (const action of [sourceLink, control('Find pages linked from'), control('Import selected'), row.querySelector('button[data-source-file-cloud-status]')!]) {
      assert.ok(action.classList.contains('kg-data-view-icon-action--sm'), 'row actions match the existing file control size')
      assert.ok(action.querySelector('svg')?.classList.contains('kg-compact-glyph'), 'row glyphs match the file glyph')
    }
    assert.ok(rowCheckbox.closest('label')?.classList.contains('kg-data-view-icon-action--sm'))
    const actions = Array.from(row.querySelectorAll('button'))
    assert.ok(actions.indexOf(control('Find pages linked from')) < actions.findIndex(button => button.hasAttribute('data-source-file-cloud-status')))
    assert.ok(actions.indexOf(control('Import selected')) < actions.findIndex(button => button.hasAttribute('data-source-file-cloud-status')))
    assert.ok(host.querySelector('button[aria-label="Import a before cloud sync"]')?.hasAttribute('disabled'))
    await act(async () => control('Import selected').click())
    assert.deepEqual(resolutions, [[source + 'a']])
    assert.deepEqual(requests.filter(url => url === '/__website_import/discover'), ['/__website_import/discover'])
    assert.equal(host.querySelector('input[aria-label^="Select page"]'), null, 'transient selection leaves with the session')
    assert.equal(host.querySelector<HTMLInputElement>('input[placeholder="Search"]')?.value, 'saved search', 'file search returns after selection')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); host.remove(); globalThis.fetch = previousFetch; restore() }
})

test('cancel aborts pending discovery and never resolves an import selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  let signal: AbortSignal | undefined, resolution: string[] | null | undefined
  globalThis.fetch = ((_url, init) => {
    signal = init?.signal as AbortSignal
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
  }) as typeof fetch
  const host = document.createElement('section'), root = createRoot(host)
  try {
    const pending = chooseWebsiteImportPages('https://example.test/library/').then(urls => { resolution = urls })
    await act(async () => root.render(<SourceFilesHarness />))
    await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Cancel import selection')!.click())
    await pending
    assert.equal(resolution, null)
    assert.equal(signal?.aborted, true)
    assert.ok(host.querySelector('section[aria-label="Choose folder(s)/page(s) to import"] input[aria-label="Select all visible pages"]'), 'idle checkbox remains after cancellation')
    assert.ok(Array.from(host.querySelectorAll('button')).some(button => button.textContent === 'Import URL'))
  } finally { await act(async () => root.unmount()); finishWebsiteImportSelection(null); globalThis.fetch = previousFetch; restore() }
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
    assert.equal(host.querySelector('button[aria-label^="Import selected"]'), null, 'idle source rows do not show an inapplicable confirmation icon')
    await act(async () => control('Find pages linked from').click())
    assert.deepEqual(imported, [])
    assert.equal(host.querySelectorAll('button[aria-label^="Import selected"]').length, 1, 'the shared tree has only the source-row confirmation')
    await act(async () => (host.querySelector('input[aria-label="Select all visible pages"]') as HTMLInputElement).click())
    assert.equal((host.querySelector('input[aria-label="Select page https://example.test/library/one"]') as HTMLInputElement).checked, true)
    assert.equal(control('Import selected').disabled, false)
    await act(async () => { control('Import selected').click(); await importedReady })
    assert.deepEqual(imported, [{ root: url, selectedUrls: [url + 'one'] }])
    assert.deepEqual(requests, ['/__website_import/discover'])
    assert.ok(host.querySelector<HTMLButtonElement>('button[aria-label^="Import selected"]')?.disabled, 'completed import clears selection while retaining discovery')
    assert.equal(useWebsiteImportSelectionSession.getState().session?.pages.length, 1)
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); unregister(); globalThis.fetch = previousFetch; restore() }
})

test('Source Files restores page checkboxes after restart without importing until confirmation', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const requests: string[] = [], imported: string[][] = []
  let importedResolve!: () => void
  const importedReady = new Promise<void>(resolve => { importedResolve = resolve })
  globalThis.fetch = (async target => {
    requests.push(String(target))
    return new Response(JSON.stringify({ ok: true, pages: [{ url: sourceUrl + 'one', path: '/library/one' }], limited: false }))
  }) as typeof fetch
  const unregister = registerMarkdownWorkspaceActionBridge('test-restart-selection', { importWebsite: async (_root, opts) => {
    imported.push(opts?.selectedUrls || []); importedResolve(); return { handled: true }
  } })
  const host = document.createElement('section'); document.body.append(host)
  let root = createRoot(host)
  const control = (prefix: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.getAttribute('aria-label')?.startsWith(prefix))!
  const page = () => host.querySelector<HTMLInputElement>(`input[aria-label="Select page ${sourceUrl}one"]`)!
  try {
    await act(async () => root.render(<SourceFilesHarness />))
    await act(async () => control('Find pages linked from').click())
    await act(async () => (host.querySelector('input[aria-label="Select all visible pages"]') as HTMLInputElement).click())
    assert.equal(page().checked, true)
    const draftKey = Object.keys(window.localStorage).find(key => {
      try { const value = JSON.parse(window.localStorage.getItem(key) || 'null'); return value?.url === sourceUrl && Array.isArray(value.pages) }
      catch { return false }
    })!
    assert.ok(draftKey, 'explicit discovery saves its local draft')
    const selectedDraft = window.localStorage.getItem(draftKey)
    await act(async () => { root.unmount(); useWebsiteImportSelectionSession.setState({ session: null, recoveryError: '' }) })
    root = createRoot(host)
    await act(async () => root.render(<SourceFilesHarness />))
    assert.equal(page().checked, true, 'the new Source Files mount restores the selected page')
    assert.deepEqual(imported, [], 'restoration cannot import by itself')
    assert.deepEqual(requests, ['/__website_import/discover'], 'restoration does not rediscover without user action')
    await act(async () => page().click())
    assert.equal(page(), null, 'unchecking the last page restores its file icon')
    assert.notEqual(window.localStorage.getItem(draftKey), selectedDraft, 'unselection updates the restart draft')
    await act(async () => (host.querySelector('input[aria-label="Select all visible pages"]') as HTMLInputElement).click())
    assert.equal(page().checked, true)
    await act(async () => { control('Import selected').click(); await importedReady })
    assert.deepEqual(imported, [[sourceUrl + 'one']])
    assert.deepEqual(JSON.parse(window.localStorage.getItem(draftKey)!).selected, [], 'successful confirmation retains discovery but clears imported selection')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); unregister(); host.remove(); globalThis.fetch = previousFetch; restore() }
})

test('discovery keeps the clicked import owner while saved copies share its page checkbox', () => {
  const sibling = { ...sourceEntry, path: '/sitemap.md', name: 'sitemap.md' }
  const session = { id: 1, url: sourceUrl, sourcePath: sourceEntry.path, pages: [{ url: sourceUrl, path: '/library/' }, { url: sourceUrl + 'new', path: '/library/new' }], selected: new Set<string>(), visited: new Set<string>(), busy: false, error: '', limited: false, query: '' }
  const projection = projectWebsiteImportTree([sourceEntry, sibling], null, session)
  assert.equal(projection.ownerPath, sourceEntry.path)
  assert.equal(projection.pageUrls.get(sourceEntry.path), sourceUrl)
  assert.equal(projection.pageUrls.get(sibling.path), sourceUrl)
  assert.deepEqual(projection.selectionUrls.get(sibling.path), [sourceUrl])
  assert.equal(projection.entries.filter(entry => entry.path === sourceEntry.path).length, 1)
  assert.equal(projection.pendingPaths.has(sourceEntry.path), false)
})


test('discovery opens existing ancestor folders and distinguishes saved files from pending pages', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'), root = createRoot(host)
  const saved = { ...sourceEntry, path: '/websites/sample/run/library.md', parentPath: '/websites/sample/run' }
  const folders = ['/websites', '/websites/sample', '/websites/sample/run'].map(path => ({ kind: 'folder' as const, path, parentPath: path.slice(0, path.lastIndexOf('/')) || '/', name: path.split('/').pop()!, updatedAtMs: 0 }))
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, pages: [sourceUrl, sourceUrl + 'guides/new'].map(url => ({ url, path: new URL(url).pathname })), limited: true }))) as typeof fetch
  const props = { loading: false, loadError: '', textSizeClass: 'text-xs', entries: [...folders, saved], expandedPaths: new Set<string>(), activePath: saved.path,
    toggleExpanded() {}, onSelectFile() {}, onSelectFolder() {}, sourcesByPath: null, onCreateNewFile() {}, onRevealInFinder() {}, onClearFile() {}, onRenameEntry() {}, onDeleteEntry() {} }
  try {
    await act(async () => { void chooseWebsiteImportPages(sourceUrl, saved.path); root.render(<MarkdownWorkspaceSourceFilesList {...props} />) })
    assert.equal(host.querySelectorAll('svg[aria-label="Saved website file"]').length, 1)
    assert.equal(host.querySelectorAll('svg[aria-label="Discovered page — not saved"]').length, 1)
    assert.match(host.textContent || '', /2 discovered pages/)
    assert.match(host.textContent || '', /partial list/)
    assert.ok(host.querySelector('section[aria-label="File new"]'))
    const collapse = host.querySelector<HTMLButtonElement>('button[aria-label="Collapse folder websites"]')!
    await act(async () => collapse.click())
    assert.equal(host.querySelector('section[aria-label="File new"]'), null)
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Expand folder websites"]')!.click())
    assert.ok(host.querySelector('section[aria-label="File new"]'))
    assert.equal(props.entries.length, 4, 'discovery never materializes workspace files')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); globalThis.fetch = previousFetch; restore() }
})


test('large discovery inventories page and search without losing saved history or exceeding selection limits', () => {
  const { restore } = initJsdomHarness()
  try {
    const pages = Array.from({ length: 650 }, (_, index) => ({ url: sourceUrl + `item-${index}`, path: `/library/item-${index}` }))
    const session = { id: 990, url: sourceUrl, pages, selected: new Set<string>(), visited: new Set<string>(), busy: false, error: '', limited: false, query: '' }
    useWebsiteImportSelectionSession.setState({ session, recoveryError: '' })
    assert.equal(visibleWebsiteSelectionPages(session).length, 100)
    showMoreWebsiteSelectionPages()
    assert.equal(visibleWebsiteSelectionPages(useWebsiteImportSelectionSession.getState().session!).length, 200)
    toggleWebsiteSelection(pages.map(page => page.url), true)
    assert.equal(useWebsiteImportSelectionSession.getState().session?.selected.size, 500)
    setWebsiteSelectionQuery('item-649')
    const current = useWebsiteImportSelectionSession.getState().session!
    assert.deepEqual(visibleWebsiteSelectionPages(current), [pages[649]])
    const history = [sourceEntry, { ...sourceEntry, path: '/previous-run.md', name: 'previous-run.md' }]
    const projected = projectWebsiteImportTree(history, null, current)
    assert.ok(history.every(entry => projected.entries.includes(entry)), 'past saved copies remain alongside filtered discovery')
    assert.equal(projected.savedPaths.size, 2)
  } finally { finishWebsiteImportSelection(null); restore() }
})


test('retained discovery preserves retry selection after failure and rejects stale import completion', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true, pages: [{ url: sourceUrl, path: '/library/' }], limited: false }))) as typeof fetch
  let fail = true, release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const unregister = registerMarkdownWorkspaceActionBridge('test-discovery-retry', { importWebsite: async () => {
    if (fail) throw new Error('Capture unavailable')
    await gate
    return { handled: true }
  } })
  try {
    const importing = importWebsiteFromSourceFiles(sourceUrl, sourceEntry.path)
    const rejected = assert.rejects(importing, /Capture unavailable/)
    await new Promise(resolve => setTimeout(resolve, 0))
    finishWebsiteImportSelection([sourceUrl])
    await rejected
    const retained = useWebsiteImportSelectionSession.getState().session!
    assert.equal(retained.importing, false)
    assert.ok(retained.selected.has(sourceUrl))
    assert.match(retained.error, /Capture unavailable/)
    fail = false
    const retry = confirmRestoredWebsiteSelection(retained.id, [sourceUrl])
    const replacement = chooseWebsiteImportPages('https://example.test/next/')
    const replacementId = useWebsiteImportSelectionSession.getState().session!.id
    release(); await retry
    assert.equal(useWebsiteImportSelectionSession.getState().session!.id, replacementId)
    finishWebsiteImportSelection(null); await replacement
  } finally { release(); finishWebsiteImportSelection(null); unregister(); globalThis.fetch = previousFetch; restore() }
})
