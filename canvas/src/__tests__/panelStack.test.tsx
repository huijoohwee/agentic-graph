import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { createPanelStackController, type PanelStackId } from '../lib/ui/panelStack'
import { usePanelStack } from '../lib/ui/usePanelStack'
import { Z_INDEX_ANCHOR_OVERLAY, Z_INDEX_MENU, Z_INDEX_PANEL_STACK_MAX_BASE } from '../lib/ui/zIndex'

const ids: PanelStackId[] = ['bottom', 'floating', 'main']

test('shared maximum floor gives a stable initial order independent of mounting order', () => {
  const stack = createPanelStackController()
  stack.register('main', 40)
  stack.register('bottom', 40)
  stack.register('floating', 420)
  const z = (id: PanelStackId) => stack.getZIndex(id, 40)
  assert.equal(z('bottom'), 1000)
  assert.equal(z('floating'), 1001)
  assert.equal(z('main'), 1002)
  stack.bringToFront('bottom')
  assert(z('bottom') > z('main') && z('main') > z('floating'))
  stack.bringToFront('floating')
  assert(z('floating') > z('bottom') && z('bottom') > z('main'))
})

test('ranks remain bounded after repeated promotions and invalid configured bases', () => {
  for (const base of [NaN, Infinity, -100, 0, 40.9, 100000, Number.MAX_SAFE_INTEGER]) {
    const stack = createPanelStackController()
    ids.forEach(id => stack.register(id, base))
    for (let index = 0; index < 1000; index++) stack.bringToFront(ids[index % ids.length])
    const values = ids.map(id => stack.getZIndex(id, base))
    assert.equal(new Set(values).size, 3)
    assert.equal(Math.max(...values) - Math.min(...values), 2)
    assert(Math.min(...values) >= 1000)
    assert(Math.max(...values) <= Z_INDEX_PANEL_STACK_MAX_BASE + 2)
    assert(Math.max(...values) < Z_INDEX_ANCHOR_OVERLAY && Math.max(...values) < Z_INDEX_MENU)
  }
})

test('already-front and absent panels do not notify; duplicate registration cleanup is safe', () => {
  const stack = createPanelStackController()
  let changes = 0
  const unsubscribe = stack.subscribe(() => changes++)
  const removeMain = stack.register('main', 5000)
  const removeFloating = stack.register('floating', 5000)
  const removeDuplicate = stack.register('floating', 9000)
  const mountedChanges = changes
  stack.bringToFront('main')
  stack.bringToFront('bottom')
  assert.equal(changes, mountedChanges)
  stack.bringToFront('floating')
  assert.equal(changes, mountedChanges + 1)
  stack.bringToFront('floating')
  assert.equal(changes, mountedChanges + 1)
  removeDuplicate()
  assert.equal(stack.getZIndex('main', 5000), 5001)
  removeDuplicate()
  assert.equal(changes, mountedChanges + 2)
  stack.bringToFront('main')
  assert(stack.getZIndex('main') > stack.getZIndex('floating'))
  removeFloating(); removeMain()
  const afterCleanup = changes
  stack.bringToFront('main')
  assert.equal(changes, afterCleanup)
  unsubscribe()
  stack.register('main', 5000)
  stack.register('bottom', 5000)
  assert.equal(changes, afterCleanup)
  assert.equal(stack.getZIndex('main'), 5002, 'a new mount session starts with Main in front')
})

function setup() {
  const environment = initJsdomHarness()
  Reflect.deleteProperty(document, 'activeElement')
  const host = document.createElement('div'), portal = document.createElement('div')
  document.body.append(host, portal)
  const root = createRoot(host)
  const renders: Partial<Record<PanelStackId, number>> = {}
  let childPointerCalls = 0
  function Panel({ id, active = true, base = 5000, children }: {
    id: PanelStackId; active?: boolean; base?: number; children?: React.ReactNode
  }) {
    const stack = usePanelStack(id, base, active)
    renders[id] = (renders[id] ?? 0) + 1
    return <section data-kg-panel-layer={id} style={{ zIndex: stack.zIndex }}
      onPointerDownCapture={stack.onPointerDownCapture} onFocusCapture={stack.onFocusCapture}>
      <button data-action={id} onPointerDown={event => { childPointerCalls++; event.stopPropagation() }}>Activate {id}</button>
      {children}
    </section>
  }
  const z = (id: PanelStackId) => Number(host.querySelector<HTMLElement>(`[data-kg-panel-layer="${id}"]`)!.style.zIndex)
  const button = (id: PanelStackId) => host.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!
  const pointer = (target: Element) => {
    const event = new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })
    act(() => { target.dispatchEvent(event) })
    assert.equal(event.defaultPrevented, false, 'promotion never cancels a child action')
  }
  return {
    ...environment, root, host, portal, Panel, z, button, pointer, renders,
    childPointerCalls: () => childPointerCalls,
    cleanup() { try { act(() => root.unmount()) } finally { host.remove(); portal.remove(); environment.restore() } },
  }
}

test('captured child pointer and keyboard focus promote without stealing focus or rerendering twice', () => {
  const env = setup(), Panel = env.Panel
  try {
    act(() => env.root.render(<><Panel id="main" /><Panel id="floating" /><Panel id="bottom" /></>))
    assert(env.z('main') > env.z('floating') && env.z('floating') > env.z('bottom'))
    env.pointer(env.button('bottom'))
    assert(env.z('bottom') > env.z('main'))
    assert.equal(env.childPointerCalls(), 1, 'the child handler runs despite stack capture')
    const beforeRepeat = { ...env.renders }
    env.pointer(env.button('bottom'))
    act(() => env.button('bottom').focus())
    assert.deepEqual(env.renders, beforeRepeat)
    assert.equal(document.activeElement, env.button('bottom'))
    act(() => env.button('floating').focus())
    assert(env.z('floating') > env.z('bottom'))
    assert.equal(document.activeElement, env.button('floating'))
  } finally { env.cleanup() }
})

test('portal menu and dialog events cannot activate their React parent panel', () => {
  const env = setup(), Panel = env.Panel
  try {
    act(() => env.root.render(<><Panel id="main" /><Panel id="floating" />
      <Panel id="bottom">{createPortal(<div role="dialog" aria-modal="true"><button>Portal action</button></div>, env.portal)}</Panel>
    </>))
    const before = ids.map(env.z), control = env.portal.querySelector('button')!
    env.pointer(control)
    act(() => control.focus())
    assert.deepEqual(ids.map(env.z), before)
    assert.equal(document.activeElement, control, 'modal/portal focus remains under its own owner')
  } finally { env.cleanup() }
})

test('nested panel owns its captured events; inactive panels and unmounted floors are released', () => {
  const env = setup(), Panel = env.Panel
  try {
    act(() => env.root.render(<><Panel id="main"><Panel id="floating" /></Panel><Panel id="bottom" base={9000} /></>))
    env.pointer(env.button('floating'))
    assert(env.z('floating') > env.z('main'), 'the outer Main capture does not consume the inner panel activation')
    assert(env.z('main') >= 9000)
    act(() => env.root.render(<><Panel id="main"><Panel id="floating" /></Panel><Panel id="bottom" base={9000} active={false} /></>))
    assert(env.z('main') < 9000, 'inactive panels release their configured floor')
    const before = [env.z('main'), env.z('floating')]
    env.pointer(env.button('bottom'))
    assert.deepEqual([env.z('main'), env.z('floating')], before)
    act(() => env.root.render(<Panel id="main" base={40} />))
    assert(env.z('main') >= 1000 && env.z('main') <= 1002)
  } finally { env.cleanup() }
})
