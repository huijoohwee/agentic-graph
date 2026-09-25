import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import AgentMissionConsolePanel from '@/features/agent-ready/AgentMissionConsolePanel'
import { closeAgentRunInspection, openAgentRunInspection } from '@/features/agent-ready/agentRunInspectionStore'
import { readRunTrace } from '@/features/agent-ready/missionControlProjection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

test('Console reuses the selected Mission span without exposing a write action', async () => {
  const { dom, restore } = initJsdomHarness()
  const container = dom.window.document.createElement('div')
  dom.window.document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => { root.render(<AgentMissionConsolePanel />) })
    assert.match(container.textContent || '', /No Mission observation is selected/u)
    const now = Date.now()
    const trace = readRunTrace({ schema: 'agent-toolkit-run/v1', runId: 'console-observation',
      observedAt: now, expiresAt: now + 60000, coverage: { partial: true }, spans: [{ spanId: 'check', kind: 'check',
        operation: 'Observed check', status: 'completed', timing: { inclusiveMs: 12, exclusiveObservedMs: 0 },
        resources: { cpuMs: 3 } }] }, 'console-observation')
    await act(async () => { openAgentRunInspection({ trace, scope: 'fixture', expiresAt: trace.expiresAt,
      spanId: null, search: '', view: 'tree' }) })
    assert.match(container.textContent || '', /Observed check/u)
    assert.match(container.textContent || '', /partial coverage/u)
    assert.equal(container.querySelector('[aria-label="Span hierarchy"]')?.getAttribute('role'), 'tree')
    assert.equal(container.querySelector('button[aria-label*="Evaluate"]'), null)
    await act(async () => { closeAgentRunInspection() })
    assert.match(container.textContent || '', /No Mission observation is selected/u)
  } finally {
    await act(async () => { closeAgentRunInspection(); root.unmount() })
    restore()
  }
})
