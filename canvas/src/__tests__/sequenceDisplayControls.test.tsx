import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { applyCanvasViewSelection } from '../components/toolbar/canvasViewActions'
import { buildCanvasViewOptions, getCanvasViewRendererOptions } from '../components/toolbar/canvasViewMenu'
import type { CanvasViewModelState, CanvasViewOptionId } from '../components/toolbar/canvasViewTypes'
import { resolveCanvasDisplayControlDisabledReason } from '../lib/canvas/canvasDisplayControlCapabilities'
import { CANVAS_2D_RENDERER_ORDER, type Canvas2dRendererId } from '../lib/config.render'
import { defaultSchema } from '../lib/graph/schema'
import { parseSequence } from '../features/sequence/sequenceModel'
import { sequenceNativeSvg } from '../features/sequence/sequenceNativeSvg'
import { sequenceTopologySvg } from '../features/sequence/sequenceTopologySvg'

const controlIds = [
  'control:richMedia', 'control:nodeShape', 'control:clusterShape', 'control:portHandles',
  'control:minimap', 'control:grid', 'control:snapGrid', 'control:helperLines', 'control:aspectRatio',
  'control:boardLayout', 'control:card', 'control:widget', 'control:timeline', 'control:flowchart',
  'control:gitGraph', 'control:gantt', 'control:architecture', 'control:eventModeling',
] as const satisfies readonly CanvasViewOptionId[]
const unsupported = ['control:richMedia', 'control:clusterShape', 'control:boardLayout', 'control:card', 'control:widget'] as const
const notationOnly = ['control:nodeShape', 'control:portHandles'] as const
const stateFor = (canvas2dRenderer: Canvas2dRendererId): CanvasViewModelState => ({
  canvas2dRenderer, canvas3dMode: '3d', canvasRenderMode: '2d', documentSemanticMode: 'document',
  frontmatterModeEnabled: true, multiDimTableModeEnabled: false, renderMediaAsNodes: true,
  timelineEnabled: false, bottomSurfaceCollapsed: true, bottomSurfaceTab: 'stats', minimapCollapsed: true,
  geospatialEnabled: false, layoutMode: 'block', schema: structuredClone(defaultSchema),
  frontmatterOnlyAllowed: true, isD3Like2dLayoutToggle: false, aspectRatioMode: '16:9',
  boardLayoutMode: 'fixed', storyboardDisplayMode: 'card',
})
const rowsFor = (state: CanvasViewModelState) => {
  const menus = buildCanvasViewOptions(state, getCanvasViewRendererOptions()).filter(option => option.id === 'control:menu')
  assert.equal(menus.length, 1, 'the shared toolbar owns one Display Controls menu')
  return menus[0]!.children!
}
function actionsFor(state: CanvasViewModelState) {
  const calls: { name: string; value: unknown }[] = []
  let unlocks = 0
  const record = (name: string) => (value?: unknown) => { calls.push({ name, value }) }
  const params: Omit<Parameters<typeof applyCanvasViewSelection>[0], 'id'> = {
    ...state, ensureBaselineUnlocked: () => { unlocks++; return true },
    onOpenGeospatialMode: record('geospatial'), onExitGeospatialMode: record('exitGeospatial'),
    onOpenShared3dPanel: record('shared3d'), setCanvas2dRenderer: record('renderer'),
    setCanvasRenderMode: record('surface'), setCanvas3dMode: record('3d'), setSchema: record('schema'),
    setBehavior: record('behavior'), setRenderMediaAsNodes: record('richMedia'), setTimelineEnabled: record('timeline'),
    setBottomSurfaceCollapsed: record('collapsed'), setBottomSurfaceTab: record('tab'),
    setMinimapCollapsed: record('minimap'), setAspectRatioMode: record('aspect'), setBoardLayoutMode: record('board'),
    setStoryboardDisplayMode: record('presentation'), setDocumentSemanticMode: record('document'),
    setFrontmatterModeEnabled: record('frontmatter'), setMultiDimTableModeEnabled: record('table'),
    requestStoryboardWidgetLayoutRebalance: record('rebalance'),
  }
  return { calls, get unlocks() { return unlocks }, apply: (id: CanvasViewOptionId) => applyCanvasViewSelection({ ...params, id }) }
}

for (const renderer of ['sequence', 'sequenceMermaid'] as const) {
  test(`${renderer} retains exactly the canonical Display Controls rows and explains unavailable controls`, () => {
    const state = stateFor(renderer), rows = rowsFor(state)
    assert.deepEqual(rows.map(row => row.id), controlIds)
    assert.equal(new Set(rows.map(row => row.id)).size, controlIds.length)
    const denied: readonly string[] = [...unsupported, ...(renderer === 'sequenceMermaid' ? notationOnly : [])]
    for (const row of rows) {
      assert.equal(row.children?.length || 0, 0, `${row.id}: no alternate menu implementation`)
      if (denied.includes(row.id)) {
        assert.equal(row.disabled, true, row.id)
        assert.ok(row.disabledReason?.trim(), `${row.id}: explain why the renderer cannot apply it`)
        assert.equal(row.disabledReason, resolveCanvasDisplayControlDisabledReason(row.id, state))
      } else if (row.id === 'control:minimap') {
        assert.equal(row.disabled, true)
        assert.equal(row.disabledReason, 'Current renderer does not support Minimap')
        assert.equal(resolveCanvasDisplayControlDisabledReason(row.id, state), undefined, 'Minimap retains its existing owner')
      } else assert.notEqual(row.disabled, true, row.id)
    }
  })

  test(`${renderer} unsupported actions cannot unlock the baseline or mutate any store`, () => {
    const state = stateFor(renderer), before = structuredClone(state)
    const actions = actionsFor(state)
    for (const id of [...unsupported, ...(renderer === 'sequenceMermaid' ? notationOnly : [])]) actions.apply(id)
    assert.equal(actions.unlocks, 0)
    assert.deepEqual(actions.calls, [])
    assert.deepEqual(state, before)
    actions.apply('control:minimap')
    assert.deepEqual(actions.calls, [], 'existing Minimap guard still rejects unsupported renderer mutation')
  })

  test(`${renderer} Grid, Snap, Guides and Aspect use their shared state writers`, () => {
    const state = stateFor(renderer), before = structuredClone(state)
    for (const [id, behaviorKey, enabled] of [
      ['control:grid', 'canvasGrid', true], ['control:snapGrid', 'snapGrid', true], ['control:helperLines', 'helperLines', false],
    ] as const) {
      const actions = actionsFor(state); actions.apply(id)
      assert.equal(actions.unlocks, 1)
      assert.deepEqual(actions.calls.map(call => call.name), ['behavior'])
      const behavior = actions.calls[0]!.value as Record<string, { enabled: boolean }>
      assert.deepEqual(Object.keys(behavior), [behaviorKey], `${id}: unrelated schema settings stay untouched`)
      assert.equal(behavior[behaviorKey]!.enabled, enabled)
      const nextState = { ...state, schema: { ...state.schema, behavior: { ...state.schema.behavior, ...behavior } } }
      assert.equal(rowsFor(nextState).find(row => row.id === id)!.isActive, enabled)
    }
    const actions = actionsFor(state); actions.apply('control:aspectRatio')
    assert.deepEqual(actions.calls, [{ name: 'aspect', value: '9:16' }])
    assert.equal(rowsFor({ ...state, aspectRatioMode: '9:16' }).find(row => row.id === 'control:aspectRatio')!.valueLabel, '9:16')
    assert.deepEqual(state, before)
  })

  test(`${renderer} six shared bottom-panel actions select, show and close the existing panel`, () => {
    const state = stateFor(renderer)
    for (const tab of ['timeline', 'flowchart', 'gitGraph', 'gantt', 'architecture', 'eventModeling'] as const) {
      const id = `control:${tab}` as const, actions = actionsFor(state)
      actions.apply(id)
      assert.deepEqual(actions.calls, [{ name: 'tab', value: tab }, { name: 'collapsed', value: false }])
      const open = { ...state, bottomSurfaceCollapsed: false, bottomSurfaceTab: tab }
      assert.equal(rowsFor(open).find(row => row.id === id)!.isActive, true)
      const close = actionsFor(open); close.apply(id)
      assert.deepEqual(close.calls, [{ name: 'collapsed', value: true }])
    }
  })
}

test('sequence capability restrictions do not replace other renderer, 3D or geospatial policy', () => {
  for (const renderer of CANVAS_2D_RENDERER_ORDER.filter(id => id !== 'sequence' && id !== 'sequenceMermaid')) {
    const state = stateFor(renderer)
    assert.deepEqual(rowsFor(state).map(row => row.id), controlIds)
    for (const id of controlIds) assert.equal(resolveCanvasDisplayControlDisabledReason(id, state), undefined, `${renderer}/${id}`)
    const actions = actionsFor(state)
    actions.apply('control:richMedia'); actions.apply('control:widget')
    assert.deepEqual(actions.calls, [{ name: 'richMedia', value: false }, { name: 'presentation', value: 'widget' }])
  }
  for (const state of [
    { ...stateFor('sequenceMermaid'), canvasRenderMode: '3d' as const },
    { ...stateFor('sequenceMermaid'), geospatialEnabled: true },
  ]) for (const id of controlIds) assert.equal(resolveCanvasDisplayControlDisabledReason(id, state), undefined)
  const geo = rowsFor({ ...stateFor('sequenceMermaid'), geospatialEnabled: true })
  for (const id of ['control:minimap', 'control:card', 'control:widget']) {
    assert.equal(geo.find(row => row.id === id)!.disabledReason, 'Disabled in Geospatial Mode')
  }
})

test('native sequence Node Shape and Port Handles mutate the shared schema only', () => {
  const state = stateFor('sequence'), before = structuredClone(state.schema)
  for (const id of notationOnly) {
    const actions = actionsFor(state); actions.apply(id)
    assert.equal(actions.unlocks, 1)
    assert.deepEqual(actions.calls.map(call => call.name), ['schema'])
    const next = actions.calls[0]!.value as typeof state.schema
    assert.equal(id === 'control:nodeShape' ? next.behavior.nodeShapeMode : next.behavior.portHandles?.enabled,
      id === 'control:nodeShape' ? 'rect' : true)
    assert.equal(next.layout, state.schema.layout)
    assert.equal(next.nodeStyles, state.schema.nodeStyles)
  }
  assert.deepEqual(state.schema, before)
})

const authoredSource = 'sequenceDiagram\nactor Reader\nparticipant Cache\nparticipant Worker\nReader->>Cache: Lookup\nCache-->>Reader: Miss\nReader-)Worker: Schedule\nWorker->>Worker: Retry\nNote over Cache,Worker: Pending'
const shapeModel = parseSequence(authoredSource)
const eventIds = shapeModel.events.map(event => event.id)
const numbers = (value: string) => (value.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number)
const attribute = (element: Element, name: string) => Number(element.getAttribute(name))
const closeTo = (actual: number, expected: number) => Math.abs(actual - expected) < 0.000001

for (const [layout, render] of [['connections', sequenceTopologySvg], ['lifelines', sequenceNativeSvg]] as const) {
  test(`${layout} shared shape actions change visible participant geometry without changing authored data`, () => {
    let state = stateFor('sequence')
    const before = JSON.stringify(shapeModel), fingerprints = new Set<string>()
    for (const shape of ['rect', 'diamond', 'hex', 'circle']) {
      const actions = actionsFor(state); actions.apply('control:nodeShape')
      state = { ...state, schema: actions.calls[0]!.value as typeof state.schema }
      const dom = new JSDOM(render(shapeModel, { schema: state.schema }))
      try {
        const svg = dom.window.document.querySelector('svg')!
        const people = [...svg.querySelectorAll('[data-sequence-participant]')]
        assert.deepEqual(people.map(person => person.getAttribute('data-sequence-participant')), shapeModel.participants.map(person => person.id))
        assert.deepEqual([...svg.querySelectorAll('[data-sequence-event]')].map(event => event.getAttribute('data-sequence-event')), eventIds)
        const shapes = people.flatMap(person => [...person.querySelectorAll('[data-kg-node-shape]')])
        assert.equal(shapes.length, shapeModel.participants.length * (layout === 'lifelines' ? 2 : 1))
        for (const outline of shapes) {
          assert.equal(outline.getAttribute('data-kg-node-shape'), shape)
          assert.equal(outline.tagName, shape === 'circle' ? 'circle' : shape === 'rect' ? 'rect' : 'path')
          assert.ok(outline.classList.contains('sequence-participant'))
          if (shape === 'circle') assert.ok(attribute(outline, 'r') > 0)
          else if (shape === 'rect') assert.ok(attribute(outline, 'width') > 0 && attribute(outline, 'height') > 0)
          else assert.ok(numbers(outline.getAttribute('d') || '').length >= 8, 'polygon has visible geometry')
        }
        fingerprints.add(shapes[0]!.outerHTML)
        assert.equal(svg.querySelectorAll('[data-kg-port-handle]').length, 0)
        assert.equal(JSON.stringify(shapeModel), before)
        assert.deepEqual(parseSequence(authoredSource), shapeModel)
      } finally { dom.window.close() }
    }
    assert.equal(fingerprints.size, 4, 'the control changes geometry rather than only a shape attribute')
  })

  test(`${layout} shared Port Handles toggle adds passive visible handles and removes them`, () => {
    const state = stateFor('sequence'), before = JSON.stringify(shapeModel)
    const enable = actionsFor(state); enable.apply('control:portHandles')
    const enabled = { ...state, schema: enable.calls[0]!.value as typeof state.schema }
    const dom = new JSDOM(render(shapeModel, { schema: enabled.schema }))
    try {
      const people = [...dom.window.document.querySelectorAll('[data-sequence-participant]')]
      for (const person of people) {
        const handles = [...person.querySelectorAll('[data-kg-port-handle]')]
        assert.equal(handles.length, layout === 'lifelines' ? 8 : 4)
        assert.deepEqual([...new Set(handles.map(handle => handle.getAttribute('data-kg-port-handle')))].sort(), ['bottom', 'left', 'right', 'top'])
        for (const handle of handles) {
          assert.ok(attribute(handle, 'r') > 0)
          assert.equal(handle.getAttribute('aria-hidden'), 'true')
          assert.equal(handle.getAttribute('pointer-events'), 'none')
          assert.equal(handle.hasAttribute('tabindex'), false, 'presentation handles cannot become an authored edit affordance')
        }
      }
      assert.deepEqual([...dom.window.document.querySelectorAll('[data-sequence-event]')].map(event => event.getAttribute('data-sequence-event')), eventIds)
    } finally { dom.window.close() }
    const disable = actionsFor(enabled); disable.apply('control:portHandles')
    const off = new JSDOM(render(shapeModel, { schema: disable.calls[0]!.value as typeof state.schema }))
    try { assert.equal(off.window.document.querySelectorAll('[data-kg-port-handle]').length, 0) }
    finally { off.window.close() }
    assert.equal(JSON.stringify(shapeModel), before)
  })
}

test('connection endpoints reach each visible shape boundary and enabled port center', () => {
  const before = JSON.stringify(shapeModel)
  for (const shape of ['circle', 'rect', 'diamond', 'hex'] as const) for (const enabled of [false, true]) {
    const schema = structuredClone(defaultSchema)
    schema.behavior.nodeShapeMode = shape
    schema.behavior.portHandles = { enabled, offset: 7, size: 5 }
    const dom = new JSDOM(sequenceTopologySvg(shapeModel, { schema }))
    try {
      for (const event of shapeModel.events.filter(event => event.kind !== 'note')) {
        const path = dom.window.document.querySelector(`[data-sequence-event="${event.id}"] .sequence-message`)!
        const coordinates = numbers(path.getAttribute('d')!)
        assert.ok(coordinates.every(Number.isFinite))
        assert.ok(path.hasAttribute('marker-end'))
        for (const [id, [x, y]] of [[event.from, coordinates.slice(0, 2)], [event.to, coordinates.slice(-2)]] as const) {
          const person = dom.window.document.querySelector(`[data-sequence-participant="${id}"]`)!
          const dx = x! - attribute(person, 'data-sequence-x'), dy = y! - attribute(person, 'data-sequence-y')
          if (enabled) {
            const handles = [...person.querySelectorAll('[data-kg-port-handle]')]
            assert.ok(handles.some(handle => closeTo(x!, attribute(handle, 'cx')) && closeTo(y!, attribute(handle, 'cy'))), `${shape}/${event.id}: route reaches a visible port center`)
          } else {
            const halfW = attribute(person, 'data-sequence-width') / 2, halfH = attribute(person, 'data-sequence-height') / 2
            assert.ok((closeTo(Math.abs(dx), halfW) && closeTo(dy, 0)) || (closeTo(Math.abs(dy), halfH) && closeTo(dx, 0)), `${shape}/${event.id}: route reaches the actual cardinal shape boundary`)
          }
        }
      }
    } finally { dom.window.close() }
  }
  assert.equal(JSON.stringify(shapeModel), before)
})

for (const [layout, render] of [['connections', sequenceTopologySvg], ['lifelines', sequenceNativeSvg]] as const) {
  test(`${layout} ports at shared metric limits fit inside the viewBox including their stroke`, () => {
    for (const shape of ['circle', 'rect', 'diamond', 'hex'] as const) for (const aspectMode of ['16:9', '9:16'] as const) {
      const schema = structuredClone(defaultSchema)
      schema.behavior.nodeShapeMode = shape
      schema.behavior.portHandles = { enabled: true, size: 100, offset: 100, strokeWidth: 100 }
      const dom = new JSDOM(render(shapeModel, { schema, aspectMode, positions: {
        Reader: { x: -250, y: -150 }, Cache: { x: 440, y: -150 }, Worker: { x: 980, y: 560 },
      } }))
      try {
        const svg = dom.window.document.querySelector('svg')!
        const [left, top, width, height] = numbers(svg.getAttribute('viewBox')!)
        const handles = [...svg.querySelectorAll('[data-kg-port-handle]')]
        assert.equal(handles.length, shapeModel.participants.length * (layout === 'lifelines' ? 8 : 4))
        for (const handle of handles) {
          const radius = attribute(handle, 'r'), stroke = attribute(handle, 'stroke-width')
          assert.equal(radius, 12, 'exercise the shared maximum handle radius')
          assert.equal(stroke, 4, 'exercise the shared maximum stroke width')
          const x = attribute(handle, 'cx'), y = attribute(handle, 'cy'), extent = radius + stroke / 2
          const person = handle.closest('[data-sequence-participant]')!, side = handle.getAttribute('data-kg-port-handle')
          if (side === 'left' || side === 'right') assert.ok(closeTo(Math.abs(x - attribute(person, 'data-sequence-x')) - attribute(person, 'data-sequence-width') / 2, 14), 'exercise the shared maximum handle offset')
          const context = `${shape}/${aspectMode}/${person.getAttribute('data-sequence-participant')}/${side}`
          assert.ok(x - extent >= left! - 0.000001, `${context}: left stroke is visible`)
          assert.ok(y - extent >= top! - 0.000001, `${context}: top stroke is visible`)
          assert.ok(x + extent <= left! + width! + 0.000001, `${context}: right stroke is visible`)
          assert.ok(y + extent <= top! + height! + 0.000001, `${context}: bottom stroke is visible`)
        }
      } finally { dom.window.close() }
    }
  })
}
