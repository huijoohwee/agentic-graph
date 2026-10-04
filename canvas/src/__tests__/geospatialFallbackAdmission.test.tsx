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
  const host = fs.readFileSync(hostUrl, 'utf8')
  const svg = fs.readFileSync(svgUrl, 'utf8')
  assert.match(host, /React\.lazy\(\(\) => import\('\.\/features\/geospatial\/SvgGeospatialFallback\.js'\)\)/)
  assert.doesNotMatch(host, /from ['"][^'"]*(?:worldSvgBasemap|d3)['"]/, 'The primary host must not eagerly import SVG terrain or projection code')
  assert.match(svg, /from '\.\/worldSvgBasemap\.js'/)
  assert.match(svg, /from 'd3'/)
}

const cases = [pendingIsNotFailure, pendingHostRendersOnlyPrimary, explicitSvgRetainsGeometryAndSemanticOwnership, fallbackAssetsStayBehindLazyBoundary]

export async function testGeospatialFallbackAdmission() {
  for (const run of cases) await run()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const run of cases) await test(run.name, run)
}
