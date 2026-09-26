import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import XrWorkspaceMediaPanel from '@/features/xr-v2/XrWorkspaceMediaPanel'
import WorkspaceActivityPanel, { WorkspaceBrowserTools } from '@/features/agent-ready/WorkspaceActivityPanel'
import { closeAgentRunInspection, openAgentRunInspection, readAgentRunInspectionSnapshot } from '@/features/agent-ready/agentRunInspectionStore'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { readBottomSurfaceTabPreset } from '@/lib/markdown/frontmatter'

test('Activity projects existing logs and Mission selection, then clears revoked observations', async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('div'); dom.window.document.body.append(container)
  const root = createRoot(container), previous = useGraphStore.getState().uiLogEntries
  try {
    await act(async () => {
      useGraphStore.getState().clearUiLog()
      useGraphStore.getState().pushUiLog({ source: 'XR', kind: 'success', message: 'Selected saved object' })
      root.render(<WorkspaceActivityPanel />)
    })
    assert.match(container.textContent || '', /Selected saved object/)
    assert.equal(container.querySelector('[aria-label="Workspace events"]')?.children.length, 1)
    const now = Date.now()
    const trace = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'xr-observation', observedAt: now,
      expiresAt: now + 60000, coverage: { partial: true }, spans: [{ spanId: 'inspect', kind: 'tool',
        operation: 'Inspect scene', status: 'completed', timing: { inclusiveMs: 7 } }] }, 'xr-observation')
    await act(async () => {
      openAgentRunInspection({ trace, scope: 'fixture', expiresAt: trace.expiresAt, spanId: null, search: '', view: 'tree' })
      const select = container.querySelector('select')!; select.value = 'mission'
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    assert.match(container.textContent || '', /Inspect scene/)
    assert.match(container.textContent || '', /partial coverage/)
    assert.match(container.textContent || '', /Input and output payloads are not included/)
    await act(async () => { container.querySelector<HTMLButtonElement>('button')!.click() })
    assert.equal(readAgentRunInspectionSnapshot()?.spanId, 'inspect')
    await act(async () => { closeAgentRunInspection() })
    assert.doesNotMatch(container.textContent || '', /Inspect scene/)
    assert.match(container.textContent || '', /No Mission observation is selected/)
    assert.equal(readBottomSurfaceTabPreset('activity'), 'activity')
    assert.equal(readBottomSurfaceTabPreset('xr'), undefined)
  } finally {
    await act(async () => { closeAgentRunInspection(); root.unmount() })
    useGraphStore.setState({ uiLogEntries: previous }); restore()
  }
})

test('Agents observes current browser tool discovery and removes stale tools', async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('div'); dom.window.document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => {
      Object.assign(dom.window.document.documentElement.dataset, { kgWebmcpContext: 'fallback', kgWebmcpScope: 'xr', kgWebmcpTools: 'inspect_scene,control_scene' })
      root.render(<WorkspaceBrowserTools />)
    })
    assert.match(container.textContent || '', /fallback · 2 exposed/)
    await act(async () => { dom.window.document.documentElement.dataset.kgWebmcpTools = 'inspect_scene' })
    assert.match(container.textContent || '', /1 exposed/)
    assert.doesNotMatch(container.textContent || '', /control_scene/)
    assert.equal(container.querySelectorAll('button').length, 0)
  } finally { await act(async () => root.unmount()); restore() }
})

test('Media navigation reuses its catalog and opens the canonical Activity surface without changing source', async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('div'); dom.window.document.body.append(container)
  const root = createRoot(container), before = useGraphStore.getState()
  try {
    await act(async () => { root.render(<XrWorkspaceMediaPanel><div>Existing catalog</div></XrWorkspaceMediaPanel>) })
    assert.match(container.textContent || '', /Existing catalog/)
    for (const label of ['Assets', 'Outliner', 'Inspector', 'Agents', 'Activity']) {
      assert.ok(container.querySelector(`button[aria-label="${label}"]`))
    }
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Activity"]')!.click() })
    assert.equal(useGraphStore.getState().bottomSurfaceTab, 'activity')
    assert.equal(useGraphStore.getState().bottomSurfaceCollapsed, false)
    assert.equal(useGraphStore.getState().markdownDocumentText, before.markdownDocumentText)
    assert.equal(useGraphStore.getState().graphData, before.graphData)
    assert.equal(readAgentRunInspectionSnapshot(), null)
  } finally {
    await act(async () => root.unmount())
    useGraphStore.setState({ bottomSurfaceTab: before.bottomSurfaceTab, bottomSurfaceCollapsed: before.bottomSurfaceCollapsed }); restore()
  }
})
