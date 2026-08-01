import type { ComponentType } from 'react'
import type {
  FlightSimStageRuntimeController,
} from '@/features/game-flight-sim/flightSimStageRuntimeController'
import { importWithRetry } from '@/lib/react/importWithRetry'

export type FlightSimMissionStageLazyModule = Readonly<{
  default: ComponentType<{
    geospatialComposite?: boolean
  }>
}>

type FlightSimMissionStageModule = Readonly<{
  createFlightSimMissionStage: (
    runtimeController: FlightSimStageRuntimeController,
  ) => ComponentType<{
    geospatialComposite?: boolean
  }>
}>

type FlightSimMissionStageImporter = () => Promise<FlightSimMissionStageModule>

export function createFlightSimMissionStageLoader(
  importMissionStage: FlightSimMissionStageImporter,
): Readonly<{
  load: () => Promise<FlightSimMissionStageLazyModule>
  preload: (runtimeController: FlightSimStageRuntimeController) => Promise<void>
  reset: () => void
}> {
  let cachedPromise: Promise<FlightSimMissionStageLazyModule> | null = null
  let boundController: FlightSimStageRuntimeController | null = null

  const load = () => {
    if (cachedPromise) return cachedPromise
    const runtimeController = boundController
    if (!runtimeController) {
      return Promise.reject(
        new Error('Flight Sim mission-stage preload requires its runtime controller.'),
      )
    }
    const requestedPromise = importWithRetry(importMissionStage, {
      retries: 2,
      retryDelayMs: 50,
    })
      .then(module => Object.freeze({
        default: module.createFlightSimMissionStage(runtimeController),
      }))
    cachedPromise = requestedPromise
    void requestedPromise.catch(() => {
      if (cachedPromise === requestedPromise) cachedPromise = null
    })
    return requestedPromise
  }

  return Object.freeze({
    load,
    preload: async runtimeController => {
      if (boundController && boundController !== runtimeController) {
        throw new Error('Flight Sim mission-stage runtime controller is already bound.')
      }
      boundController = runtimeController
      await load()
    },
    reset: () => {
      cachedPromise = null
      boundController = null
    },
  })
}

const defaultFlightSimMissionStageImporter: FlightSimMissionStageImporter =
  () => import('@/features/game-flight-sim/FlightSimMissionStage')
let flightSimMissionStageImporter = defaultFlightSimMissionStageImporter
const flightSimMissionStageLoader = createFlightSimMissionStageLoader(
  () => flightSimMissionStageImporter(),
)

export const loadFlightSimMissionStage = flightSimMissionStageLoader.load
export const preloadFlightSimMissionStage = flightSimMissionStageLoader.preload

export function setFlightSimMissionStageImporterForTests(
  importer: FlightSimMissionStageImporter,
): () => void {
  flightSimMissionStageImporter = importer
  flightSimMissionStageLoader.reset()
  return resetFlightSimMissionStageLoaderForTests
}

export function resetFlightSimMissionStageLoaderForTests(): void {
  flightSimMissionStageImporter = defaultFlightSimMissionStageImporter
  flightSimMissionStageLoader.reset()
}
