import assert from 'node:assert/strict'
import test from 'node:test'

import {
  disposeMapLibreFlightBootstrap,
  reconcileMapLibreFlightBootstrap,
} from '../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap.js'
import {
  captureNativeGeospatialMapLibreLease,
  claimMapLibreMapLease,
  NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
} from '../../../gympgrph/src/features/geospatial/mapLibreHostLease.js'

const flushMicrotasks = async () => {
  await new Promise<void>(resolve => setImmediate(resolve))
}

test('native Geo lease ignores inline Markdown maps and fences stale releases', () => {
  const hostCanvas = {} as HTMLCanvasElement
  const inlineCanvas = {} as HTMLCanvasElement
  const replacementCanvas = {} as HTMLCanvasElement
  const hostMap = { getCanvas: () => hostCanvas }
  const inlineMap = { getCanvas: () => inlineCanvas }
  const replacementMap = { getCanvas: () => replacementCanvas }

  const releaseHost = claimMapLibreMapLease({
    map: hostMap,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    root: null,
  })
  const hostLease = captureNativeGeospatialMapLibreLease()
  assert.equal(hostLease?.map, hostMap)
  assert.equal(hostLease?.canvas, hostCanvas)
  assert.equal(hostLease?.isCurrent(), true)

  const releaseInline = claimMapLibreMapLease({
    map: inlineMap,
    ownerScope: 'embedded-preview',
    root: null,
  })
  assert.equal(captureNativeGeospatialMapLibreLease(), hostLease)
  releaseInline()
  assert.equal(captureNativeGeospatialMapLibreLease(), hostLease)

  const releaseReplacement = claimMapLibreMapLease({
    map: replacementMap,
    ownerScope: NATIVE_GEOSPATIAL_MAPLIBRE_OWNER,
    root: null,
  })
  const replacementLease = captureNativeGeospatialMapLibreLease()
  assert.equal(hostLease?.isCurrent(), false)
  assert.equal(replacementLease?.map, replacementMap)
  assert.equal(replacementLease?.canvas, replacementCanvas)

  releaseHost()
  assert.equal(captureNativeGeospatialMapLibreLease(), replacementLease)
  releaseReplacement()
  assert.equal(replacementLease?.isCurrent(), false)
  assert.equal(captureNativeGeospatialMapLibreLease(), null)
})

test('Flight activation swaps a mounted Geo map to local bootstrap then promotes in place', async () => {
  const canvas = {} as HTMLCanvasElement
  const renderListeners = new Set<() => void>()
  const calls: string[] = []
  let overlayPresented = false
  const map = {
    getCanvas: () => canvas,
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: (
      style: string | Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    ) => {
      calls.push(
        typeof style === 'string'
          ? `style:${style}:${options?.transformStyle ? 'retained' : 'plain'}`
          : `style:${String(style.name || 'local')}:plain`,
      )
    },
    triggerRepaint: () => {
      calls.push('repaint')
    },
  }
  const mapIdentity = map
  const canvasIdentity = map.getCanvas()
  const reconcile = (
    bootstrapStyle: Readonly<Record<string, unknown>> | null,
  ) => {
    reconcileMapLibreFlightBootstrap({
      bootstrapStyle,
      hasExactFlightOverlay: () => overlayPresented,
      loadProviderStyle: async () => {
        calls.push('provider:resolve')
        return 'https://provider.test/style.json'
      },
      map,
      retainFlightOverlay: (_previous, next) => ({ ...next }),
    })
  }

  reconcile({ version: 8, name: 'local-flight-bootstrap' })
  assert.deepEqual(calls, [
    'style:local-flight-bootstrap:plain',
    'repaint',
  ])
  assert.equal(map, mapIdentity)
  assert.equal(map.getCanvas(), canvasIdentity)
  assert.equal(renderListeners.size, 1)

  overlayPresented = true
  for (const listener of [...renderListeners]) listener()
  await flushMicrotasks()

  assert.deepEqual(calls, [
    'style:local-flight-bootstrap:plain',
    'repaint',
    'provider:resolve',
    'style:https://provider.test/style.json:retained',
  ])
  assert.equal(renderListeners.size, 0)
  assert.equal(map, mapIdentity)
  assert.equal(map.getCanvas(), canvasIdentity)

  reconcile(null)
  await flushMicrotasks()
  assert.equal(calls.at(-1), 'style:https://provider.test/style.json:retained')
  disposeMapLibreFlightBootstrap(map)
})

test('Flight deactivation restores the provider without waiting for overlay presentation', async () => {
  const renderListeners = new Set<() => void>()
  const applied: Array<{
    style: string | Readonly<Record<string, unknown>>
    retained: boolean
  }> = []
  const map = {
    off: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.delete(listener)
    },
    on: (event: string, listener: () => void) => {
      if (event === 'render') renderListeners.add(listener)
    },
    setStyle: (
      style: string | Readonly<Record<string, unknown>>,
      options?: Readonly<Record<string, unknown>>,
    ) => {
      applied.push({
        style,
        retained: Boolean(options?.transformStyle),
      })
    },
    triggerRepaint: () => void 0,
  }
  const options = {
    hasExactFlightOverlay: () => false,
    loadProviderStyle: async () => 'https://provider.test/style.json',
    map,
    retainFlightOverlay: (
      _previous: Readonly<Record<string, any>> | undefined,
      next: Readonly<Record<string, any>>,
    ) => ({ ...next }),
  }

  reconcileMapLibreFlightBootstrap({
    ...options,
    bootstrapStyle: { version: 8, name: 'local-flight-bootstrap' },
  })
  assert.equal(renderListeners.size, 1)

  reconcileMapLibreFlightBootstrap({
    ...options,
    bootstrapStyle: null,
  })
  await flushMicrotasks()

  assert.equal(renderListeners.size, 0)
  assert.equal(applied.length, 2)
  assert.equal(applied[1]?.style, 'https://provider.test/style.json')
  assert.equal(applied[1]?.retained, false)
  disposeMapLibreFlightBootstrap(map)
})
