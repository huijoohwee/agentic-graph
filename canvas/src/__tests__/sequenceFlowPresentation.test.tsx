import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { parseSequence } from '../features/sequence/sequenceModel'
import { sequenceNativeSvg } from '../features/sequence/sequenceNativeSvg'
import { sequenceTopologySvg } from '../features/sequence/sequenceTopologySvg'
import { bindSequenceSvg } from '../features/sequence/sequenceSvgBinding'

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
