import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { MarkdownFileTreeRowButton } from '@/features/markdown-workspace/MarkdownFileTreeRowButton'

export async function testMarkdownFileTreeRowButtonReusesSharedRowShell() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  let clicks = 0
  let contextMenus = 0

  try {
    await act(async () => {
      root.render(
        React.createElement(
          MarkdownFileTreeRowButton,
          {
            ariaLabel: 'File note.md',
            indent: 12,
            isActive: true,
            textClassName: 'text-sm',
            onClick: () => {
              clicks += 1
            },
            onContextMenu: event => {
              event.preventDefault()
              contextMenus += 1
            },
            children: React.createElement('span', null, 'note.md'),
          },
        ),
      )
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const button = container.querySelector('button')
    if (!(button instanceof dom.window.HTMLButtonElement)) throw new Error('expected shared file-tree row button to render a button')
    if (button.getAttribute('aria-label') !== 'File note.md') throw new Error(`expected row aria-label, got ${String(button.getAttribute('aria-label') || '')}`)
    if (!String(button.className || '').includes('flex-1')) throw new Error(`expected shared row button shell classes, got ${String(button.className || '')}`)

    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    if (clicks !== 1) throw new Error(`expected shared row click once, got ${String(clicks)}`)
    if (contextMenus !== 1) throw new Error(`expected shared row context menu once, got ${String(contextMenus)}`)
  } finally {
    await act(async () => {
      root.unmount()
    })
    restore()
  }
}

export async function testMarkdownFileTreeRevealsActiveSourceWithoutStealingFocus() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const revealed: string[] = []
  dom.window.HTMLElement.prototype.scrollIntoView = function () { revealed.push(this.getAttribute('title') || '') }
  const entries: WorkspaceEntry[] = [
    { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
    { path: '/docs', parentPath: '/', kind: 'folder', name: 'docs', updatedAtMs: 1 },
    { path: '/docs/scenes', parentPath: '/docs', kind: 'folder', name: 'scenes', updatedAtMs: 1 },
    { path: '/docs/scenes/playground.md', parentPath: '/docs/scenes', kind: 'file', name: 'playground.md', updatedAtMs: 1 },
  ]
  function Harness({ activePath }: { activePath: string | null }) {
    const state = useMarkdownWorkspaceBootstrapState({ activePath, effectiveBottomSurfaceCollapsed: false })
    return <MarkdownFileTree entries={entries} activePath={activePath} expandedPaths={state.expandedPaths}
      toggleExpanded={() => {}} onSelectFile={() => {}} />
  }
  try {
    dom.window.localStorage.clear()
    await act(async () => { root.render(<Harness activePath={null} />) })
    if (container.querySelector('[aria-current]')) throw new Error('expected no active row before a document opens')
    const focused = dom.window.document.activeElement
    await act(async () => { root.render(<Harness activePath="/docs/scenes/playground.md" />) })
    const active = container.querySelector('[aria-current="page"]')
    if (active?.getAttribute('title') !== '/docs/scenes/playground.md') throw new Error('expected full source path on the revealed active file')
    if (revealed.length !== 1 || revealed[0] !== '/docs/scenes/playground.md') throw new Error('expected active document to reveal through collapsed source ancestors once')
    if (dom.window.document.activeElement !== focused) throw new Error('revealing the source must preserve editor keyboard focus')
    await act(async () => { root.render(<Harness activePath="/docs/scenes/playground.md" />) })
    if (revealed.length !== 1) throw new Error('ordinary rerenders must not pull the explorer back to the active row')
  } finally {
    await act(async () => { root.unmount() })
    restore()
  }
}

export async function testMarkdownFileTreeReadOnlyContextMenuCopiesPaths() {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container), copied: string[] = []
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { copied.push(text) } } })
  const path = '/.workspace/workflow-test/agent-mission.manifest.json'
  try {
    await act(async () => { root.render(<MarkdownFileTree readOnly entries={[
      { path, parentPath: '/', kind: 'file', name: 'agent-mission.manifest.json', updatedAtMs: 1 },
    ]} expandedPaths={new Set()} activePath={path} toggleExpanded={() => {}} onSelectFile={() => {}}
      onRenameEntry={() => { throw Error('Read-only rename') }} onDeleteEntry={() => { throw Error('Read-only delete') }} />) })
    const row = container.querySelector('button[aria-label="File agent-mission.manifest.json"]')!
    for (const label of ['Copy Path', 'Copy Relative Path']) {
      await act(async () => { row.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })) })
      const items = Array.from(container.querySelectorAll('.kg-data-view-floating-menu button')) as HTMLButtonElement[]
      if (items.map(item => item.textContent).join(',') !== 'Share URL,Share canvas embed,Reveal in Finder,Copy Path,Copy Relative Path,New file,Clear,Rename,Delete') throw Error('Read-only menu must retain the shared file menu and order')
      if (items.filter(item => !item.disabled).map(item => item.textContent).join(',') !== 'Copy Path,Copy Relative Path') throw Error('Only applicable path actions may be enabled')
      await act(async () => { items.filter(item => item.disabled).forEach(item => item.click()) })
      if (!container.querySelector('.kg-data-view-floating-menu')) throw Error('Disabled actions must not dismiss the menu or execute')
      await act(async () => { (items.find(item => item.textContent === label) as HTMLButtonElement).click() })
      if (container.querySelector('.kg-data-view-floating-menu')) throw Error('Path action must close the menu')
    }
    if (copied.join(',') !== `${path},${path.slice(1)}`) throw Error('Both path actions must copy the selected manifest path')
  } finally {
    await act(async () => { root.unmount() })
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    restore()
  }
}
