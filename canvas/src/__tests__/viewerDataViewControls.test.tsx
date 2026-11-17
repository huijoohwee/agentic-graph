import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { ToolbarMenuLauncher } from '@/features/toolbar/ToolbarMenuLauncher'
import { requestFloatingPanelOpen, isFloatingPanelBridgeReady } from '@/features/toolbar/floatingPanelBridge'
import { useGraphStore } from '@/hooks/useGraphStore'
import { defaultWorkspaceDataViewConfig } from '@/features/markdown-workspace/main/viewer/workspaceDataViewConfig'
import { useWorkspaceDataViewFloatingBinding, useWorkspaceDataViewFloatingRegistration,
  type WorkspaceDataViewFloatingBinding, type WorkspaceDataViewSettingsPanelKey,
} from '@/features/markdown-workspace/main/viewer/workspaceDataViewFloatingStore'

const TEST_VIEW_CONFIG = defaultWorkspaceDataViewConfig({
  title: 'test-binding',
  layout: 'table',
  groupByColumnId: null,
})
const EMPTY_COLUMNS: WorkspaceDataViewFloatingBinding['columns'] = []
const noopSetViewConfig: WorkspaceDataViewFloatingBinding['setViewConfig'] = () => {}
const noopOnChangeLayout: WorkspaceDataViewFloatingBinding['onChangeLayout'] = () => {}

function buildTestBinding(id: string, activePanel: WorkspaceDataViewSettingsPanelKey, contextLabel = id): WorkspaceDataViewFloatingBinding {
  return {
    registrationId: id,
    contextLabel,
    activePanel,
    canMutate: false,
    viewerLayout: 'table',
    columns: EMPTY_COLUMNS,
    groupByColumnId: null,
    viewConfig: TEST_VIEW_CONFIG,
    setViewConfig: noopSetViewConfig,
    onChangeLayout: noopOnChangeLayout,
  }
}

function Binding({ id, revision }: { id: string; revision: number }) {
  const [activePanel, setPanel] = React.useState<WorkspaceDataViewSettingsPanelKey>('properties')
  const binding = React.useMemo<WorkspaceDataViewFloatingBinding>(
    () => buildTestBinding(id, activePanel, `${id}:${revision}`),
    [activePanel, id, revision],
  )
  const activate = useWorkspaceDataViewFloatingRegistration(binding)
  return <button data-binding={id} onClick={() => { activate('filter'); setPanel('filter') }}>{id}</button>
}
function Selection() {
  const binding = useWorkspaceDataViewFloatingBinding()
  return <output>{binding ? `${binding.contextLabel}/${binding.activePanel}` : 'none'}</output>
}

let selfSubscribedBindingRenderCount = 0

function SelfSubscribedBinding() {
  selfSubscribedBindingRenderCount += 1
  const binding = buildTestBinding('self-subscribed-binding', 'properties', 'self')
  useWorkspaceDataViewFloatingRegistration(binding)
  const current = useWorkspaceDataViewFloatingBinding()
  return <output data-self-subscribed>{current ? `${current.contextLabel}/${current.activePanel}/${selfSubscribedBindingRenderCount}` : 'none'}</output>
}

export async function testViewerSettingsRemainReachableFromHiddenCanvasToolbar() {
  const { restore } = initJsdomHarness()
  const host = document.createElement('nav')
  host.style.display = 'none'
  document.body.append(host)
  const root = createRoot(host)
  const original = useGraphStore.getState()
  try {
    await act(async () => root.render(<ToolbarMenuLauncher onOpenMainPanel={() => {}} />))
    assert.ok(isFloatingPanelBridgeReady())
    await act(async () => { assert.equal(requestFloatingPanelOpen({ tab: 'view', open: true }), true) })
    // Lazy settings code may need multiple event-loop turns before React commits it.
    for (let i = 0; i < 100 && !document.querySelector('[data-kg-floating-panel-root]'); i++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) })
    }
    const panel = document.querySelector('[data-kg-floating-panel-root]')
    assert.ok(panel, 'the request must mount a panel')
    assert.equal(host.contains(panel), false, 'the panel must escape the hidden toolbar')
    assert.ok(document.body.contains(panel))
    await act(async () => { requestFloatingPanelOpen({ tab: 'view', open: false }) })
    assert.equal(document.querySelector('[data-kg-floating-panel-root]'), null)
    const renderBindings = (revision: number, includeFirst = true) => root.render(<>
      {includeFirst && <Binding id="first" revision={revision} />}
      <Binding id="second" revision={revision} /><Selection />
    </>)
    await act(async () => renderBindings(0))
    await act(async () => host.querySelector<HTMLButtonElement>('[data-binding="first"]')!.click())
    assert.equal(host.querySelector('output')?.textContent, 'first:0/filter')
    await act(async () => renderBindings(1))
    assert.equal(host.querySelector('output')?.textContent, 'first:1/filter', 'passive rerenders must not steal focus')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-binding="second"]')!.click())
    assert.equal(host.querySelector('output')?.textContent, 'second:1/filter')
    await act(async () => host.querySelector<HTMLButtonElement>('[data-binding="first"]')!.click())
    assert.equal(host.querySelector('output')?.textContent, 'first:1/filter', 'reopening the same section must reactivate it')
    await act(async () => renderBindings(2, false))
    assert.equal(host.querySelector('output')?.textContent, 'second:2/filter', 'unmount must release focus to a live binding')
    selfSubscribedBindingRenderCount = 0
    await act(async () => root.render(<SelfSubscribedBinding />))
    assert.equal(
      host.querySelector('[data-self-subscribed]')?.textContent,
      'self/properties/2',
      'self-subscribed registration should settle without re-registering forever',
    )
  } finally {
    await act(async () => root.unmount())
    useGraphStore.setState(original)
    restore()
  }
}
