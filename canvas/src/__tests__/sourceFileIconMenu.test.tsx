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
