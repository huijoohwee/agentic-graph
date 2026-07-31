import assert from 'node:assert/strict'

import {
  type FlightGeoOverlayPresentation,
  type FlightGeoOverlaySnapshot,
} from '../../../../gympgrph/src/flightGeoOverlay'
import {
  createFlightGeoOverlayPresentationGate,
} from '../../../../gympgrph/src/features/geospatial/useFlightGeoOverlayMapLibrePresentation'
import {
  markMapLibreFlightBootstrapApplied,
} from '../../../../gympgrph/src/features/geospatial/mapLibreFlightBootstrap'
import {
  applyFlightGeoOverlayToMap,
  flightGeoOverlayMapLibreFeatureCollection,
  FLIGHT_GEO_OVERLAY_LAYER_IDS,
  FLIGHT_GEO_OVERLAY_SOURCE_ID,
} from '../../../../gympgrph/src/flightGeoOverlayMapLibre'
import {
  applyFlightGeoEnvironmentToMap,
  flightGeoEnvironmentMapLibreFeatureCollection,
  FLIGHT_GEO_ENVIRONMENT_LAYER_IDS,
  FLIGHT_GEO_ENVIRONMENT_SOURCE_ID,
} from '../../../../gympgrph/src/flightGeoEnvironmentMapLibre'

export function flightOverlay(
  phase: FlightGeoOverlaySnapshot['phase'],
  revision: string,
  readyFrameRequestId: number | null = phase === 'ready' ? 1 : null,
): FlightGeoOverlaySnapshot {
  return {
    active: true,
    aircraft: {
      coordinate: [103.82, 1.35],
      altitudeMeters: 400,
      headingDegrees: 0,
    },
    camera: {
      centerCoordinate: [103.82, 1.35],
      cockpitClearance: {
        forwardMeters: 2,
        verticalMeters: 1,
      },
      effectiveOwner: 'fixed-follow',
      source: 'fixed-follow',
      timeline: null,
      view: 'chase',
    },
    environment: null,
    night: false,
    objective: {
      bearingDegrees: 45,
      coordinate: [103.83, 1.36],
      distanceMeters: 120,
      headingErrorDegrees: 45,
      id: 'landing',
      kind: 'landing',
      label: 'LAND',
    },
    phase,
    presentationOwner: 'flight',
    profileId: 'singapore',
    readyFrameRequestId,
    revision,
    route: [
      {
        id: 'spawn',
        coordinate: [103.82, 1.35],
        altitudeMeters: 400,
        kind: 'spawn',
        state: 'visited',
      },
      {
        id: 'landing',
        coordinate: [103.83, 1.36],
        altitudeMeters: 0,
        kind: 'landing',
        state: 'active',
      },
    ],
    runId: phase === 'stopped' ? 0 : 1,
    tick: 0,
  }
}

export function withEnvironment(
  overlay: FlightGeoOverlaySnapshot,
): FlightGeoOverlaySnapshot {
  const ring = [
    [103.8198, 1.3498],
    [103.8202, 1.3498],
    [103.8202, 1.3502],
    [103.8198, 1.3502],
    [103.8198, 1.3498],
  ] as const
  return {
    ...overlay,
    environment: {
      anchor: [103.82, 1.35],
      id: 'singapore',
      label: 'Singapore',
      presentationBounds: [[103.8198, 1.3498], [103.8202, 1.3502]],
      revision: 'environment:stopped-ready',
      stageFootprint: ring,
      surfaces: [{
        baseHeightMeters: 0,
        color: '#0f766e',
        heightMeters: 0.08,
        id: 'stage-footprint',
        kind: 'stage-footprint',
        ring,
      }],
    },
  }
}

export function presentationHarness(
  initial: FlightGeoOverlaySnapshot,
  afterPresented?: (presentation: FlightGeoOverlayPresentation) => void,
  options?: Readonly<{
    bootstrapApplied?: boolean
    cameraExact?: boolean
    environmentSourceLoaded?: boolean
    overlaySourceLoaded?: boolean
  }>,
) {
  let current = initial
  let cameraExact = options?.cameraExact ?? true
  let environmentSourceLoaded = options?.environmentSourceLoaded ?? true
  let overlaySourceLoaded = options?.overlaySourceLoaded ?? true
  let width = 0
  let repaintCount = 0
  let sourceData = flightGeoOverlayMapLibreFeatureCollection(initial)
  let environmentSourceData = initial.environment
    ? flightGeoEnvironmentMapLibreFeatureCollection(initial)
    : null
  let sourceDataWrites = 0
  let jumpToCount = 0
  let styleSetCount = 0
  let styleFingerprint = 'style:bootstrap'
  const images = new Set<string>()
  const layerDefinitions = new Map<string, Record<string, any>>()
  const listeners = new Set<() => void>()
  const resizeListeners = new Set<() => void>()
  const sourceDataListeners = new Set<(event: {
    sourceDataType?: 'content'
    sourceId: string
    tile?: object
  }) => void>()
  const sourceErrorListeners = new Set<(event: { sourceId: string }) => void>()
  const sourceLoadingListeners =
    new Set<(event: { sourceId: string; tile?: object }) => void>()
  const styleLoadListeners = new Set<() => void>()
  let environmentLayerOrder: string[] = []
  let overlayLayerOrder: string[] = []
  const layerIds = new Set<string>()
  const layerVisibility = new Map<string, 'none' | 'visible'>([
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.fill2d, 'none'],
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.extrusion3d, 'visible'],
    [FLIGHT_GEO_ENVIRONMENT_LAYER_IDS.outline, 'visible'],
  ])
  const canvas = {
    dataset: {} as DOMStringMap,
    get height() {
      return 100
    },
    get width() {
      return width
    },
    getBoundingClientRect: () => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  }
  const map = {
    style: { _loaded: true },
    addLayer: (layer: Record<string, any>) => {
      const id = String(layer.id)
      layerDefinitions.set(id, layer)
      layerIds.add(id)
      if (Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).includes(id as never)) {
        overlayLayerOrder = overlayLayerOrder.filter(layerId => layerId !== id)
        overlayLayerOrder.push(id)
      }
      if (Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS).includes(id as never)) {
        environmentLayerOrder =
          environmentLayerOrder.filter(layerId => layerId !== id)
        environmentLayerOrder.push(id)
      }
    },
    addImage: (id: string) => images.add(id),
    getBearing: () => cameraExact ? current.aircraft.headingDegrees : 180,
    getCanvas: () => canvas,
    getCenter: () => ({
      lng: cameraExact ? current.camera.centerCoordinate[0] : 0,
      lat: cameraExact ? current.camera.centerCoordinate[1] : 0,
    }),
    getLayer: (id: string) => (
      layerIds.has(id) ? layerDefinitions.get(id) : undefined
    ),
    getLayoutProperty: (id: string, property: string) => {
      if (property === 'visibility') return layerVisibility.get(id)
      return layerDefinitions.get(id)?.layout?.[property]
    },
    getPaintProperty: (id: string, property: string) => (
      layerDefinitions.get(id)?.paint?.[property]
    ),
    getPadding: () => ({ top: 16, right: 16, bottom: 16, left: 16 }),
    getPitch: () => cameraExact ? 48 : 0,
    hasImage: (id: string) => images.has(id),
    getSource: (id: string) => (
      id === FLIGHT_GEO_OVERLAY_SOURCE_ID
        ? {
            id,
            loaded: () => overlaySourceLoaded,
            serialize: () => ({ data: sourceData }),
            setData: (data: ReturnType<typeof flightGeoOverlayMapLibreFeatureCollection>) => {
              sourceDataWrites += 1
              sourceData = data
            },
          }
        : id === FLIGHT_GEO_ENVIRONMENT_SOURCE_ID && environmentSourceData
          ? {
              id,
              loaded: () => environmentSourceLoaded,
              serialize: () => ({ data: environmentSourceData }),
              setData: (data: ReturnType<typeof flightGeoEnvironmentMapLibreFeatureCollection>) => {
                sourceDataWrites += 1
                environmentSourceData = data
              },
            }
        : undefined
    ),
    getStyle: () => ({
      metadata: { kgTestStyleFingerprint: styleFingerprint },
      layers: [
        ...(initial.environment
          ? environmentLayerOrder
              .filter(id => layerIds.has(id))
              .map(id => layerDefinitions.get(id))
          : []),
        ...overlayLayerOrder
          .filter(id => layerIds.has(id))
          .map(id => layerDefinitions.get(id)),
      ],
    }),
    getZoom: () => cameraExact ? 15.5 : 0,
    moveLayer: (id: string) => {
      if (Object.values(FLIGHT_GEO_ENVIRONMENT_LAYER_IDS).includes(id as never)) {
        environmentLayerOrder =
          environmentLayerOrder.filter(layerId => layerId !== id)
        environmentLayerOrder.push(id)
      }
      if (Object.values(FLIGHT_GEO_OVERLAY_LAYER_IDS).includes(id as never)) {
        overlayLayerOrder = overlayLayerOrder.filter(layerId => layerId !== id)
        overlayLayerOrder.push(id)
      }
    },
    off: (type: string, listener: (...args: any[]) => void) => {
      if (type === 'render') listeners.delete(listener)
      if (type === 'resize') resizeListeners.delete(listener)
      if (type === 'sourcedataloading') sourceLoadingListeners.delete(listener)
      if (type === 'sourcedata') sourceDataListeners.delete(listener)
      if (type === 'error') sourceErrorListeners.delete(listener)
      if (type === 'style.load') styleLoadListeners.delete(listener)
    },
    on: (type: string, listener: (...args: any[]) => void) => {
      if (type === 'render') listeners.add(listener)
      if (type === 'resize') resizeListeners.add(listener)
      if (type === 'sourcedataloading') sourceLoadingListeners.add(listener)
      if (type === 'sourcedata') sourceDataListeners.add(listener)
      if (type === 'error') sourceErrorListeners.add(listener)
      if (type === 'style.load') styleLoadListeners.add(listener)
    },
    removeLayer: (id: string) => {
      layerIds.delete(id)
      layerDefinitions.delete(id)
      environmentLayerOrder =
        environmentLayerOrder.filter(layerId => layerId !== id)
      overlayLayerOrder = overlayLayerOrder.filter(layerId => layerId !== id)
    },
    setStyle: (style: string | Readonly<Record<string, unknown>>) => {
      styleSetCount += 1
      styleFingerprint = typeof style === 'string'
        ? style
        : String(style.name || `style:${styleSetCount}`)
    },
    triggerRepaint: () => {
      repaintCount += 1
    },
    jumpTo: () => {
      jumpToCount += 1
    },
    setLayoutProperty: (
      id: string,
      property: string,
      value: 'none' | 'visible',
    ) => {
      if (property === 'visibility') layerVisibility.set(id, value)
    },
  }
  assert.equal(applyFlightGeoOverlayToMap(map, initial), true)
  assert.equal(
    applyFlightGeoEnvironmentToMap(map, initial, '3d'),
    true,
  )
  if (options?.bootstrapApplied !== false) {
    markMapLibreFlightBootstrapApplied(map)
  }
  const presentations: FlightGeoOverlayPresentation[] = []
  const presented = {
    current: {
      map: null,
      readyFrameRequestId: null,
      revision: '',
    },
  }
  const gate = createFlightGeoOverlayPresentationGate({
    active: () => true,
    isCanvasElement: (value): value is HTMLCanvasElement => value === canvas,
    map,
    onPresented: presentation => {
      presentations.push(presentation)
      afterPresented?.(presentation)
    },
    presented,
    readOverlay: () => current,
    readRoot: () => null,
    viewMode: '3d',
  })
  return {
    canvas,
    emitRender: () => {
      for (const listener of [...listeners]) listener()
    },
    emitResize: () => {
      for (const listener of [...resizeListeners]) listener()
    },
    emitSourceDataError: (sourceId: string) => {
      for (const listener of [...sourceErrorListeners]) listener({ sourceId })
    },
    emitSourceDataLoading: (sourceId: string, tile = false) => {
      const event = tile ? { sourceId, tile: {} } : { sourceId }
      for (const listener of [...sourceLoadingListeners]) listener(event)
    },
    emitSourceData: (sourceId: string) => {
      for (const listener of [...sourceDataListeners]) {
        listener({ sourceDataType: 'content', sourceId })
      }
    },
    emitSourceTileData: (sourceId: string) => {
      for (const listener of [...sourceDataListeners]) {
        listener({ sourceId, tile: {} })
      }
    },
    emitStyleLoad: () => {
      for (const listener of [...styleLoadListeners]) listener()
    },
    gate,
    map,
    listenerCount: () => listeners.size,
    sourceDataListenerCount: () => sourceDataListeners.size,
    sourceLifecycleListenerCount: () => (
      sourceDataListeners.size
      + sourceErrorListeners.size
      + sourceLoadingListeners.size
    ),
    presentedRevision: () => presented.current.revision,
    presentations,
    repaintCount: () => repaintCount,
    jumpToCount: () => jumpToCount,
    replaceSourceData: (next: FlightGeoOverlaySnapshot | null) => {
      sourceData = next
        ? flightGeoOverlayMapLibreFeatureCollection(next)
        : { type: 'FeatureCollection', features: [] }
    },
    setCurrent: (next: FlightGeoOverlaySnapshot) => {
      current = next
      sourceData = flightGeoOverlayMapLibreFeatureCollection(next)
      environmentSourceData = next.environment
        ? flightGeoEnvironmentMapLibreFeatureCollection(next)
        : null
    },
    setCurrentPreservingSourceData: (next: FlightGeoOverlaySnapshot) => {
      current = next
    },
    setCameraExact: (exact: boolean) => {
      cameraExact = exact
    },
    setOverlaySourceLoaded: (loaded: boolean) => {
      overlaySourceLoaded = loaded
    },
    setEnvironmentSourceLoaded: (loaded: boolean) => {
      environmentSourceLoaded = loaded
    },
    setLayerPresent: (id: string, present: boolean) => {
      if (present) layerIds.add(id)
      else layerIds.delete(id)
    },
    setLayerVisibility: (id: string, visibility: 'none' | 'visible') => {
      layerVisibility.set(id, visibility)
    },
    setEnvironmentLayerOrder: (next: readonly string[]) => {
      environmentLayerOrder = [...next]
    },
    setOverlayLayerOrder: (next: readonly string[]) => {
      overlayLayerOrder = [...next]
    },
    setStyleFingerprint: (next: string) => {
      styleFingerprint = next
    },
    sourceDataWrites: () => sourceDataWrites,
    styleSetCount: () => styleSetCount,
    setWidth: (next: number) => {
      width = next
    },
  }
}
