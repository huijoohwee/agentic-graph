import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import type { WorkspaceEntry, WorkspacePath } from '@/features/workspace-fs/types'
import { resolveCanvasMarkdownSyncTargetPath, useCanvasMarkdownSync } from '@/features/markdown-workspace/useCanvasMarkdownSync'

const tick = async () => {
  await new Promise<void>(resolve => setTimeout(resolve, 0))
}

export function testCanvasSelectionSyncCanonicalizesDocsMirrorAliases() {
  const entries: WorkspaceEntry[] = [
    { kind: 'file', path: '/report.md', parentPath: '/', name: 'report.md', updatedAtMs: 1, text: 'root alias' },
    { kind: 'file', path: '/docs/report.md', parentPath: '/docs', name: 'report.md', updatedAtMs: 1, text: 'canonical docs mirror' },
  ]
  const target = resolveCanvasMarkdownSyncTargetPath({
    entries,
    docKey: 'report.md',
  })
  if (target !== '/docs/report.md') {
    throw new Error(`expected canvas markdown sync to select canonical docs mirror path, got ${String(target)}`)
  }
}

export async function testCanvasSelectionDoesNotAutoOpenWorkspaceWhenInactive() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('canvas')
    store.setGraphData({
      type: 'Graph',
      context: 'test',
      nodes: [
        {
          id: 'n1',
          type: 'Node',
          label: 'Hello',
          properties: {},
          metadata: { documentPath: 'foo.md', lineStart: 2, lineEnd: 4 },
        },
      ],
      edges: [],
    } as never)
    store.setSelectionSource('canvas')
    store.selectNode('n1')

    const container = bootstrap.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const entries: WorkspaceEntry[] = [
      { kind: 'file', path: '/foo.md', parentPath: '/', name: 'foo.md', updatedAtMs: Date.now(), text: 'hi' },
    ]

    const calls = { reveal: 0, setActive: 0 }

    function Harness(props: { active: boolean }) {
      const [activePath, setActivePath] = React.useState<WorkspacePath | null>(null)
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())

      useCanvasMarkdownSync({
        active: props.active,
        entries,
        activePath,
        setActivePathSafe: path => {
          calls.setActive += 1
          setActivePath(path)
        },
        setExpandedPaths,
        revealLineInEditor: () => {
          calls.reveal += 1
        },
        setStatusError: () => {},
      })

      return null
    }

    const root = createRoot(container)

    await act(async () => {
      root.render(<Harness active={false} />)
    })
    await tick()

    if (calls.reveal !== 0 || calls.setActive !== 0) {
      throw new Error(`expected no sync calls when inactive, got reveal=${calls.reveal} setActive=${calls.setActive}`)
    }

    await act(async () => {
      root.render(<Harness active={true} />)
    })
    await tick()

    if (calls.reveal <= 0 || calls.setActive <= 0) {
      throw new Error(`expected sync calls when active, got reveal=${calls.reveal} setActive=${calls.setActive}`)
    }

    await act(async () => {
      root.unmount()
    })
    await tick()
  } finally {
    try {
      useGraphStore.getState().setWorkspaceViewMode('canvas')
    } catch {
      void 0
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testCanvasSelectionRetriesAfterMissingWorkspaceFileAppears() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const sessionId = '20260102T030405Z'
    const canonicalPath = `/chat-log/${sessionId}/agenticOs_${sessionId}.md` as WorkspacePath
    const tracePath = `/chat-log/${sessionId}/agentic-os-trace_${sessionId}.md` as WorkspacePath
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('editor')
    store.setGraphData({
      type: 'Graph',
      context: 'test',
      nodes: [
        {
          id: 'run',
          type: 'Run',
          label: 'AGENTIC_OS',
          properties: {},
          metadata: {
            documentPath: canonicalPath.replace(/^\/+/, ''),
            lineStart: 3,
            lineEnd: 3,
          },
        },
      ],
      edges: [],
    } as never)
    store.setMarkdownDocument(tracePath, '# Trace')
    store.setSelectionSource('canvas')
    store.selectNode('run')

    const container = bootstrap.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const calls = {
      errors: [] as string[],
      reveals: 0,
      activePaths: [] as string[],
    }

    function Harness(props: { entries: WorkspaceEntry[] }) {
      const [activePath, setActivePath] = React.useState<WorkspacePath | null>(tracePath)
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())

      useCanvasMarkdownSync({
        active: true,
        entries: props.entries,
        activePath,
        setActivePathSafe: path => {
          calls.activePaths.push(path)
          setActivePath(path)
        },
        setExpandedPaths,
        revealLineInEditor: () => {
          calls.reveals += 1
        },
        setStatusError: message => {
          calls.errors.push(message)
        },
      })

      return null
    }

    const root = createRoot(container)

    await act(async () => {
      root.render(<Harness entries={[]} />)
    })
    await tick()

    if (!calls.errors.some(message => message.includes(`Missing file: ${canonicalPath.replace(/^\/+/, '')}`))) {
      throw new Error(`expected initial stale-entry pass to report the missing AGENTIC_OS file, got ${JSON.stringify(calls.errors)}`)
    }
    if (calls.activePaths.length !== 0 || calls.reveals !== 0) {
      throw new Error(`expected missing file pass not to activate or reveal, got ${JSON.stringify(calls)}`)
    }

    const entries: WorkspaceEntry[] = [
      {
        kind: 'file',
        path: canonicalPath,
        parentPath: `/chat-log/${sessionId}` as WorkspacePath,
        name: `agenticOs_${sessionId}.md`,
        text: '# AGENTIC_OS',
        updatedAtMs: 2,
      },
    ]
    await act(async () => {
      root.render(<Harness entries={entries} />)
    })
    await tick()

    if (!calls.activePaths.includes(canonicalPath)) {
      throw new Error(`expected canvas selection to retry and activate the AGENTIC_OS file after entries refresh, got ${JSON.stringify(calls.activePaths)}`)
    }
    if (calls.reveals <= 0) {
      throw new Error('expected canvas selection to reveal the AGENTIC_OS document location after retry')
    }

    await act(async () => {
      root.unmount()
    })
    await tick()
  } finally {
    useGraphStore.getState().resetAll()
    bootstrap.restore()
  }
}

export async function testCanvasSelectionSyncSkipsWhenLiveSelectionSourceChangesToEditor() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('canvas')
    store.setGraphData({
      type: 'Graph',
      context: 'test',
      nodes: [
        {
          id: 'n1',
          type: 'Node',
          label: 'Hello',
          properties: {},
          metadata: { documentPath: 'foo.md', lineStart: 2, lineEnd: 4 },
        },
      ],
      edges: [],
    } as never)
    store.setSelectionSource('canvas')
    store.selectNode('n1')

    const container = bootstrap.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const entries: WorkspaceEntry[] = [
      { kind: 'file', path: '/foo.md', parentPath: '/', name: 'foo.md', updatedAtMs: Date.now(), text: 'hi' },
    ]

    const calls = { reveal: 0, setActive: 0 }

    function Harness() {
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())

      useCanvasMarkdownSync({
        active: true,
        entries,
        activePath: null,
        setActivePathSafe: path => {
          void path
          calls.setActive += 1
          useGraphStore.getState().setSelectionSource('editor')
        },
        setExpandedPaths,
        revealLineInEditor: () => {
          calls.reveal += 1
        },
        setStatusError: () => {},
      })

      return null
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
    })

    await tick()

    if (calls.reveal !== 0 || calls.setActive !== 1) {
      throw new Error(`expected live selection-source guard to prevent canvas sync override, got reveal=${calls.reveal} setActive=${calls.setActive}`)
    }

    await act(async () => {
      root.unmount()
    })
    await tick()
  } finally {
    try {
      useGraphStore.getState().setWorkspaceViewMode('canvas')
    } catch {
      void 0
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}

export async function testCanvasSelectionSyncRetriesKeywordTextHighlightWhenSourceTextArrives() {
  const bootstrap = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  try {
    const store = useGraphStore.getState()
    store.resetAll()
    store.setWorkspaceViewMode('canvas')
    store.setGraphData({
      type: 'Graph',
      context: 'test',
      nodes: [
        {
          id: 'kw:agent',
          type: 'Keyword',
          label: 'Agent Labs',
          properties: { 'keyword:key': 'agent labs' },
          metadata: { derived: true, kind: 'keyword' },
        },
      ],
      edges: [],
    } as never)
    useGraphStore.setState({ markdownDocumentText: 'No matching source yet.' } as never)
    store.setSelectionSource('canvas')
    store.selectNode('kw:agent')

    const container = bootstrap.dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const entries: WorkspaceEntry[] = [
      { kind: 'file', path: '/foo.md', parentPath: '/', name: 'foo.md', updatedAtMs: Date.now(), text: 'Agent Labs ships locally.' },
    ]

    const calls: { reveal: number; line: number } = { reveal: 0, line: 0 }
    const readCalls = () => ({ reveal: calls.reveal, line: calls.line })

    function Harness() {
      const [activePath, setActivePath] = React.useState<WorkspacePath | null>('/foo.md' as WorkspacePath)
      const [, setExpandedPaths] = React.useState<Set<string>>(() => new Set())

      useCanvasMarkdownSync({
        active: true,
        entries,
        activePath,
        setActivePathSafe: path => {
          setActivePath(path)
        },
        setExpandedPaths,
        revealLineInEditor: line => {
          calls.reveal += 1
          calls.line = line
        },
        setStatusError: () => {},
      })

      return null
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(<Harness />)
    })
    await tick()

    const beforeSourceText = readCalls()
    if (beforeSourceText.reveal !== 0) {
      throw new Error(`expected no reveal before source text has selected keyword, got ${beforeSourceText.reveal}`)
    }

    await act(async () => {
      useGraphStore.setState({
        markdownDocumentText: ['# Transcript', 'Agent Labs ships a local renderer validation path.'].join('\n'),
      } as never)
    })
    await tick()

    const afterSourceText = readCalls()
    if (afterSourceText.reveal !== 1 || afterSourceText.line !== 2) {
      throw new Error(`expected retry reveal on source text arrival at line 2, got reveal=${afterSourceText.reveal} line=${afterSourceText.line}`)
    }

    await act(async () => {
      root.unmount()
    })
    await tick()
  } finally {
    try {
      useGraphStore.getState().setWorkspaceViewMode('canvas')
    } catch {
      void 0
    }
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    bootstrap.restore()
  }
}
