import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownWorkspaceViewShell } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceViewShell'
import { buildMarkdownFileTreeContextMenuItems } from '@/features/markdown-workspace/markdownFileTreeContextMenuItems'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'

test('Explorer reveal uses the captured artifact and reports failure without opening a URL or changing selection', async () => {
  const { restore } = initJsdomHarness(), previousFetch = globalThis.fetch
  const entry = { kind: 'file', path: '/websites/example/article.md', name: 'article.md', parentPath: '/websites/example',
    text: '---\nkgWebsiteImportId: "20260928T034028Z"\nkgWebsiteNodeId: "a123"\n---\nBody' } as WorkspaceEntry
  const statuses: string[] = [], requests: Record<string, unknown>[] = []
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
    const shell = useMarkdownWorkspaceViewShell({ entries: [entry], sourcesByPath: { [entry.path]: { kind: 'url', url: 'https://example.invalid/article' } },
      folderModeContract: 'sitemap', setFolderModeContract: () => {}, activePath: entry.path, selectionPath: entry.path,
      selectionEntryKind: 'file', setActivePathSafe: forbidden, setSelectionPathSafe: forbidden, setSelectionSource: forbidden,
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
    assert.deepEqual(requests[0], { website: { importId: '20260928T034028Z', nodeId: 'a123' } })
    assert.deepEqual(statuses, ['Revealed in Finder'])
    fail = true
    await act(async () => { reveal(); await pending })
    assert.match(statuses[1]!, /^Reveal failed: Reveal requires the local workspace host/)
  } finally { await act(async () => root.unmount()); globalThis.fetch = previousFetch; restore() }
})
