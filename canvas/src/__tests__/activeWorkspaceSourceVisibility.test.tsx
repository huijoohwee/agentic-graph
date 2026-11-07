import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownWorkspaceExplorer } from '@/features/markdown-workspace/MarkdownWorkspaceExplorer'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

test('active source remains identifiable and can be revealed through filtering and collapsed parents without reopening', async () => {
  const env = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const activePath = '/notes/中立/long-document-name.with-details.md'
  const paths = ['/', '/notes', '/notes/中立', activePath, '/notes/long-document-name.with-details.md']
  const entries: WorkspaceEntry[] = paths.map((path, index) => ({ path,
    parentPath: path === '/' ? null : path.slice(0, path.lastIndexOf('/')) || '/',
    kind: index < 3 ? 'folder' : 'file', name: path.split('/').at(-1)!, updatedAtMs: 1,
    ...(index >= 3 ? { text: 'Unsaved text remains owned by the editor.' } : {}),
  }))
  const scrolled: string[] = []
  const prototype = env.dom.window.HTMLElement.prototype
  const focused: string[] = []
  const previousFocus = prototype.focus
  const previousScroll = prototype.scrollIntoView
  // The shared harness deliberately reports body as activeElement. Observe focus requests instead.
  prototype.focus = function (options) { focused.push(this.getAttribute('title') || ''); previousFocus.call(this, options) }
  prototype.scrollIntoView = function () { scrolled.push(this.getAttribute('title') || '') }
  let selected = 0
  let reset: () => void = () => {}
  const noop = () => {}
  function Harness() {
    const [search, setSearch] = React.useState('unmatched')
    const [collapsed, setCollapsed] = React.useState(true)
    const [expanded, setExpanded] = React.useState(new Set<string>())
    reset = () => { setSearch('unmatched'); setCollapsed(true); setExpanded(new Set()) }
    return <MarkdownWorkspaceExplorer uiPanelTextFontClass="font-sans" sidebarWidthPx={260} sidebarWidthMinPx={200} sidebarWidthMaxPx={420}
      entries={entries} filteredEntries={search ? entries.filter(entry => entry.kind === 'folder') : entries}
      sourcesByPath={null} loading={false} loadError="" activePath={activePath} expandedPaths={expanded}
      toggleExpanded={path => setExpanded(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })}
      onSelectFile={() => { selected++ }} onSelectFolder={noop} search={search} setSearch={setSearch}
      sourceFilesCollapsed={collapsed} setSourceFilesCollapsed={setCollapsed} tocCollapsed backlinksCollapsed
      setTocCollapsed={noop} setBacklinksCollapsed={noop} tocTokens={[]} backlinks={[]} onRevealLine={noop}
      onOpenBacklink={noop} onTocReorder={noop} onCreateNewFile={noop} onRefresh={noop}
      canRefreshActiveFromSource={false} onRefreshActiveFromSource={noop} onRevealInFinder={noop}
      onClearFile={noop} onRenameEntry={noop} onDeleteEntry={noop} />
  }
  try {
    await act(async () => root.render(<Harness />))
    const reveal = host.querySelector<HTMLButtonElement>('button[aria-label="Reveal active file in Source Files"]')!
    assert.equal(host.querySelector('[aria-label="Active source file"]'), null, 'the duplicate full-path strip is removed')
    assert.ok(reveal.closest('nav[aria-label="Explorer actions"]'), 'reveal uses the shared Explorer header')
    assert.equal(reveal.title, activePath, 'the complete source identity remains available in the tooltip')
    assert.equal(reveal.textContent, '', 'reveal is an icon action')
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt === 1) await act(async () => reset())
      scrolled.length = 0
      focused.length = 0
      await act(async () => reveal.click())
      assert.ok(host.querySelector(`button[aria-current="page"]`))
      assert.ok(focused.includes(activePath))
      assert.ok(scrolled.includes(activePath))
      assert.equal(selected, 0, 'reveal must not reload or replace the editor document')
      assert.equal(entries[3]!.text, 'Unsaved text remains owned by the editor.')
    }
  } finally {
    await act(async () => root.unmount())
    prototype.scrollIntoView = previousScroll
    prototype.focus = previousFocus
    env.restore()
  }
})
