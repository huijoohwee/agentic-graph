import React, { act } from 'react'
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

    const selectedFolders: WorkspacePath[] = []
    function Harness() {
      const [selected, select] = React.useState('/folder/file.md')
      const [expanded, expand] = React.useState(new Set<string>())
      return <MarkdownFileTree entries={entries} expandedPaths={expanded}
        toggleExpanded={path => {
          expandedCalls.push(path)
          expand(previous => { const next = new Set(previous); if (next.has(path)) next.delete(path); else next.add(path); return next })
        }} activePath={selected} onSelectFile={path => { selectFileCalls.push(path); select(path) }}
        onSelectFolder={path => { selectedFolders.push(path); select(path) }} />
    }
    root = createRoot(container as unknown as HTMLElement)
    await act(async () => { root!.render(<Harness />) })
    const folder = container.querySelector('button[aria-label="Folder folder"]')!
    const iconButton = container.querySelector('button[aria-label="Select folder folder"]')!
    const icon = iconButton.querySelector('svg[role="img"]')!
    if (!iconButton.classList.contains('kg-data-view-icon-action--sm')) throw Error('Folder icon must reuse the shared square control')
    if (!icon || icon.hasAttribute('aria-hidden')) throw Error('Folder icon must be a named, visible selection target')
    if (!icon.classList.contains('lucide-folder')) throw Error('Collapsed folder must show the closed-folder glyph')
    await act(async () => { icon.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    if (selectedFolders.join() !== '/folder' || folder.getAttribute('aria-current') !== 'page') throw Error('Folder icon must select its folder')
    if (expandedCalls.length) throw Error('Folder selection must not also toggle expansion')
    const disclosure = container.querySelector('button[aria-label="Expand folder folder"]') as HTMLButtonElement
    if (!disclosure.classList.contains('kg-data-view-icon-action--sm') || disclosure.classList.contains('self-stretch')) throw Error('Disclosure must be square, independent of row height')
    await act(async () => { disclosure.click() })
    if (expandedCalls.join() !== '/folder' || disclosure.getAttribute('aria-expanded') !== 'true') throw Error('Disclosure must expand children')
    if (!container.querySelector('button[aria-label="File file.md"]')) throw Error('Expanded folder must reveal its file')
    if (folder.getAttribute('aria-current') !== 'page' || selectedFolders.length !== 1) throw Error('Disclosure must preserve selection')
    if (selectFileCalls.length) throw Error('Folder controls must not open a file')
    if (!iconButton.querySelector('.lucide-folder-open')) throw Error('Expanded folder must show the open-folder glyph')
    const guide = container.querySelector('button[aria-label="Select folder folder from hierarchy guide"]') as HTMLButtonElement
    if (!guide?.querySelector('svg[role="img"]')) throw Error('Hierarchy guide must expose a named image inside a real control')
    await act(async () => { guide.click() })
    if (selectedFolders.join() !== '/folder,/folder' || expandedCalls.join() !== '/folder') throw Error('Hierarchy guide must select its parent without changing expansion')
    if (container.querySelector('div, [aria-hidden="true"], button button')) throw Error('Tree affordances must use semantic, visible controls without nested buttons')
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
        onSelectFolder={() => undefined}
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
