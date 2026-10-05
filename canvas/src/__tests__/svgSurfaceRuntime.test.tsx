import test from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'
import { useGraphStore } from '../hooks/useGraphStore'
import { defaultSchema } from '../lib/graph/schema'
import type { GraphData } from '../lib/graph/types'
import { useSvgSurfaceZoomRuntime } from '../components/GraphCanvas/hooks/useSvgSurfaceZoomRuntime'
import { buildSvgSurfaceGraphData, prepareSvgForInteractiveViewport, svgSurfaceGraphLayoutSignature } from '../components/GraphCanvas/hooks/svgSurfaceGeometry'

const source: GraphData = { type: 'Graph', nodes: [
  { id: 'canonical:left', label: 'Repeated', type: 'Entity', properties: {} },
  { id: 'canonical:right', label: 'Repeated', type: 'Entity', properties: {} },
], edges: [{ id: 'canonical:message', source: 'canonical:left', target: 'canonical:right', label: 'Send', properties: {} }] }
const markup = '<svg viewBox="0 0 1200 240"><defs><marker id="tip"/></defs><title>Authored chart</title><rect id="left" aria-label="Left" x="20" y="20" width="80" height="60"/><rect id="right" aria-label="Right" x="200" y="20" width="80" height="60"/></svg>'
const rect = (width: number, height: number) => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} }) as DOMRect
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
const project = (svg: SVGSVGElement, graph: GraphData | null): GraphData | null => graph && ({ ...graph,
  nodes: graph.nodes.map((node, index) => ({ ...node, x: 60 + index * 180 + Number(svg.dataset.offset || 0), y: 50,
    properties: { ...node.properties, 'visual:width': 80, 'visual:height': 60 } })),
})

async function runtimeCase(run: (context: {
  host: HTMLElement
  render: (props?: { owns?: boolean; svg?: string; read?: typeof project; offset?: number }) => Promise<void>
  labels: string[]
}) => Promise<void>) {
  const env = initJsdomHarness()
  const previous = useGraphStore.getState()
  const globals = ['SVGElement', 'SVGSVGElement', 'SVGGElement', 'MouseEvent', 'navigator'] as const
  const descriptors = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, writable: true,
    value: key === 'SVGGElement' ? env.dom.window.SVGElement : env.dom.window[key] })
  env.dom.window.HTMLElement.prototype.getBoundingClientRect = () => rect(800, 600)
  env.dom.window.SVGElement.prototype.getBoundingClientRect = function () {
    return this.hasAttribute('data-kg-svg-zoom-content') ? rect(1200, 240) : rect(800, 600)
  }
  Object.defineProperties(env.dom.window.SVGSVGElement.prototype, {
    width: { configurable: true, get: () => ({ baseVal: { value: 800 } }) },
    height: { configurable: true, get: () => ({ baseVal: { value: 600 } }) },
  })
  useGraphStore.setState({ canvasRenderMode: '2d', canvas2dRenderer: 'sequence', schema: defaultSchema,
    fitToScreenMode: false, zoomToSelectionMode: false, viewPinned: false, zoomState: null, zoomStateByKey: {},
    zoomRequest: null, zoomDurationFitMs: 0, zoomDurationSelectionMs: 0, graphData: source, graphDataRevision: 1,
    selectedNodeId: null, selectedEdgeId: null, selectedGroupId: null, selectedNodeIds: [], selectedEdgeIds: [], selectedGroupIds: [],
  })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host), labels: string[] = []
  const onLabel = (label: string) => labels.push(label)
  function Surface({ owns = false, svg = markup, read, offset = 0 }: { owns?: boolean; svg?: string; read?: typeof project; offset?: number }) {
    const rootRef = React.useRef<HTMLDivElement>(null), svgHostRef = React.useRef<HTMLDivElement>(null)
    useSvgSurfaceZoomRuntime({ active: true, rootRef, svgHostRef, svgMarkup: svg, rendererId: 'sequence',
      graphData: source, graphDataRevision: 1, readRenderGraph: read, rendererOwnsSelection: owns, onSelectedElementLabelChange: onLabel })
    React.useLayoutEffect(() => { const element = svgHostRef.current?.querySelector('svg'); if (element) element.dataset.offset = String(offset) }, [offset, svg])
    return <div ref={rootRef}><div ref={svgHostRef} dangerouslySetInnerHTML={{ __html: svg }}/></div>
  }
  const render = async (props = {}) => { await act(async () => root.render(<Surface {...props}/>)); await flush() }
  try { await run({ host, render, labels }) }
  finally {
    await act(async () => root.unmount())
    useGraphStore.setState(previous, true)
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
    env.restore()
  }
}

test('shared SVG viewport keeps metadata and intrinsic bounds through repeated preparation', async () => {
  await runtimeCase(async ({ host, render }) => {
    await render()
    const svg = host.querySelector('svg')!
    const prepared = prepareSvgForInteractiveViewport({ svgEl: svg, fitMode: 'wideTimeline' })
    assert.deepEqual(prepared.bounds, { minX: 0, minY: 0, width: 1200, height: 240 })
    assert.equal(svg.querySelectorAll('g[data-kg-svg-zoom-content]').length, 1)
    assert.equal(svg.querySelectorAll('[data-kg-svg-viewport-hitbox]').length, 1)
    assert.equal(svg.querySelector('marker#tip')?.parentElement?.parentElement, svg)
    assert.equal(svg.querySelector('title')?.parentElement, svg)
    assert.equal(svg.querySelector('title')?.textContent, 'Authored chart')
    assert.equal(prepared.group.querySelectorAll('rect').length, 2)
  })
})

test('generic SVG selection remains default and renderer ownership removes competing listeners and dimming', async () => {
  await runtimeCase(async ({ host, render, labels }) => {
    await render()
    const svg = host.querySelector('svg')!
    await act(async () => svg.querySelector('#left')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left'])
    assert.equal(svg.querySelector('#left')?.getAttribute('data-kg-svg-selected'), '1')
    assert.equal(svg.querySelector('#right')?.getAttribute('data-kg-svg-dimmed'), '1')
    await render({ owns: true })
    assert.equal(svg.querySelectorAll('[data-kg-svg-selected], [data-kg-svg-dimmed]').length, 0)
    await act(async () => svg.querySelector('#right')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left'], 'renderer-owned selection never invokes the generic label callback')
    assert.equal(svg.hasAttribute('data-kg-svg-has-selection'), false)
    await render()
    await act(async () => svg.querySelector('#right')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left', 'Right'], 'default ownership can resume without duplicate listeners')
    await render({ svg: markup.replace('Authored chart', 'Replacement chart') })
    await act(async () => svg.querySelector('#left')!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    assert.deepEqual(labels, ['Left', 'Right'], 'detached SVG no longer publishes selection')
  })
})

test('render projection preserves canonical identities and whole-SVG bounds without mutating source', () => {
  const before = JSON.stringify(source)
  const graph = { ...source, nodes: source.nodes.map((node, index) => ({ ...node, x: 60 + index * 180, y: 50,
    properties: { 'visual:width': 80, 'visual:height': 60 } })) }
  const visual = buildSvgSurfaceGraphData({ bounds: { minX: 0, minY: 0, width: 1200, height: 240 }, graphData: source, rendererId: 'sequence', renderGraphData: graph })!
  assert.deepEqual(visual.nodes.slice(0, -1).map(node => node.id), source.nodes.map(node => node.id))
  assert.equal(visual.edges, source.edges)
  assert.equal(visual.nodes.at(-1)?.properties['visual:width'], 1200)
  assert.equal(visual.nodes.at(-1)?.properties['visual:height'], 240)
  assert.equal(JSON.stringify(source), before)
  assert.notEqual(svgSurfaceGraphLayoutSignature(visual), svgSurfaceGraphLayoutSignature({ ...visual,
    nodes: visual.nodes.map(node => node.id === 'canonical:left' ? { ...node, x: 400 } : node) }))
  assert.throws(() => buildSvgSurfaceGraphData({ bounds: { minX: 0, minY: 0, width: 1, height: 1 }, graphData: source,
    rendererId: 'sequence', renderGraphData: { ...source, nodes: [{ ...source.nodes[0]!, id: 'svg-surface:sequence:bounds' }] } }), /reserved SVG bounds ID/)
})

test('shared zoom selects canonical rendered participants after layout and still fits the entire SVG', async () => {
  await runtimeCase(async ({ host, render }) => {
    let observedOffset = -1
    const read: typeof project = (svg, graph) => { observedOffset = Number(svg.dataset.offset); return project(svg, graph) }
    await render({ owns: true, read, offset: 300 })
    assert.equal(observedOffset, 300, 'projection reads the renderer layout effect, not the pre-layout SVG')
    const svg = host.querySelector('svg')!
    const transform = () => ['x', 'y', 'k'].map(axis => Number(svg.getAttribute(`data-kg-svg-zoom-${axis}`)))
    await act(async () => useGraphStore.setState({ zoomRequest: { type: 'fit', intent: 'fitToScreen' } }))
    await flush()
    const whole = transform()
    assert.ok(whole.every(Number.isFinite) && whole[2]! > 0)
    await act(async () => useGraphStore.setState({ selectedNodeId: 'canonical:left', zoomRequest: { type: 'selection' } }))
    await flush()
    const selected = transform()
    assert.ok(selected[2]! > whole[2]!, 'selection uses positioned canonical nodes and excludes the whole-SVG envelope')
    assert.equal(useGraphStore.getState().zoomRequest, null)
    assert.deepEqual(useGraphStore.getState().graphData, source, 'viewport projection is never authored state')
    await act(async () => useGraphStore.setState({ zoomRequest: { type: 'fit', intent: 'fitToScreen' } }))
    await flush()
    assert.deepEqual(transform(), whole, 'manual whole fit still includes labels and frame outside participant bounds')
  })
})
