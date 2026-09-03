import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import { useMarkdownWorkspaceViewShell } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceViewShell'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export async function testMarkdownWorkspaceViewShellFileSelectionClearsCanvasSelectionAuthority() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setSelectionSource('canvas')

    const entries: WorkspaceEntry[] = [
      { path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 1 },
      { path: '/workspace-readme.md', parentPath: '/', kind: 'file', name: 'workspace-readme.md', text: '# readme', updatedAtMs: 2 },
      { path: '/agentic-graph-maps-places.md', parentPath: '/', kind: 'file', name: 'agentic-graph-maps-places.md', text: '# places', updatedAtMs: 3 },
    ]

    const container = harness.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function TestHarness() {
      const [, forceRender] = React.useReducer((n: number) => n + 1, 0)
      const [selectionPath, setSelectionPath] = React.useState<WorkspacePath | null>(null)
      const [activePath, setActivePath] = React.useState<WorkspacePath | null>('/agentic-graph-maps-places.md')
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())

      const viewShell = useMarkdownWorkspaceViewShell({
        entries,
        sourcesByPath: {},
        folderModeContract: 'sitemap',
        setFolderModeContract: () => {},
        activePath,
        selectionPath,
        selectionEntryKind: 'file',
        setActivePathSafe: path => setActivePath(path),
        setSelectionPathSafe: path => setSelectionPath(path),
        setSelectionSource: source => {
          useGraphStore.getState().setSelectionSource(source)
          forceRender()
        },
        setExpandedPaths,
        resolveFolderContractDocPath: folderPath => folderPath,
        pickFolderContractTargetPath: () => null,
        revealLineInEditor: () => {},
        setStatusWithAutoClear: () => {},
      })

      return (
        <button
          id="select-readme"
          type="button"
          data-active-path={activePath || ''}
          data-selection-path={selectionPath || ''}
          data-selection-source={String(useGraphStore.getState().selectionSource || '')}
          onClick={() => viewShell.onSelectFile('/workspace-readme.md')}
        >
          Select readme
        </button>
      )
    }

    root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root.render(<TestHarness />)
      await tick()
    })

    const button = container.querySelector('#select-readme') as HTMLButtonElement | null
    if (!button) throw new Error('missing select-readme button')
    if (button.dataset.selectionSource !== 'canvas') {
      throw new Error(`expected initial selection source to stay canvas, got ${String(button.dataset.selectionSource || '')}`)
    }

    await act(async () => {
      button.dispatchEvent(new harness.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }))
      await tick()
    })

    if (button.dataset.activePath !== '/workspace-readme.md') {
      throw new Error(`expected workspace file selection to activate readme, got ${String(button.dataset.activePath || '')}`)
    }
    if (button.dataset.selectionPath !== '/workspace-readme.md') {
      throw new Error(`expected workspace file selection to update selection path, got ${String(button.dataset.selectionPath || '')}`)
    }
    const nextSelectionSource = String(button.dataset.selectionSource || '')
    if (nextSelectionSource !== 'editor') {
      throw new Error(`expected workspace file selection to override stale canvas selection authority, got ${nextSelectionSource}`)
    }
  } finally {
    try {
      useGraphStore.getState().resetAll()
    } catch {
      void 0
    }
    try {
      await act(async () => {
        root?.unmount()
        await tick()
      })
    } catch {
      void 0
    }
    harness.restore()
  }
}

export async function testMarkdownWorkspaceViewShellKeepsYoutubeFormatOutOfSourceFileRow() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const entry: WorkspaceEntry = {
      path: '/youtube-transcript.md',
      parentPath: '/',
      kind: 'file',
      name: 'youtube-transcript.md',
      text: '# Transcript',
      updatedAtMs: 1,
    }
    const container = harness.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function TestHarness() {
      const [folderModeContract, setFolderModeContract] = React.useState<'sitemap' | 'user-journey'>('sitemap')
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())
      const viewShell = useMarkdownWorkspaceViewShell({
        entries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 }, entry],
        sourcesByPath: {},
        folderModeContract,
        setFolderModeContract,
        activePath: entry.path,
        selectionPath: entry.path,
        selectionEntryKind: 'file',
        setActivePathSafe: () => {},
        setSelectionPathSafe: () => {},
        setSelectionSource: () => {},
        setExpandedPaths,
        resolveFolderContractDocPath: folderPath => folderPath,
        pickFolderContractTargetPath: () => null,
        revealLineInEditor: () => {},
        setStatusWithAutoClear: () => {},
      })

      return <section>{viewShell.renderSourceFileRight({ entry, isActive: true })}</section>
    }

    root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root.render(<TestHarness />)
      await tick()
    })

    const legacySelect = container.querySelector('select[aria-label="YouTube transcript format"]')
    if (legacySelect) throw new Error('expected YouTube source file format control to avoid legacy select menu')
    const rowControls = String(container.textContent || '').trim()
    if (rowControls) throw new Error(`expected file-name right side format controls to be consolidated into the toolbar, got ${rowControls}`)
  } finally {
    try {
      await act(async () => {
        root?.unmount()
        await tick()
      })
    } catch {
      void 0
    }
    harness.restore()
  }
}

export async function testMarkdownWorkspaceViewShellShowsFrontmatterWarningBadgeForMalformedFileRow() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const entry: WorkspaceEntry = {
      path: '/broken-frontmatter.md',
      parentPath: '/',
      kind: 'file',
      name: 'broken-frontmatter.md',
      text: [
        '---',
        'title: "Broken',
        'flow:',
        '  direction: LR',
        '---',
        '',
        '# Invalid',
      ].join('\n'),
      updatedAtMs: 1,
    }
    const container = harness.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function TestHarness() {
      const [folderModeContract, setFolderModeContract] = React.useState<'sitemap' | 'user-journey'>('sitemap')
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())
      const viewShell = useMarkdownWorkspaceViewShell({
        entries: [{ path: '/', parentPath: null, kind: 'folder', name: '', updatedAtMs: 0 }, entry],
        sourcesByPath: {},
        folderModeContract,
        setFolderModeContract,
        activePath: null,
        selectionPath: null,
        selectionEntryKind: 'file',
        setActivePathSafe: () => {},
        setSelectionPathSafe: () => {},
        setSelectionSource: () => {},
        setExpandedPaths,
        resolveFolderContractDocPath: folderPath => folderPath,
        pickFolderContractTargetPath: () => null,
        revealLineInEditor: () => {},
        setStatusWithAutoClear: () => {},
      })

      return <section>{viewShell.renderSourceFileRight({ entry, isActive: false })}</section>
    }

    root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root.render(<TestHarness />)
      await tick()
    })

    const badge = container.querySelector('[aria-label="Frontmatter warning in broken-frontmatter.md"]') as HTMLElement | null
    if (!badge) throw new Error('expected malformed frontmatter file row to render a warning badge')
    if (String(badge.textContent || '').trim() !== 'YAML') {
      throw new Error(`expected compact YAML warning badge, got ${JSON.stringify(badge.textContent || '')}`)
    }
    const title = String(badge.getAttribute('title') || '')
    if (!title.includes('Markdown frontmatter YAML parse failed and frontmatter was ignored:')) {
      throw new Error(`expected warning badge title to reuse parse warning summary, got ${JSON.stringify(title)}`)
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
        await tick()
      })
    } catch {
      void 0
    }
    harness.restore()
  }
}

export async function testMarkdownWorkspaceViewShellSuppressesYamlBadgeForLiveStreamingTraceRow() {
  const harness = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  let root: ReturnType<typeof createRoot> | null = null

  try {
    const entry: WorkspaceEntry = {
      path: '/docs/20260527T123654Z/kgc-trace_20260527T123654Z.md',
      parentPath: '/docs/20260527T123654Z',
      kind: 'file',
      name: 'kgc-trace_20260527T123654Z.md',
      updatedAtMs: 1,
      text: ['---', 'title: "Broken', 'flow: [a b]', '---', '', '# Streaming'].join('\n'),
    }

    const container = harness.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    function TestHarness() {
      const viewShell = useMarkdownWorkspaceViewShell({
        entries: [entry],
        sourcesByPath: {},
        folderModeContract: 'sitemap',
        setFolderModeContract: () => {},
        activePath: entry.path,
        selectionPath: entry.path,
        selectionEntryKind: 'file',
        setActivePathSafe: () => {},
        setSelectionPathSafe: () => {},
        setSelectionSource: () => {},
        setExpandedPaths: () => {},
        resolveFolderContractDocPath: folderPath => folderPath,
        pickFolderContractTargetPath: () => null,
        revealLineInEditor: () => {},
        setStatusWithAutoClear: () => {},
        streamingWorkspacePath: entry.path,
      })

      return <section>{viewShell.renderSourceFileRight({ entry, isActive: true })}</section>
    }

    root = createRoot(container as unknown as HTMLElement)
    await act(async () => {
      root.render(<TestHarness />)
      await tick()
    })

    const badge = container.querySelector('[aria-label="Frontmatter warning in kgc-trace_20260527T123654Z.md"]') as HTMLElement | null
    if (badge) {
      throw new Error('expected live streaming trace row to suppress transient YAML warning badges')
    }
  } finally {
    try {
      await act(async () => {
        root?.unmount()
        await tick()
      })
    } catch {
      void 0
    }
    harness.restore()
  }
}
