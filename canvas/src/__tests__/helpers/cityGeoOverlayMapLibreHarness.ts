import assert from 'node:assert/strict'
import { SINGAPORE_MAJOR_POI_GEO_PROFILE } from 'grph-shared/geospatial/singaporeMajorPoiGeo'
import {
  CITY_GEO_ZONES,
  createCityGeoOverlaySnapshot,
  type CityGeoOverlaySnapshot,
  type CityGeoZone,
  type CityGeoZoneStyle,
  type CityGeographicProfile,
} from '../../../../gympgrph/src/cityGeoOverlay.js'
import {
  REGIONAL_POI_LAYER_ORDER,
  REGIONAL_POI_SOURCE_ID,
} from '../../../../gympgrph/src/regionalPoiMapLibre.js'

export const TEST_LAYER_ANCHOR = 'test-overlay-anchor'

const zoneStyle = (
  fillColor: string,
): CityGeoZoneStyle => ({
  fillColor,
  outlineColor: '#172033',
})

function createSyntheticGeographicProfile(): CityGeographicProfile {
  return {
    framing: {
      '2d': {
        bearingDegrees: 0,
        maxZoom: 18,
        paddingPixels: 28,
        pitchDegrees: 0,
      },
      '3d': {
        bearingDegrees: 24,
        maxZoom: 17,
        paddingPixels: 36,
        pitchDegrees: 52,
      },
    },
    id: 'synthetic-city-profile',
    regionalPoiProfile: SINGAPORE_MAJOR_POI_GEO_PROFILE,
    revision: 'profile-revision-a',
    selectedOutlineColor: '#f8fafc',
    zoneStyles: {
      unzoned: zoneStyle('#d1d5db'),
      residential: zoneStyle('#34d399'),
      commercial: zoneStyle('#60a5fa'),
      industrial: zoneStyle('#f59e0b'),
    },
  }
}

export function createSyntheticCityGeoOverlaySnapshot(options: Readonly<{
  landValueOffset?: number
  revision?: string
  selectedParcelId?: string | null
}> = {}): CityGeoOverlaySnapshot {
  const rows = 2
  const columns = 3
  const parcels = SINGAPORE_MAJOR_POI_GEO_PROFILE.pois.map((poi, index) => {
    const row = Math.floor(index / columns)
    const column = index % columns
    return {
      column,
      id: poi.id,
      landValueCents: 10_000 + index * 1_000
        + (options.landValueOffset || 0),
      pollution: index,
      population: index * 10,
      row,
      zone: CITY_GEO_ZONES[index % CITY_GEO_ZONES.length] as CityGeoZone,
    }
  })
  return createCityGeoOverlaySnapshot({
    active: true,
    columns,
    parcels,
    profile: createSyntheticGeographicProfile(),
    revision: options.revision || 'city-revision-a',
    rows,
    selectedParcelId: options.selectedParcelId === undefined
      ? SINGAPORE_MAJOR_POI_GEO_PROFILE.pois[0].id
      : options.selectedParcelId,
  })
}

function cloneRecord(value: unknown): Record<string, any> {
  return structuredClone(value) as Record<string, any>
}

class TestGeoJsonSource {
  data: unknown
  setDataCount = 0
  private loadedState: boolean
  private readonly markLoadingOnSetData: boolean

  constructor(
    data: unknown,
    options: Readonly<{
      loaded: boolean
      markLoadingOnSetData: boolean
    }>,
  ) {
    this.data = structuredClone(data)
    this.loadedState = options.loaded
    this.markLoadingOnSetData = options.markLoadingOnSetData
  }

  loaded(): boolean {
    return this.loadedState
  }

  serialize(): Readonly<{ data: unknown; type: 'geojson' }> {
    return { type: 'geojson', data: this.data }
  }

  setData(data: unknown): void {
    this.setDataCount += 1
    this.data = structuredClone(data)
    if (this.markLoadingOnSetData) this.loadedState = false
  }

  markLoaded(): void {
    this.loadedState = true
  }
}

export class TestMapLibreMap {
  readonly fitBoundsCalls: Array<Readonly<{
    bounds: unknown
    options: Record<string, unknown>
  }>> = []
  readonly style = { _loaded: true }
  readonly setPaddingCalls: Array<Readonly<{
    bottom: number
    left: number
    right: number
    top: number
  }>> = []
  readonly featureStateSetCalls: Array<Readonly<{
    id: string | number
    source: string
    state: Readonly<Record<string, unknown>>
  }>> = []
  readonly featureStateRemoveCalls: Array<Readonly<{
    id?: string | number
    key?: string
    source: string
  }>> = []
  readonly styleListeners = new Map<
    string,
    Set<(event?: unknown) => void>
  >()
  setStyleCount = 0
  sourceAddCount = 0
  sourceRemoveCount = 0
  fitBoundsError: Error | null = null
  queryFeatures: readonly Record<string, any>[] = []
  private readonly asynchronousSourceLoading: boolean
  private readonly container: HTMLElement | null
  private padding = {
    bottom: 6,
    left: 3,
    right: 4,
    top: 5,
  }
  private readonly corruptedSources = new Set<string>()
  private readonly featureStates = new Map<string, Record<string, unknown>>()
  private readonly sources = new Map<string, TestGeoJsonSource>()
  private readonly layers: Record<string, any>[] = [{
    id: TEST_LAYER_ANCHOR,
    type: 'background',
    paint: { 'background-color': '#ffffff' },
  }]

  constructor(options: Readonly<{
    asynchronousSourceLoading?: boolean
    container?: HTMLElement | null
  }> = {}) {
    this.asynchronousSourceLoading = options.asynchronousSourceLoading === true
    this.container = options.container || null
  }

  isStyleLoaded(): boolean {
    return true
  }

  getStyle(): Readonly<{
    layers: readonly Record<string, any>[]
    sources: Readonly<Record<string, unknown>>
  }> {
    return {
      layers: this.layers,
      sources: Object.fromEntries(
        [...this.sources].map(([id, source]) => [
          id,
          this.corruptedSources.has(id)
            ? { type: 'vector', url: 'test-corrupted-source' }
            : source.serialize(),
        ]),
      ),
    }
  }

  getSource(id: string): TestGeoJsonSource | undefined {
    return this.sources.get(id)
  }

  addSource(id: string, definition: Readonly<{
    data: unknown
    type: 'geojson'
  }>): void {
    assert.equal(definition.type, 'geojson')
    assert.equal(this.sources.has(id), false)
    this.sourceAddCount += 1
    this.sources.set(id, new TestGeoJsonSource(definition.data, {
      loaded: !this.asynchronousSourceLoading,
      markLoadingOnSetData: this.asynchronousSourceLoading,
    }))
  }

  removeSource(id: string): void {
    this.sourceRemoveCount += 1
    this.corruptedSources.delete(id)
    this.sources.delete(id)
    for (const key of [...this.featureStates.keys()]) {
      if (key.startsWith(`${id}:`)) this.featureStates.delete(key)
    }
  }

  getLayer(id: string): Record<string, any> | undefined {
    return this.layers.find(layer => layer.id === id)
  }

  addLayer(layer: unknown, beforeLayerId?: string): void {
    const next = cloneRecord(layer)
    assert.equal(this.getLayer(String(next.id)), undefined)
    const beforeIndex = beforeLayerId
      ? this.layers.findIndex(candidate => candidate.id === beforeLayerId)
      : -1
    if (beforeIndex >= 0) this.layers.splice(beforeIndex, 0, next)
    else this.layers.push(next)
  }

  removeLayer(id: string): void {
    const index = this.layers.findIndex(layer => layer.id === id)
    if (index >= 0) this.layers.splice(index, 1)
  }

  moveLayer(id: string, beforeLayerId?: string): void {
    const layer = this.getLayer(id)
    if (!layer) return
    this.removeLayer(id)
    const beforeIndex = beforeLayerId
      ? this.layers.findIndex(candidate => candidate.id === beforeLayerId)
      : -1
    if (beforeIndex >= 0) this.layers.splice(beforeIndex, 0, layer)
    else this.layers.push(layer)
  }

  getLayoutProperty(layerId: string, property: string): unknown {
    return this.getLayer(layerId)?.layout?.[property]
  }

  setLayoutProperty(
    layerId: string,
    property: string,
    value: unknown,
  ): void {
    const layer = this.getLayer(layerId)
    assert.ok(layer)
    layer.layout = { ...(layer.layout || {}), [property]: value }
  }

  fitBounds(bounds: unknown, options: Record<string, unknown>): void {
    if (this.fitBoundsError) throw this.fitBoundsError
    this.fitBoundsCalls.push({ bounds, options })
  }

  getContainer(): HTMLElement | null {
    return this.container
  }

  getPadding(): Readonly<{
    bottom: number
    left: number
    right: number
    top: number
  }> {
    return { ...this.padding }
  }

  setPadding(padding: Readonly<{
    bottom: number
    left: number
    right: number
    top: number
  }>): void {
    this.padding = { ...padding }
    this.setPaddingCalls.push({ ...padding })
  }

  setFeatureState(
    target: Readonly<{ id: string | number; source: string }>,
    state: Readonly<Record<string, unknown>>,
  ): void {
    assert.ok(this.getSource(target.source))
    const key = `${target.source}:${target.id}`
    this.featureStates.set(key, {
      ...(this.featureStates.get(key) || {}),
      ...structuredClone(state),
    })
    this.featureStateSetCalls.push({ ...target, state: structuredClone(state) })
  }

  getFeatureState(
    target: Readonly<{ id: string | number; source: string }>,
  ): Readonly<Record<string, unknown>> {
    return structuredClone(
      this.featureStates.get(`${target.source}:${target.id}`) || {},
    )
  }

  removeFeatureState(
    target: Readonly<{ id?: string | number; source: string }>,
    key?: string,
  ): void {
    this.featureStateRemoveCalls.push({ ...target, ...(key ? { key } : {}) })
    const prefix = `${target.source}:`
    const featureKeys = target.id === undefined
      ? [...this.featureStates.keys()].filter(candidate => candidate.startsWith(prefix))
      : [`${target.source}:${target.id}`]
    for (const featureKey of featureKeys) {
      if (!key) {
        this.featureStates.delete(featureKey)
        continue
      }
      const state = this.featureStates.get(featureKey)
      if (!state) continue
      delete state[key]
      if (Object.keys(state).length === 0) this.featureStates.delete(featureKey)
    }
  }

  queryRenderedFeatures(): readonly Record<string, any>[] {
    return this.queryFeatures
  }

  setStyle(): void {
    this.setStyleCount += 1
  }

  on(eventName: string, listener: (event?: unknown) => void): void {
    const listeners = this.styleListeners.get(eventName) || new Set()
    listeners.add(listener)
    this.styleListeners.set(eventName, listeners)
  }

  off(eventName: string, listener: (event?: unknown) => void): void {
    this.styleListeners.get(eventName)?.delete(listener)
  }

  emit(eventName: string, event?: unknown): void {
    for (const listener of [...(this.styleListeners.get(eventName) || [])]) {
      listener(event)
    }
  }

  markRegionalPoiSourceLoaded(): void {
    this.sources.get(REGIONAL_POI_SOURCE_ID)?.markLoaded()
  }

  dropRegionalPoiStyleOwnership(): void {
    for (const layerId of [...REGIONAL_POI_LAYER_ORDER].reverse()) {
      this.removeLayer(layerId)
    }
    this.sources.delete(REGIONAL_POI_SOURCE_ID)
    this.featureStates.clear()
  }
}
