import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { JSDOM } from 'jsdom'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PanelColorPicker } from '@/lib/ui/PanelColorPicker'
import { normalizeHexColor, hexToHsv, hsvToHex, rgbToHex } from '@/lib/ui/colorValue'
import Tooltip from '@/features/panels/ui/Tooltip'

// These interaction checks need native focus; the broad repository harness stubs activeElement.
function initJsdomHarness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
  const keys = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']
  const original = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  for (const key of keys) {
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true
      : key === 'requestAnimationFrame' || key === 'cancelAnimationFrame' || key === 'getComputedStyle' ? dom.window[key].bind(dom.window)
      : (dom.window as unknown as Record<string, unknown>)[key]
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  return { dom, restore: () => {
    keys.forEach((key, i) => { if (original[i]) Object.defineProperty(globalThis, key, original[i]!); else Reflect.deleteProperty(globalThis, key) })
    dom.window.close()
  } }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 35))

export function testPanelColorMath() {
  assert.equal(normalizeHexColor('#AbC'), '#aabbcc')
  for (const invalid of ['red', '#0000', '#gggggg', 'url(evil)', '']) assert.equal(normalizeHexColor(invalid), null)
  for (const color of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#336699', '#28a745']) assert.equal(hsvToHex(hexToHsv(color)), color)
  assert.equal(rgbToHex([-20, 300, 127.6]), '#00ff80')
}

export async function testPanelColorInteraction() {
  const { dom, restore } = initJsdomHarness()
  document.documentElement.style.setProperty('--kg-canvas-accent', '#3b82f6')
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), changes: string[] = []
  const trigger = () => host.querySelector<HTMLButtonElement>('[data-kg-color-picker]')!
  function Fixture() {
    const [value, setValue] = React.useState('#336699')
    return <Tooltip content="Field colour help"><label>Node colour<PanelColorPicker value={value} onValueChange={next => { changes.push(next); setValue(next) }} /></label></Tooltip>
  }
  try {
    await act(async () => root.render(<Fixture />))
    trigger().focus()
    await act(async () => { trigger().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await tick() })
    await act(async () => { await import('@/lib/ui/ColorPalette'); await tick() })
    const palette = document.querySelector<HTMLElement>('[role="dialog"]')!
    assert.ok(palette); assert.equal(host.contains(palette), false)
    assert.equal(palette.getAttribute('aria-label'), 'Node colour palette')
    assert.equal(document.querySelector('[role="tooltip"]'), null)
    assert.equal(palette.querySelectorAll('div,[aria-hidden="true"],input[type="color"]').length, 0)
    assert.ok(palette.querySelector('button[aria-label="Choose #3b82f6"]'), 'theme colour comes from the palette owner')
    await act(async () => palette.querySelector<HTMLButtonElement>('[aria-label="Choose #ffffff"]')!.click())
    assert.equal(changes.at(-1), '#ffffff')
    const spectrum = palette.querySelector<HTMLButtonElement>('[aria-label="Saturation and brightness"]')!
    await act(async () => spectrum.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })))
    assert.equal(changes.at(-1), '#fcfcfc')
    const hex = palette.querySelector<HTMLInputElement>('[aria-label="Hex colour"]')!
    await act(async () => Simulate.change(hex, { target: { value: '#12zzzz' } } as never))
    await act(async () => Simulate.blur(hex))
    assert.equal(changes.at(-1), '#fcfcfc'); assert.ok(palette.querySelector('[role="alert"]'))
    await act(async () => Simulate.change(hex, { target: { value: '#123456' } } as never))
    assert.equal(changes.at(-1), '#123456')
    await act(async () => Simulate.change(palette.querySelector('[aria-label="Red"]')!, { target: { value: '999' } } as never))
    assert.equal(changes.at(-1), '#ff3456')
    await act(async () => palette.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(document.querySelector('[role="dialog"]'), null)
    assert.equal(document.activeElement, trigger())
    await act(async () => root.render(<PanelColorPicker value="#fff" disabled onValueChange={() => assert.fail('disabled colour changed')} />))
    trigger().click(); assert.equal(document.querySelector('[role="dialog"]'), null)
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
}

export function testPanelColorForbidsNativeVariants() {
  const root = new URL('..', import.meta.url).pathname
  const visit = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue
      const file = join(path, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (file.endsWith('.tsx') && !file.endsWith('.test.tsx')) assert.doesNotMatch(readFileSync(file, 'utf8'), /type=["']color["']|type=\{[^}]*['"]color['"]/, file)
    }
  }
  for (const owner of ['features', 'components', 'lib']) visit(join(root, owner))
}
