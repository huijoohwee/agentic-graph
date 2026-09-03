import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'

const tick = async () => {
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), 0)
  })
}

export async function testMarkdownFileTreeFolderClickDoesNotClearSelection() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const doc = dom.window.document
  const container = doc.createElement('section')
  doc.body.appendChild(container)

  let root: ReturnType<typeof createRoot> | null = null
  try {
    const expandedCalls: WorkspacePath[] = []
    const selectFileCalls: WorkspacePath[] = []

    const entries: WorkspaceEntry[] = [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/folder', parentPath: '/', kind: 'folder', name: 'folder', updatedAtMs: 1 },
      { path: '/folder/file.md', parentPath: '/folder', kind: 'file', name: 'file.md', text: '# ok', updatedAtMs: 1 },
    ]

    root = createRoot(container as unknown as HTMLElement)
    root.render(
      <MarkdownFileTree
        entries={entries}
        expandedPaths={new Set()}
        toggleExpanded={path => expandedCalls.push(path)}
        activePath={'/folder/file.md'}
        onSelectFile={path => selectFileCalls.push(path)}
        sourcesByPath={null}
      />,
    )
    await tick()

    let folderButton: HTMLButtonElement | null = null
    for (let i = 0; i < 50; i += 1) {
      folderButton = container.querySelector('section[aria-label="Folder folder"] button') as HTMLButtonElement | null
      if (folderButton) break
      await tick()
    }
    if (!folderButton) throw new Error('folder button not found')

    folderButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick()

    if (expandedCalls.length !== 1 || expandedCalls[0] !== '/folder') {
      throw new Error(`expected toggleExpanded to be called once with /folder, got ${JSON.stringify(expandedCalls)}`)
    }
    if (selectFileCalls.length !== 0) {
      throw new Error(`expected onSelectFile not to be called, got ${JSON.stringify(selectFileCalls)}`)
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
  }
}

export async function testMarkdownFileTreeExcludesLegacyRootsAndKeepsCanonicalArtifacts() {
  const { dom, restore: restoreDom } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)

  let root: ReturnType<typeof createRoot> | null = null
  try {
    const entries: WorkspaceEntry[] = [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/agentic-canvas-os', parentPath: '/', kind: 'folder', name: 'agentic-canvas-os', updatedAtMs: 1 },
      { path: '/agentic-os-docs', parentPath: '/', kind: 'folder', name: 'agentic-os-docs', updatedAtMs: 1 },
      { path: '/video-runs', parentPath: '/', kind: 'folder', name: 'video-runs', updatedAtMs: 1 },
      { path: '/video-runs-24', parentPath: '/', kind: 'folder', name: 'video-runs-24', updatedAtMs: 1 },
      { path: '/video-runs-demo', parentPath: '/', kind: 'folder', name: 'video-runs-demo', updatedAtMs: 1 },
      { path: '/agentic-os-output_20260720T010203Z-video.mp4', parentPath: '/', kind: 'file', name: 'agentic-os-output_20260720T010203Z-video.mp4', updatedAtMs: 1 },
    ]

    root = createRoot(container as unknown as HTMLElement)
    root.render(
      <MarkdownFileTree
        entries={entries}
        expandedPaths={new Set()}
        toggleExpanded={() => undefined}
        activePath={null}
        onSelectFile={() => undefined}
        sourcesByPath={null}
      />,
    )
    await tick()

    if (!container.querySelector('section[aria-label="Folder agentic-canvas-os"]')) {
      throw new Error('expected canonical agentic-canvas-os root to remain visible')
    }
    if (container.querySelector('section[aria-label="Folder agentic-os-docs"]')) {
      throw new Error('expected legacy agentic-os-docs root to be excluded')
    }
    if (container.querySelector('section[aria-label="Folder video-runs"]') || container.querySelector('section[aria-label="Folder video-runs-24"]')) {
      throw new Error('expected legacy video-runs roots to be excluded')
    }
    if (!container.querySelector('section[aria-label="Folder video-runs-demo"]')) {
      throw new Error('expected similarly named nonlegacy folders to remain visible')
    }
    if (!container.querySelector('section[aria-label="File agentic-os-output_20260720T010203Z-video.mp4"]')) {
      throw new Error('expected the current generated artifact to remain visible')
    }
  } finally {
    try {
      root?.unmount()
    } catch {
      void 0
    }
    restoreDom()
  }
}
