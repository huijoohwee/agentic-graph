import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { initJsdomHarness } from '../tests/lib/jsdomHarness'

const hostUrl = new URL('../../../gympgrph/src/GeospatialHost.tsx', import.meta.url)
const svgUrl = new URL('../../../gympgrph/src/features/geospatial/SvgGeospatialFallback.tsx', import.meta.url)
const recoveryUrl = new URL('../../../gympgrph/src/features/geospatial/RecoverableSvgFallback.tsx', import.meta.url)

async function pendingIsNotFailure() {
  const { hasUnavailableMapLibreBasemap } = await import(hostUrl.href)
  const pending = { map: null, basemapUnavailable: false, probe: { tilesLoaded: false }, mapError: null }
  assert.equal(hasUnavailableMapLibreBasemap(pending), false, 'A runtime import in progress must not request SVG')
  assert.equal(hasUnavailableMapLibreBasemap({ ...pending, map: {} }), false, 'An initializing map must not request SVG')
  assert.equal(hasUnavailableMapLibreBasemap({ ...pending, mapError: '  ' }), false)
  assert.equal(hasUnavailableMapLibreBasemap({ ...pending, mapError: 'WebGL unavailable' }), true, 'Confirmed initialization failure admits fallback')
  assert.equal(hasUnavailableMapLibreBasemap({ ...pending, map: {}, basemapUnavailable: true }), true, 'Confirmed blank or offline basemap admits fallback')
  assert.equal(hasUnavailableMapLibreBasemap({ ...pending, map: {}, probe: { tilesLoaded: true }, mapError: 'One tile failed' }), false, 'A renderable primary map survives non-fatal tile errors')
}

async function pendingHostRendersOnlyPrimary() {
  const { GeospatialOverlayHost } = await import(hostUrl.href)
  const markup = renderToString(<GeospatialOverlayHost active gameplayPresentationOwner={null} />)
  assert.match(markup, /data-kg-geospatial-map-host=/, 'The primary map gets its container immediately')
  assert.match(markup, /role="status"[^>]*>Loading map…/, 'Pending runtime loading is reported truthfully')
  assert.doesNotMatch(markup, /<svg|kg-geo-fallback|Loading SVG map/, 'Primary startup must not render or begin the fallback')
}

async function explicitSvgRetainsGeometryAndSemanticOwnership() {
  const env = initJsdomHarness()
  const container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main'))
  const root = createRoot(container)
  const { GeospatialOverlayHost } = await import(hostUrl.href)
  const { useGympgrphStore } = await import(new URL('../../../gympgrph/src/store.ts', import.meta.url).href)
  const previousMode = useGympgrphStore.getState().geospatialViewMode
  try {
    useGympgrphStore.setState({ geospatialViewMode: '2d-svg' })
    await act(async () => {
      root.render(<GeospatialOverlayHost active gameplayPresentationOwner={null}
        snapshot={{ graphData: { nodes: [{ id: 'airport', label: 'Airport', properties: { geo: { lat: 1.35, lng: 103.99 } } }] }, selectedNodeIds: ['airport'] }}
        semanticMediaOwner={{ captionId: 'geo-caption', label: 'Recorded route map', selectionAttribute: { name: 'data-test-selectable', value: 'map' } }} />)
    })
    await act(async () => { await import(svgUrl.href) })
    const svg = container.querySelector('svg')
    assert.ok(svg, 'The explicitly selected SVG mode still renders its basemap')
    assert.equal(container.querySelector('[data-kg-geospatial-map-host]'), null, 'Explicit SVG does not start a MapLibre host')
    assert.equal(svg.getAttribute('aria-label'), 'Recorded route map')
    assert.equal(svg.getAttribute('aria-labelledby'), 'geo-caption')
    assert.equal(svg.getAttribute('data-test-selectable'), 'map')
    assert.ok(svg.querySelector('.kg-geo-fallback-terrain .st0[d]'), 'Vendored terrain geometry survives lazy extraction')
    assert.ok(svg.querySelector('path[fill="rgba(37,99,235,0.92)"]')?.getAttribute('d'), 'Graph point geometry remains visible')
    await act(async () => root.render(<GeospatialOverlayHost active={false} gameplayPresentationOwner={null} />))
    assert.equal(container.querySelector('svg'), null, 'An inactive host releases its selectable SVG surface')
    assert.equal(svg.getAttribute('data-test-selectable'), null, 'Semantic ownership is released on unmount')
  } finally {
    await act(async () => root.unmount())
    useGympgrphStore.setState({ geospatialViewMode: previousMode })
    env.restore()
  }
}

function fallbackAssetsStayBehindLazyBoundary() {
  const entry = fs.readFileSync(new URL('../../../gympgrph/src/index.ts', import.meta.url), 'utf8')
  const host = fs.readFileSync(hostUrl, 'utf8')
  const svg = fs.readFileSync(svgUrl, 'utf8')
  const recovery = fs.readFileSync(recoveryUrl, 'utf8')
  assert.match(recovery, /createRecoverableSvgFallback\(\(\) => import\('\.\/SvgGeospatialFallback\.js'\)\)/)
  assert.doesNotMatch(recovery, /import (?!type)[^\n]+ from ['"]\.\/SvgGeospatialFallback/)
  assert.doesNotMatch(host, /from ['"][^'"]*(?:worldSvgBasemap|d3)['"]/, 'The primary host must not eagerly import SVG terrain or projection code')
  assert.match(svg, /from '\.\/worldSvgBasemap\.js'/)
  assert.match(svg, /from 'd3'/)
  assert.match(entry, /await import\('\.\/GeospatialHost\.js'\)/)
  assert.doesNotMatch(entry, /import [^\n]+ from ['"]\.\/GeospatialHost/, 'Shared Geo helpers must not load the host or its recovery UI at startup')
}

async function failedSvgLoadIsContainedAndReloadsOnlyOnRequest() {
  const env = initJsdomHarness()
  const container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main'))
  const root = createRoot(container)
  const { createRecoverableSvgFallback } = await import(recoveryUrl.href)
  let attempts = 0
  let reloads = 0
  const Map = createRecoverableSvgFallback(async () => {
    attempts += 1
    throw new Error('Fixture SVG chunk unavailable')
  }, () => { reloads += 1 })
  const features = { type: 'FeatureCollection' as const, features: [] }
  const render = (label: string) => root.render(<>
    <button type="button" data-workspace-control>Workspace remains available</button>
    <Map featureCollection={features} selectedFeatureCollection={features} className={label} />
  </>)
  try {
    assert.equal(attempts, 0, 'Constructing the boundary must not fetch a chunk')
    await act(async () => render('initial'))
    assert.ok(container.querySelector('[role="alert"]'), 'A rejected chunk must expose local recovery')
    const workspaceControl = container.querySelector('[data-workspace-control]')
    assert.ok(workspaceControl?.isConnected, 'A rejected map must preserve the workspace')
    await act(async () => render('latest'))
    assert.equal(attempts, 1, 'Unrelated renders must not retry a failed fetch')
    const reload = container.querySelector('[role="alert"] button') as HTMLButtonElement
    assert.equal(reload.textContent?.trim(), 'Reload workspace')
    assert.equal(reloads, 0, 'Chunk failures must never reload automatically')
    await act(async () => reload.click())
    assert.equal(reloads, 1, 'One explicit action must request one document reload')
    assert.equal(attempts, 1, 'Do not spend requests retrying a cached module failure')
    assert.equal(container.querySelector('[data-workspace-control]') === workspaceControl, true, 'The workspace must remain mounted until navigation')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
}

async function packageHostSupportsTheCanvasLazyLoader() {
  const env = initJsdomHarness()
  const container = env.dom.window.document.body.appendChild(env.dom.window.document.createElement('main'))
  const root = createRoot(container)
  const { GeospatialOverlayHost } = await import(new URL('../../../gympgrph/src/index.ts', import.meta.url).href)
  const CanvasHost = React.lazy(async () => ({ default: GeospatialOverlayHost }))
  try {
    await act(async () => root.render(<React.Suspense fallback={<p>Loading host</p>}>
      <CanvasHost active={false} gameplayPresentationOwner={null} />
      <output>Package host ready</output>
    </React.Suspense>))
    await act(async () => { await import(hostUrl.href) })
    assert.equal(container.textContent, 'Package host ready', 'Canvas must resolve the package host to a renderable component, not another lazy object')
    assert.equal(container.querySelector('svg'), null, 'Resolving the host must not start the SVG renderer')
  } finally {
    await act(async () => root.unmount())
    env.restore()
  }
}

const cases = [pendingIsNotFailure, pendingHostRendersOnlyPrimary, explicitSvgRetainsGeometryAndSemanticOwnership, fallbackAssetsStayBehindLazyBoundary, failedSvgLoadIsContainedAndReloadsOnlyOnRequest, packageHostSupportsTheCanvasLazyLoader]

export async function testGeospatialFallbackAdmission() {
  for (const run of cases) await run()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const run of cases) await test(run.name, run)
}
