import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import React, { act, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'

export async function testCollapsibleDefaultsCompactAndAnchoredToLsKeys() {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const orchestratorHookPath = path.join(
    srcRoot,
    'features',
    'panels',
    'hooks',
    'useOrchestratorPanelState.ts',
  )
  const hookText = fs.readFileSync(orchestratorHookPath, 'utf8').replace(/\s+/g, ' ')

  const requiredSnippets = [
    'LS_KEYS.orchestratorGraphRagCollapsed, true',
    'LS_KEYS.orchestratorPresetsCollapsed, true',
    'LS_KEYS.orchestratorEditorCollapsed, true',
    'LS_KEYS.orchestratorContextCollapsed, true',
    'LS_KEYS.orchestratorWorkflowIndexingCollapsed, true',
    'LS_KEYS.orchestratorWorkflowTracingCollapsed, true',
  ]

  for (const snippet of requiredSnippets) {
    if (!hookText.includes(snippet)) {
      throw new Error(`Missing compact default snippet in useOrchestratorPanelState: ${snippet}`)
    }
  }
  const harness = initJsdomHarness()
  const host = harness.dom.window.document.createElement('section')
  harness.dom.window.document.body.appendChild(host)
  const root = createRoot(host)
  let mounts = 0; let cleanups = 0
  function StatefulContent() {
    const [count, setCount] = useState(0)
    useEffect(() => { mounts += 1; return () => { cleanups += 1 } }, [])
    return React.createElement('button', { 'data-test-collapse-child': '1', onClick: () => setCount(value => value + 1) }, String(count))
  }
  const header = () => {
    const result = host.querySelector<HTMLElement>('[role="button"][aria-controls]')
    assert.ok(result, 'the section must keep an accessible toggle before its content mounts')
    return result
  }
  const child = () => host.querySelector<HTMLButtonElement>('[data-test-collapse-child]')
  const render = async (props: Partial<React.ComponentProps<typeof CollapsibleSection>> & { key?: string } = {}) => {
    await act(async () => root.render(React.createElement(CollapsibleSection, { title: 'Details', children: React.createElement(StatefulContent), ...props })))
  }
  const click = async (element: HTMLElement) => { await act(async () => element.click()) }
  try {
    await render()
    assert.equal(header().getAttribute('aria-expanded'), 'false', 'shared default must be compact')
    assert.equal(mounts, 0, 'initially collapsed content must not mount effects before first expansion')
    assert.equal(child(), null, 'initially collapsed content is created on demand')
    await click(header())
    assert.equal(header().getAttribute('aria-expanded'), 'true')
    assert.equal(mounts, 1)
    assert.ok(child()); await click(child()!)
    assert.equal(child()!.textContent, '1')
    await click(header())
    assert.equal(header().getAttribute('aria-expanded'), 'false')
    assert.equal(child()!.textContent, '1', 'later collapse must retain local content state')
    assert.ok(child()!.parentElement!.classList.contains('hidden'))
    assert.equal(cleanups, 0, 'later collapse must not unmount previously opened content')
    await act(async () => header().dispatchEvent(new harness.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    assert.equal(header().getAttribute('aria-expanded'), 'true')
    assert.equal(child()!.textContent, '1')
    assert.equal(mounts, 1, 'reopening must reuse the mounted content')

    await render({ key: 'controlled', collapsed: true, defaultCollapsed: false })
    assert.equal(header().getAttribute('aria-expanded'), 'false', 'controlled state owns a conflicting default')
    assert.equal(child(), null)
    const toggles: boolean[] = []
    await render({ key: 'controlled', collapsed: false, onToggle: value => { toggles.push(value) } })
    await click(header())
    assert.deepEqual(toggles, [true])
    assert.equal(header().getAttribute('aria-expanded'), 'true', 'a controlled toggle requests state; its owner commits it')
    await render({ key: 'controlled', collapsed: true })
    assert.ok(child(), 'controlled collapse also retains content after first expansion')
    await render({ key: 'explicit-open', defaultCollapsed: false })
    assert.equal(header().getAttribute('aria-expanded'), 'true', 'an explicitly open section must render immediately')
    assert.ok(child())
  } finally {
    await act(async () => root.unmount())
    harness.restore()
  }
  assert.equal(cleanups, mounts, 'all mounted content effects must clean up when the section owner unmounts')
}
