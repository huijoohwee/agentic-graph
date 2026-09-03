import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useMarkdownExplorerStore } from '@/features/markdown-explorer/store'
import { useGraphStore } from '@/hooks/useGraphStore'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import {
  resolveStreamingWorkspaceSelectionLockTarget,
  useMarkdownWorkspaceStreamingSelectionLock,
} from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceStreamingSelectionLock'

const tick = async (n = 1): Promise<void> => {
  for (let i = 0; i < n; i += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }
}

export function testResolveStreamingWorkspaceSelectionLockTargetRequiresMissingActivePath() {
  const streamingPath = '/chat-log/run/agentic-os-trace_run.md' as never
  if (resolveStreamingWorkspaceSelectionLockTarget({
    activePath: '/docs/other.md' as never,
    streamingPath,
    streamingText: '',
  }) !== null) {
    throw new Error('expected empty streaming text not to lock workspace selection')
  }
  if (resolveStreamingWorkspaceSelectionLockTarget({
    activePath: streamingPath,
    streamingPath,
    streamingText: 'live text',
  }) !== null) {
    throw new Error('expected already-active streaming file not to request a selection lock')
  }
  if (resolveStreamingWorkspaceSelectionLockTarget({
    activePath: '/docs/other.md' as never,
    streamingPath,
    streamingText: 'live text',
  }) !== null) {
    throw new Error('expected live streaming text to respect an active workspace selection')
  }
  const target = resolveStreamingWorkspaceSelectionLockTarget({
    activePath: null,
    streamingPath,
    streamingText: 'live text',
  })
  if (target !== streamingPath) {
    throw new Error(`expected live streaming text to recover a missing active workspace selection, got ${JSON.stringify(target)}`)
  }
}

export async function testMarkdownWorkspaceStreamingSelectionLockRespectsManualActivePathSwitch() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const container = dom.window.document.getElementById('root')
  if (!container) throw new Error('missing root container')
  const root = createRoot(container)
  const activeWrites: string[] = []
  const selectionWrites: string[] = []
  const streamingPath = '/chat-log/run/agentic-os-trace_run.md' as never

  function Harness(props: { activePath: string | null }) {
    useMarkdownWorkspaceStreamingSelectionLock({
      activePath: props.activePath as never,
      setActivePathSafe: path => { activeWrites.push(path) },
      setSelectionPathSafe: path => { selectionWrites.push(path) },
    })
    return <output data-testid="state" />
  }

  try {
    useMarkdownExplorerStore.getState().setActivePath(null)
    await act(async () => {
      useGraphStore.getState().setChatWorkspaceStreamingState({ path: streamingPath, text: 'live stream chunk' })
      await tick()
    })
    await act(async () => {
      root.render(<Harness activePath={null} />)
      await tick(3)
    })
    if (activeWrites[0] !== streamingPath || selectionWrites[0] !== streamingPath) {
      throw new Error(`expected live stream lock to recover an empty workspace selection, got ${JSON.stringify({ activeWrites, selectionWrites })}`)
    }
    activeWrites.length = 0
    selectionWrites.length = 0
    useMarkdownExplorerStore.getState().setActivePath('/docs/other.md' as never)
    await act(async () => {
      root.render(<Harness activePath="/docs/other.md" />)
      useGraphStore.getState().setChatWorkspaceStreamingState({ path: streamingPath, text: 'next live stream chunk' })
      await tick(3)
    })
    if (activeWrites.length || selectionWrites.length) {
      throw new Error(`expected live stream lock to respect manual active file selection, got ${JSON.stringify({ activeWrites, selectionWrites })}`)
    }
  } finally {
    try {
      await act(async () => {
        useGraphStore.getState().setChatWorkspaceStreamingState(null)
        root.unmount()
        await tick(2)
      })
    } catch {
      void 0
    }
    restore()
  }
}
