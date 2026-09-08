import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { persistMarkdownSourceFolderPaths, readPersistedMarkdownSourceFolderPaths } from '@/features/markdown/ui/markdownSourceFilesPersistence'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspace } from '@/lib/markdown-workspace-runtime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { normalizeWorkspacePath, workspaceDocumentKey } from '@/features/workspace-fs/path'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { createId } from '@/lib/id'

const tick = async (dom: { window: Window }) => {
  await new Promise<void>(resolve => {
    const raf = (dom.window as unknown as { requestAnimationFrame?: (cb: (ts: number) => void) => number }).requestAnimationFrame
    if (typeof raf === 'function') {
      raf(() => resolve())
      return
    }
    setTimeout(() => resolve(), 0)
  })
}

const waitFor = async (dom: { window: Window }, predicate: () => boolean, timeoutMs: number) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return
    await tick(dom)
    await new Promise<void>(resolve => (dom.window as unknown as { setTimeout: (cb: () => void, ms: number) => number }).setTimeout(() => resolve(), 10))
  }
}

export async function testMarkdownWorkspaceFolderModeContractOpensDocs() {
  const storage = new MemoryStorage()
  const { dom, restore: restoreDom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const { restore: restoreWindow } = initWindowHarness({ storage })
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const doc = dom.window.document
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH })
    persistMarkdownSourceFolderPaths([...readPersistedMarkdownSourceFolderPaths(), WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH])
    const folderName = `repo-${createId('t').slice(0, 6)}`
    const folderPath = await fs.createFolder({ parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH, name: folderName })
    const sitemapPath = await fs.createFile({ parentPath: folderPath, name: 'repo.sitemap.md', text: '# Sitemap\n\nHello' })
    const journeyPath = await fs.createFile({ parentPath: folderPath, name: 'repo.user-journey.md', text: '# Journey\n\nHello' })
    useGraphStore.getState().resetAll()
    useMarkdownExplorerStore.getState().setActivePath(journeyPath)
    useGraphStore.getState().setMarkdownDocument(workspaceDocumentKey(journeyPath), '# Journey\n\nHello')
    useGraphStore.getState().setMarkdownDocumentSourceUrl(null)

    root = createRoot(doc.getElementById('root') as unknown as HTMLElement)
    root.render(React.createElement(MarkdownWorkspace))
    await tick(dom)

    await waitFor(dom, () => !!doc.querySelector(`section[aria-label="Folder ${folderName}"]`), 1200)

    const folderSection = doc.querySelector(`section[aria-label="Folder ${folderName}"]`) as HTMLElement | null
    if (!folderSection) throw new Error('expected folder row')
    const folderButton = folderSection.querySelector('button') as HTMLButtonElement | null
    if (!folderButton) throw new Error('expected folder row button')
    folderButton.click()
    await tick(dom)
    await tick(dom)

    const activeAfterFolder = useMarkdownExplorerStore.getState().activePath
    if (activeAfterFolder !== normalizeWorkspacePath(sitemapPath)) {
      throw new Error(`expected activePath to open sitemap, got ${String(activeAfterFolder)}`)
    }

    const select = doc.querySelector('select[aria-label="Folder mode contract"]') as HTMLSelectElement | null
    if (!select) throw new Error('expected folder mode contract select')
    select.value = 'user-journey'
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    await tick(dom)
    await tick(dom)

    const activeAfterSwitch = useMarkdownExplorerStore.getState().activePath
    if (activeAfterSwitch !== normalizeWorkspacePath(journeyPath)) {
      throw new Error(`expected activePath to switch to user journey, got ${String(activeAfterSwitch)}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreWindow()
    restoreDom()
  }
}
