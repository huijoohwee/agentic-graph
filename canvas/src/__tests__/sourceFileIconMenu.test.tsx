import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import { testMarkdownFileTreeReadOnlyContextMenuCopiesPaths, testMarkdownFileTreeRowButtonReusesSharedRowShell, testMarkdownFileTreeRevealsActiveSourceWithoutStealingFocus } from './markdownFileTreeRowButton.test'

test('file row selection and read-only actions survive context-menu consolidation', async () => {
  await testMarkdownFileTreeRowButtonReusesSharedRowShell()
  await testMarkdownFileTreeRevealsActiveSourceWithoutStealingFocus()
  await testMarkdownFileTreeReadOnlyContextMenuCopiesPaths()
})

test('keyboard and pointer open one portaled icon toolbar without activating a file', async () => {
  const { dom, restore } = initJsdomHarness()
  // This interaction needs native focus tracking; the generic harness pins it to body.
  delete (document as unknown as { activeElement?: Element }).activeElement
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), reveals: string[] = []
  const entry = { path: '/notes.md', parentPath: '/', kind: 'file' as const, name: 'notes.md', text: 'Notes', updatedAtMs: 1 }
  let activated = 0
  const menu = () => document.querySelector<HTMLElement>('[role="toolbar"][aria-label="Actions for notes.md"]')
  try {
    await act(async () => root.render(<MarkdownFileTree entries={[entry]} expandedPaths={new Set()} activePath={null}
      toggleExpanded={() => {}} onSelectFile={() => { activated++ }} onSelectFolder={() => {}}
      onRevealInFinder={path => { reveals.push(path) }} />))
    assert.equal(menu(), null)
    const row = host.querySelector<HTMLButtonElement>('button[aria-label="File notes.md"]')!
    await act(async () => row.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'F10', shiftKey: true })))
    assert.ok(menu()); assert.equal(host.contains(menu()), false, 'the shared portal escapes the explorer scroll clip')
    assert.equal(menu()!.textContent, '', 'visible action labels are replaced by icons')
    for (const button of menu()!.querySelectorAll('button')) {
      assert.ok(button.getAttribute('aria-label')); assert.ok(button.title)
      assert.ok(button.querySelector('svg.kg-compact-glyph'))
      assert.ok(button.classList.contains('kg-data-view-icon-action--sm'))
    }
    await act(async () => menu()!.querySelector<HTMLButtonElement>('[aria-label="Reveal in Finder"]')!.click())
    assert.deepEqual(reveals, ['/notes.md']); assert.equal(menu(), null); assert.equal(activated, 0)
    await act(async () => row.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10000, clientY: 10000 })))
    const overlay = menu()!.closest<HTMLElement>('[data-kg-anchor-overlay]')!
    assert.ok(parseFloat(overlay.style.left) < window.innerWidth)
    assert.ok(parseFloat(overlay.style.top) < window.innerHeight)
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })))
    assert.equal(menu(), null); assert.equal(activated, 0)
    assert.ok(document.activeElement === row, `dismissal restores focus to the invoking row; got ${document.activeElement?.tagName}`)
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
})

test('files and folders use the same icon slots with unavailable actions disabled', async () => {
  const { MarkdownWorkspaceSourceFilesList } = await import('@/features/markdown-workspace/MarkdownWorkspaceSourceFilesList')
  const { restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), calls: string[] = []
  const entries = [
    { path: '/notes.md', parentPath: '/', kind: 'file' as const, name: 'notes.md', text: 'Notes', updatedAtMs: 1 },
    { path: '/notes', parentPath: '/', kind: 'folder' as const, name: 'notes', updatedAtMs: 1 },
  ]
  try {
    await act(async () => root.render(<MarkdownWorkspaceSourceFilesList loading={false} loadError="" textSizeClass="text-xs"
      entries={entries} expandedPaths={new Set()} activePath={null} sourcesByPath={null}
      toggleExpanded={() => {}} onSelectFile={() => calls.push('select')} onSelectFolder={() => calls.push('select')}
      onRevealInFinder={path => calls.push(path)} onCreateNewFile={() => calls.push('new')}
      onClearFile={() => calls.push('clear')} onRenameEntry={() => calls.push('rename')} onDeleteEntry={() => calls.push('delete')} />))
    let fileLabels: Array<string | null> = []
    for (const entry of entries) {
      await act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="${entry.kind === 'file' ? 'File' : 'Folder'} ${entry.name}"]`)!.dispatchEvent(
        new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 })))
      const menus = document.querySelectorAll('[data-source-file-actions]')
      assert.equal(menus.length, 1)
      const buttons = Array.from(menus[0].querySelectorAll<HTMLButtonElement>('button'))
      assert.equal(buttons.length, 16)
      assert.ok(buttons[0].disabled, 'missing source URL keeps its disabled slot')
      const labels = buttons.slice(7).map(button => button.getAttribute('aria-label'))
      if (entry.kind === 'file') fileLabels = labels
      else {
        assert.deepEqual(labels, fileLabels, 'file and folder action order cannot diverge')
        assert.deepEqual(buttons.filter(button => !button.disabled).map(button => button.getAttribute('aria-label')),
          ['Reveal in Finder', 'Copy Path', 'Copy Relative Path', 'New file', 'Rename', 'Delete'])
        for (const button of buttons.filter(button => button.disabled)) {
          assert.ok(button.title)
          assert.match(button.className, /opacity-40/)
          await act(async () => button.click())
        }
        assert.deepEqual(calls, [], 'disabled actions neither activate the row nor perform work')
        await act(async () => buttons.find(button => button.getAttribute('aria-label') === 'Reveal in Finder')!.click())
        assert.deepEqual(calls, ['/notes'])
      }
    }
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
})

test('unavailable capabilities remain inert even when their action callback is invoked directly', async () => {
  const { buildMarkdownFileTreeContextMenuItems } = await import('@/features/markdown-workspace/markdownFileTreeContextMenuItems')
  const entry = { path: '/pending', parentPath: '/', kind: 'folder' as const, name: 'pending', updatedAtMs: 1 }
  let calls = 0
  const items = buildMarkdownFileTreeContextMenuItems({ entry, unavailableReason: 'Not saved',
    copyToClipboard: async () => { calls++; return true }, closeContextMenu: () => { calls++ },
    onRevealInFinder: () => { calls++ }, onDeleteEntry: () => { calls++ } })
  assert.equal(items.length, 9)
  for (const item of items) { assert.equal(item.disabledReason, 'Not saved'); await item.onSelect() }
  assert.equal(calls, 0)
})

test('discovery summary opens in a separate shared overlay only after an applicable icon action', async () => {
  const { MarkdownWorkspaceSourceFilesList } = await import('@/features/markdown-workspace/MarkdownWorkspaceSourceFilesList')
  const { useWebsiteImportSelectionSession, finishWebsiteImportSelection } = await import('@/features/source-files/websiteImportSelectionSession')
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), url = 'https://sample.test/catalog/'
  const pages = Array.from({ length: 205 }, (_, index) => ({ url: `${url}page-${index}`, path: `/catalog/page-${index}` }))
  let networkCalls = 0
  globalThis.fetch = (async () => { networkCalls++; throw new Error('Unexpected request') }) as typeof fetch
  const entries = [
    { path: '/capture.md', parentPath: '/', kind: 'file' as const, name: 'capture.md', text: `---\nkgWebpageUrl: "${url}"\n---\nCapture`, updatedAtMs: 1 },
    { path: '/notes.py', parentPath: '/', kind: 'file' as const, name: 'notes.py', text: 'print(1)', updatedAtMs: 1 },
  ]
  const open = async (name: string) => act(async () => host.querySelector<HTMLButtonElement>(`button[aria-label="File ${name}"]`)!.dispatchEvent(
    new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })))
  const toolbar = () => document.querySelector<HTMLElement>('[data-source-file-actions]')!
  const more = () => toolbar().querySelector<HTMLButtonElement>('button[aria-label^="Show more pages"]')!
  try {
    useWebsiteImportSelectionSession.setState({ session: { id: 1000, url, sourcePath: '/capture.md', pages,
      selected: new Set([pages[0].url, pages[1].url]), visited: new Set(), busy: false, limited: false, error: '', query: '' }, recoveryError: '' })
    await act(async () => root.render(<MarkdownWorkspaceSourceFilesList loading={false} loadError="" textSizeClass="text-xs"
      entries={entries} expandedPaths={new Set()} activePath={null} sourcesByPath={null}
      toggleExpanded={() => {}} onSelectFile={() => {}} onSelectFolder={() => {}}
      onRevealInFinder={() => {}} onCreateNewFile={() => {}} onClearFile={() => {}} onRenameEntry={() => {}} onDeleteEntry={() => {}} />))
    assert.equal(host.querySelector('[role="status"], button[aria-label^="Show more pages"], button[aria-label="Refresh discovered pages"]'), null)
    await open('capture.md')
    assert.equal(document.querySelector('section[aria-label="Website discovery status"]'), null, 'opening a menu does not reveal its summary')
    const statusButton = () => toolbar().querySelector<HTMLButtonElement>('button[aria-label="Website discovery status"]')!
    assert.equal(statusButton().getAttribute('aria-expanded'), 'false')
    await act(async () => statusButton().click())
    for (let attempt = 0; attempt < 50 && !document.querySelector('section[aria-label="Website discovery status"]'); attempt++) {
      await act(async () => new Promise(resolve => setTimeout(resolve, 10)))
    }
    let details = document.querySelector<HTMLElement>('section[aria-label="Website discovery status"]')!
    assert.ok(details)
    const summaryOverlay = details.closest<HTMLElement>('[data-kg-anchor-overlay]')!
    const menuOverlay = toolbar().closest<HTMLElement>('[data-kg-anchor-overlay]')!
    assert.ok(summaryOverlay && menuOverlay && summaryOverlay !== menuOverlay, 'toolbar and summary are separate shared overlays')
    assert.equal(summaryOverlay.dataset.kgOverlayGroup, menuOverlay.dataset.kgOverlayGroup, 'both panels share dismissal ownership')
    assert.ok(summaryOverlay.classList.contains('kg-data-view-floating-menu'))
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 2)
    await act(async () => new Promise(resolve => setTimeout(resolve, 130)))
    await act(async () => details.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 2, 'interacting with the summary keeps both panels open')
    assert.equal(host.contains(details), false, 'readout escapes the clipped Source Files tree')
    assert.equal(toolbar().textContent, '', 'all actions remain icons')
    assert.equal(toolbar().querySelectorAll('a, button').length, 16)
    assert.match(details.textContent || '', /205 discovered pages · 100 shown · 2 selected/)
    assert.match(details.textContent || '', /Select up to 500 pages to crawl/)
    assert.match(details.textContent || '', /Saved file\s+Discovered, not saved/)
    assert.equal(more().getAttribute('aria-label'), 'Show more pages (105 remaining)')
    await act(async () => statusButton().click())
    assert.equal(document.querySelector('section[aria-label="Website discovery status"]'), null)
    await act(async () => more().click())
    details = document.querySelector<HTMLElement>('section[aria-label="Website discovery status"]')!
    assert.equal(statusButton().getAttribute('aria-expanded'), 'true', 'an applicable discovery action reveals the summary')
    assert.match(details.textContent || '', /200 shown · 2 selected/)
    await act(async () => more().click())
    assert.match(details.textContent || '', /205 shown · 2 selected/)
    assert.ok(more().disabled)
    assert.match(more().className, /opacity-40/)
    await act(async () => more().click())
    assert.equal(useWebsiteImportSelectionSession.getState().session?.visibleCount, 300)
    const folder = host.querySelector<HTMLButtonElement>('section[aria-label="Folder catalog"] button[aria-expanded]')!
    await act(async () => folder.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })))
    assert.equal(toolbar().querySelector<HTMLButtonElement>('[aria-label="Refresh discovered pages"]')?.disabled, false, 'related folders reuse discovery refresh')
    await open('notes.py')
    const unavailable = Array.from(toolbar().querySelectorAll<HTMLButtonElement>('button')).filter(button =>
      /^(Find links unavailable|Show more pages|Cancel import selection|Website discovery status)/.test(button.getAttribute('aria-label') || ''))
    assert.equal(unavailable.length, 4)
    for (const button of unavailable) { assert.ok(button.disabled); assert.match(button.className, /opacity-40/); await act(async () => button.click()) }
    assert.deepEqual([...useWebsiteImportSelectionSession.getState().session!.selected], [pages[0].url, pages[1].url])
    assert.equal(document.querySelector('section[aria-label="Website discovery status"]'), null, 'unrelated icons cannot open the summary')
    assert.equal(networkCalls, 0, 'paging and unavailable actions do not crawl or fetch')
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 1)
    await open('capture.md')
    assert.equal(document.querySelector('section[aria-label="Website discovery status"]'), null, 'changing targets resets the summary')
    await act(async () => statusButton().click())
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 2)
    await act(async () => new Promise(resolve => setTimeout(resolve, 130)))
    await act(async () => document.body.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 0, 'outside clicks dismiss both panels')
    await open('capture.md')
    await act(async () => statusButton().click())
    await act(async () => window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' })))
    assert.equal(document.querySelectorAll('[data-kg-anchor-overlay]').length, 0, 'Escape dismisses both panels')
  } finally { await act(async () => { root.unmount(); finishWebsiteImportSelection(null) }); host.remove(); globalThis.fetch = previousFetch; restore() }
})
