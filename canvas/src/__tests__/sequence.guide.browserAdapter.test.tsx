import assert from 'node:assert/strict'
import { test } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { FloatingPanelShell } from '../components/ui/FloatingPanel'
import { SequenceInspectorView } from '../features/sequence/SequenceInspectorView'
import {
  mountSequenceGuide, SEQUENCE_GUIDE_BROWSER_LIMITS,
  type SequenceGuideBrowserState, type SequenceGuideBrowserHandle,
} from '../features/sequence/sequenceGuideBrowserAdapter'

const fixture = (): SequenceGuideBrowserState => ({
  title: 'Offer setup', summary: '1 of 4 steps complete', status: 'Save before review.',
  items: ['describe', 'identity', 'economics', 'review'].map(id => ({
    id, label: id, detail: `Detail for ${id}`, meta: 'Needs attention', actionLabel: `Edit ${id}`, actionDisabled: false,
  })),
  selectedId: 'describe', busy: false, closeLabel: 'Close offer setup', notice: 'Local setup only.',
  onSelect() {}, onAction() {}, onClose() {},
})

function setup() {
  const environment = initJsdomHarness()
  // This focus-specific suite needs JSDOM's real getter, not the harness's body fallback.
  Reflect.deleteProperty(document, 'activeElement')
  const launcher = document.createElement('button'), field = document.createElement('input'), host = document.createElement('div')
  document.body.append(launcher, field, host)
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style'), target = document.createElement('div')
  shadow.append(style, target)
  let handle: SequenceGuideBrowserHandle | undefined
  return {
    ...environment, launcher, field, host, shadow, style, target,
    mount(state: SequenceGuideBrowserState) { act(() => { handle = mountSequenceGuide(target, state) }); return handle! },
    cleanup() { try { act(() => handle?.destroy()) } finally { environment.restore() } },
  }
}

test('native shell and inspector keep their markup and optional controller slots', () => {
  const markup = renderToStaticMarkup(<FloatingPanelShell minimized pinned={false} rowHeight="comfortable" fieldLine="single"
    header={<button>Native controls</button>}>
    <SequenceInspectorView title="Sequence Diagram" summary="Authored rehearsal" status="Selected step 7"
      items={[{ id: 'event', ordinal: 7, label: 'Request', detail: 'Buyer → Store · request', meta: 'Source line 9' }]}
      selectedId="event" onSelect={() => {}} textClassName="font-sans text-sm"
      beforeItems={<p>Branch selector</p>} footer={<p>Offline controls</p>} />
  </FloatingPanelShell>)
  assert.match(markup, /data-kg-floating-panel-root="true"/)
  assert.match(markup, /ModalContainer/)
  assert.match(markup, /kg-responsive-panel-header-row/)
  assert.match(markup, /cursor-move/)
  assert.match(markup, /sequence-flow sequence-inspector font-sans text-sm/)
  assert.match(markup, /<strong>7\. Request<\/strong>/)
  assert.match(markup, /aria-pressed="true"/)
  assert.match(markup, /Branch selector/)
  assert.match(markup, /Offline controls/)
  assert.doesNotMatch(markup, /data-sequence-guide-action|tabindex/)
})

test('plain text is snapshotted; selection is controlled and only the selected action renders', () => {
  const env = setup()
  try {
    const selected: string[] = [], actions: string[] = []
    const state = fixture()
    const literal = '<img src=x onerror=alert(1)> /buy @agent #workspace'
    state.items[0].detail = literal
    state.onSelect = id => selected.push(id)
    state.onAction = id => actions.push(id)
    const handle = env.mount(state)
    assert.equal(env.target.querySelectorAll('[data-step-id]').length, 4)
    assert.equal(env.target.querySelectorAll('[data-sequence-guide-action]').length, 1)
    assert.equal(env.target.querySelector('[data-step-id="describe"] span')?.textContent, literal)
    assert.equal(env.target.querySelector('img,a,iframe,script'), null)
    state.items[0].detail = 'Caller mutation'
    assert.equal(env.target.querySelector('[data-step-id="describe"] span')?.textContent, literal)
    act(() => (env.target.querySelector('[data-step-id="review"]') as HTMLButtonElement).click())
    assert.deepEqual(selected, ['review'])
    assert.equal(env.target.querySelector('[aria-pressed="true"]')?.getAttribute('data-step-id'), 'describe')
    act(() => (env.target.querySelector('[data-sequence-guide-action]') as HTMLButtonElement).click())
    assert.deepEqual(actions, ['describe'])
    act(() => handle.update({ ...state, selectedId: 'review' }))
    assert.equal(env.target.querySelector('[data-sequence-guide-action]')?.textContent, 'Edit review')
    assert.deepEqual(actions, ['describe'])
  } finally { env.cleanup() }
})

test('full updates synchronously disable actions and use the latest callbacks and availability', () => {
  const env = setup()
  try {
    const calls: string[] = []
    const state = fixture()
    state.onAction = () => calls.push('old')
    const handle = env.mount(state)
    const action = () => env.target.querySelector('[data-sequence-guide-action]') as HTMLButtonElement
    const next = { ...state, onAction: (id: string) => calls.push(id), onSelect: (id: string) => calls.push(`select:${id}`) }
    act(() => {
      handle.update({ ...next, busy: true })
      assert.equal(action().disabled, true)
      assert.ok([...env.target.querySelectorAll<HTMLButtonElement>('[data-step-id]')].every(button => button.disabled))
      action().click()
    })
    assert.deepEqual(calls, [])
    act(() => handle.update({ ...next, selectedId: 'review' }))
    act(() => action().click())
    act(() => (env.target.querySelector('[data-step-id="identity"]') as HTMLButtonElement).click())
    assert.deepEqual(calls, ['review', 'select:identity'])
    act(() => handle.update({ ...next, selectedId: 'review', items: next.items.map(item => ({ ...item, actionDisabled: item.id === 'review' })) }))
    assert.equal(action().disabled, true)
    act(() => action().click())
    assert.deepEqual(calls, ['review', 'select:identity'])
  } finally { env.cleanup() }
})

test('focus enters once, Escape closes once, and destroy leaves return focus to the consumer', () => {
  const env = setup()
  try {
    let closes = 0
    env.launcher.focus()
    const state = fixture()
    const handle = env.mount(state)
    assert.equal(env.shadow.activeElement, env.target.querySelector('h2'))
    const row = env.target.querySelector('[data-step-id="identity"]') as HTMLButtonElement
    row.focus()
    act(() => handle.update({ ...state, onClose() { closes++ } }))
    assert.equal(env.shadow.activeElement, row)
    const escape = new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    row.dispatchEvent(escape)
    assert.equal(closes, 1)
    assert.equal(escape.defaultPrevented, true)
    const ignored = new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    ignored.preventDefault(); row.dispatchEvent(ignored)
    assert.equal(closes, 1)
    act(() => (env.target.querySelector('[aria-label="Close offer setup"]') as HTMLButtonElement).click())
    assert.equal(closes, 2)
    env.field.focus()
    act(() => handle.destroy()); handle.destroy()
    assert.equal(document.activeElement, env.field)
    assert.equal(env.target.childElementCount, 0)
    assert.equal(env.shadow.querySelector('style'), env.style)
    env.target.dispatchEvent(new env.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(closes, 2)
    assert.throws(() => handle.update(state), /destroyed/)
    env.mount(state)
    assert.equal(env.target.querySelectorAll('[data-step-id]').length, 4)
  } finally { env.cleanup() }
})

test('validation rejects malformed and oversized state before mount or changing a valid view', () => {
  const env = setup()
  try {
    const state = fixture(), limits = SEQUENCE_GUIDE_BROWSER_LIMITS
    const invalid: unknown[] = [
      null, [], { ...state, title: '' }, { ...state, busy: 'false' }, { ...state, onClose: null },
      { ...state, onAction: '/save' }, { ...state, onSelect: undefined }, { ...state, selectedId: 'missing' },
      { ...state, notice: '\u0000' }, { ...state, closeLabel: '' }, { ...state, items: [] },
      { ...state, items: [state.items[0], state.items[0]] },
      { ...state, title: 'x'.repeat(limits.labelChars + 1) },
      { ...state, items: [{ ...state.items[0], id: 'x'.repeat(limits.idChars + 1) }] },
      { ...state, items: [{ ...state.items[0], actionDisabled: undefined }] },
      { ...state, items: [{ ...state.items[0], detail: 'x'.repeat(limits.textChars + 1) }] },
      { ...state, items: Array.from({ length: limits.items + 1 }, (_, i) => ({ ...state.items[0], id: String(i) })) },
      { ...state, selectedId: '0', items: Array.from({ length: 8 }, (_, i) => ({ ...state.items[0], id: String(i), detail: '界'.repeat(limits.textChars) })) },
    ]
    for (const input of invalid) {
      assert.throws(() => mountSequenceGuide(env.target, input as SequenceGuideBrowserState), /sequence guide/i)
      assert.equal(env.target.childElementCount, 0)
    }
    assert.throws(() => mountSequenceGuide(null as unknown as HTMLElement, state), /HTML element/)
    const handle = env.mount(state)
    assert.throws(() => mountSequenceGuide(env.target, state), /already mounted/)
    const before = env.target.innerHTML
    for (const input of invalid) {
      assert.throws(() => handle.update(input as SequenceGuideBrowserState), /sequence guide/i)
      assert.equal(env.target.innerHTML, before)
    }
  } finally { env.cleanup() }
})
