import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownWorkspaceViewShell } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceViewShell'
import { buildMarkdownFileTreeContextMenuItems } from '@/features/markdown-workspace/markdownFileTreeContextMenuItems'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

test('Explorer reveal saves the current selected document and reports failure without opening a URL or changing selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  let entry = { kind: 'file', path: '/websites/example/article.md', name: 'article.md', parentPath: '/websites/example',
    text: '---\nkgWebsiteImportId: "20260928T034028Z"\nkgWebsiteNodeId: "a123"\n---\nBody' } as WorkspaceEntry
  let entries = [entry]
  const statuses: string[] = [], requests: Record<string, unknown>[] = []
  let activePath = entry.path, activeText = 'Current unsaved text'
  let reveal: () => void | Promise<void> = () => {}, pending: Promise<void> | undefined, fail = false
  const forbidden = () => { throw new Error('Reveal must not open the source URL or change selection') }
  window.open = forbidden
  globalThis.fetch = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return fail ? new Response('<html>Static app</html>', { headers: { 'content-type': 'text/html' } })
      : new Response(JSON.stringify({ ok: true, message: 'Revealed in Finder' }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const root = createRoot(document.createElement('section'))
  function Harness() {
    const shell = useMarkdownWorkspaceViewShell({ entries, sourcesByPath: { [entry.path]: { kind: 'url', url: 'https://example.invalid/article' } },
      folderModeContract: 'sitemap', setFolderModeContract: () => {}, activePath, activeText, selectionPath: entry.path,
      selectionEntryKind: entry.kind, setActivePathSafe: forbidden, setSelectionPathSafe: forbidden, setSelectionSource: forbidden,
      setExpandedPaths: () => {}, resolveFolderContractDocPath: () => entry.path, pickFolderContractTargetPath: () => null,
      revealLineInEditor: () => {}, setStatusWithAutoClear: s => statuses.push(s), setStatusError: s => statuses.push(s) })
    reveal = buildMarkdownFileTreeContextMenuItems({ entry, copyToClipboard: async () => false, closeContextMenu: () => {},
      onRevealInFinder: path => { pending = shell.revealInFinder(path) } }).find(item => item.key === 'reveal')!.onSelect
    return null
  }
  try {
    await act(async () => { root.render(<Harness />) })
    await act(async () => { reveal(); const first = pending; reveal(); await first })
    assert.equal(requests.length, 1, 'Repeated clicks coalesce while reveal is pending')
    assert.deepEqual(requests[0], { kind: 'file', snapshot: { workspacePath: entry.path, text: 'Current unsaved text' } })
    assert.deepEqual(statuses, ['Revealed in Finder'])
    activePath = '/notes/another.md'; activeText = 'Other editor content'
    await act(async () => { root.render(<Harness />) })
    await act(async () => { reveal(); await pending })
    assert.deepEqual(requests[1], { kind: 'file', snapshot: { workspacePath: entry.path, text: entry.kind === 'file' ? entry.text : '' } })
    fail = true
    await act(async () => { reveal(); await pending })
    assert.match(statuses[2]!, /^Reveal failed: Reveal requires the local workspace host/)
    fail = false
    activePath = '/notes/current.md'; activeText = 'Unsaved folder child'
    entry = { kind: 'folder', path: '/notes', parentPath: '/', name: 'notes', updatedAtMs: 0 }
    entries = [entry, { kind: 'file', path: activePath, parentPath: '/notes', name: 'current.md', text: 'Stored text', updatedAtMs: 0 },
      { kind: 'file', path: '/notes-other/excluded.md', parentPath: '/notes-other', name: 'excluded.md', text: 'Unrelated', updatedAtMs: 0 }]
    await act(async () => { root.render(<Harness />) })
    await act(async () => { reveal(); await pending })
    assert.deepEqual(requests.at(-1), { kind: 'folder', folderSnapshot: { workspacePath: '/notes', entries: [
      { workspacePath: activePath, kind: 'file', text: activeText },
    ] } })
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; restore() }
})

test('client keeps explicit local provenance, generic names and payload budgets independent of website metadata', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const requests: Record<string, unknown>[] = []
  globalThis.fetch = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const { revealWorkspaceFileInManager } = await import('@/features/workspace-fs/workspaceRevealInFileManager')
    await revealWorkspaceFileInManager({ path: '/notes/renamed.md', kind: 'file', text: '---\nkgWebsiteImportId: stale\n---',
      source: { kind: 'local', originalName: '/local/exact.md' } })
    assert.deepEqual(requests.pop(), { path: '/local/exact.md', kind: 'file' })
    await revealWorkspaceFileInManager({ path: '/notes/empty.txt', text: '' })
    assert.deepEqual(requests.pop(), { kind: 'file', snapshot: { workspacePath: '/notes/empty.txt', text: '' } })
    for (const text of ['界'.repeat(166667), '\n'.repeat(250000)]) {
      await assert.rejects(revealWorkspaceFileInManager({ path: '/notes/large.txt', text }), /500 KB/)
    }
    await assert.rejects(revealWorkspaceFileInManager({ path: '/notes', kind: 'folder' }), /no saved local/)
    assert.equal(requests.length, 0)
    const { writeWorkspaceDocsMirrorRootPathSetting } = await import('@/lib/workspace/workspaceStoreSyncSettings')
    writeWorkspaceDocsMirrorRootPathSetting('/local-workspace/docs')
    await revealWorkspaceFileInManager({ path: '/notes/portable.txt', text: 'Portable' })
    assert.deepEqual(requests.pop(), { path: '/local-workspace/notes/portable.txt', outputRoot: '/local-workspace/docs_',
      kind: 'file', snapshot: { workspacePath: '/notes/portable.txt', text: 'Portable' } })
  } finally { globalThis.fetch = previousFetch; restore() }
})


test('reveal hydrates unopened saved files without reading unrelated entries or discarding missing content', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const requests: Record<string, unknown>[] = [], reads: string[] = []
  globalThis.fetch = (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  const entries: WorkspaceEntry[] = [
    { kind: 'file', path: '/notes/unopened.md', parentPath: '/notes', name: 'unopened.md', updatedAtMs: 0 },
    { kind: 'file', path: '/notes/draft.md', parentPath: '/notes', name: 'draft.md', text: 'Current draft', updatedAtMs: 0 },
    { kind: 'file', path: '/other/ignored.md', parentPath: '/other', name: 'ignored.md', updatedAtMs: 0 },
  ]
  const readFileText = async (path: string) => { reads.push(path); return 'Stored content' }
  try {
    const { revealWorkspaceFileInManager: reveal } = await import('@/features/workspace-fs/workspaceRevealInFileManager')
    await reveal({ path: '/notes', kind: 'folder', entries, readFileText })
    assert.deepEqual(reads, ['/notes/unopened.md'])
    assert.deepEqual(requests.pop(), { kind: 'folder', folderSnapshot: { workspacePath: '/notes', entries: [
      { workspacePath: '/notes/unopened.md', kind: 'file', text: 'Stored content' },
      { workspacePath: '/notes/draft.md', kind: 'file', text: 'Current draft' },
    ] } })
    await reveal({ path: '/notes/unopened.md', kind: 'file', readFileText })
    assert.deepEqual(requests.pop(), { kind: 'file', snapshot: { workspacePath: '/notes/unopened.md', text: 'Stored content' } })
    await assert.rejects(reveal({ path: '/notes', kind: 'folder', entries, readFileText: async () => null }), /unavailable/)
    await assert.rejects(reveal({ path: '/notes', kind: 'folder', entries, readFileText: async () => '界'.repeat(166667) }), /500 KB/)
    assert.equal(requests.length, 0)
  } finally { globalThis.fetch = previousFetch; restore() }
})
