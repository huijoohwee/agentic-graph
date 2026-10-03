import { selectMenuValue } from './helpers/semanticMenu'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { useGraphStore } from '@/hooks/useGraphStore'
import MainPanelBody from '@/features/panels/ui/MainPanelBody'
import CollapsibleSection from '@/features/panels/ui/CollapsibleSection'
import { WorkspaceTableModeControl } from '@/features/workspace-table/ui/WorkspaceTableModeControl'
import { workspaceTablePreferencesStore } from '@/features/workspace-table/workspaceTablePreferencesStore'
import { MainPanelField } from '@/features/panels/ui/MainPanelField'
import { MainPanelIconButton } from '@/features/panels/ui/MainPanelIconButton'
import { buildMainPanelFieldHelp, type MainPanelFieldHelp } from '@/features/panels/ui/mainPanelRowHelp'
import { getMainPanelTypeIconMeta } from '@/features/panels/ui/mainPanelHelpIconLibrary'
import { MainPanelLoadingFallback } from '@/features/panels/ui/MainPanelFrame'

export async function testMainPanelPendingLoadCanCloseWithoutLateReopen() {
  const { dom, restore } = initJsdomHarness()
  // This keyboard contract needs native focus, rather than the harness's body-only getter.
  delete (dom.window.document as unknown as { activeElement?: Element }).activeElement
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host)
  let release!: (module: { default: () => React.ReactElement }) => void
  const pending = new Promise<{ default: () => React.ReactElement }>(resolve => { release = resolve })
  const LazyPanel = React.lazy(() => pending)
  let activations = 0
  function PendingPanel() {
    const [open, setOpen] = React.useState(true)
    return <>
      <button onClick={() => activations++}>Workspace action</button>
      {open && <React.Suspense fallback={<MainPanelLoadingFallback onClose={() => setOpen(false)} />}>
        <LazyPanel />
      </React.Suspense>}
    </>
  }
  try {
    await act(async () => root.render(<PendingPanel />))
    assert.equal(host.querySelector('[role="status"]')?.textContent, 'Loading panel…')
    assert(host.querySelector('aside[aria-label="Main panel loading"]'), 'loading uses the shared panel frame')
    const close = host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!
    assert(close && !close.disabled, 'a pending panel has a native Close control')
    await act(async () => close.focus())
    assert.ok(Object.is(document.activeElement, close), 'Close remains reachable by keyboard focus')
    await act(async () => close.click())
    assert.ok(Object.is(host.querySelector('[data-kg-main-panel-loading]'), null), 'Close dismisses the loading status')
    await act(async () => {
      release({ default: () => <p data-ready="1">Loaded panel</p> })
      await pending
    })
    assert.ok(Object.is(host.querySelector('[data-ready]'), null), 'late completion cannot reopen a dismissed panel')
    assert.ok(Object.is(host.querySelector('aside'), null), 'the loading frame stays dismissed')
    await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
    assert.equal(activations, 1, 'workspace controls remain usable after dismissal')
  } finally {
    release({ default: () => <p>Released</p> })
    await act(async () => root.unmount())
    host.remove(); restore()
  }
}

export async function testMainPanelSharedPresentationKeepsAccessibleControlsAndHelp() {
  const { restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), previous = useGraphStore.getState()
  const originalBounds = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute('data-kg-tooltip-root')) {
      return new window.DOMRect(Number.parseFloat(this.style.left) - 180, Number.parseFloat(this.style.top), 360, 40)
    }
    if (this.hasAttribute('data-kg-tooltip-anchor')) return new window.DOMRect(100, 200, 80, 20)
    return originalBounds.call(this)
  }
  const previousPlacement = workspaceTablePreferencesStore.getSnapshot().workspaceCellSelectPanelPlacement
  let activations = 0
  const help: MainPanelFieldHelp = {
    role: 'Orchestrator', actions: ['cap maxDepth hops from the traversal start node'],
    outcome: 'bound neighborhood walks while surfacing multi-hop structure around the chosen anchor',
    value: { key: 'traversalMaxDepth', type: 'number', defaultValue: 2, min: 1, max: 8, interval: 1, expansionNote: 'More hops expands reach', contractionNote: 'fewer narrows scope.' },
  }
  try {
    useGraphStore.setState({ uiPanelTextFontClass: 'font-serif', uiPanelKeyValueTextSizeClass: 'text-[15px]', uiPanelRowDensityDefaultClass: 'py-2' })
    await act(async () => root.render(<MainPanelBody header={null}>
      <MainPanelField label="traversalMaxDepth" type="number" help={help}><input aria-label="Traversal max depth" type="number" defaultValue={2} min={1} max={8} step={1} /></MainPanelField>
      <MainPanelIconButton iconKey="action.run" label="Run traversal" onClick={() => activations++} />
      <MainPanelIconButton iconKey="action.import" label="Import selected (0)" disabled onClick={() => activations++} />
    </MainPanelBody>))
    const shell = host.querySelector('aside')!
    assert(shell.className.includes('font-serif') && shell.className.includes('text-[15px]'))
    const row = host.querySelector('dl')!
    assert(row.className.includes('py-2'), 'shared row honors configured density')
    const descriptions = Array.from(host.querySelectorAll('[aria-description]')).map(node => node.getAttribute('aria-description'))
    assert(descriptions.includes(buildMainPanelFieldHelp(help).key))
    assert(descriptions.includes('Default: 2; Min: 1; Max: 8; Interval: 1; More hops expands reach; fewer narrows scope.'))
    const key = host.querySelector<HTMLElement>('dt [tabindex="0"]')!
    await act(async () => key.focus())
    assert(document.querySelector('[role="tooltip"]')?.textContent?.includes('Orchestrator → cap maxDepth hops'))
    assert((document.querySelector('[role="tooltip"]')?.getBoundingClientRect().left ?? -1) >= 8, 'opening help keeps long text inside the viewport after effects settle')
    const run = host.querySelector<HTMLButtonElement>('button[aria-label="Run traversal"]')!
    const glyph = run.querySelector('svg')!
    assert.equal(glyph.getAttribute('role'), 'img')
    assert.equal(glyph.getAttribute('aria-hidden'), null)
    assert.equal(glyph.getAttribute('aria-label'), getMainPanelTypeIconMeta('action.run').label)
    assert.equal(run.querySelector('.sr-only')?.textContent, 'Run traversal')
    await act(async () => { run.click(); host.querySelector<HTMLButtonElement>('button[disabled]')!.click() })
    assert.equal(activations, 1, 'named icon action activates once; disabled action cannot activate')
    await act(async () => root.render(<CollapsibleSection title="Workspace" defaultCollapsed={false}>
      <WorkspaceTableModeControl />
    </CollapsibleSection>))
    const select = host.querySelector<HTMLButtonElement>('button[data-kg-select][aria-label="Select panel position"]')!
    assert(select.className.includes('font-serif') && select.className.includes('text-[15px]'), 'workspace controls use configured panel typography')
    const nextPlacement = previousPlacement === 'top' ? 'bottom' : 'top'
    await act(async () => {
      selectMenuValue(select, nextPlacement)
    })
    assert.equal(workspaceTablePreferencesStore.getSnapshot().workspaceCellSelectPanelPlacement, nextPlacement, 'shared layout keeps the canonical preference handler')
    const header = host.querySelector<HTMLElement>('section[role="button"]')!
    await act(async () => header.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    assert.equal(header.getAttribute('aria-expanded'), 'false')
    await act(async () => header.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true })))
    assert.equal(header.getAttribute('aria-expanded'), 'true')
    assert.equal(select.value, nextPlacement, 'collapse and expand preserve the field value')
  } finally {
    await act(async () => root.unmount())
    HTMLElement.prototype.getBoundingClientRect = originalBounds
    useGraphStore.setState({ uiPanelTextFontClass: previous.uiPanelTextFontClass, uiPanelKeyValueTextSizeClass: previous.uiPanelKeyValueTextSizeClass, uiPanelRowDensityDefaultClass: previous.uiPanelRowDensityDefaultClass })
    workspaceTablePreferencesStore.setWorkspaceCellSelectPanelPlacement(previousPlacement)
    host.remove(); restore()
  }
}
