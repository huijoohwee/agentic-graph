import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { MarkdownFileTree } from '@/features/markdown-workspace/MarkdownFileTree'
import type { WorkspaceEntry } from '@/features/workspace-fs/types'
import { closeAgentRunInspection, readAgentRunWorkspace, selectAgentRunSource, useAgentRunFolderSelection } from '@/features/agent-ready/agentRunInspectionStore'
import { AgentMissionSourceFile } from '@/features/agent-ready/agentMissionSourceFiles'
import { SourceFileCloudSyncIndicator } from '@/features/markdown-workspace/SourceFileCloudSyncIndicator'
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
      toggleExpanded={() => {}} onSelectFile={() => {}} onSelectFolder={() => {}} />
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
  await testSourceFileSelectionAndAffordances()
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
    ]} expandedPaths={new Set()} activePath={path} toggleExpanded={() => {}} onSelectFile={() => {}} onSelectFolder={() => {}}
      onRenameEntry={() => { throw Error('Read-only rename') }} onDeleteEntry={() => { throw Error('Read-only delete') }} />) })
    const row = container.querySelector('button[aria-label="File agent-mission.manifest.json"]')!
    for (const label of ['Copy Path', 'Copy Relative Path']) {
      await act(async () => { row.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })) })
      const items = Array.from(document.querySelectorAll('.kg-data-view-floating-menu button')) as HTMLButtonElement[]
      if (items.map(item => item.getAttribute('aria-label')).join(',') !== 'Share URL,Share canvas embed,Reveal in Finder,Copy Path,Copy Relative Path,New file,Clear,Rename,Delete') throw Error('Read-only menu must retain the shared file menu and order')
      if (items.filter(item => !item.disabled).map(item => item.getAttribute('aria-label')).join(',') !== 'Copy Path,Copy Relative Path') throw Error('Only applicable path actions may be enabled')
      await act(async () => { items.filter(item => item.disabled).forEach(item => item.click()) })
      if (!document.querySelector('.kg-data-view-floating-menu')) throw Error('Disabled actions must not dismiss the menu or execute')
      await act(async () => { (items.find(item => item.getAttribute('aria-label') === label) as HTMLButtonElement).click() })
      if (document.querySelector('.kg-data-view-floating-menu')) throw Error('Path action must close the menu')
    }
    if (copied.join(',') !== `${path},${path.slice(1)}`) throw Error('Both path actions must copy the selected manifest path')
  } finally {
    await act(async () => { root.unmount() })
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    restore()
  }
}

async function testSourceFileSelectionAndAffordances() {
  const { dom, restore } = initJsdomHarness()
  dom.window.matchMedia = (media: string) => ({ matches: false, media, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true })
  const browserErrors: string[] = []
  dom.window.addEventListener('error', event => { browserErrors.push(event.message) })
  const container = dom.window.document.createElement('section')
  dom.window.document.body.appendChild(container)
  const root = createRoot(container)
  const entry: WorkspaceEntry = { path: '/article.md', parentPath: '/', kind: 'file', name: 'article.md', updatedAtMs: 1 }
  let opens = 0, uploads = 0
  function Harness({ activePath, url = 'https://example.org/article' }: { activePath: string | null; url?: string }) {
    const selectedFolder = useAgentRunFolderSelection()
    const selectedPath = selectedFolder ?? activePath
    return <><AgentMissionSourceFile activePath={selectedPath} /><MarkdownFileTree entries={[entry]}
      expandedPaths={new Set()} toggleExpanded={() => {}} activePath={selectedPath}
      onSelectFile={() => { selectAgentRunSource(null); opens++ }} onSelectFolder={() => {}} sourcesByPath={{ [entry.path]: { kind: 'url', url } }}
      renderContextActions={() => <SourceFileCloudSyncIndicator entry={entry} status="local" onUpload={() => { uploads++ }} />} /></>
  }
  try {
    await act(async () => { root.render(<Harness activePath={null} />) })
    assert.equal(container.querySelectorAll('[aria-current]').length, 0, 'An inactive mission must not select its fallback inspection file')
    let mission = container.querySelector('button[aria-label="File agent-mission.inspection.json"]')!
    const missionPath = mission.getAttribute('title')!
    const folderName = container.querySelector('button[aria-label="Folder unobserved"]')!
    const disclosure = container.querySelector('button[aria-label="Collapse folder unobserved"]')!
    const folderRow = container.querySelector('button[aria-label="Folder unobserved"]')!
    await act(async () => { (folderName as HTMLButtonElement).click() })
    assert.equal(container.querySelector('[aria-current]'), folderRow, 'Read-only mission folder name must select its folder')
    assert.equal(disclosure.getAttribute('aria-expanded'), 'true', 'Mission folder selection must preserve expansion')
    assert.equal(readAgentRunWorkspace(), null, 'Selecting a folder must not activate a mission Canvas or document')
    await act(async () => { (disclosure as HTMLButtonElement).click() })
    assert.equal(disclosure.getAttribute('aria-expanded'), 'false')
    assert.equal(container.querySelector('[aria-current]'), folderRow, 'Collapsing must retain mission folder selection')
    await act(async () => { (disclosure as HTMLButtonElement).click(); selectAgentRunSource(null) })
    assert.equal(container.querySelector('[aria-current]'), null, 'Leaving mission sources must clear folder selection')
    mission = container.querySelector('button[aria-label="File agent-mission.inspection.json"]')!
    await act(async () => { (container.querySelector('button[aria-label="Select file agent-mission.inspection.json"]') as HTMLButtonElement).click() })
    assert.equal(readAgentRunWorkspace()?.source, missionPath, 'Mission file icon must open the selected document')
    await act(async () => { (folderName as HTMLButtonElement).click() })
    assert.equal(readAgentRunWorkspace()?.source, missionPath, 'Folder selection must preserve the open mission document')
    assert.equal(container.querySelector('[aria-current]')?.getAttribute('aria-label'), 'Folder unobserved')
    await act(async () => { selectAgentRunSource(null) })
    await act(async () => { root.render(<Harness activePath={missionPath} />) })
    assert.equal(container.querySelector('[aria-current]'), mission, 'Explicit mission selection must highlight the visible mission document')
    await act(async () => { root.render(<Harness activePath={entry.path} />) })
    assert.equal(mission.hasAttribute('aria-current'), false, 'Opening an authored file must clear mission selection')
    const file = container.querySelector('button[aria-label="File article.md"]')!
    assert.deepEqual([...container.querySelectorAll('[aria-current]')], [file], 'Both source trees must share one current selection')
    const row = file.parentElement!
    assert.equal(row.querySelector('a, [data-source-file-cloud-status]'), null, 'File actions live only in the context toolbar')
    await act(async () => { file.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })) })
    const menu = document.querySelector('[role="toolbar"][aria-label="Actions for article.md"]')!
    const link = menu.querySelector('a')!, cloud = menu.querySelector('[data-source-file-cloud-status]')!
    assert.equal(link.href, 'https://example.org/article')
    assert.equal(link.getAttribute('aria-label'), 'Open source URL for article.md')
    assert.ok(link.compareDocumentPosition(cloud) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING)
    assert.equal(link.getAttribute('target'), '_blank')
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer')
    assert.equal(menu.querySelector('button button, button a'), null)
    for (const action of menu.querySelectorAll('button, a')) assert.ok(action.getAttribute('aria-label'))
    await act(async () => { row.querySelector('button[aria-label="Select file article.md"] svg')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(opens, 1, 'File icon must activate the file')
    const fileIcon = row.querySelector('button[aria-label="Select file article.md"]')!
    assert.equal(fileIcon.getAttribute('aria-pressed'), 'true')
    assert.ok(fileIcon.classList.contains('kg-data-view-icon-action--sm'), 'File selection must reuse the shared square control')
    await act(async () => { cloud.querySelector('svg')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
    assert.equal(uploads, 1, 'Cloud icon must activate only its cloud control')
    assert.equal(opens, 1)
    await act(async () => { root.render(<Harness activePath={entry.path} url="javascript:alert(1)" />) })
    assert.equal(document.querySelector('.kg-data-view-floating-menu a'), null, 'Untrusted source protocols must never become executable links')
    assert.deepEqual(browserErrors, [], 'Source selection handlers must finish without browser errors')
  } finally {
    await act(async () => { root.unmount() })
    closeAgentRunInspection()
    restore()
  }
}
