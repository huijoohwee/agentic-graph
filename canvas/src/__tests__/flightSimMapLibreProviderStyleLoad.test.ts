import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  loadMapLibreProviderStyleDocument,
  shouldPreflightInitialMapLibreStyle,
} from '../../../gympgrph/src/features/geospatial/useMapLibreBasemap.js'
import {
  canFetchMapLibreProviderStyle,
  preflightMapLibreStyle,
  resolveInitialMapLibreStyle,
  resolveMapLibreFlightProviderStyle,
} from '../../../gympgrph/src/features/geospatial/mapLibreProviderStyle.js'
import {
  cancelMapLibreFlightProviderStyleLoad,
  promoteMapLibreFlightProviderStyle,
  type MapLibreFlightProviderPromotionState,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightProviderPromotion.js'
import {
  acquireFlightSimGeospatialBootstrapRequest,
  readFlightSimGeospatialBootstrapRequested,
  subscribeFlightSimGeospatialBootstrapRequest,
} from '../features/game-flight-sim/flightSimSurfaceOpenLifecycle.js'

test('Flight does not block initial MapLibre mount on non-Grab provider I/O', () => {
  assert.equal(
    shouldPreflightInitialMapLibreStyle(
      'https://tiles.openfreemap.org/styles/liberty',
    ),
    false,
  )
  assert.equal(
    shouldPreflightInitialMapLibreStyle(
      'https://maps.grab.com/api/maps/tiles/v1/style',
    ),
    true,
  )
})

test('Flight activation preempts a provider preflight before map construction', async () => {
  const flightStyle = Object.freeze({ version: 8, sources: {}, layers: [] })
  let activationStyle: typeof flightStyle | null = null
  let releaseProvider: (() => void) | null = null
  const providerSettled = new Promise<void>(resolve => {
    releaseProvider = resolve
  })
  const resolution = resolveInitialMapLibreStyle({
    preflight: async () => {
      await providerSettled
      return {
        style: 'provider:stale-preflight',
        shouldFallback: false,
      }
    },
    readActivationStyleOverride: () => activationStyle,
    selectedStyle: 'https://maps.grab.com/style.json',
  })

  activationStyle = flightStyle
  releaseProvider?.()

  assert.deepEqual(await resolution, {
    activationStyleOverride: flightStyle,
    shouldFallback: false,
    style: flightStyle,
  })
})

test('Flight surface opening retains local bootstrap intent until every request settles', () => {
  const transitions: boolean[] = []
  const unsubscribe = subscribeFlightSimGeospatialBootstrapRequest(() => {
    transitions.push(readFlightSimGeospatialBootstrapRequested())
  })
  const releaseFirst = acquireFlightSimGeospatialBootstrapRequest()
  const releaseSecond = acquireFlightSimGeospatialBootstrapRequest()

  assert.equal(readFlightSimGeospatialBootstrapRequested(), true)
  releaseFirst()
  assert.equal(readFlightSimGeospatialBootstrapRequested(), true)
  releaseSecond()
  releaseSecond()
  assert.equal(readFlightSimGeospatialBootstrapRequested(), false)
  assert.deepEqual(transitions, [true, false])
  unsubscribe()
})

test('Flight threads surface-open bootstrap intent into the native map host', () => {
  const overlay = readFileSync(
    new URL(
      '../components/CanvasViewportGeospatialOverlay.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  const host = readFileSync(
    new URL('../../../gympgrph/src/GeospatialHost.tsx', import.meta.url),
    'utf8',
  )

  assert.match(
    overlay,
    /flightBootstrapRequested=\{flightBootstrapRequested\}/,
  )
  assert.match(
    host,
    /flightOverlayActive\s*\|\|\s*props\.flightBootstrapRequested === true/,
  )
})

test('runtime basemap fallbacks cannot bypass exact Flight style retention', () => {
  const basemap = readFileSync(
    new URL(
      '../../../gympgrph/src/features/geospatial/useMapLibreBasemap.ts',
      import.meta.url,
    ),
    'utf8',
  )

  assert.match(
    basemap,
    /const mapHasExactCurrentFlightPresentation[\s\S]*?mapHasExactFlightGeoOverlay\(candidate, overlay\)[\s\S]*?mapHasExactFlightGeoEnvironment\(candidate, overlay\)/,
  )
  assert.match(
    basemap,
    /const requiresFlightStyleRetention[\s\S]*?Boolean\(initialStyleOverrideRef\.current\)[\s\S]*?readFlightGeoOverlay\(\)\.active/,
  )
  assert.match(
    basemap,
    /createMapLibreFlightRuntimeFallbackRequester\(\{[\s\S]*?hasCurrentProviderPresentation:[\s\S]*?mapHasCurrentFlightProviderPresentation[\s\S]*?resolveMapLibreFlightProviderStyle\(style, \{ signal \}\)[\s\S]*?requiresFlightRetention: requiresFlightStyleRetention/,
  )
  assert.equal(
    [...basemap.matchAll(
      /requestResolvedBasemapStyleWithoutDroppingFlight\(\s*'[^']+',\s*RESILIENT_AUTOMATIC_FALLBACK_STYLE_URL/g,
    )].length,
    4,
    'every runtime fallback resolves an object before the retained Flight swap',
  )
  assert.match(
    basemap,
    /hasExactFlightOverlay: candidate => \{[\s\S]*?createFlightGeoOverlayMapLibreCamera\([\s\S]*?mapHasExactFlightGeoOverlayCamera\(candidate, expectedCamera\)/,
  )
})

test('Flight resolves a provider URL to an exact style document before MapLibre promotion', async () => {
  const requests: Array<{ method: string; url: string }> = []
  const resolution = await resolveMapLibreFlightProviderStyle(
    'https://provider.test/styles/liberty.json',
    {
      fetchStyle: async (input, init) => {
        requests.push({
          method: String(init?.method || 'GET'),
          url: String(input),
        })
        return new Response(JSON.stringify({
          version: 8,
          sprite: './sprites/liberty',
          glyphs: './fonts/{fontstack}/{range}.pbf',
          sources: {
            provider: {
              type: 'vector',
              url: './tiles.json',
            },
            raster: {
              type: 'raster',
              tiles: ['./tiles/{z}/{x}/{y}.png'],
            },
          },
          layers: [{
            id: 'provider-background',
            type: 'background',
          }],
        }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      },
    },
  )
  assert.notEqual(typeof resolution.style, 'string')
  if (typeof resolution.style === 'string') {
    throw new Error('Flight provider resolution returned an unsafe URL.')
  }
  const style = resolution.style

  assert.deepEqual(requests, [{
    method: 'GET',
    url: 'https://provider.test/styles/liberty.json',
  }])
  assert.equal(
    style.sprite,
    'https://provider.test/styles/sprites/liberty',
  )
  assert.equal(
    style.glyphs,
    'https://provider.test/styles/fonts/{fontstack}/{range}.pbf',
  )
  assert.equal(
    (style.sources as Record<string, { url?: string }>).provider?.url,
    'https://provider.test/styles/tiles.json',
  )
  assert.deepEqual(
    (style.sources as Record<string, { tiles?: string[] }>).raster?.tiles,
    ['https://provider.test/styles/tiles/{z}/{x}/{y}.png'],
  )
})

test('provider redirects establish the base URL for relative style assets', async () => {
  const response = new Response(JSON.stringify({
    version: 8,
    sprite: './sprites/current',
    sources: {},
    layers: [],
  }), { status: 200 })
  Object.defineProperty(response, 'url', {
    configurable: true,
    value: 'https://cdn.provider.test/releases/v4/style.json',
  })
  const style = await loadMapLibreProviderStyleDocument(
    'https://provider.test/styles/latest',
    async () => response,
  )

  assert.equal(
    style.sprite,
    'https://cdn.provider.test/releases/v4/sprites/current',
  )
})

test('custom MapLibre protocols remain URL-backed and are never fetched manually', async () => {
  let fetchCount = 0
  const customStyle = 'pmtiles://catalog.example/base.pmtiles'
  const result = await preflightMapLibreStyle(customStyle, {
    fetchStyle: async () => {
      fetchCount += 1
      return new Response(null, { status: 500 })
    },
  })

  assert.equal(canFetchMapLibreProviderStyle(customStyle), false)
  assert.equal(result.style, customStyle)
  assert.equal(result.shouldFallback, false)
  assert.equal(fetchCount, 0)
})

test('Flight aborts a slow provider preflight and still constructs its local style', async () => {
  const flightStyle = Object.freeze({ version: 8, sources: {}, layers: [] })
  const controller = new AbortController()
  let activationStyle: typeof flightStyle | null = null
  const resolution = resolveInitialMapLibreStyle({
    preflight: (_styleUrl, options) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'))
      }, { once: true })
    }),
    readActivationStyleOverride: () => activationStyle,
    selectedStyle: 'https://maps.grab.com/style.json',
    signal: controller.signal,
  })

  activationStyle = flightStyle
  controller.abort()

  assert.equal((await resolution).style, flightStyle)
})

test('superseded provider promotion aborts remote I/O without applying stale style', async () => {
  const appliedStyles: unknown[] = []
  const state: MapLibreFlightProviderPromotionState = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 1,
    map: {
      setStyle: (style: unknown) => appliedStyles.push(style),
    },
  }
  let observedSignal: AbortSignal | null = null
  let reportedError: unknown = null
  const promotion = promoteMapLibreFlightProviderStyle({
    generation: 1,
    hasExactFlightOverlay: () => true,
    hasCurrentProviderPresentation: () => true,
    loadProviderStyle: signal => {
      observedSignal = signal
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        }, { once: true })
      })
    },
    onApplied: () => assert.fail('aborted promotion cannot apply'),
    onError: error => {
      reportedError = error
    },
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    retainOverlay: false,
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
    state,
  })

  cancelMapLibreFlightProviderStyleLoad(state)

  assert.equal(await promotion, 'terminated')
  assert.equal(observedSignal?.aborted, true)
  assert.equal(reportedError, null)
  assert.deepEqual(appliedStyles, [])
})

test('provider promotion rechecks exact Flight visuals after its async idle window', async () => {
  const appliedStyles: unknown[] = []
  const state: MapLibreFlightProviderPromotionState = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 1,
    map: {
      setStyle: (style: unknown) => appliedStyles.push(style),
    },
  }
  let exact = true
  let scheduledApply: (() => void) | null = null
  const promotion = promoteMapLibreFlightProviderStyle({
    generation: 1,
    hasCurrentProviderPresentation: () => true,
    hasExactFlightOverlay: () => exact,
    loadProviderStyle: async () => ({ layers: [], sources: {}, version: 8 }),
    onApplied: () => assert.fail('mutated Flight visuals cannot promote'),
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    retainOverlay: true,
    scheduleProviderApply: apply => {
      scheduledApply = apply
      return () => {
        scheduledApply = null
      }
    },
    state,
  })

  await Promise.resolve()
  assert.ok(scheduledApply)
  exact = false
  scheduledApply()

  assert.equal(await promotion, 'admission-changed')
  assert.deepEqual(appliedStyles, [])
})

test('Flight keeps its local bootstrap when a provider style cannot be resolved', async () => {
  await assert.rejects(
    resolveMapLibreFlightProviderStyle(
      'https://provider.test/styles/unavailable.json',
      {
        fetchStyle: async () => new Response(null, { status: 503 }),
      },
    ),
    /provider style request failed with status 503/,
  )
})

test('Flight provider promotion never passes a raw URL to MapLibre', async () => {
  let applied = 0
  let markedApplied = 0
  const result = await promoteMapLibreFlightProviderStyle({
    generation: 1,
    hasCurrentProviderPresentation: () => true,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => 'https://provider.test/style.json',
    onApplied: () => {
      markedApplied += 1
    },
    retainFlightOverlay: (_previous, next) => ({ ...next }),
    retainOverlay: true,
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
    state: {
      cancelProviderStyleApply: null,
      cancelProviderStyleLoad: null,
      disposed: false,
      generation: 1,
      map: {
        getStyle: () => ({ layers: [], sources: {}, version: 8 }),
        setStyle: () => {
          applied += 1
        },
      },
    },
  })

  assert.equal(result, 'admission-changed')
  assert.equal(applied, 0)
  assert.equal(markedApplied, 0)
})

test('Flight precomposes and validates the complete provider style before one object swap', async () => {
  const previousStyle = {
    layers: [{ id: 'flight-layer', type: 'line' }],
    sources: { flight: { type: 'geojson' } },
    version: 8,
  }
  const providerStyle = {
    layers: [{ id: 'provider-layer', type: 'background' }],
    sources: { provider: { type: 'vector' } },
    version: 8,
  }
  const retainedStyle = {
    layers: [...providerStyle.layers, ...previousStyle.layers],
    sources: { ...providerStyle.sources, ...previousStyle.sources },
    version: 8,
  }
  const applied: Array<{
    options: Readonly<Record<string, unknown>>
    style: Readonly<Record<string, unknown>>
  }> = []
  let markedApplied = 0
  const state: MapLibreFlightProviderPromotionState = {
    cancelProviderStyleApply: null,
    cancelProviderStyleLoad: null,
    disposed: false,
    generation: 1,
    map: {
      getStyle: () => previousStyle,
      setStyle: (
        style: Readonly<Record<string, unknown>>,
        options: Readonly<Record<string, unknown>>,
      ) => applied.push({ options, style }),
    },
  }
  const result = await promoteMapLibreFlightProviderStyle({
    generation: 1,
    hasCurrentProviderPresentation: () => true,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => providerStyle,
    onApplied: () => {
      markedApplied += 1
    },
    retainFlightOverlay: (previous, next) => {
      assert.equal(previous, previousStyle)
      assert.equal(next, providerStyle)
      return retainedStyle
    },
    retainOverlay: true,
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
    state,
  })

  assert.equal(result, 'applied')
  assert.equal(markedApplied, 1)
  assert.deepEqual(applied, [{
    options: { diff: true },
    style: retainedStyle,
  }])
  assert.equal('transformStyle' in applied[0]!.options, false)

  state.generation = 2
  applied.length = 0
  markedApplied = 0
  const rejected = await promoteMapLibreFlightProviderStyle({
    generation: 2,
    hasCurrentProviderPresentation: () => true,
    hasExactFlightOverlay: () => true,
    loadProviderStyle: async () => providerStyle,
    onApplied: () => {
      markedApplied += 1
    },
    retainFlightOverlay: () => null,
    retainOverlay: true,
    scheduleProviderApply: apply => {
      apply()
      return () => void 0
    },
    state,
  })
  assert.equal(rejected, 'admission-changed')
  assert.deepEqual(applied, [])
  assert.equal(markedApplied, 0)
})
