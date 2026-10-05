import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { parseSequence, sequenceTimedEvents } from '../features/sequence/sequenceModel'
import { sequenceNativeSvg } from '../features/sequence/sequenceNativeSvg'
import { sequenceTopologySvg } from '../features/sequence/sequenceTopologySvg'
import { bindSequenceSvg, createSequenceSvgPlayback } from '../features/sequence/sequenceSvgBinding'

type Box = { x: number; y: number; width: number; height: number }
const boxOf = (element: Element): Box => Object.fromEntries(
  ['x', 'y', 'width', 'height'].map(key => [key, Number(element.getAttribute(key))]),
) as Box
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const cases = {
  repeated: () => 'Left->>Right: Same label',
  reversed: (index: number) => index % 2 ? 'Right-->>Left: Same label' : 'Left->>Right: Same label',
  self: () => 'Left->>Left: Same label',
  notes: () => 'Note over Left,Right: Same label',
  mixed: (index: number) => ['Left->>Right: Same label', 'Right-)Left: Same label', 'Left->>Left: Same label', 'Note over Left,Right: Same label'][index % 4]!,
}

for (const count of [10, 200]) {
  test(`connections keep ${count} repeated, reverse, self and note targets reachable`, () => {
    for (const [name, line] of Object.entries(cases)) {
      const model = parseSequence(['sequenceDiagram', 'participant Left', 'participant Right', ...Array.from({ length: count }, (_, index) => line(index))].join('\n'))
      assert.deepEqual(model.diagnostics, [], name)
      const dom = new JSDOM(sequenceTopologySvg(model))
      try {
        const svg = dom.window.document.querySelector('svg')!
        const [x, y, width, height] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number)
        const targets = [...svg.querySelectorAll('[data-sequence-event]')]
        assert.deepEqual(targets.map(element => element.getAttribute('data-sequence-event')), model.events.map(event => event.id), name)
        const badges = targets.map(element => boxOf(element.querySelector('.sequence-connection-badge')!))
        const participants = [...svg.querySelectorAll('[data-sequence-participant] .sequence-participant')].map(boxOf)
        for (const [index, badge] of badges.entries()) {
          const context = `${name}, target ${index + 1}`
          assert.ok(Object.values(badge).every(Number.isFinite), context)
          assert.ok(badge.width >= 44 && badge.height >= 44, `${context}: minimum target size`)
          assert.ok(badge.x >= x! && badge.y >= y! && badge.x + badge.width <= x! + width! && badge.y + badge.height <= y! + height!, `${context}: within viewBox`)
          assert.ok(!participants.some(person => overlaps(badge, person)), `${context}: participant does not obscure target`)
          assert.ok(!badges.slice(index + 1).some(other => overlaps(badge, other)), `${context}: another event does not obscure target`)
        }
        const connectionPaths = targets.flatMap(element => [...element.querySelectorAll('path')])
        assert.ok(connectionPaths.every(path => path.getAttribute('pointer-events') === 'none'), `${name}: later curves cannot intercept another event badge`)
        const paths = targets.flatMap(element => [...element.querySelectorAll('.sequence-message')].map(path => path.getAttribute('d')))
        assert.equal(paths.length, model.events.filter(event => event.kind !== 'note').length, name)
        assert.equal(new Set(paths).size, paths.length, `${name}: repeated occurrences have distinct routes`)
      } finally { dom.window.close() }
    }
  })
}

test('diagonal connections terminate on the destination boundary with a visible arrowhead', () => {
  const model = parseSequence('sequenceDiagram\nparticipant A\nparticipant B\nparticipant C\nB->>C: Forward entry')
  const dom = new JSDOM(sequenceTopologySvg(model))
  try {
    const svg = dom.window.document.querySelector('svg')!
    const destination = boxOf(svg.querySelector('[data-sequence-participant="C"] .sequence-participant')!)
    const path = svg.querySelector('[data-sequence-event] .sequence-message')!
    const coordinates = path.getAttribute('d')!.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)!.map(Number)
    const [x, y] = coordinates.slice(-2)
    const epsilon = 0.000001
    assert.ok(x! >= destination.x - epsilon && x! <= destination.x + destination.width + epsilon)
    assert.ok(y! >= destination.y - epsilon && y! <= destination.y + destination.height + epsilon)
    assert.ok([
      x! - destination.x, x! - destination.x - destination.width,
      y! - destination.y, y! - destination.y - destination.height,
    ].some(distance => Math.abs(distance) < epsilon), 'arrowhead must reach an edge, not be hidden inside the participant')
    assert.ok(path.hasAttribute('marker-end'))
  } finally { dom.window.close() }
})

test('dense connections leave and enter participant edges from outside their boxes', () => {
  const people = Array.from({ length: 32 }, (_, index) => `participant P${index}`)
  const mixed = Array.from({ length: 200 }, (_, index) => {
    const from = Math.floor(index / 4) % 32, to = (from + 13) % 32
    return [`P${from}->>P${to}: Forward`, `P${to}-->>P${from}: Return`, `P${from}->>P${from}: Retry`, 'P0->>P31: Repeated'][index % 4]!
  })
  const diagonal = Array.from({ length: 200 }, (_, index) => `P${index % 32}->>P${(index * 7 + 3) % 32}: Cross-link`)
  for (const messages of [diagonal, mixed]) {
    const model = parseSequence(['sequenceDiagram', ...people, ...messages].join('\n'))
    assert.deepEqual(model.diagnostics, [])
    const dom = new JSDOM(sequenceTopologySvg(model))
    try {
      const svg = dom.window.document.querySelector('svg')!
      const participants = new Map([...svg.querySelectorAll('[data-sequence-participant]')].map(person => [person.getAttribute('data-sequence-participant')!, boxOf(person.querySelector('.sequence-participant')!)]))
      const assertOutward = (id: string, endpoint: number[], control: number[], context: string) => {
        const box = participants.get(id)!, [x, y] = endpoint, [cx, cy] = control, epsilon = 0.000001
        assert.ok(x! >= box.x - epsilon && x! <= box.x + box.width + epsilon && y! >= box.y - epsilon && y! <= box.y + box.height + epsilon, `${context}: endpoint within participant bounds`)
        const faces = [
          [Math.abs(x! - box.x), x! - cx!], [Math.abs(x! - box.x - box.width), cx! - x!],
          [Math.abs(y! - box.y), y! - cy!], [Math.abs(y! - box.y - box.height), cy! - y!],
        ].filter(([distance]) => distance! < epsilon)
        assert.ok(faces.length, `${context}: endpoint reaches an edge`)
        assert.ok(faces.some(([, outward]) => outward! > epsilon), `${context}: endpoint tangent faces outside the participant`)
      }
      for (const event of model.events) {
        const path = svg.querySelector(`[data-sequence-event="${event.id}"] .sequence-message`)!
        const coordinates = path.getAttribute('d')!.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)!.map(Number)
        assert.ok(coordinates.every(Number.isFinite))
        assertOutward(event.from, coordinates.slice(0, 2), coordinates.slice(2, 4), `event ${event.ordinal} start`)
        assertOutward(event.to, coordinates.slice(-2), coordinates.slice(-4, -2), `event ${event.ordinal} end`)
        assert.ok(path.hasAttribute('marker-end'))
      }
    } finally { dom.window.close() }
  }
})

test('native diagrams inherit the theme ink and expose every event as an interactive child', () => {
  const model = parseSequence('sequenceDiagram\nactor Left as Reader\nparticipant Right as Index\nLeft->>Right: Find entry\nNote over Left: Inspect\nRight-->>Left: Entry found')
  for (const render of [sequenceNativeSvg, sequenceTopologySvg]) {
    const dom = new JSDOM(render(model))
    try {
      const svg = dom.window.document.querySelector('svg')!
      assert.equal(svg.getAttribute('role'), 'group', 'an image role must not hide nested buttons')
      const events = [...svg.querySelectorAll('[data-sequence-event]')]
      assert.equal(events.length, model.events.length)
      assert.ok(events.every(event => event.getAttribute('role') === 'button' && event.getAttribute('tabindex') === '0' && event.getAttribute('aria-label')))
      const text = [...svg.querySelectorAll('text')]
      assert.ok(text.length)
      for (const label of text) {
        const fill = label.closest('[fill]')?.getAttribute('fill')
        assert.ok(fill === 'currentColor' || (label.hasAttribute('fill') && fill?.startsWith('var(--sequence-surface')), `label ${JSON.stringify(label.textContent)} has a theme-aware foreground`)
      }
    } finally { dom.window.close() }
  }
})

function withNotation(markup: string, check: (host: HTMLElement) => void) {
  const dom = new JSDOM(`<div id="host"><svg xmlns="http://www.w3.org/2000/svg" role="img">${markup}</svg></div>`)
  const priorDocument = globalThis.document
  globalThis.document = dom.window.document
  Object.defineProperty(dom.window.SVGElement.prototype, 'getBBox', { value: () => ({ x: 0, y: 0, width: 100, height: 20 }) })
  try { check(dom.window.document.getElementById('host')!) }
  finally { globalThis.document = priorDocument; dom.window.close() }
}

test('connections distinguish authored messages from step metadata without losing full accessible labels', () => {
  const participant = '資料庫 Café 👩🏽‍💻 with a deliberately long descriptive name'
  const longLabel = 'Transmit <draft> & "résumé" 👩🏽‍💻 ' + '情報'.repeat(40)
  const model = parseSequence([
    'sequenceDiagram', `participant A as ${participant}`, 'participant B as Worker',
    'A->>B: Save item', 'B-->>A: Save item', 'A-)B: [queue] Enqueue',
    `A->>A: ${longLabel}`, `Note over A,B: ${'👩🏽‍💻'.repeat(30)}`,
  ].join('\n'))
  assert.deepEqual(model.diagnostics, [])
  const dom = new JSDOM(sequenceTopologySvg(model))
  try {
    const targets = [...dom.window.document.querySelectorAll('[data-sequence-event]')]
    assert.deepEqual(targets.map(target => target.getAttribute('data-sequence-event')), model.events.map(event => event.id))
    for (const [index, target] of targets.entries()) {
      const event = model.events[index]!
      const message = target.querySelector('.sequence-event-label')!
      const metadata = target.querySelector('.sequence-event-meta')!
      assert.ok(message?.textContent, `step ${event.ordinal}: authored text is visible`)
      assert.ok(metadata?.textContent?.includes(String(event.ordinal)), 'ordinal is independently visible')
      assert.ok(metadata.textContent?.includes(event.protocol || event.kind), 'protocol or message kind is secondary metadata')
      assert.ok(target.getAttribute('aria-label')?.includes(event.label), 'accessible name retains the complete authored message')
      assert.ok(target.querySelector('title')?.textContent?.includes(event.label), 'hover text retains the complete authored message')
      assert.equal(target.getAttribute('role'), 'button')
      assert.equal(target.getAttribute('tabindex'), '0')
    }
    assert.equal(targets[0]!.querySelector('.sequence-event-label')!.textContent, 'Save item')
    assert.equal(targets[1]!.querySelector('.sequence-event-label')!.textContent, 'Save item')
    assert.notEqual(targets[0]!.getAttribute('data-sequence-event'), targets[1]!.getAttribute('data-sequence-event'))
    for (const index of [3, 4]) {
      const visible = targets[index]!.querySelector('.sequence-event-label')!.textContent!
      assert.ok(visible.endsWith('…'), 'overflow is explicitly signalled')
      assert.ok(model.events[index]!.label.startsWith(visible.slice(0, -1)), 'preview preserves authored order')
      assert.doesNotMatch(visible, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u, 'no split surrogate pairs')
    }
    const emojiPreview = targets[4]!.querySelector('.sequence-event-label')!.textContent!.slice(0, -1)
    assert.equal(emojiPreview.replaceAll('👩🏽‍💻', ''), '', 'emoji clusters are not split by truncation')
    const person = dom.window.document.querySelector('[data-sequence-participant="A"]')!
    assert.equal(person.querySelector('title')!.textContent, participant)
    assert.ok(person.querySelector('.sequence-participant-name')!.textContent!.includes('資料庫'))
    assert.equal(dom.window.document.querySelector('draft'), null, 'authored markup remains escaped text')
  } finally { dom.window.close() }
})

for (const { name, width, height, left, right, top, bottom } of [
  { name: 'desktop', width: 1280, height: 800, left: 240, right: 380, top: 64, bottom: 200 },
  { name: 'mobile', width: 390, height: 844, left: 0, right: 130, top: 56, bottom: 280 },
]) {
  test(`${name} mounted sequence viewport reserves visible Inspector, Timeline and toolbar space`, async () => {
    const { CanvasViewContainer } = await import('../components/CanvasViewContainer')
    const env = initJsdomHarness()
    const rectangles = new Map<Element, DOMRect>()
    const rect = (x: number, y: number, w: number, h: number) => new env.dom.window.DOMRect(x, y, w, h)
    const frameRect = rect(0, 0, width, height)
    const prototype = env.dom.window.HTMLElement.prototype
    prototype.getBoundingClientRect = function () {
      if (this.getAttribute('aria-label') === 'Canvas Toolbar' && this.closest('[data-kg-canvas-container-frame]')) return frameRect
      return this.hasAttribute('data-kg-canvas-container-frame') ? frameRect : rectangles.get(this) || rect(0, 0, 0, 0)
    }
    prototype.getClientRects = function () {
      const items = this.hidden ? [] : [this.getBoundingClientRect()]
      return Object.assign(items, { item: (index: number) => items[index] || null }) as unknown as DOMRectList
    }
    const frames = new Map<number, FrameRequestCallback>()
    let nextFrame = 0
    env.dom.window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame }
    env.dom.window.cancelAnimationFrame = id => { frames.delete(id) }
    let notifyResize = () => {}, disconnected = false
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { notifyResize = () => callback([], this) }
      observe() {}
      unobserve() {}
      disconnect() { disconnected = true }
    }
    const panel = (attributes: Record<string, string>, bounds: DOMRect) => {
      const element = document.createElement('aside')
      for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
      rectangles.set(element, bounds); document.body.append(element)
      return element
    }
    if (left) panel({ 'data-kg-workspace-left-pane': '1' }, rect(0, top, left, height - top - bottom))
    const inspector = panel({ 'data-kg-floating-panel-root': 'true' }, rect(width - right, top, right, height - top - bottom))
    const timeline = panel({ class: 'kg-canvas-bottom-panel' }, rect(0, height - bottom, width, bottom))
    panel({ 'aria-label': 'Canvas Toolbar' }, rect(0, 0, width, top))
    const host = document.createElement('div'); document.body.append(host)
    const root = createRoot(host)
    const flush = async (change: () => void) => act(async () => {
      change(); await Promise.resolve()
      const pending = [...frames.values()]; frames.clear()
      for (const callback of pending) callback(0)
    })
    const insets = () => {
      const element = host.querySelector<HTMLElement>('[data-kg-canvas-view-container]')!
      return Object.fromEntries(['left', 'right', 'top', 'bottom'].map(edge => [edge, Number.parseFloat(element.style.getPropertyValue(edge))]))
    }
    try {
      await act(async () => root.render(<CanvasViewContainer sizing="inset" overlay>
        <div aria-label="Sequence chart"><button aria-label="Canvas Toolbar">Internal chart control</button></div>
      </CanvasViewContainer>))
      assert.deepEqual(insets(), { left, right, top, bottom }, 'chart bounds exclude actual visible workspace chrome')
      assert.ok(host.querySelector('[aria-label="Sequence chart"]'), 'the chart remains mounted while its available area changes')
      await flush(() => inspector.setAttribute('aria-hidden', 'true'))
      assert.deepEqual(insets(), { left, right: 0, top, bottom }, 'hidden Inspector gives its width back')
      await flush(() => { rectangles.set(timeline, rect(0, height - 180, width, 180)); notifyResize() })
      assert.deepEqual(insets(), { left, right: 0, top, bottom: 180 }, 'Timeline resize updates the existing chart frame')
      await flush(() => timeline.remove())
      assert.deepEqual(insets(), { left, right: 0, top, bottom: 0 }, 'closed Timeline releases its reserved height')
      await flush(() => inspector.removeAttribute('aria-hidden'))
      assert.deepEqual(insets(), { left, right, top, bottom: 0 }, 'reopened Inspector is measured again')
    } finally {
      await act(async () => root.unmount())
      env.restore()
      assert.equal(disconnected, true, 'unmount disconnects panel measurements')
      assert.equal(frames.size, 0, 'unmount cancels pending frame work')
    }
  })
}

test('notation participant highlighting uses source identities when display aliases are identical', () => {
  const model = parseSequence('sequenceDiagram\nparticipant Left as Worker\nparticipant Right as Worker\nLeft->>Right: Repeated\nRight-->>Left: Repeated\nNote over Left: Repeated')
  const participants = ['Left', 'Right'].map(id => `<g data-et="participant" data-id="${id}"><rect/><text>Worker</text></g><g data-et="life-line" data-id="${id}"><line/></g>`).join('')
  const messages = '<line class="messageLine0"/><text class="messageText">Repeated</text><line class="messageLine1"/><text class="messageText">Repeated</text><g data-et="note"><rect/><text>Repeated</text></g>'
  withNotation(participants + messages, host => {
    bindSequenceSvg(host, model, true)
    assert.equal(host.querySelector('svg')!.getAttribute('role'), 'group')
    for (const id of ['Left', 'Right']) {
      const bindings = [...host.querySelectorAll(`[data-sequence-participant="${id}"]`)]
      assert.equal(bindings.length, 2, `${id}: both participant and lifeline bind`)
      assert.ok(bindings.every(element => element.getAttribute('data-id') === id))
    }
    const events = [...host.querySelectorAll('[data-sequence-event]')]
    assert.deepEqual(events.map(element => element.getAttribute('data-sequence-event')), model.events.map(event => event.id))
    assert.ok(events.every(element => element.getAttribute('role') === 'button' && element.getAttribute('tabindex') === '0'))
    assert.equal(events[0]!.querySelector('.messageLine0')?.tagName, 'line')
    assert.equal(events[1]!.querySelector('.messageLine1')?.tagName, 'line')
    assert.equal(events[2]!.getAttribute('data-et'), 'note')
  })
})

test('notation rejects unknown participant or lifeline identities instead of highlighting an alias match', () => {
  const model = parseSequence('sequenceDiagram\nparticipant Left as Worker\nparticipant Right as Worker\nLeft->>Right: Send')
  for (const kind of ['participant', 'life-line']) {
    withNotation(`<g data-et="${kind}" data-id="Unknown"><text>Worker</text></g><line class="messageLine0"/><text class="messageText">Send</text>`, host => {
      assert.throws(() => bindSequenceSvg(host, model, true), /participant identity does not match authored source/)
    })
  }
})

for (const [layout, render] of [['lifelines', sequenceNativeSvg], ['connections', sequenceTopologySvg]] as const) {
  test(`${layout} playback preserves semantic selection without repeating static SVG mutations`, () => {
    const model = parseSequence('sequenceDiagram\nparticipant Left\nparticipant Right\nLeft->>Right: Repeated\nRight-->>Left: Repeated')
    const events = sequenceTimedEvents(model.events)
    const dom = new JSDOM(`<main>${render(model)}</main>`)
    const host = dom.window.document.querySelector('main')!
    const groups = [...host.querySelectorAll('[data-sequence-event]')]
    let lengthReads = 0
    for (const path of host.querySelectorAll('.sequence-message')) {
      Object.assign(path, {
        getTotalLength: () => { lengthReads++; return 100 },
        getPointAtLength: (distance: number) => ({ x: distance, y: distance / 2 }),
      })
    }
    const projection = createSequenceSvgPlayback(host, events)
    const mutations = new dom.window.MutationObserver(() => {})
    mutations.observe(host, { attributes: true, childList: true, subtree: true })
    try {
      projection.update(events[0]!, 100, false)
      const pulse = host.querySelector('[data-sequence-pulse]')!
      assert.ok(pulse)
      assert.equal(pulse.parentElement, groups[0])
      assert.equal(pulse.getAttribute('cx'), '10')
      assert.deepEqual(groups.map(group => group.getAttribute('aria-pressed')), ['true', 'false'])
      assert.deepEqual(groups.map(group => group.getAttribute('data-sequence-state')), ['active', 'pending'])
      mutations.takeRecords()
      projection.update(events[0]!, 200, false)
      const tick = mutations.takeRecords()
      assert.equal(host.querySelector('[data-sequence-pulse]'), pulse, 'Continuous playback retains the same pulse')
      assert.equal(pulse.getAttribute('cx'), '20')
      assert.equal(lengthReads, 1, 'Geometry length is stable for this bound path')
      assert.ok(tick.length > 0)
      assert.ok(tick.every(change => change.type === 'attributes' && change.target === pulse && ['cx', 'cy'].includes(change.attributeName!)), 'Only pulse coordinates change within the same event')
      projection.update(events[1]!, 1100, false)
      assert.equal(host.querySelectorAll('[data-sequence-pulse]').length, 1)
      assert.equal(host.querySelector('[data-sequence-pulse]')!.parentElement, groups[1])
      assert.deepEqual(groups.map(group => group.getAttribute('aria-pressed')), ['false', 'true'])
      assert.deepEqual(groups.map(group => group.getAttribute('data-sequence-state')), ['complete', 'active'])
      projection.update(events[1]!, 1200, true)
      assert.equal(host.querySelectorAll('[data-sequence-pulse]').length, 0, 'Reduced motion removes the moving projection')
      assert.equal(groups[1]!.getAttribute('aria-pressed'), 'true', 'Textual selection survives reduced motion')
      projection.update(events[1]!, 1300, false)
      assert.equal(host.querySelectorAll('[data-sequence-pulse]').length, 1)
      assert.equal(lengthReads, 2, 'Each stable path is measured only once')
      projection.dispose(); mutations.takeRecords()
      projection.update(events[0]!, 100, false)
      assert.equal(mutations.takeRecords().length, 0, 'Disposed playback cannot mutate a stale source')
      assert.equal(host.querySelectorAll('[data-sequence-pulse]').length, 0)
    } finally { mutations.disconnect(); projection.dispose(); dom.window.close() }
  })

  test(`${layout} playback bindings cannot publish into a replaced SVG or select an excluded branch`, () => {
    const model = parseSequence('sequenceDiagram\nparticipant Left\nparticipant Right\nLeft->>Right: Included\nRight-->>Left: Excluded')
    const events = sequenceTimedEvents(model.events)
    const dom = new JSDOM(`<main>${render(model)}</main>`)
    const host = dom.window.document.querySelector('main')!
    const projection = createSequenceSvgPlayback(host, events.slice(0, 1))
    try {
      projection.update(events[0]!, 100, true)
      const excluded = host.querySelectorAll('[data-sequence-event]')[1]!
      assert.equal(excluded.getAttribute('data-sequence-state'), 'skipped')
      assert.equal(excluded.getAttribute('aria-pressed'), 'false')
      host.innerHTML = render(model)
      const original = host.innerHTML
      projection.update(events[0]!, 300, false)
      assert.equal(host.innerHTML, original, 'A replaced source requires a new binding')
    } finally { projection.dispose(); dom.window.close() }
  })
}
