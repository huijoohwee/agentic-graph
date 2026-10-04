import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { CanvasViewContainer } from '@/components/CanvasViewContainer'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import { bindResizeSeparatorDragRuntime } from '@/lib/ui/resizeSeparatorDrag'
import { installFlightSimDesktopInput } from '@/features/game-flight-sim/flightSimInput'
import { FLIGHT_SIM_NEUTRAL_INPUT, type FlightSimTickInput } from '@/features/game-flight-sim/flightSimModel'

import {
  resolveFloatingPanelRightClearanceCss,
  resolveFloatingPanelWidthCss,
} from '@/lib/ui/floatingPanelGeometry'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

test('floating-panel geometry clamps one shared responsive width expression', () => {
  assert.match(resolveFloatingPanelWidthCss(Number.NaN), /30vw/)
  assert.match(resolveFloatingPanelWidthCss(0.01), /15vw/)
  assert.match(resolveFloatingPanelWidthCss(0.9), /60vw/)
  assert.match(resolveFloatingPanelRightClearanceCss(0.3), /30vw/)
  assert.match(resolveFloatingPanelRightClearanceCss(0.3), /kg-safe-right/)
})

test('shared separator keyboard resize cannot publish Flight input or leave held keys stuck', () => {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const canvas = doc.createElement('canvas'), handle = doc.createElement('hr')
  handle.setAttribute('role', 'separator'); handle.tabIndex = 0
  doc.body.append(canvas, handle)
  const inputs: FlightSimTickInput[] = []
  let width = 500
  const flight = installFlightSimDesktopInput(canvas, { onInput: input => inputs.push(input) })
  const disposeResize = bindResizeSeparatorDragRuntime({
    resizeHandleEl: handle, cursor: 'col-resize', readCurrentValue: () => width,
    setPreviewValue: next => { width = next }, commitValue: next => { width = next },
    resolveNextValueFromPointerDrag: input => input.startValue + input.deltaX,
  })
  const key = (target: Element, type: string, key: string, code: string, shiftKey = false) =>
    target.dispatchEvent(new dom.window.KeyboardEvent(type, { key, code, shiftKey, bubbles: true, cancelable: true }))
  try {
    handle.focus()
    key(handle, 'keydown', 'Shift', 'ShiftLeft', true)
    key(handle, 'keydown', 'ArrowRight', 'ArrowRight', true)
    key(handle, 'keyup', 'ArrowRight', 'ArrowRight', true)
    key(handle, 'keyup', 'Shift', 'ShiftLeft')
    assert.equal(width, 532)
    assert.deepEqual(inputs, [], 'resize modifiers and unowned key releases must not fly the aircraft')
    assert.deepEqual(flight.consumeInput(), FLIGHT_SIM_NEUTRAL_INPUT)
    key(canvas, 'keydown', 'w', 'KeyW')
    assert.equal(inputs.at(-1)?.pitch, 1)
    key(handle, 'keyup', 'w', 'KeyW')
    assert.deepEqual(inputs.at(-1), FLIGHT_SIM_NEUTRAL_INPUT, 'release owned keys even after focus changes')
    const handled = new dom.window.KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true, cancelable: true })
    handled.preventDefault(); canvas.dispatchEvent(handled)
    assert.deepEqual(flight.consumeInput(), FLIGHT_SIM_NEUTRAL_INPUT)
  } finally { disposeResize(); flight.dispose(); restore() }
})

test('Flight HUD reuses the shared viewport owner without lowering touch controls', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'canvas/src/features/game-flight-sim/FlightSimHud.tsx'),
    'utf8',
  )
  assert.match(source, /<CanvasViewContainer sizing="inset" overlay>/)
  assert.match(source, /data-kg-flight-sim-viewport="shared"/)
  assert.doesNotMatch(source, /floatingPanelWidthRatio|floatingPanelClearanceVariables/)
  assert.match(source, /z-\[230\]/)
  assert.doesNotMatch(source, /z-\[80\]/)
  const navigation = source.match(/<aside\s+[\s\S]*?aria-label="Flight navigation HUD"[\s\S]*?>/)?.[0]
  assert.ok(navigation)
  assert.match(navigation, /data-kg-workspace-visible-viewport-occluder="vertical"/)
})

test('Flight HUD announces only objective transitions as one polite status', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'canvas/src/features/game-flight-sim/FlightSimHud.tsx'),
    'utf8',
  )
  const objectiveStatus = source.match(
    /<p\s+className="mt-1 text-sm font-semibold"[\s\S]*?<\/p>/,
  )?.[0]

  assert.ok(objectiveStatus)
  assert.match(objectiveStatus, /role="status"/)
  assert.match(objectiveStatus, /aria-live="polite"/)
  assert.match(objectiveStatus, /aria-atomic="true"/)
  assert.match(objectiveStatus, /\{projection\.objective\}/)

  const courseDirector = source.match(
    /<p\b(?:(?!<\/p>)[\s\S])*?data-kg-flight-sim-course-director="hud"[\s\S]*?<\/p>/,
  )?.[0]
  assert.ok(courseDirector)
  assert.match(
    courseDirector,
    /aria-label=\{`Course director: \$\{courseDirector\.label\}`\}/,
  )
  assert.doesNotMatch(courseDirector, /aria-live=/)
  assert.doesNotMatch(courseDirector, /role="status"/)
})


test('shared overlay frame follows editor, toolbar and panels, ignores its own HUD and releases on close', async () => {
  const { dom, restore } = initJsdomHarness()
  const doc = dom.window.document
  const rect = (left: number, top: number, right: number, bottom: number) =>
    new dom.window.DOMRect(left, top, right - left, bottom - top)
  const frame = rect(0, 0, 1106, 952)
  const editor = doc.createElement('aside')
  editor.dataset.kgWorkspaceLeftPane = '1'
  const toolbar = doc.createElement('nav')
  toolbar.setAttribute('aria-label', 'Canvas Toolbar')
  const panel = doc.createElement('aside')
  panel.dataset.kgFloatingPanelRoot = 'true'
  const timeline = doc.createElement('aside')
  timeline.dataset.kgWorkspaceVisibleViewportOccluder = 'bottom'
  const fixtures = new Map<Element, DOMRect>([
    [editor, rect(0, 0, 500, 952)], [toolbar, rect(220, 0, 900, 48)],
    [panel, rect(900, 60, 1106, 952)], [timeline, rect(500, 752, 900, 952)],
  ])
  const proto = dom.window.HTMLElement.prototype
  const originalRect = proto.getBoundingClientRect, originalRects = proto.getClientRects
  proto.getBoundingClientRect = function () {
    return fixtures.get(this) ?? (this.hasAttribute('data-kg-canvas-container-frame')
      ? frame : this.hasAttribute('data-kg-workspace-visible-viewport-occluder')
        ? rect(500, 48, 900, 500) : rect(0, 0, 0, 0))
  }
  proto.getClientRects = function () { return [this.getBoundingClientRect()] as unknown as DOMRectList }
  const host = doc.createElement('main')
  doc.body.append(editor, toolbar, panel, timeline, host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(React.createElement(CanvasViewContainer,
      { sizing: 'inset', overlay: true, children: React.createElement('aside', {
        'data-kg-workspace-visible-viewport-occluder': 'vertical',
      }) })))
    const surface = host.querySelector<HTMLElement>('[data-kg-canvas-view-container]')!
    assert.deepEqual([surface.style.left, surface.style.top, surface.style.right, surface.style.bottom],
      ['500px', '48px', '206px', '200px'])
    assert.ok(surface.classList.contains('pointer-events-none'))
    await act(async () => {
      editor.remove(); panel.remove(); timeline.remove()
      await new Promise(resolve => dom.window.requestAnimationFrame(() => dom.window.requestAnimationFrame(resolve)))
    })
    assert.deepEqual([surface.style.left, surface.style.top, surface.style.right, surface.style.bottom],
      ['0px', '48px', '0px', '0px'])
    await act(async () => root.unmount())
  } finally {
    proto.getBoundingClientRect = originalRect; proto.getClientRects = originalRects
    restore()
  }
})
