import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ToolbarToolMenu } from '@/lib/toolbar/ToolbarToolMenu.impl'
import { useGraphStore } from '@/hooks/useGraphStore'
import { UI_LABELS } from '@/lib/config'
import { LS_KEYS } from '@/lib/config.ls.keys'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { mountReactRoot, unmountReactRoot, waitForNextTask } from '@/tests/lib/reactRootHarness'

export async function testFloatingPanelDesignLayersViewRendersAsDiv() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  try {
    try {
      dom.window.localStorage.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
      ;(globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
    } catch {
      void 0
    }
    store.setWorkspaceViewMode('canvas')
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('design')

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const root = createRoot(container)
    await mountReactRoot(root,
      <ToolbarToolMenu
        pipelineStatus={null}
        exportStatus={null}
        toolMenuCardRef={{ current: null }}
        toolMenuCardStyle={{ top: 0, left: 0 }}
        onHeaderPointerDown={() => void 0}
        requestedFloatingPanelView="propsPanel"
        requestedFloatingPanelViewSeq={1}
        onClose={() => void 0}
      />,
    { tasks: 10 })

    const nav = dom.window.document.querySelector('nav[aria-label="Floating panel views"]')
    if (!nav) throw new Error('expected Floating panel views nav')

    const buttons = Array.from(nav.querySelectorAll('button')) as HTMLButtonElement[]
    const labels = buttons.map(b => String(b.getAttribute('aria-label') || ''))
    if (labels[0] !== UI_LABELS.propsPanel) {
      throw new Error(`expected first floating panel view to be ${UI_LABELS.propsPanel}, got ${labels[0]}`)
    }
    if (!labels.includes(UI_LABELS.geo)) {
      throw new Error(`expected floating panel views to include ${UI_LABELS.geo}, got ${JSON.stringify(labels)}`)
    }
    if (!labels.includes(UI_LABELS.gameMode)) {
      throw new Error(`expected floating panel views to include ${UI_LABELS.gameMode}, got ${JSON.stringify(labels)}`)
    }
    if (labels.some(label => label.toLowerCase() === 'discovery')) {
      throw new Error(`expected floating panel views to remove legacy Discovery tab after Props Panel Discovery Widget consolidation, got ${JSON.stringify(labels)}`)
    }
    if (labels.includes(UI_LABELS.layerMode)) {
      throw new Error(`expected floating panel views to exclude ${UI_LABELS.layerMode} after Workflow Manager consolidation`)
    }

    let designLayers: HTMLElement | null = null
    for (let i = 0; i < 30; i++) {
      await waitForNextTask()
      designLayers = dom.window.document.querySelector('[aria-label="Design Layers"]') as HTMLElement | null
      if (designLayers) break
    }

    if (designLayers) {
      throw new Error('expected Design Layers view to be removed from floating panel after Workflow Manager consolidation')
    }

    await unmountReactRoot(root, { tasks: 1 })
  } finally {
    restore()
  }
}

export async function testFloatingPanelInteractionViewIsRemovedAfterSkillsCommandsCentralization() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  try {
    try {
      dom.window.localStorage.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
      ;(globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
    } catch {
      void 0
    }
    store.setWorkspaceViewMode('canvas')
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('d3')

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    const root = createRoot(container)
    await mountReactRoot(root,
      <ToolbarToolMenu
        pipelineStatus="ingest->parse->render"
        exportStatus={null}
        toolMenuCardRef={{ current: null }}
        toolMenuCardStyle={{ top: 0, left: 0 }}
        onHeaderPointerDown={() => void 0}
        requestedFloatingPanelView="skillsCommands"
        requestedFloatingPanelViewSeq={2}
        onClose={() => void 0}
      />,
    { tasks: 10 })

    const shellBodies = Array.from(
      dom.window.document.querySelectorAll(`[aria-label="${UI_LABELS.floatingPanel}"]`),
    ) as HTMLElement[]
    const shellBody = shellBodies.find((el): el is HTMLElement =>
      String(el.getAttribute('class') || '').includes('mt-1'),
    )
    if (!(shellBody instanceof dom.window.HTMLElement)) {
      throw new Error('expected floating panel shell body')
    }
    const nav = dom.window.document.querySelector('nav[aria-label="Floating panel views"]')
    const buttons = Array.from(nav?.querySelectorAll('button') || []) as HTMLButtonElement[]
    const labels = buttons.map(button => String(button.getAttribute('aria-label') || ''))
    if (labels.includes('Interaction') || dom.window.document.querySelector('[aria-label="Interaction panel"]')) {
      throw new Error(`expected stale Interaction floating section to be removed, got ${JSON.stringify(labels)}`)
    }
    if (!dom.window.document.querySelector('[data-kg-floating-panel-skills-commands-view="true"]')) {
      throw new Error('expected Skills & Commands to remain the centralized invocation surface')
    }

    await unmountReactRoot(root, { tasks: 1 })
  } finally {
    restore()
  }
}

export async function testFloatingPanelGeoViewRemainsClickableWhenDisabledByState() {
  const { restore, dom } = initJsdomHarness('<!doctype html><html><body><section id="root"></section></body></html>')
  const store = useGraphStore.getState()
  let root: ReturnType<typeof createRoot> | null = null
  try {
    try {
      dom.window.localStorage.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
      ;(globalThis as unknown as { localStorage?: Storage }).localStorage?.setItem(LS_KEYS.geospatialOverlayEnabled, '0')
    } catch {
      void 0
    }
    store.setWorkspaceViewMode('canvas')
    store.setCanvasRenderMode('2d')
    store.setCanvas2dRenderer('design')

    const container = dom.window.document.getElementById('root')
    if (!container) throw new Error('missing root container')

    root = createRoot(container)
    await mountReactRoot(root,
      <ToolbarToolMenu
        pipelineStatus={null}
        exportStatus={null}
        toolMenuCardRef={{ current: null }}
        toolMenuCardStyle={{ top: 0, left: 0 }}
        onHeaderPointerDown={() => void 0}
        requestedFloatingPanelView="propsPanel"
        requestedFloatingPanelViewSeq={3}
        onClose={() => void 0}
      />,
    { tasks: 10 })

    const geoButton = Array.from(container.querySelectorAll('button')).find(button =>
      String((button as HTMLButtonElement).getAttribute('aria-label') || '') === UI_LABELS.geo,
    ) as HTMLButtonElement | undefined
    if (!geoButton) throw new Error(`expected ${UI_LABELS.geo} button to render`)
    if (geoButton.disabled) {
      throw new Error(`expected ${UI_LABELS.geo} button to stay clickable when geospatial mode is off`)
    }

    await act(async () => {
      geoButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await waitForNextTask()
      await waitForNextTask()
    })

    const geoPanel = dom.window.document.querySelector('[aria-label="Geospatial panel"]')
    if (!(geoPanel instanceof dom.window.HTMLElement)) {
      throw new Error('expected clicking Geo to switch into the geospatial panel shell')
    }
    const text = container.textContent || ''
    const enabledValue = String(dom.window.localStorage.getItem(LS_KEYS.geospatialOverlayEnabled) || '').trim().toLowerCase()
    if (enabledValue !== 'true' && enabledValue !== '1') {
      throw new Error(`expected clicking Geo to enable geospatial mode through the shared bridge, got ${JSON.stringify(enabledValue)}`)
    }
    if (!(Array.from(geoPanel.querySelectorAll('button')) as HTMLButtonElement[]).some(button => !button.disabled)) {
      throw new Error(`expected Geo panel to remain actionable when disabled, got ${JSON.stringify(text)}`)
    }

  } finally {
    try { if (root) await unmountReactRoot(root, { tasks: 1 }) } finally { restore() }
  }
}
