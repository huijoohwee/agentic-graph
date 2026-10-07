import test from 'node:test'
import assert from 'node:assert/strict'
import * as d3 from 'd3'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGraphStore } from '../hooks/useGraphStore'
import { defaultSchema } from '../lib/graph/schema'
import { ensureSpacePanKeyListenerInstalled, resetSpacePanHeldForTests, isSpacePanHeld } from '../lib/canvas/space-pan'
import { getGlobalUserSelectLockCountForTests } from '../lib/canvas/interaction-user-select'
import { nodeDragBehavior, edgeDragBehavior } from '../components/GraphCanvas/drag'
import { bindGroupsDrag } from '../components/GraphCanvas/layers/groupsDrag'
import { bindSequenceCanvasInteractions } from '../features/sequence/sequenceCanvasInteractions'
import { sequenceTopologySvg } from '../features/sequence/sequenceTopologySvg'
import { parseSequence } from '../features/sequence/sequenceModel'

function fixture() {
  const env = initJsdomHarness('<!doctype html><html><body><main></main><svg><g><circle/><text>Group</text><path/></g></svg></body></html>')
  const before = useGraphStore.getState(), schema = structuredClone(defaultSchema)
  schema.layout = { ...schema.layout, mode: 'radial' }; schema.behavior.snapGrid = { enabled: false, size: 10 }
  useGraphStore.setState({ schema, canvasPointerMode2d: 'select' })
  resetSpacePanHeldForTests(); ensureSpacePanKeyListenerInstalled()
  const win = env.dom.window
  const mouse = (target: EventTarget, type: string, x: number, y: number, extra = {}) => target.dispatchEvent(new win.MouseEvent(type, {
    bubbles: true, cancelable: true, view: win as unknown as Window, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, ...extra,
  }))
  const space = (held: boolean) => win.dispatchEvent(new win.KeyboardEvent(held ? 'keydown' : 'keyup', { key: ' ', code: 'Space', bubbles: true }))
  return { env, win, schema, mouse, space, restore() { resetSpacePanHeldForTests(); useGraphStore.setState(before, true); env.restore() } }
}

function graphDrag(kind: 'node' | 'edge' | 'group', explicitGroup = true) {
  const f = fixture(), a = { id: 'A', type: 'Node', label: 'A', properties: {}, x: 20, y: 30 }, b = { id: 'B', type: 'Node', label: 'B', properties: {}, x: 70, y: 80 }
  const simulation = d3.forceSimulation([a, b]).stop(), svg = f.win.document.querySelector('svg')!
  let commits = 0, selections = 0
  const target = svg.querySelector(kind === 'node' ? 'circle' : kind === 'edge' ? 'path' : 'text')!
  const bounds = { x: 10, y: 10, width: 100, height: 100 }, group: any = { id: 'G', memberNodeIds: ['A', 'B'], bounds }
  if (kind === 'node') d3.select(target).datum(a).call(nodeDragBehavior(simulation as any, f.schema, { onNodeDragEnd: () => commits++ }) as any)
  if (kind === 'edge') d3.select(target).datum({ id: 'E', source: 'A', target: 'B' }).call(edgeDragBehavior(simulation as any, f.schema, new Map([['A', a], ['B', b]])) as any)
  if (kind === 'group') bindGroupsDrag({
    labelSelection: d3.select(target).datum(group) as any, visibleGroups: [group], parentGroupIdById: new Map(),
    nodeById: new Map([['A', a], ['B', b]]), graphNodeById: new Map(), schema: f.schema, simulation: simulation as any,
    setSelectionSource: () => {}, selectGroup: () => selections++, readExplicitBounds: () => explicitGroup ? bounds : null,
    computeBoundsAndLabel: g => ({ ...g.bounds, w: g.bounds.width, h: g.bounds.height }) as any,
    applyComputedToGroup: () => {}, commitGroupBounds: () => commits++,
  })
  return { ...f, target, a, b, group, bounds, get commits() { return commits }, get selections() { return selections },
    restore() { simulation.stop(); f.restore() } }
}

for (const kind of ['node', 'edge', 'group'] as const) {
  test(`${kind} rejects Pan and Space before D3 captures or selects`, () => {
    for (const reason of ['pan', 'space', 'disabled', 'none'] as const) {
      const f = graphDrag(kind)
      try {
        if (reason === 'pan') useGraphStore.setState({ canvasPointerMode2d: 'pan' })
        if (reason === 'space') f.space(true)
        if (reason === 'disabled') (f.schema.behavior as any)[kind === 'group' ? 'allowGroupDrag' : 'allowNodeDrag'] = false
        if (reason === 'none') f.schema.behavior.dragConstraint = 'none'
        let bubbled = 0; f.target.parentElement!.addEventListener('mousedown', () => bubbled++)
        f.mouse(f.target, 'mousedown', 20, 30); f.mouse(f.win, 'mousemove', 80, 90); f.mouse(f.win, 'mouseup', 80, 90)
        assert.equal(bubbled, 1, `${reason}: viewport receives the rejected gesture`)
        assert.deepEqual([f.a.x, f.a.y, f.b.x, f.b.y], [20, 30, 70, 80])
        assert.equal(f.commits, 0); assert.equal(f.selections, 0)
        assert.equal(getGlobalUserSelectLockCountForTests(), 0)
      } finally { f.restore() }
    }
  })

  test(`${kind} cancels a live drag after admission changes without a late commit`, () => {
    const f = graphDrag(kind)
    try {
      f.mouse(f.target, 'mousedown', 20, 30); f.mouse(f.win, 'mousemove', 50, 60)
      assert.notDeepEqual(kind === 'group' ? [f.group.bounds.x, f.group.bounds.y] : [f.a.x, f.a.y], kind === 'group' ? [10, 10] : [20, 30])
      useGraphStore.setState({ canvasPointerMode2d: 'pan' })
      f.mouse(f.win, 'mousemove', 90, 100); useGraphStore.setState({ canvasPointerMode2d: 'select' }); f.mouse(f.win, 'mouseup', 90, 100)
      assert.deepEqual([f.a.x, f.a.y, f.b.x, f.b.y], [20, 30, 70, 80])
      assert.deepEqual(f.group.bounds, f.bounds)
      assert.equal(f.commits, 0); assert.equal(getGlobalUserSelectLockCountForTests(), 0)
    } finally { f.restore() }
  })

  test(`${kind} applies a shared axis constraint and still completes an allowed drag`, () => {
    const f = graphDrag(kind)
    try {
      f.schema.behavior.dragConstraint = 'axis-x'
      f.mouse(f.target, 'mousedown', 20, 30); f.mouse(f.win, 'mousemove', 50, 60); f.mouse(f.win, 'mouseup', 50, 60)
      if (kind === 'group') { assert.equal(f.group.bounds.x, 40); assert.equal(f.group.bounds.y, 10) }
      else { assert.equal(f.a.x, 50); assert.equal(f.a.y, 30) }
      if (kind !== 'edge') assert.equal(f.commits, 1)
      assert.equal(getGlobalUserSelectLockCountForTests(), 0)
    } finally { f.restore() }
  })

  test(`${kind} rechecks live policy at mouseup even without another move`, () => {
    for (const reason of ['space', 'disabled', 'none', 'replaced-schema'] as const) {
      const f = graphDrag(kind)
      try {
        f.mouse(f.target, 'mousedown', 20, 30); f.mouse(f.win, 'mousemove', 50, 60)
        if (reason === 'space') f.space(true)
        if (reason === 'disabled') (f.schema.behavior as any)[kind === 'group' ? 'allowGroupDrag' : 'allowNodeDrag'] = false
        if (reason === 'none') f.schema.behavior.dragConstraint = 'none'
        if (reason === 'replaced-schema') useGraphStore.setState({ schema: { ...f.schema, behavior: { ...f.schema.behavior, dragConstraint: 'none' } } })
        f.mouse(f.win, 'mouseup', 50, 60)
        assert.deepEqual([f.a.x, f.a.y, f.b.x, f.b.y], [20, 30, 70, 80], reason)
        assert.deepEqual(f.group.bounds, f.bounds); assert.equal(f.commits, 0)
        assert.equal(getGlobalUserSelectLockCountForTests(), 0)
      } finally { f.restore() }
    }
  })
}

test('D3 group cancellation restores every member preview and prior fixed coordinates', () => {
  const f = graphDrag('group', false)
  try {
    Object.assign(f.a, { fx: 12, fy: 13, vx: 2, vy: 3 })
    f.mouse(f.target, 'mousedown', 20, 30); f.mouse(f.win, 'mousemove', 50, 60)
    assert.deepEqual([f.a.x, f.a.y, f.b.x, f.b.y], [50, 60, 100, 110])
    f.space(true); f.mouse(f.win, 'mouseup', 50, 60)
    assert.deepEqual(f.a, { id: 'A', type: 'Node', label: 'A', properties: {}, x: 20, y: 30, fx: 12, fy: 13, vx: 2, vy: 3, index: 0 })
    assert.deepEqual([f.b.x, f.b.y], [70, 80]); assert.equal(f.commits, 0)
  } finally { f.restore() }
})

function sequenceDrag(onInteractionChange?: (value: boolean, schema: typeof defaultSchema) => void) {
  const f = fixture(), host = f.win.document.querySelector('main')!, model = parseSequence('sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Read')
  host.innerHTML = sequenceTopologySvg(model, { schema: f.schema })
  const commits: unknown[] = [], changes: boolean[] = []
  const adapter = bindSequenceCanvasInteractions({ host, model, mermaid: false, layout: 'connections', schema: () => f.schema,
    canArrange: () => useGraphStore.getState().canvasPointerMode2d !== 'pan' && !isSpacePanHeld(), onCommit: (...value) => commits.push(value),
    onInteractionChange: value => { changes.push(value); onInteractionChange?.(value, f.schema) } })
  const person = host.querySelector('[data-sequence-participant="A"]')!
  const pointer = (target: EventTarget, type: string, x: number, y: number, extra = {}) => {
    const event = new f.win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.assign(event, { pointerId: 1, pointerType: 'touch', isPrimary: true, ...extra }); target.dispatchEvent(event)
  }
  return { ...f, host, person, pointer, commits, changes, restore() { adapter.dispose(); f.restore() } }
}

test('sequence keyboard respects shared admission and axis constraints', () => {
  const f = sequenceDrag()
  try {
    const key = (key: string) => f.person.dispatchEvent(new f.win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    useGraphStore.setState({ canvasPointerMode2d: 'pan' }); key('ArrowRight'); assert.equal(f.commits.length, 0)
    useGraphStore.setState({ canvasPointerMode2d: 'select' }); f.space(true); key('ArrowRight'); assert.equal(f.commits.length, 0)
    f.space(false); f.schema.behavior.allowNodeDrag = false
    key('ArrowRight'); assert.equal(f.commits.length, 0)
    f.schema.behavior.allowNodeDrag = true; f.schema.behavior.dragConstraint = 'axis-y'
    key('ArrowRight'); assert.equal(f.commits.length, 0)
    key('ArrowDown'); assert.equal(f.commits.length, 1)
  } finally { f.restore() }
})

for (const pointerType of ['mouse', 'pen', 'touch']) test(`sequence ${pointerType} uses shared slop and rejects revoked terminal input`, async () => {
  const f = sequenceDrag(), initial = f.person.getAttribute('transform')
  try {
    f.pointer(f.person, 'pointerdown', 20, 30, { pointerType })
    if (pointerType !== 'mouse') {
      f.pointer(f.win, 'pointermove', 21, 31, { pointerType })
      await new Promise(resolve => f.win.requestAnimationFrame(resolve))
      assert.equal(f.person.getAttribute('transform'), initial)
    }
    f.pointer(f.win, 'pointermove', 70, 90, { pointerType })
    await new Promise(resolve => f.win.requestAnimationFrame(resolve))
    assert.notEqual(f.person.getAttribute('transform'), initial)
    f.space(true); f.pointer(f.win, 'pointerup', 70, 90, { pointerType })
    assert.equal(f.person.getAttribute('transform'), initial); assert.deepEqual(f.commits, [])
    assert.deepEqual(f.changes, [true, false])
  } finally { f.restore() }
})

test('sequence revokes a captured touch before pointerup and never resumes it', async () => {
  const f = sequenceDrag(), initial = f.person.getAttribute('transform')
  try {
    f.pointer(f.person, 'pointerdown', 20, 30); f.pointer(f.win, 'pointermove', 70, 90)
    await new Promise(resolve => f.win.requestAnimationFrame(resolve))
    assert.notEqual(f.person.getAttribute('transform'), initial)
    f.schema.behavior.allowNodeDrag = false
    f.pointer(f.win, 'pointermove', 100, 120)
    await new Promise(resolve => f.win.requestAnimationFrame(resolve))
    f.schema.behavior.allowNodeDrag = true; f.pointer(f.win, 'pointerup', 100, 120)
    assert.equal(f.person.getAttribute('transform'), initial); assert.deepEqual(f.commits, [])
    assert.deepEqual(f.changes, [true, false])
  } finally { f.restore() }
})

test('sequence rechecks admission after external interaction callbacks before keyboard or pointer commit', async () => {
  for (const input of ['keyboard-start', 'keyboard-end', 'pointer-end'] as const) {
    const f = sequenceDrag((value, schema) => { if (value === (input === 'keyboard-start')) schema.behavior.allowNodeDrag = false })
    const initial = f.person.getAttribute('transform')
    try {
      if (input.startsWith('keyboard')) f.person.dispatchEvent(new f.win.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      else {
        f.pointer(f.person, 'pointerdown', 20, 30); f.pointer(f.win, 'pointermove', 70, 90)
        await new Promise(resolve => f.win.requestAnimationFrame(resolve))
        assert.notEqual(f.person.getAttribute('transform'), initial)
        f.pointer(f.win, 'pointerup', 70, 90)
      }
      assert.deepEqual(f.commits, [], input); assert.equal(f.person.getAttribute('transform'), initial)
    } finally { f.restore() }
  }
})
