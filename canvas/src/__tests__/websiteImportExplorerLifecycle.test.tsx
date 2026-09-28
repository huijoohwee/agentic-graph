import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownWorkspaceOpenSourceFilesEvent } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceOpenSourceFilesEvent'
import { beginWebsiteImportExplorerUpdates } from '@/features/workspace-fs/websiteImportRefreshGuard'
import { MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT } from '@/features/markdown/ui/useMarkdownExplorerSectionCollapseState'

test('opening the progressive crawl tree does not reload the workspace during import', async () => {
  const { restore } = initJsdomHarness()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const importRoot = '/websites/example.invalid/live'
  const finish = beginWebsiteImportExplorerUpdates(importRoot)
  let refreshes = 0
  let expanded = new Set<string>()
  let opened = false
  let collapsed = true
  function Harness() {
    useMarkdownWorkspaceOpenSourceFilesEvent({
      setExplorerOpen(value) { opened = value },
      setSourceFilesCollapsed(value) { collapsed = value },
      setExpandedPaths(update) { expanded = update(expanded) },
      refresh() { refreshes += 1 },
    })
    return null
  }
  const open = (path: string) => window.dispatchEvent(new CustomEvent(
    MARKDOWN_EXPLORER_OPEN_SOURCE_FILES_EVENT, { detail: { path } },
  ))
  try {
    await act(async () => { root.render(<Harness />) })
    await act(async () => { open(importRoot + '/page.md') })
    assert.equal(opened, true)
    assert.equal(collapsed, false)
    assert.equal(expanded.has(importRoot), true)
    assert.equal(refreshes, 0, 'the crawl already publishes completed entries; do not seed/reload them again')
    await act(async () => { open('/docs/unrelated.md') })
    assert.equal(refreshes, 1, 'unrelated requests must still refresh')
    finish()
    await act(async () => { open(importRoot + '/page.md') })
    assert.equal(refreshes, 2, 'normal refresh must resume after the import')
  } finally {
    finish()
    await act(async () => { root.unmount() })
    host.remove()
    restore()
  }
})
