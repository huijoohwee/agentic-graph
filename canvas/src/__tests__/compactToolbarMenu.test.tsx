import assert from 'node:assert/strict'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initJsdomHarness } from '@/tests/lib/jsdomHarness'
import NativeTitleTooltip from '@/features/panels/ui/NativeTitleTooltip'
import { ToolbarDropdownSelect } from '@/components/toolbar/ToolbarDropdownSelect'
import { buildCanvasViewOptionHelp } from '@/components/toolbar/canvasViewOptionHelp'
import type { CanvasViewOption } from '@/components/toolbar/canvasViewTypes'

const tick = () => new Promise(resolve => setTimeout(resolve, 40))
const Icon = () => <svg role="img" aria-label="Renderer" />
const option: CanvasViewOption = { id: 'renderer:multiDimTable', title: '2D Renderer: Multi-dimensional Table',
  rowLabel: '2D Renderer', label: 'Table', valueLabel: 'Multi-dimensional Table', Icon,
  description: 'Structured table view', badges: ['Table', 'Data'], disabled: true,
  disabledReason: 'Disabled in Geospatial Mode', enableHint: 'Switch to Document Mode to enable' }

export async function testCompactToolbarMenuHelpAndDisabledActions() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), selected: string[] = []
  try {
    const options: CanvasViewOption[] = [{ id: 'renderer:menu', title: '2D Renderer', label: 'Renderer', Icon,
      children: [option, { ...option, id: 'renderer:dashboard', title: 'Dashboard', disabled: false }] }]
    const render = (items: CanvasViewOption[]) => root.render(<><NativeTitleTooltip /><ToolbarDropdownSelect value="renderer:menu" title="Canvas view" options={items}
      onSelect={id => selected.push(id)} getOptionTooltip={buildCanvasViewOptionHelp}
      renderButtonContent={() => 'Canvas'} renderOptionContent={item => item.valueLabel || item.title} /></>)
    render(options)
    await tick(); Simulate.click(host.querySelector('button')!); await tick()
    Simulate.click(document.querySelector('button[aria-label="2D Renderer"]')!); await tick()
    const disabled = document.querySelector<HTMLButtonElement>('button[aria-label="2D Renderer: Multi-dimensional Table"]')!
    assert.ok(disabled && !disabled.disabled, 'Disabled choices stay focusable for guidance')
    assert.equal(disabled.getAttribute('aria-disabled'), 'true')
    assert.equal(disabled.textContent, 'Multi-dimensional Table', 'No inline descriptions, badges or repeated hints')
    assert.match(disabled.getAttribute('aria-description')!, /2D Renderer → select Multi-dimensional Table → Structured table view/)
    assert.match(disabled.getAttribute('aria-description')!, /Default: Storyboard/)
    Simulate.click(disabled); assert.deepEqual(selected, [], 'Unavailable actions must never dispatch')
    disabled.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true })); await tick()
    const tip = document.querySelector('[role="tooltip"]')!
    assert.match(tip.textContent!, /Switch to Document Mode to enable/)
    assert.ok(!document.querySelector('menu')!.contains(tip), 'Reuse the unclipped portal tooltip')
    let focused = false
    disabled.focus = () => { focused = true }
    const parent = document.querySelector<HTMLButtonElement>('button[aria-label="2D Renderer"]')!
    let stolenFocus = false
    parent.focus = () => { stolenFocus = true }
    render([...options]); await tick()
    assert.equal(stolenFocus, false, 'Live menu updates must preserve the user focus')
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => parent })
    Simulate.keyDown(parent, { key: 'ArrowDown' }); assert.equal(focused, true, 'Arrow navigation includes disabled child help')
    Simulate.click(document.querySelector('button[aria-label="Dashboard"]')!); assert.deepEqual(selected, ['renderer:dashboard'])
  } finally { root.unmount(); host.remove(); restore() }
}

export function testCompactToolbarMenuForbidsInlineHelp() {
  const read = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8')
  const menu = read('components/toolbar/ToolbarDropdownSelect.tsx')
  const renderer = read('components/toolbar/Canvas2dRendererSelect.tsx')
  const css = read('styles/responsive-toolbar.css')
  assert.ok(!/kg-toolbar-dropdown-option-(hint|meta|copy)/.test(menu + renderer + css))
  assert.ok(!renderer.includes('option.badges') && !renderer.includes('option.description'))
  assert.ok(renderer.includes('getOptionTooltip={buildCanvasViewOptionHelp}'))
  assert.ok(css.includes('.kg-toolbar-dropdown-menu .kg-menu-row { height: var(--kg-control-height, 28px); }'))
}
