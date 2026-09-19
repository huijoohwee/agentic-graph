import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { getWorkspaceFs } from '@/features/workspace-fs/workspaceFs'
import { useGraphStore } from '@/hooks/useGraphStore'
import { controlDashboardWidget } from '@/components/DashboardCanvas/dashboardWidgetTools'
import { DASHBOARD_WIDGETS_PATH, parseDashboardWidgets } from '@/components/DashboardCanvas/dashboardWidgetConfiguration'
import DashboardWidgetDisclosure from '@/components/DashboardCanvas/DashboardWidgetDisclosure'
import DashboardLayoutPanel from '@/components/DashboardCanvas/DashboardLayoutPanel'
import DashboardDocumentWidgets from '@/components/DashboardCanvas/DashboardDocumentWidgets'
import { dashboardTableMarkdown } from '@/components/DashboardCanvas/DashboardMarkdown'
import { createRegistryWidget } from '@/components/DashboardCanvas/dashboardRegistryWidgetCommand'
import { FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, claimFlowWidgetPointerDragDrop, type FlowWidgetPointerDragDropDetail } from '@/lib/storyboardWidget/widgetDrag'

const pause = () => new Promise(resolve => setTimeout(resolve, 20))
async function until(predicate: () => boolean, context = 'widget state') { for (let i = 0; i < 200 && !predicate(); i++) await act(pause); assert(predicate(), `Expected ${context}`) }

export async function testDashboardWidgetCommands() {
  const { dom, restore } = initJsdomHarness(), host = document.createElement('section'), root = createRoot(host)
  document.body.append(host)
  const fs = await getWorkspaceFs(), previous = await fs.readFileText(DASHBOARD_WIDGETS_PATH), state = useGraphStore.getState()
  const read = async () => parseDashboardWidgets(await fs.readFileText(DASHBOARD_WIDGETS_PATH))
  try {
    await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false })
    const invocation = '/canvas.widget #widget @dashboard operation=upsert id=graph:notes template=text'
    const settings = { markdown: '## Evidence\n\nText with **meaning**.\n\n| Name | Value |\n| --- | --- |\n| CPU | 1 |\n\n---', title: 'Notes' }
    await controlDashboardWidget({ invocation, settings })
    await controlDashboardWidget({ invocation, settings })
    assert.equal(Object.keys((await read()).widgets).length, 1)
    await assert.rejects(() => controlDashboardWidget({ operation: 'remove', id: 'graph:notes', document: { version: 1, widgets: {} } }), /expected widget document changed/)
    await act(async () => { root.render(React.createElement(React.Fragment, null, React.createElement(DashboardLayoutPanel), React.createElement(DashboardDocumentWidgets, { sourceIds: [] }), React.createElement(DashboardWidgetDisclosure, { id: 'mission:index-economics', title: 'Index economics', children: React.createElement('span', { 'data-evidence': 'retained' }, 'Retained snapshot') }))); await pause() })
    await until(() => !!host.querySelector('main article h2') && !!host.querySelector('table th') && !!host.querySelector('hr'))
    assert.equal(host.querySelector('main article h2')?.textContent, 'Evidence')
    assert.equal(host.querySelector('table th')?.textContent, 'Name')
    assert.equal(host.querySelector('strong')?.textContent, 'meaning')
    // Edit the heading through the Workspace Editor's existing WYSIWYG surface.
    await act(async () => { host.querySelector('main article h2')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); await pause() })
    await until(() => !!host.querySelector('[contenteditable="true"]'), 'WYSIWYG editor')
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!
    await act(async () => {
      editor.textContent = 'Updated evidence'
      editor.dispatchEvent(new dom.window.InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Updated evidence' }))
      document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true }))
      editor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })); await pause()
    })
    await until(() => host.querySelector('main article h2')?.textContent === 'Updated evidence' && !host.querySelector('[contenteditable="true"]'))
    assert.match((await read()).widgets['graph:notes'].markdown!, /^## Updated evidence/)
    // The Viewer selection toolbar owns text colors and math in Widget Cards too.
    await act(async () => { host.querySelector('strong')!.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })); host.querySelector('strong')!.closest('[data-start-line]')!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })); await pause() })
    await until(() => !!host.querySelector('[contenteditable="true"]'), 'paragraph WYSIWYG editor')
    const colorEditor = host.querySelector<HTMLElement>('[contenteditable="true"]')!
    const range = document.createRange(); range.selectNodeContents(colorEditor.querySelector('strong')!)
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range)
    if (!dom.window.Range.prototype.getBoundingClientRect) dom.window.Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}) })
    await act(async () => { document.dispatchEvent(new dom.window.Event('selectionchange')); colorEditor.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true })); await pause() })
    await until(() => !!document.querySelector('button[aria-label="Text color"]'), 'text color toolbar')
    assert(document.querySelector('button[aria-label="Math"]'), 'Math uses the existing selection toolbar')
    await act(async () => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Text color"]')!
      button.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
      button.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })); button.click(); await pause()
    })
    await until(() => !!document.querySelector('menu[aria-label="Text color menu"] button'), 'text color menu')
    await act(async () => {
      const red = document.querySelector<HTMLButtonElement>('menu[aria-label="Text color menu"] button')!
      red.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })); red.click(); await pause()
    })
    assert.equal(colorEditor.querySelector('[data-kg-sigil-color]')?.getAttribute('data-kg-sigil-color'), '#EF4444')
    await act(async () => { document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true })); colorEditor.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true, relatedTarget: document.body })); await pause() })
    await until(() => !host.querySelector('[contenteditable="true"]'), 'color editor to return to View')
    assert.match((await read()).widgets['graph:notes'].markdown!, /#EF4444:meaning/)

    const retained = host.querySelector('[data-evidence="retained"]')
    await act(async () => { await controlDashboardWidget({ invocation: '/canvas.widget #widget @dashboard operation=collapse id=mission:index-economics' }) })
    assert.equal(host.querySelector<HTMLDetailsElement>('[data-dashboard-disclosure]')?.open, false)
    assert.equal(host.querySelector('[data-evidence="retained"]'), retained, 'collapse keeps the evidence owner mounted')
    await act(async () => { await controlDashboardWidget({ operation: 'expand', id: 'mission:index-economics' }) })
    assert.equal(host.querySelector<HTMLDetailsElement>('[data-dashboard-disclosure]')?.open, true)
    let frame = host.querySelector<HTMLElement>('[data-dashboard-widget="graph:notes"]')!
    assert.equal(frame.dataset.widgetAspect, '16:9')
    await act(async () => { await controlDashboardWidget({ operation: 'upsert', id: 'graph:notes', aspectRatio: '9:16' }) })
    assert.equal(frame.style.aspectRatio, '9 / 16')
    await act(async () => { await controlDashboardWidget({ operation: 'upsert', id: 'graph:notes', settings: { aspectRatio: 'custom', width: 400, height: 300 } }) })
    Object.defineProperty(frame, 'getBoundingClientRect', { value: () => ({ width: 400, height: 300, x: 0, y: 0, top: 0, left: 0, bottom: 300, right: 400 }) })
    const handle = frame.querySelector<HTMLButtonElement>('[data-kg-rich-media-resize-handle="1"]')!
    assert(handle, 'Custom uses the shared resize handle')
    await act(async () => { Simulate.keyDown(handle, { key: 'ArrowRight' }); await pause() })
    assert.equal((await read()).widgets['graph:notes'].width, 410)
    const pointer = (type: string, x: number, y: number) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
      Object.defineProperty(event, 'pointerId', { value: 44 }); return event
    }
    await act(async () => { handle.dispatchEvent(pointer('pointerdown', 400, 300)); document.dispatchEvent(pointer('pointermove', 440, 350)); document.dispatchEvent(pointer('pointerup', 440, 350)); await pause() })
    assert.deepEqual([(await read()).widgets['graph:notes'].width, (await read()).widgets['graph:notes'].height], [440, 350])
    const apply = [...host.querySelectorAll('button')].find(item => item.textContent === 'Apply columns')!
    await act(async () => { Simulate.click(apply); await pause() })
    assert.deepEqual((await read()).boards?.mission, [['mission:codebase', 'mission:tree']])
    assert.equal(useGraphStore.getState().graphData, state.graphData, 'widget configuration never mutates evidence')
    assert.match(dashboardTableMarkdown({ id: 't', title: 'Table', subtitle: '', kind: 'table', tone: 'slate', series: [], rows: [{ id: 'x', label: 'a|b', value: '**value**' }] }), /a\\\|b/)
    // The native receipt, not a guess at newly added nodes, completes registry commands.
    useGraphStore.setState({ canvas2dRenderer: 'storyboard', graphData: { ...state.graphData, nodes: [], edges: [], metadata: { source: 'widget-command-test', kind: 'authored' } } })
    host.setAttribute('data-kg-canvas-viewport', '1')
    Object.defineProperty(host, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 600 }) })
    let calls = 0
    const onDrop = (event: Event) => { const detail = (event as CustomEvent<FlowWidgetPointerDragDropDetail>).detail; calls++; claimFlowWidgetPointerDragDrop(detail); detail.command!.onCreated('native-node') }
    window.addEventListener(FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, onDrop)
    try {
      const [a, b] = await Promise.all([createRegistryWidget({ id: 'graph:command-test' }), createRegistryWidget({ id: 'graph:command-test' })])
      assert.equal(a.nodeId, 'native-node'); assert.equal(b.nodeId, a.nodeId); assert.equal(calls, 1)
    } finally { window.removeEventListener(FLOW_WIDGET_POINTER_DRAG_DROP_EVENT, onDrop) }
  } finally {
    await act(async () => root.unmount()); host.remove(); useGraphStore.setState(state)
    if (previous === null) await fs.deleteEntry(DASHBOARD_WIDGETS_PATH, { mirrorToHost: false }); else await fs.writeFileText(DASHBOARD_WIDGETS_PATH, previous, { mirrorToHost: false })
    restore()
  }
}
