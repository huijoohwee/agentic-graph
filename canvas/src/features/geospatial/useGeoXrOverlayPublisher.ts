import React from 'react'
import { useGraphStore } from '@/hooks/useGraphStore'
import {
  readCitySimSnapshot,
  subscribeCitySimSnapshot,
} from '@/features/game-city-sim/citySimRuntime'
import { projectCitySimAerialInspectionToGeospatialOverlay } from '@/features/game-city-sim/citySimAerialInspectionProjection'
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
            const flight = readFlightSimSnapshot()
            const city = readCitySimSnapshot()
            publishGeoXrOverlayComposition({
              city,
              flight,
              projectCityAerial: projectCitySimAerialInspectionToGeospatialOverlay,
              projectCityOverlay: projectCitySimToGeospatialOverlay,
              projectFlight: flightSnapshot => {
                const spatialProfile = readFlightSimSpatialProfile()
                const motionRuntime = readXrMotionReferenceRuntime()
                const timelinePose = useGraphStore.getState().timelineTransportPlaying
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
                    timeline: timelinePose
                      ? projectFlightSimTimelineCameraToGeospatial(
                          timelinePose,
                          spatialProfile,
                          motionRuntime.playheadSeconds,
                        )
                      : null,
                    view: readFlightSimCameraSnapshot().view,
                  },
                  readFlightSimTrainingSnapshot().night,
                  readCurrentFlightSimReadyFrameRequestId(),
                  projectXrEnvironmentToFlightGeo(motionRuntime.plan),
                )
              },
              store: module,
            })
          }
          publishCurrent = publish
          unsubscribeCity = subscribeCitySimSnapshot(publish)
          unsubscribeFlight = subscribeFlightSimPresentation('maplibre', publish)
          unsubscribeFlightCamera = subscribeFlightSimCamera(publish)
          unsubscribeFlightTraining = subscribeFlightSimTrainingSnapshot(publish)
          unsubscribeCameraSource = subscribeXrNativeControllerCamera(publish)
          unsubscribeTimelineRuntime = subscribeXrMotionReferenceRuntime(publish)
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
