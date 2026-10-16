import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import { readActiveMapLibreMap } from '@/lib/gympgrph/api'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { projectCitySimToGeospatialOverlay } from '@/features/game-city-sim/citySimGeospatialProjection'
import {
  readFlightSimSnapshot,
  readFlightSimSpatialProfile,
  subscribeFlightSimPresentation,
  subscribeFlightSimSnapshot,
} from '@/features/game-flight-sim/flightSimRuntime'
import { readCurrentFlightSimReadyFrameRequestId } from '@/features/game-flight-sim/flightSimDeadlineRuntime'
import {
  projectFlightSimTimelineCameraToGeospatial,
  projectFlightSimToGeospatialOverlay,
} from '@/features/game-flight-sim/flightSimGeospatialProjection'
import { projectXrEnvironmentToFlightGeo } from '@/features/game-flight-sim/flightSimGeoEnvironmentProjection'
import { readFlightSimTrainingScenario } from '@/features/game-flight-sim/flightSimTrainingScenario'
import {
  readFlightSimCameraSnapshot,
  subscribeFlightSimCamera,
} from '@/features/game-flight-sim/flightSimCameraRuntime'
import {
  readFlightSimTrainingSnapshot,
  subscribeFlightSimTrainingSnapshot,
} from '@/features/game-flight-sim/flightSimTrainingRuntime'
import {
  readXrNativeControllerCamera,
  subscribeXrNativeControllerCamera,
} from '@/features/three/xrNativeControllerCameraRuntime'
import { sampleXrMotionReferenceCameraPose } from '@/features/three/xrMotionReferenceModel'
import {
  readXrMotionReferenceRuntime,
  subscribeXrMotionReferenceRuntime,
} from '@/features/three/xrMotionReferenceRuntime'
import {
  resolveCinemaShotTimelineGeoCamera,
  subscribeCinemaShotFocus,
} from '@/features/cinema/cinemaShotFocus'
import {
  publishGeoXrOverlayComposition,
  type GeoXrOverlayStoreModule,
} from './geoXrFlightOverlayComposition'
import {
  claimActiveGeoXrOverlayPublisherLease,
  clearGeoXrOverlaysAfterPublisherRelease,
} from './geoXrOverlayPublisherLease'

export function useGeoXrOverlayPublisher(options: Readonly<{
  active: boolean
  composedWithXr: boolean
  loadOverlayModule: () => Promise<GeoXrOverlayStoreModule>
}>): void {
  React.useEffect(() => {
    const publisherLease = claimActiveGeoXrOverlayPublisherLease(
      options.active,
      options.composedWithXr,
    )
    if (!publisherLease) return
    let disposed = false
    let loadPending = false
    let publishCurrent: (() => void) | null = null
    let unsubscribeCity = () => void 0
    let unsubscribeFlight = () => void 0
    let unsubscribeFlightCamera = () => void 0
    let unsubscribeFlightTraining = () => void 0
    let unsubscribeCameraSource = () => void 0
    let unsubscribeTimelineRuntime = () => void 0
    let unsubscribeTimelineTransport = () => void 0
    let unsubscribeCinemaShots = () => void 0
    // The Cinema timeline frames its active shot until a map gesture or camera tool takes control.
    let operatorOwnsCamera = false
    let lastPlayheadSeconds: number | null = null
    let lastShotCameraSignature = ''
    let mapMountFrame: number | null = null
    let mapMountRetries = 0
    let cameraInputCanvas: HTMLCanvasElement | null = null
    type ShotCameraMap = {
      jumpTo?: (options: Record<string, unknown>) => void
      setCenterClampedToGround?: (clamped: boolean) => void
    }
    // Without terrain MapLibre re-clamps the camera centre to sea level every frame, which would
    // drop rooftop shots to the street; the shot owner holds the centre elevation while it frames.
    let shotElevationMap: ShotCameraMap | null = null
    const releaseShotElevation = () => {
      if (!shotElevationMap) return
      shotElevationMap.setCenterClampedToGround?.(true)
      shotElevationMap = null
      lastShotCameraSignature = ''
    }
    const onMapCameraGesture = () => {
      operatorOwnsCamera = true
      publishCurrent?.()
    }
    const bindMapCameraInput = () => {
      const nextCanvas = readActiveMapLibreMap()?.getCanvas?.() || null
      if (nextCanvas === cameraInputCanvas) return
      if (cameraInputCanvas) {
        for (const eventName of ['pointerdown', 'touchstart', 'wheel']) {
          cameraInputCanvas.removeEventListener(eventName, onMapCameraGesture)
        }
      }
      cameraInputCanvas = nextCanvas
      if (cameraInputCanvas) {
        for (const eventName of ['pointerdown', 'touchstart', 'wheel']) {
          cameraInputCanvas.addEventListener(eventName, onMapCameraGesture, { passive: true })
        }
      }
    }
    const applyShotCameraToMap = (camera: NonNullable<ReturnType<typeof resolveCinemaShotTimelineGeoCamera>>) => {
      const map = readActiveMapLibreMap() as ShotCameraMap | null
      if (!map?.jumpTo) return
      if (shotElevationMap && shotElevationMap !== map) releaseShotElevation()
      if (!shotElevationMap && typeof map.setCenterClampedToGround === 'function') {
        map.setCenterClampedToGround(false)
        shotElevationMap = map
      }
      const signature = [
        ...camera.centerCoordinate,
        camera.zoom,
        camera.pitchDegrees,
        camera.bearingDegrees,
        camera.centerElevationMeters,
      ].map(value => value.toFixed(5)).join('|')
      if (signature === lastShotCameraSignature) return
      lastShotCameraSignature = signature
      map.jumpTo({
        bearing: camera.bearingDegrees,
        center: [...camera.centerCoordinate],
        elevation: camera.centerElevationMeters,
        pitch: camera.pitchDegrees,
        zoom: camera.zoom,
      })
    }
    const retryCinemaCameraAfterMapMount = () => {
      if (mapMountFrame !== null || mapMountRetries >= 90) return
      mapMountFrame = requestAnimationFrame(() => {
        mapMountFrame = null
        if (disposed || !publisherLease.isCurrent()) return
        if (!readActiveMapLibreMap()?.jumpTo) {
          mapMountRetries += 1
          retryCinemaCameraAfterMapMount()
          return
        }
        mapMountRetries = 0
        publishCurrent?.()
      })
    }
    const activatePublisher = () => {
      if (disposed || !publisherLease.isCurrent()) return
      if (publishCurrent) {
        publishCurrent()
        return
      }
      if (loadPending) return
      loadPending = true
      void options.loadOverlayModule()
        .then(module => {
          loadPending = false
          if (disposed || !publisherLease.isCurrent()) return
          const publish = () => {
            if (disposed || !publisherLease.isCurrent()) return
            bindMapCameraInput()
            const flight = readFlightSimSnapshot()
            const city = readCitySimSnapshot()
            const motionRuntime = readXrMotionReferenceRuntime()
            const transportPlaying = useGraphStore.getState().timelineTransportPlaying
            if (lastPlayheadSeconds !== null && motionRuntime.playheadSeconds !== lastPlayheadSeconds) {
              operatorOwnsCamera = false
            }
            lastPlayheadSeconds = motionRuntime.playheadSeconds
            const shotCamera = !operatorOwnsCamera
              ? resolveCinemaShotTimelineGeoCamera(
                  motionRuntime.plan.stageId,
                  motionRuntime.playheadSeconds,
                )
              : null
            const mapCanvas = readActiveMapLibreMap()?.getCanvas?.()
            if (mapCanvas) {
              mapCanvas.dataset.kgCinemaCameraOwner = operatorOwnsCamera ? 'operator' : 'timeline'
              mapCanvas.dataset.kgCinemaCameraTarget = shotCamera
                ? `${shotCamera.centerCoordinate.join(',')}@${shotCamera.zoom.toFixed(2)}`
                : 'none'
              mapCanvas.dataset.kgCinemaFlightActive = String(flight.active)
            }
            publishGeoXrOverlayComposition({
              city,
              flight,
              projectCityOverlay: projectCitySimToGeospatialOverlay,
              projectFlight: flightSnapshot => {
                const reference = readFlightSimTrainingScenario().geographicReference
                if (!reference) return null
                const environment = projectXrEnvironmentToFlightGeo(
                  motionRuntime.plan,
                  reference,
                )
                const spatialProfile = readFlightSimSpatialProfile()
                const timelineOwnsCamera = transportPlaying
                const timelinePose = timelineOwnsCamera && !shotCamera
                  ? sampleXrMotionReferenceCameraPose(
                      motionRuntime.plan.camera,
                      motionRuntime.playheadSeconds,
                      motionRuntime.plan.cast,
                      motionRuntime.plan.subjects,
                    )
                  : null
                return projectFlightSimToGeospatialOverlay(
                  flightSnapshot,
                  spatialProfile,
                  {
                    source: readXrNativeControllerCamera().mode,
                    timeline: shotCamera || (timelinePose
                      ? projectFlightSimTimelineCameraToGeospatial(
                          timelinePose,
                          spatialProfile,
                          motionRuntime.playheadSeconds,
                          reference,
                        )
                      : null),
                    view: readFlightSimCameraSnapshot().view,
                  },
                  readFlightSimTrainingSnapshot().night,
                  readCurrentFlightSimReadyFrameRequestId(),
                  environment,
                  reference,
                )
              },
              store: module,
            })
            // Without an active flight overlay no other owner drives the map, so the shot schedule frames it directly.
            if (shotCamera && !flight.active) {
              if (readActiveMapLibreMap()?.jumpTo) {
                mapMountRetries = 0
                applyShotCameraToMap(shotCamera)
              } else retryCinemaCameraAfterMapMount()
            } else releaseShotElevation()
          }
          publishCurrent = publish
          unsubscribeCity = subscribeCitySimSnapshot(publish)
          unsubscribeFlight = subscribeFlightSimPresentation('maplibre', publish)
          unsubscribeFlightCamera = subscribeFlightSimCamera(publish)
          unsubscribeFlightTraining = subscribeFlightSimTrainingSnapshot(publish)
          unsubscribeCameraSource = subscribeXrNativeControllerCamera(publish)
          unsubscribeTimelineRuntime = subscribeXrMotionReferenceRuntime(publish)
          unsubscribeCinemaShots = subscribeCinemaShotFocus(publish)
          unsubscribeTimelineTransport = useGraphStore.subscribe(
            (state, previousState) => {
              if (
                state.timelineTransportPlaying
                !== previousState.timelineTransportPlaying
              ) publish()
            },
          )
          publish()
        })
        .catch(() => {
          loadPending = false
        })
    }
    const unsubscribeActivation = publisherLease.onBecameCurrent(activatePublisher)
    return () => {
      disposed = true
      unsubscribeActivation()
      unsubscribeCity()
      unsubscribeFlight()
      unsubscribeFlightCamera()
      unsubscribeFlightTraining()
      unsubscribeCameraSource()
      unsubscribeTimelineRuntime()
      unsubscribeTimelineTransport()
      unsubscribeCinemaShots()
      if (mapMountFrame !== null) cancelAnimationFrame(mapMountFrame)
      if (cameraInputCanvas) {
        for (const eventName of ['pointerdown', 'touchstart', 'wheel']) {
          cameraInputCanvas.removeEventListener(eventName, onMapCameraGesture)
        }
      }
      cameraInputCanvas = null
      releaseShotElevation()
      publishCurrent = null
      if (!publisherLease.release()) return
      void clearGeoXrOverlaysAfterPublisherRelease(
        publisherLease,
        () => readFlightSimSnapshot().active || readCitySimSnapshot().active,
        listener => {
          const unsubscribeFlightRuntime = subscribeFlightSimSnapshot(listener)
          const unsubscribeCityRuntime = subscribeCitySimSnapshot(listener)
          return () => {
            unsubscribeFlightRuntime()
            unsubscribeCityRuntime()
          }
        },
        options.loadOverlayModule,
      ).catch(() => void 0)
    }
  }, [options.active, options.composedWithXr, options.loadOverlayModule])
}
