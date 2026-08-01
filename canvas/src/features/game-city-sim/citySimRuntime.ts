import { readWebglSupport } from '@/lib/three/webglSupport'
import {
  commitCanvasGeospatialSurfaceOwnership,
  GeospatialSurfaceOwnershipRestorationError,
} from '@/features/geospatial/geospatialSurfaceOwnershipRuntime'
import { activateXrSceneSurface, registerXrSceneGameplayExitHandler } from '@/features/three/xrSceneSurfaceRuntime'
import {
  CITY_SIM_FIXED_STEP_MS,
  freezeCityGrid,
  type CityGrid,
} from './citySimModel'
import {
  validateCitySimAuthoredSource,
  type CitySimAuthoredSource,
} from './citySimAuthoredSource'
import { loadCityGridFromWorkspace } from './citySimPersistence'
import {
  citySimSnapshot as snapshot,
  publishCitySimFailure as publishFailure,
  publishCitySimSnapshot as publish,
  publishCitySimSuccess as publishSuccess,
  readCitySimSnapshot,
  resetCitySimSnapshotForTests,
  subscribeCitySimSnapshot,
  type CitySimSaveStatus,
  type CitySimSnapshot,
  type CitySimSnapshotUpdate,
} from './citySimRuntimeState'
import { createCitySimSynchronousCommands } from './citySimSynchronousCommands'
import {
  createCitySimPersistenceCommands,
  type CitySimMalformedDocument,
  type CitySimWorkspaceOptions,
} from './citySimPersistenceCommands'
import {
  captureCitySimPreviousCanvasSurface,
  restoreCitySimPreviousCanvasSurface,
  type CitySimPreviousCanvasSurface,
} from './citySimSurfaceOwnership'

export { readCitySimSnapshot, subscribeCitySimSnapshot }
export type { CitySimOperationResult, CitySimPhase, CitySimSaveStatus, CitySimSnapshot } from './citySimRuntimeState'

export type CitySimOpenOptions = CitySimWorkspaceOptions & Readonly<{
  authoredSource?: CitySimAuthoredSource
  openPanel?: boolean
  previousCanvasSurface?: CitySimPreviousCanvasSurface
  webglSupported?: boolean
}>

let timer: ReturnType<typeof setTimeout> | null = null
let timerGeneration = 0
let asyncGeneration = 0
let previousCanvasSurface: CitySimPreviousCanvasSurface | null = null
let citySimSurfaceOpenTail: Promise<void> | null = null
let citySimSurfaceRestorationTail: Promise<string | null> = Promise.resolve(null)
let citySimSurfaceRestoring: CitySimPreviousCanvasSurface | null = null
let latestCitySimSurfaceIntent: 'idle' | 'open' | 'exit' = 'idle'
let sessionStartCity: CityGrid | null = null
let authoredSource: CitySimAuthoredSource | null = null
let malformedDocument: CitySimMalformedDocument | null = null

function fenceTimer(): void {
  timerGeneration += 1
  if (timer) clearTimeout(timer)
  timer = null
}

const synchronousCommands = createCitySimSynchronousCommands({
  fenceTimer,
  invalidateAsyncOperations: () => {
    asyncGeneration += 1
  },
  readMalformedDocument: () => malformedDocument,
  clearMalformedDocument: () => {
    malformedDocument = null
  },
  readSessionStartCity: () => sessionStartCity,
  readAuthoredSource: () => authoredSource,
  replaceSessionStartCity: city => {
    sessionStartCity = city
  },
})

export const {
  stopCitySim,
  advanceCitySimByFixedStep,
  restartCitySim,
  resetCitySim,
  selectCityParcel,
  zoneCityParcel,
  zoneSelectedCityParcel,
  requestCityAdvice,
  applyCityAdvice,
} = synchronousCommands

function scheduleNextTick(generation: number): void {
  timer = setTimeout(() => {
    timer = null
    if (
      generation !== timerGeneration
      || !snapshot.active
      || snapshot.phase !== 'running'
    ) return
    const next = advanceCitySimByFixedStep()
    if (
      next.phase === 'running'
      && generation === timerGeneration
      && next.active
    ) {
      scheduleNextTick(generation)
    }
  }, CITY_SIM_FIXED_STEP_MS)
}

function tickZero(city: CityGrid): CityGrid {
  return city.tick === 0 ? city : freezeCityGrid({ ...city, tick: 0 })
}

function authoredSourceIssue(source: CitySimAuthoredSource): string | null {
  try {
    const issues = validateCitySimAuthoredSource(source)
    return issues.length > 0 ? issues[0] : null
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

function applyLoadedCity(
  city: CityGrid,
  saveStatus: Extract<CitySimSaveStatus, 'loaded' | 'not-loaded'>,
  operation: string,
): CitySimSnapshot {
  fenceTimer()
  malformedDocument = null
  sessionStartCity = tickZero(city)
  return publishSuccess(
    operation,
    saveStatus === 'loaded'
      ? `Loaded the canonical City Document at tick ${city.tick}.`
      : 'No City Document exists; restored the applied source-authored City grid.',
    {
      city,
      phase: snapshot.active ? 'stopped' : 'idle',
      selectedParcelId: null,
      advisor: null,
      saveStatus,
    },
  )
}

const persistenceCommands = createCitySimPersistenceCommands({
  applyLoadedCity,
  beginAsyncOperation: () => {
    asyncGeneration += 1
    return asyncGeneration
  },
  fenceTimer,
  isAsyncOperationCurrent: generation => generation === asyncGeneration,
  publish,
  publishFailure,
  publishSuccess,
  readAuthoredSource: () => authoredSource,
  readMalformedDocument: () => malformedDocument,
  readSnapshot: () => snapshot,
  setMalformedDocument: document => {
    malformedDocument = document
  },
})

export const {
  loadCitySim,
  saveCitySim,
} = persistenceCommands

function beginCitySimSurfaceRestoration(
  previous: CitySimPreviousCanvasSurface,
): Promise<string | null> {
  if (citySimSurfaceRestoring === previous) {
    return citySimSurfaceRestorationTail
  }
  citySimSurfaceRestoring = previous
  citySimSurfaceRestorationTail = restoreCitySimPreviousCanvasSurface(previous)
  return citySimSurfaceRestorationTail
}

async function failSurfaceEntry(
  previous: CitySimPreviousCanvasSurface,
  code: string,
  message: string,
  update: CitySimSnapshotUpdate = {},
): Promise<CitySimSnapshot> {
  fenceTimer()
  previousCanvasSurface = null
  const restorationFailure = await beginCitySimSurfaceRestoration(previous)
  return publishFailure(
    'open',
    restorationFailure ? 'surface-restoration-failed' : code,
    restorationFailure
      ? `${message} Surface restoration failed: ${restorationFailure}`
      : message,
    {
      ...update,
      active: false,
      phase: 'error',
    },
  )
}

async function claimCityGeoXrSurface(expectedGeneration: number): Promise<void> {
  await commitCanvasGeospatialSurfaceOwnership(true, {
    isCurrent: () => expectedGeneration === asyncGeneration,
  })
}

function surfaceOwnershipFailureAfterSupersession(
  error: unknown,
): CitySimSnapshot {
  if (!(error instanceof GeospatialSurfaceOwnershipRestorationError)) {
    return snapshot
  }
  return publishFailure(
    latestCitySimSurfaceIntent === 'exit' ? 'exit' : 'open',
    'surface-restoration-failed',
    `City Simulation Geo+XR ownership did not restore: ${error.message}`,
    { active: false, phase: 'error' },
  )
}

async function performOpenCitySimSurface(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  const priorRestoration = citySimSurfaceRestorationTail
  const restorationFailure = await priorRestoration
  if (priorRestoration !== citySimSurfaceRestorationTail) return snapshot
  if (restorationFailure) {
    return publishFailure(
      'open',
      'surface-restoration-failed',
      `City Simulation cannot enter until the prior surface restores: ${restorationFailure}`,
      { active: false, phase: 'error' },
    )
  }
  citySimSurfaceRestoring = null
  const generation = asyncGeneration + 1
  asyncGeneration = generation
  const previous = previousCanvasSurface
    ?? options.previousCanvasSurface
    ?? captureCitySimPreviousCanvasSurface()
  const webglSupported = options.webglSupported ?? readWebglSupport()
  if (!webglSupported) {
    return failSurfaceEntry(
      previous,
      'webgl-unavailable',
      'City Simulation requires the native MapLibre Geo surface.',
      { webglSupported },
    )
  }
  const requestedSource = options.authoredSource ?? null
  if (requestedSource) {
    const sourceIssue = authoredSourceIssue(requestedSource)
    if (sourceIssue) {
      return failSurfaceEntry(
        previous,
        'invalid-authored-source',
        `City Simulation rejected its authored source: ${sourceIssue}`,
      )
    }
  }
  const source = requestedSource ?? authoredSource
  if (snapshot.active) {
    try {
      await claimCityGeoXrSurface(generation)
      if (generation !== asyncGeneration || !snapshot.active) {
        return snapshot
      }
    } catch (error) {
      if (generation !== asyncGeneration) {
        return surfaceOwnershipFailureAfterSupersession(error)
      }
      return failSurfaceEntry(
        previous,
        'geo-surface-unavailable',
        `City Builder could not claim the shared Geo+XR surface: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    const activated = activateXrSceneSurface({
      geospatialComposite: true,
      gameplaySurface: 'cityBuilder',
      ...(options.openPanel === false
        ? {}
        : { panelView: 'cityBuilder' as const, openPanel: true }),
    })
    if (!activated) {
      return publishFailure(
        'open',
        'surface-unavailable',
        'City Builder could not claim the shared Geo+XR surface.',
      )
    }
    const sourceChanged = requestedSource !== null && requestedSource !== authoredSource
    if (requestedSource) authoredSource = requestedSource
    const restoreAuthoredGrid = sourceChanged && snapshot.saveStatus === 'not-loaded'
    if (restoreAuthoredGrid && requestedSource) {
      sessionStartCity = tickZero(requestedSource.city)
    }
    return publishSuccess(
      'open',
      sourceChanged
        ? 'City Builder applied the current source-authored City session.'
        : 'City Builder is open on the active city session.',
      {
        ...(restoreAuthoredGrid && requestedSource
          ? {
              city: requestedSource.city,
              selectedParcelId: null,
              advisor: null,
            }
          : {}),
      },
    )
  }

  publish({
    webglSupported,
    saveStatus: 'loading',
    error: null,
    message: 'Reading the browser-local City Document before entry…',
  })
  let loaded: Awaited<ReturnType<typeof loadCityGridFromWorkspace>>
  try {
    loaded = await loadCityGridFromWorkspace(options)
  } catch (error) {
    if (generation !== asyncGeneration) return snapshot
    return failSurfaceEntry(
      previous,
      'document-read-failed',
      error instanceof Error ? error.message : String(error),
      { saveStatus: 'error' },
    )
  }
  if (generation !== asyncGeneration) return snapshot
  if (loaded.status === 'malformed') {
    malformedDocument = Object.freeze({
      document: loaded.document,
      message: loaded.error.message,
    })
    return failSurfaceEntry(
      previous,
      'malformed-document',
      `City Document is malformed and was preserved: ${loaded.error.message}`,
      { saveStatus: 'malformed' },
    )
  }

  if (!source) {
    return failSurfaceEntry(
      previous,
      'authored-source-missing',
      'City Simulation cannot open without the applied source-authored POI zoning document.',
      { saveStatus: 'not-loaded' },
    )
  }
  const city = loaded.status === 'loaded' ? loaded.city : source.city
  try {
    await claimCityGeoXrSurface(generation)
    if (generation !== asyncGeneration) {
      return snapshot
    }
    const activated = activateXrSceneSurface({
      geospatialComposite: true,
      gameplaySurface: 'cityBuilder',
      ...(options.openPanel === false
        ? {}
        : { panelView: 'cityBuilder' as const, openPanel: true }),
      beforePanelCommit: () => {
        if (generation !== asyncGeneration) {
          throw new Error('City surface entry was superseded.')
        }
      },
    })
    if (!activated) {
      return failSurfaceEntry(
        previous,
        'surface-unavailable',
        'City Simulation could not claim the shared Geo+XR surface.',
        { saveStatus: loaded.status === 'loaded' ? 'loaded' : 'not-loaded' },
      )
    }
    previousCanvasSurface = previous
    malformedDocument = null
    if (requestedSource) authoredSource = requestedSource
    sessionStartCity = tickZero(city)
    return publishSuccess(
      'open',
      loaded.status === 'loaded'
        ? `City Simulation opened from the canonical City Document at tick ${city.tick}.`
        : 'City Simulation opened from the applied source-authored City grid.',
      {
        active: true,
        webglSupported,
        phase: 'stopped',
        city,
        selectedParcelId: null,
        advisor: null,
        saveStatus: loaded.status === 'loaded' ? 'loaded' : 'not-loaded',
      },
    )
  } catch (error) {
    if (generation !== asyncGeneration) {
      return surfaceOwnershipFailureAfterSupersession(error)
    }
    return failSurfaceEntry(
      previous,
      'surface-entry-failed',
      `City surface entry failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

export function openCitySimSurface(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  latestCitySimSurfaceIntent = 'open'
  if (!snapshot.active && snapshot.lastResult?.operation === 'exit') {
    publish({
      lastResult: null,
      message: 'Opening City Simulation on the native MapLibre Geo+XR surface…',
    })
  }
  const opening = performOpenCitySimSurface(options)
  const tail = opening.then(() => undefined, () => undefined)
  citySimSurfaceOpenTail = tail
  void tail.then(() => {
    if (citySimSurfaceOpenTail === tail) citySimSurfaceOpenTail = null
  })
  return opening
}

export async function startCitySim(
  options: CitySimOpenOptions = {},
): Promise<CitySimSnapshot> {
  if (malformedDocument) {
    return publishFailure(
      'start',
      'malformed-document',
      `Start is blocked because the City Document is malformed: ${malformedDocument.message}`,
      { phase: 'error', saveStatus: 'malformed' },
    )
  }
  if (!snapshot.active) {
    const opened = await openCitySimSurface(options)
    if (!opened.active || opened.phase === 'error') {
      return publishFailure(
        'start',
        opened.lastResult?.code || 'open-failed',
        `City Simulation could not start: ${opened.message}`,
      )
    }
  }
  if (snapshot.phase === 'error') {
    return publishFailure(
      'start',
      snapshot.lastResult?.code || 'runtime-error',
      `City Simulation could not start: ${snapshot.message}`,
    )
  }
  if (snapshot.phase === 'running') {
    return publishSuccess(
      'start',
      `City Simulation is already running at tick ${snapshot.city.tick}.`,
    )
  }
  fenceTimer()
  const running = publishSuccess(
    'start',
    `City Simulation is running one deterministic tick every ${CITY_SIM_FIXED_STEP_MS} ms.`,
    { phase: 'running' },
  )
  scheduleNextTick(timerGeneration)
  return running
}

export function exitCitySimSurface(
  options: Readonly<{ restorePreviousSurface?: boolean }> = {},
): CitySimSnapshot {
  latestCitySimSurfaceIntent = 'exit'
  asyncGeneration += 1
  fenceTimer()
  const previous = previousCanvasSurface
  previousCanvasSurface = null
  const next = publishSuccess(
    'exit',
    'City Simulation exited; its committed in-memory city remains inspectable.',
    {
      active: false,
      phase: 'idle',
      selectedParcelId: null,
      advisor: null,
    },
  )
  if (options.restorePreviousSurface !== false && previous) {
    beginCitySimSurfaceRestoration(previous)
  } else if (options.restorePreviousSurface === false) {
    citySimSurfaceRestoring = null
    citySimSurfaceRestorationTail = Promise.resolve(null)
  }
  return next
}

export async function waitForCitySimSurfaceRestoration(): Promise<CitySimSnapshot> {
  while (true) {
    const opening = citySimSurfaceOpenTail
    if (opening) await opening
    const restoration = citySimSurfaceRestorationTail
    const restorationFailure = await restoration
    if (
      opening !== citySimSurfaceOpenTail
      || restoration !== citySimSurfaceRestorationTail
    ) continue
    if (!restorationFailure) return snapshot
    return publishFailure(
      'exit',
      'surface-restoration-failed',
      `City Simulation surface restoration did not complete: ${restorationFailure}`,
      { active: false, phase: 'error' },
    )
  }
}

registerXrSceneGameplayExitHandler('cityBuilder', () => {
  if (snapshot.active) exitCitySimSurface({ restorePreviousSurface: false })
}, {
  preserveWhenPanelOnly: [
    'media',
    'animation',
    'motionControl',
    'gameMode',
    'flightSim',
    'camera',
  ],
})

export function resetCitySimRuntimeForTests(
  options: Readonly<{
    authoredSource?: CitySimAuthoredSource
    webglSupported?: boolean
  }> = {},
): CitySimSnapshot {
  asyncGeneration += 1
  fenceTimer()
  previousCanvasSurface = null
  citySimSurfaceOpenTail = null
  citySimSurfaceRestorationTail = Promise.resolve(null)
  citySimSurfaceRestoring = null
  latestCitySimSurfaceIntent = 'idle'
  malformedDocument = null
  authoredSource = options.authoredSource ?? null
  if (authoredSource) {
    const sourceIssue = authoredSourceIssue(authoredSource)
    if (sourceIssue) throw new Error(`Invalid City test source: ${sourceIssue}`)
  }
  sessionStartCity = authoredSource?.city ?? null
  const reset = resetCitySimSnapshotForTests(
    sessionStartCity,
    options.webglSupported ?? readWebglSupport(),
  )
  persistenceCommands.resetQueue(reset)
  return reset
}
