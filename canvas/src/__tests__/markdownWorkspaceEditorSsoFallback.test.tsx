import { WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH } from '@/features/workspace-fs/workspaceSourceRoots'
import { ensureWorkspaceFolderTreeIfMissing } from '@/features/workspace-fs/ensureFolderTreeIfMissing'
import { persistMarkdownSourceFolderPaths, readPersistedMarkdownSourceFolderPaths } from '@/features/markdown/ui/markdownSourceFilesPersistence'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownWorkspace } from '@/lib/markdown-workspace-runtime'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { initWindowHarness } from '@/tests/lib/windowHarness'
import { MemoryStorage } from '@/tests/lib/memoryStorage'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { LS_KEYS } from '@/lib/config'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { workspaceDocumentKey } from '@/features/workspace-fs/path'

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

export async function testMarkdownWorkspaceEditorUsesGraphStoreFallbackWhenActiveTextEmpty() {
  const storage = new MemoryStorage()
  storage.setItem(LS_KEYS.markdownLayoutMode, JSON.stringify('editor'))
  storage.setItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles, 'true')

  const { dom, restore: restoreDom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const { restore: restoreWindow } = initWindowHarness({ storage })
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const doc = dom.window.document

    const activePath = '/ComfyUI/repo.sitemap.md'
    useMarkdownExplorerStore.getState().setActivePath(activePath)

    const docKey = workspaceDocumentKey(activePath)
    useGraphStore.getState().setMarkdownDocument(docKey, '# Fallback\n\nHello')

    root = createRoot(doc.getElementById('root') as unknown as HTMLElement)
    root.render(React.createElement(MarkdownWorkspace))
    await tick(dom)
    await tick(dom)

    const textarea = doc.querySelector('textarea[aria-label="Markdown Editor Text"]') as HTMLTextAreaElement | null
    if (!textarea) throw new Error('expected markdown editor textarea')
    const v = String(textarea.value || '')
    if (!v.includes('Fallback')) {
      throw new Error(`expected fallback text in editor, got ${JSON.stringify(v.slice(0, 120))}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}

export async function testMarkdownWorkspaceImmediatelySyncsPlainDocumentOnFileSwitch() {
  const storage = new MemoryStorage()
  storage.setItem(LS_KEYS.markdownLayoutMode, JSON.stringify('editor'))
  storage.setItem(LS_KEYS.markdownWorkspaceUserClearedAllFiles, 'true')

  const { dom, restore: restoreDom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const { restore: restoreWindow } = initWindowHarness({ storage })
  let root: ReturnType<typeof createRoot> | null = null

  const waitFor = async (predicate: () => boolean, maxTicks = 48) => {
    for (let i = 0; i < maxTicks; i += 1) {
      await tick(dom)
      if (predicate()) return
    }
    throw new Error(`timed out waiting for markdown workspace state: ${JSON.stringify({ name: useGraphStore.getState().markdownDocumentName, activePath: useMarkdownExplorerStore.getState().activePath, text: String(useGraphStore.getState().markdownDocumentText || '').slice(0, 120), targetVisible: dom.window.document.body.textContent?.includes('video-demo-switch-source.md') })}`)
  }

  try {
    const doc = dom.window.document
    const fs = await getWorkspaceFs()
    await fs.ensureSeed()
    await ensureWorkspaceFolderTreeIfMissing({ fs, folderPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH })
    persistMarkdownSourceFolderPaths([...readPersistedMarkdownSourceFolderPaths(), WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH])
    const firstPath = await fs.createFile({
      parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
      name: 'grabmaps-switch-source.md',
      text: '# GrabMaps Switch Source\n\nAlpha',
    })
    const secondPath = await fs.createFile({
      parentPath: WORKSPACE_AUTHORED_NOTES_SOURCE_ROOT_PATH,
      name: 'video-demo-switch-source.md',
      text: '# Video Demo Switch Target\n\nBeta',
    })

    useMarkdownExplorerStore.getState().setActivePath(firstPath)
    const graph = useGraphStore.getState()
    await graph.setActiveMarkdownDocument({ name: workspaceDocumentKey(firstPath), text: '# GrabMaps Switch Source\n\nAlpha', normalizeMermaidMmd: false, applyToGraph: true })
    graph.setMarkdownDocumentSourceUrl(null)

    root = createRoot(doc.getElementById('root') as unknown as HTMLElement)
    root.render(React.createElement(MarkdownWorkspace))

    await waitFor(() => String(doc.body.textContent || '').includes('video-demo-switch-source.md'))

    useMarkdownExplorerStore.getState().setActivePath(secondPath)

    await waitFor(() => {
      const state = useGraphStore.getState()
      return (
        state.markdownDocumentName === workspaceDocumentKey(secondPath) &&
        String(state.markdownDocumentText || '').includes('Video Demo Switch Target')
      )
    }, 8)

    const switchedState = useGraphStore.getState()
    const switchedText = String(switchedState.markdownDocumentText || '')
    if (switchedState.markdownDocumentName !== workspaceDocumentKey(secondPath)) {
      throw new Error(`expected active markdown document name to switch immediately, got ${String(switchedState.markdownDocumentName)}`)
    }
    if (!switchedText.includes('Video Demo Switch Target')) {
      throw new Error(`expected switched markdown document text to match the target file, got ${JSON.stringify(switchedText.slice(0, 160))}`)
    }
    if (switchedText.includes('GrabMaps Switch Source')) {
      throw new Error(`expected switched markdown document text to drop the previous file payload, got ${JSON.stringify(switchedText.slice(0, 160))}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
    restoreWindow()
  }
}
