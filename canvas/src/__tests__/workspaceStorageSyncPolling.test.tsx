import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getWorkspaceFs, resetWorkspaceFsForTests } from '@/features/workspace-fs/workspaceFs'
import { useMarkdownWorkspaceBootstrapState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceBootstrapState'
import { useMarkdownWorkspaceExplorerState } from '@/lib/markdown-workspace-runtime/useMarkdownWorkspaceExplorerState'
import {
  writeWorkspaceAutoRefreshEnabledSetting,
  writeWorkspaceSeedSyncEnabledSetting,
  writeWorkspaceSeedSyncIdleMaxMsSetting,
  writeWorkspaceSeedSyncPollMsSetting,
} from '@/lib/workspace/workspaceStoreSyncSettings'

test('Storage Sync resumes after inline editing and an off/on toggle during an in-flight read', async () => {
  const { dom, restore } = initJsdomHarness()
  resetWorkspaceFsForTests()
  writeWorkspaceAutoRefreshEnabledSetting(false)
  writeWorkspaceSeedSyncEnabledSetting(true)
  writeWorkspaceSeedSyncPollMsSetting(1000)
  writeWorkspaceSeedSyncIdleMaxMsSetting(1000)
  const fs = await getWorkspaceFs(), originalSeed = fs.ensureSeed
  const originalSet = window.setTimeout, originalClear = window.clearTimeout
  const polls = new Map<number, () => void>()
  let timerId = 100000, reads = 0, held: Promise<void> | null = null
  let release: (() => void) | undefined
  fs.ensureSeed = async () => { reads++; if (held) await held; return false }
  window.setTimeout = ((fn: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (Number(delay) >= 1000 && typeof fn === 'function') {
      const id = ++timerId; polls.set(id, () => fn(...args)); return id
    }
    return originalSet.call(window, fn, delay, ...args)
  }) as typeof window.setTimeout
  window.clearTimeout = ((id?: number) => {
    if (id !== undefined && polls.delete(id)) return
    originalClear.call(window, id)
  }) as typeof window.clearTimeout
  const inline = { current: true }
  const container = dom.window.document.createElement('section')
  const root = createRoot(container)
  function Harness() {
    const state = useMarkdownWorkspaceBootstrapState({ activePath: null, effectiveBottomSurfaceCollapsed: false })
    useMarkdownWorkspaceExplorerState({ ...state, active: true, viewerInlineEditActiveRef: inline,
      setStatusInfo: () => {}, setStatusError: () => {}, setStatusProgress: () => {} })
    return null
  }
  const tick = async () => {
    const next = polls.entries().next().value
    assert.ok(next, 'An enabled but temporarily busy poll must retain a retry')
    polls.delete(next[0]); await act(async () => { next[1]() })
  }
  try {
    await act(async () => { root.render(<Harness />) })
    assert.equal(reads, 0, 'Inline editing defers storage reconciliation')
    inline.current = false
    await tick()
    assert.equal(reads, 1, 'Polling resumes without requiring focus or a setting change')
    await act(async () => { writeWorkspaceSeedSyncEnabledSetting(false) })
    assert.equal(polls.size, 0, 'Off cancels the scheduled read')
    held = new Promise<void>(resolve => { release = resolve })
    await act(async () => { writeWorkspaceSeedSyncEnabledSetting(true) })
    assert.equal(reads, 2)
    await act(async () => { writeWorkspaceSeedSyncEnabledSetting(false) })
    await act(async () => { writeWorkspaceSeedSyncEnabledSetting(true) })
    assert.equal(reads, 2, 'A new effect must not overlap the old read')
    await act(async () => { release!(); await held; held = null })
    await tick()
    assert.equal(reads, 3, 'The new effect retains ownership after the old read settles')
  } finally {
    release?.()
    await act(async () => { root.unmount() })
    assert.equal(polls.size, 0)
    window.setTimeout = originalSet; window.clearTimeout = originalClear
    fs.ensureSeed = originalSeed
    resetWorkspaceFsForTests(); restore()
  }
})
