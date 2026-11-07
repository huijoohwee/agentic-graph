import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import Tooltip from '@/features/panels/ui/Tooltip'
import { SemanticSelect } from '@/lib/ui/SemanticSelect'
import { bindOutsideDismiss, enhanceSelects } from '@agentic-base/views-react/controls'
import { readSemanticSelectOptions } from '@/lib/ui/semanticSelectOptions'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// These interaction checks need native focus; the broad repository harness stubs activeElement.
function initJsdomHarness() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
  const keys = ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']
  const original = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  for (const key of keys) {
    const value = key === 'IS_REACT_ACT_ENVIRONMENT' ? true
      : key === 'requestAnimationFrame' || key === 'cancelAnimationFrame' ? dom.window[key].bind(dom.window)
      : (dom.window as unknown as Record<string, unknown>)[key]
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  }
  return { dom, restore: () => {
    keys.forEach((key, i) => { if (original[i]) Object.defineProperty(globalThis, key, original[i]!); else Reflect.deleteProperty(globalThis, key) })
    dom.window.close()
  } }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 35))

export async function testSemanticSelectKeyboardAndPortal() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host), changes: string[] = []
  const choose = () => document.querySelector<HTMLButtonElement>('[data-kg-select]')!
  const items = () => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
  const key = async (value: string) => { await act(async () => { document.activeElement!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) }); await act(tick) }
  function Fixture() {
    const [value, setValue] = React.useState('a')
    return <Tooltip content="Workspace field help"><label>Workspace editor view<SemanticSelect value={value} onValueChange={next => { changes.push(next); setValue(next) }}>
      <option value="a">Table</option><option value="x" disabled>Unavailable</option><option value="b">Kanban</option>
    </SemanticSelect></label></Tooltip>
  }
  try {
    await act(async () => root.render(<Fixture />))
    assert.ok(choose().classList.contains('agentic-form-control'), 'direct dropdowns reuse the central control utility')
    assert.equal(choose().querySelector('[aria-label="Show choices"]')?.tagName.toLowerCase(), 'svg', 'chevrons retain geometry instead of a font-dependent baseline')
    choose().focus()
    await key('ArrowDown')
    assert.equal(choose().getAttribute('aria-expanded'), 'true')
    const menu = document.querySelector('menu[role="menu"]')!
    assert.ok(items().every(item => item.classList.contains('agentic-form-control')), 'menu options reuse trigger/textbox geometry')
    assert.ok(menu); assert.equal(document.querySelector('[role=tooltip]') === null, true, 'field help must not cover menu choices'); assert.equal(host.contains(menu), false, 'menu escapes clipping ancestors through the shared portal')
    assert.equal(menu.querySelectorAll('div, [aria-hidden="true"]').length, 0)
    assert.equal(items()[1].disabled, true)
    assert.equal(document.activeElement === items()[0], true)
    let observed = false
    const inspect = () => { observed = true }
    document.addEventListener('pointerdown', inspect)
    items()[0].dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    document.removeEventListener('pointerdown', inspect)
    assert.equal(observed, true, 'menu targets remain observable to page inspection tools')
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })))
    assert.ok(document.querySelector('menu[role="menu"]'), 'pointerdown must not dismiss before annotation tooling can intercept the toolbar-compatible mouse gesture')
    const cancel = (event: Event) => event.preventDefault()
    document.body.addEventListener('mousedown', cancel)
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true })))
    await act(tick)
    document.body.removeEventListener('mousedown', cancel)
    assert.ok(document.querySelector('menu[role="menu"]'), 'a cancelled inspection gesture leaves the target menu open')
    document.addEventListener('click', cancel, true)
    await act(async () => items()[2].click())
    document.removeEventListener('click', cancel, true)
    assert.deepEqual(changes, [], 'a cancelled inspection click must not select an option')
    assert.ok(document.querySelector('menu[role="menu"]'))
    await key('ArrowDown'); assert.equal(document.activeElement === items()[2], true)
    await key('Home'); assert.equal(document.activeElement === items()[0], true)
    await key('k'); assert.equal(document.activeElement === items()[2], true)
    await act(async () => items()[2].click())
    assert.deepEqual(changes, ['b']); assert.equal(choose().querySelector('.agentic-menu-label')?.textContent, 'Kanban'); assert.equal(choose().getAttribute('data-value'), 'b')
    assert.equal(document.querySelector('menu[role="menu"]') === null, true)
    assert.equal(document.activeElement === choose(), true)
    await key('ArrowDown'); await key('Escape')
    assert.equal(document.querySelector('menu[role="menu"]') === null, true)
    assert.equal(document.activeElement === choose(), true); assert.deepEqual(changes, ['b'])
    await key('ArrowDown'); await key('Tab')
    assert.equal(document.querySelector('menu[role="menu"]') === null, true)
    assert.equal(document.activeElement === choose(), true, 'Tab starts from trigger so native focus can advance to the next field')
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
}

export async function testSemanticSelectFormsAndDisabled() {
  const { dom, restore } = initJsdomHarness()
  const host = document.createElement('section'); document.body.append(host)
  const root = createRoot(host)
  try {
    let dismissed = 0
    const stop = bindOutsideDismiss(() => false, () => { dismissed++ })
    document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
    stop(); await tick()
    assert.equal(dismissed, 0, 'disposing a popup cancels pending outside callbacks')
    const nativeHost = document.createElement('section'); document.body.append(nativeHost)
    const nativeHandle = enhanceSelects(nativeHost)
    try {
      const field = document.createElement('select'); field.innerHTML = '<option value="a">Table</option><option value="b">Kanban</option>'; nativeHost.append(field)
      field.focus(); await tick()
      assert.equal(document.activeElement, nativeHost.querySelector('.agentic-select-trigger'), 'asynchronous enhancement preserves focus held by a newly rendered select')
      field.focus(); assert.equal(document.activeElement, nativeHost.querySelector('.agentic-select-trigger'), 'later native focus calls reach the same visible control')
      assert.equal(nativeHost.querySelector('.agentic-menu-mark')?.namespaceURI, 'http://www.w3.org/2000/svg')
      nativeHost.querySelector<HTMLButtonElement>('.agentic-select-trigger')!.click()
      const cancel = (event: Event) => event.preventDefault()
      document.addEventListener('click', cancel, true)
      document.querySelector<HTMLButtonElement>('menu [value="b"]')!.click()
      document.removeEventListener('click', cancel, true)
      assert.equal(field.value, 'a', 'native and React adapters share cancelled-inspection semantics')
    } finally { nativeHandle.destroy(); nativeHost.remove() }
    await act(async () => root.render(<form><SemanticSelect name="layout" defaultValue="a" aria-label="Layout">
      <optgroup label="Enabled"><option value="a">Table</option><option value="b">Kanban</option></optgroup>
      <optgroup label="Disabled" disabled><option value="c">Later</option></optgroup>
    </SemanticSelect><button type="button">After</button></form>))
    const trigger = host.querySelector<HTMLButtonElement>('[data-kg-select]')!, form = host.querySelector('form')!
    await act(async () => trigger.click()); await act(tick)
    assert.equal(document.querySelector<HTMLButtonElement>('[aria-label="Later"]')?.disabled, true)
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Kanban"]')!.click())
    assert.equal(new dom.window.FormData(form).get('layout'), 'b')
    await act(async () => form.reset())
    assert.equal(new dom.window.FormData(form).get('layout'), 'a')
    await act(async () => trigger.click()); await act(async () => { await new Promise(resolve => setTimeout(resolve, 130)) })
    await act(async () => document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true })))
    await act(tick)
    assert.equal(document.querySelector('menu[role="menu"]') === null, true)
    await act(async () => root.render(<SemanticSelect disabled aria-label="Disabled"><option>Only</option></SemanticSelect>))
    assert.equal(host.querySelector<HTMLButtonElement>('button')!.disabled, true)
  } finally { await act(async () => root.unmount()); host.remove(); restore() }
}

export function testSemanticSelectOptionData() {
  assert.deepEqual(readSemanticSelectOptions(<><option>Default</option><option value="h" hidden>Hidden</option></>), [{ value: 'Default', label: 'Default', disabled: false, group: undefined }])
  assert.throws(() => readSemanticSelectOptions(<span>Not an option</span>), /accepts option/)
}

export function testSemanticSelectForbidsNativeVariants() {
  const root = new URL('..', import.meta.url).pathname
  function visit(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      if (item.name === '__tests__') continue
      const file = join(path, item.name)
      if (item.isDirectory()) visit(file)
      else if (file.endsWith('.tsx')) assert.doesNotMatch(readFileSync(file, 'utf8'), /<select\b|React\.SelectHTMLAttributes/, file)
    }
  }
  for (const owner of ['features', 'components', 'lib']) visit(join(root, owner))
}
